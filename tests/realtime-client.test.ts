import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient } from '../src/client/utils/realtime-client.ts';
import { TalkAudio } from '../src/client/utils/audio.ts';
import { AUDIO, HTTP_EVENTS, WS_CLOSE, WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * Client transport tests: the one authenticated socket (tickets, queueing, durable cursor,
 * reconnect policy, binary routing) and the ephemeral push-to-talk codec.
 */

/** Minimal controllable WebSocket double. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  binaryType = 'blob';
  sent: Array<string | ArrayBuffer> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(payload: string | ArrayBuffer): void {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('socket not open');
    this.sent.push(payload);
  }

  close(code = 1000): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code });
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }

  serverClose(code = 1000): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code });
  }
}

const TICKET = { ticket: 'tkt_abc', expiresAt: Date.now() + 20_000, path: '/ws', heartbeatMs: 4000, protocol: 1 };

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', Object.assign(FakeSocket, {
    CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3
  }));
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, requestId: 'req_rt', data: TICKET }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  ));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('realtime client', () => {
  it('requests a one-use ticket, opens the socket and flushes queued messages', async () => {
    const client = new RealtimeClient();
    const statuses: string[] = [];
    client.on('status', (value) => statuses.push(String(value)));

    const connecting = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;

    expect(statuses).toContain('connecting');
    expect(FakeSocket.instances).toHaveLength(1);
    const socket = FakeSocket.instances[0];
    expect(socket.url).toContain('/ws?ticket=tkt_abc');
    expect(socket.binaryType).toBe('arraybuffer');

    // Messages sent before the socket opens are queued, not dropped.
    expect(client.sendJson({ type: 'queue-me' })).toBe(false);
    socket.open();
    expect(statuses).toContain('connected');
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(String(socket.sent[0]))).toEqual({ type: 'queue-me' });
    expect(client.sendJson({ type: 'now-open' })).toBe(true);
    client.close();
  });

  it('tracks the durable cursor from hello and committed events, and fans out by type', async () => {
    const client = new RealtimeClient();
    const seen: string[] = [];
    // The domain channel receives the whole event, so read `payload` from it.
    client.on('event', (event) => seen.push(`event:${event.id}`));
    // Domain event types are the durable `type` column, declared once in HTTP_EVENTS; WS_EVENTS
    // only names the transport envelopes. The client fans out on the durable type and hands the
    // domain listeners the event *payload*, while the generic `event` channel gets the envelope.
    client.on(HTTP_EVENTS.SOS_CREATED, (payload) => seen.push(`sos:${payload.sosId}`));

    const connecting = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;
    const socket = FakeSocket.instances[0];
    socket.open();

    socket.message(JSON.stringify({ type: WS_EVENTS.HELLO, eventCursor: 41, heartbeatMs: 4000 }));
    expect(client.cursor).toBe(41);

    socket.message(JSON.stringify({
      type: WS_EVENTS.EVENT,
      event: { id: 42, type: HTTP_EVENTS.SOS_CREATED, payload: { sosId: 'sos_1' } }
    }));
    socket.message(JSON.stringify({
      type: WS_EVENTS.EVENT,
      event: { id: 40, type: HTTP_EVENTS.SOS_CREATED, payload: { sosId: 'stale' } }
    }));
    // The cursor never moves backwards on a replayed or out-of-order event, so a reconnect with
    // `sync(since=cursor)` cannot skip a missed event.
    expect(client.cursor).toBe(42);
    expect(seen).toContain('event:42');
    expect(seen).toContain('sos:sos_1');
    client.close();
  });

  it('routes binary frames to the audio channel and ignores malformed JSON', async () => {
    const client = new RealtimeClient();
    const frames: number[] = [];
    const messages: unknown[] = [];
    client.on('binary', (buffer) => frames.push(buffer.byteLength));
    client.on('message', (message) => messages.push(message));

    const connecting = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;
    const socket = FakeSocket.instances[0];
    socket.open();

    socket.message(new ArrayBuffer(26));
    socket.message('{not json');
    socket.message(JSON.stringify({ type: 'presence', room: 'sos:1' }));

    expect(frames).toEqual([26]);
    expect(messages).toHaveLength(1);
    client.close();
  });

  it('sends pings on the negotiated heartbeat and stops them when closed', async () => {
    const client = new RealtimeClient();
    const connecting = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.message(JSON.stringify({ type: WS_EVENTS.HELLO, eventCursor: 0, heartbeatMs: 4000 }));

    await vi.advanceTimersByTimeAsync(2000);
    const pings = socket.sent.filter((payload) => String(payload).includes(WS_EVENTS.PING));
    expect(pings.length).toBeGreaterThanOrEqual(1);
    client.close();
    const afterClose = socket.sent.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.sent.length).toBe(afterClose);
  });

  it('reconnects with backoff after an unexpected close but not after a policy close', async () => {
    const client = new RealtimeClient();
    const connecting = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;
    const first = FakeSocket.instances[0];
    first.open();

    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeSocket.instances.length).toBe(2);

    const second = FakeSocket.instances[1];
    second.open();
    second.serverClose(WS_CLOSE.POLICY);
    await vi.advanceTimersByTimeAsync(60_000);
    // A policy close means the session is gone; retrying would loop forever.
    expect(FakeSocket.instances.length).toBe(2);
    client.close();
  });

  it('drops socket writes after close and caps the offline queue', async () => {
    const client = new RealtimeClient();
    for (let index = 0; index < 80; index++) client.sendJson({ index });
    const connecting = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await connecting;
    const socket = FakeSocket.instances[0];
    socket.open();
    // The queue is bounded so a long outage cannot grow memory without limit.
    expect(socket.sent.length).toBe(64);
    client.close();
    expect(client.sendBinary(new ArrayBuffer(10))).toBe(false);
  });
});

/** Minimal Web Audio double sufficient for the capture and playback paths. */
function installAudioMocks(options: { microphone?: boolean } = {}) {
  const sent: ArrayBuffer[] = [];
  const started: number[] = [];
  const closed: string[] = [];

  class FakeAudioContext {
    state: 'running' | 'suspended' | 'closed' = 'suspended';
    currentTime = 0;
    destination = { name: 'destination' };
    constructor(public readonly options?: { sampleRate?: number }) {}
    async resume(): Promise<void> {
      this.state = 'running';
    }
    async close(): Promise<void> {
      this.state = 'closed';
      closed.push('capture');
    }
    createMediaStreamSource() {
      return { connect: () => undefined };
    }
    createScriptProcessor() {
      return { onaudioprocess: null as ((event: any) => void) | null, connect: () => undefined, disconnect: () => undefined };
    }
    createGain() {
      return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined };
    }
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { duration: length / 16000, getChannelData: () => data };
    }
    createBufferSource() {
      return {
        buffer: null as unknown,
        connect: () => undefined,
        start: (at: number) => started.push(at),
        stop: () => undefined,
        onended: null as (() => void) | null
      };
    }
  }

  const stopTrack = vi.fn();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: options.microphone === false
      ? {}
      : {
          getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }))
        }
  });
  return { sent, started, closed, stopTrack };
}

