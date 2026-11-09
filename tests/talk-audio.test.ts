import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TalkAudio } from '../src/client/utils/audio.ts';
import { AUDIO } from '../src/shared/protocol.ts';

/**
 * The capture/playback edges of the push-to-talk pipeline that the component-level doubles cannot
 * reach: a late frame after the session stopped, a frame too large for the server's ceiling, and
 * the source bookkeeping once a buffer finishes playing.
 */

class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  currentTime = 0;
  readonly sampleRate = 16000;
  readonly destination = {};
  readonly processor: { onaudioprocess: ((event: any) => void) | null; connect: () => void; disconnect: () => void };
  readonly createdSources: Array<{ buffer: unknown; connect: () => void; start: () => void; onended: (() => void) | null }> = [];

  constructor(public readonly options?: { sampleRate?: number }) {
    this.processor = { onaudioprocess: null, connect: () => undefined, disconnect: () => undefined };
  }

  async resume(): Promise<void> { this.state = 'running'; }
  async close(): Promise<void> { this.state = 'closed'; }
  createMediaStreamSource(): { connect: () => void } { return { connect: () => undefined }; }
  createScriptProcessor(): typeof this.processor { return this.processor; }
  createGain(): { connect: () => void; disconnect: () => void; gain: { value: number } } {
    return { connect: () => undefined, disconnect: () => undefined, gain: { value: 0 } };
  }
  createBuffer(_channels = 1, length = 512): { getChannelData: () => Float32Array; duration: number } {
    return { getChannelData: () => new Float32Array(length), duration: length / this.sampleRate };
  }
  createBufferSource(): (typeof this.createdSources)[number] {
    const source = { buffer: null as unknown, connect: () => undefined, start: () => undefined, onended: null as (() => void) | null };
    this.createdSources.push(source);
    return source;
  }
}

function installAudioMocks(): void {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) }
  });
}

beforeEach(() => {
  installAudioMocks();
});

describe('capture gating', () => {
  it('emits nothing when the processor fires after the session stopped', async () => {
    const sent: unknown[] = [];
    const audio = new TalkAudio(() => { sent.push('frame'); return true; });
    await audio.start(7);
    const context = (audio as unknown as { capture: FakeAudioContext }).capture;
    audio.stop();
    // The processor survives the teardown in this double, which is exactly the race: its callback
    // fires after `active` went false and must not emit a frame.
    context.processor.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(512) } });
    expect(sent).toEqual([]);
  });

  it('drops a frame that would exceed the server payload ceiling but keeps the next one', async () => {
    const sent: ArrayBuffer[] = [];
    const audio = new TalkAudio((frame: ArrayBuffer) => { sent.push(frame); return true; });
    await audio.start(9);
    const context = (audio as unknown as { capture: FakeAudioContext }).capture;
    // 9000 samples × 2 bytes = 18000 > AUDIO.MAX_PAYLOAD_BYTES; 4 samples is fine.
    context.processor.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(AUDIO.MAX_PAYLOAD_BYTES / 2 + 1000) } });
    expect(sent).toHaveLength(0);
    context.processor.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(4) } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.byteLength).toBe(AUDIO.HEADER_BYTES + 8);
  });
});

describe('playback bookkeeping', () => {
  it('forgets a source once its playback has ended', () => {
    const audio = new TalkAudio(() => true);
    audio.preparePlayback();
    const context = (audio as unknown as { playback: FakeAudioContext }).playback;
    audio.play(new ArrayBuffer(AUDIO.HEADER_BYTES + 8));
    const internal = audio as unknown as { sources: unknown[] };
    expect(internal.sources).toHaveLength(1);

    const source = context.createdSources[0]!;
    source.onended!();
    expect(internal.sources).toHaveLength(0);
  });
});