describe('push-to-talk audio', () => {
  it('encodes captured samples with the shared binary header', async () => {
    const mocks = installAudioMocks();
    const audio = new TalkAudio((frame) => {
      mocks.sent.push(frame);
      return true;
    });
    await audio.start(7);

    const context = new AudioContext() as unknown as { createScriptProcessor: () => any };
    expect(context).toBeTruthy();
    // Drive the capture callback the way the Web Audio API would.
    const processor = (audio as unknown as { processor: { onaudioprocess: (event: any) => void } }).processor;
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
    processor.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });

    expect(mocks.sent).toHaveLength(1);
    const frame = mocks.sent[0];
    const view = new DataView(frame);
    expect(frame.byteLength).toBe(AUDIO.HEADER_BYTES + samples.length * 2);
    expect(view.getUint8(0)).toBe(AUDIO.VERSION);
    expect(view.getUint8(1)).toBe(AUDIO.TYPE);
    expect(view.getUint32(2, false)).toBe(7);
    expect(view.getUint32(6, false)).toBe(0);
    // Samples are clamped to the valid range instead of wrapping on overflow.
    const payload = new Int16Array(frame, AUDIO.HEADER_BYTES);
    expect(payload[1]).toBeGreaterThan(16000);
    expect(payload[2]).toBeLessThan(-16000);
    expect(payload[5]).toBe(0x7fff);
    expect(payload[6]).toBe(-0x8000);

    audio.stop();
    expect(mocks.stopTrack).toHaveBeenCalled();
    expect(mocks.closed).toContain('capture');
  });

  it('streams a whole hold instead of stopping after the first few frames', async () => {
    const mocks = installAudioMocks();
    const audio = new TalkAudio((frame) => {
      mocks.sent.push(frame);
      return true;
    });
    await audio.start(3);
    const processor = (audio as unknown as { processor: { onaudioprocess: (event: any) => void } }).processor;
    const samples = new Float32Array(512);
    // A 30-second hold at 31.25 frames/s is ~960 frames of 1024 bytes each. The per-frame ceiling
    // must not be mistaken for a session budget, so every frame is transmitted.
    for (let index = 0; index < 200; index++) {
      processor.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
    }
    expect(mocks.sent).toHaveLength(200);
    const last = mocks.sent[mocks.sent.length - 1];
    expect(last.byteLength - AUDIO.HEADER_BYTES).toBeLessThanOrEqual(AUDIO.MAX_PAYLOAD_BYTES);
    const sequences = mocks.sent.map((frame) => new DataView(frame).getUint32(6, false));
    expect(sequences).toEqual(sequences.map((_, index) => index));
    audio.stop();
  });

  it('reports an unsupported microphone instead of throwing opaquely', async () => {
    installAudioMocks({ microphone: false });
    const audio = new TalkAudio(() => true);
    await expect(audio.start(1)).rejects.toThrow(/میکروفن/);
  });

  it('plays received frames in order and ignores empty ones', () => {
    const mocks = installAudioMocks();
    const audio = new TalkAudio(() => true);
    audio.play(new ArrayBuffer(AUDIO.HEADER_BYTES));
    expect(mocks.started).toHaveLength(0);

    const frame = new ArrayBuffer(AUDIO.HEADER_BYTES + 8);
    const view = new DataView(frame);
    view.setUint8(0, AUDIO.VERSION);
    view.setUint8(1, AUDIO.TYPE);
    audio.play(frame);
    audio.play(frame);
    expect(mocks.started).toHaveLength(2);
    // Playback is scheduled back-to-back, never overlapping.
    expect(mocks.started[1]).toBeGreaterThanOrEqual(mocks.started[0]);
    audio.stop();
  });
});
