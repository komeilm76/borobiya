import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import TalkView from '../src/client/views/map/TalkView.vue';
import { useRealtimeStore } from '../src/client/stores/realtime.ts';
import { useMapStore } from '../src/client/stores/map.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * Push-to-talk owns the microphone. The properties that matter are negative ones: the stream must
 * stop on every path that can end a turn, a refused floor request must not leave the button
 * claiming a live call, and nothing may keep capturing after the screen is gone.
 */

/**
 * A real class rather than `vi.fn()`: `TalkAudio` builds its context through `Reflect.construct`,
 * which requires an actual constructor.
 */
class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 16000;
  destination = {};
  processor: { onaudioprocess: ((event: any) => void) | null; connect: () => void; disconnect: () => void };

  constructor(public readonly options?: { sampleRate?: number }) {
    this.processor = { onaudioprocess: null, connect: () => undefined, disconnect: () => undefined };
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }

  createMediaStreamSource() {
    return { connect: () => undefined };
  }

  createScriptProcessor() {
    return this.processor;
  }

  createGain() {
    return { connect: () => undefined, disconnect: () => undefined, gain: { value: 0 } };
  }

  createBuffer(_channels = 1, length = 512) {
    // Playback writes decoded samples into a real Float32Array.
    return { getChannelData: () => new Float32Array(length), duration: 1 };
  }

  createBufferSource() {
    return { buffer: null, connect: () => undefined, start: () => undefined, stop: () => undefined, onended: null };
  }
}

/** Installs the audio doubles and returns the capture stream so a test can inspect its tracks. */
function installAudioMocks() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) }
  });
  return { stream, track };
}

/** Mounts the talk screen with one known peer. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.talk });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const map = useMapStore();
  map.liveFixes = { usr_companion: { userId: 'usr_companion', username: 'maryam.a', latitude: 35.72, longitude: 51.33, accuracy: 8, recordedAt: Date.now() } } as never;
  const wrapper = mount(TalkView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  // Hand back the store the component actually uses: patching a store from another pinia records
  // nothing, because the component resolves its own instance.
  return { wrapper, map, router, realtime: useRealtimeStore() };
}

/** Chooses a peer in the select the way a click does: set the value, then fire `change`. */
async function selectPeer(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], userId = 'usr_companion'): Promise<void> {
  const select = wrapper.find('#talk-target');
  (select.element as HTMLSelectElement).value = userId;
  await select.trigger('change');
}

/**
 * Delivers a server message to the store's listeners.
 *
 * `RealtimeClient.emit` is private (a socket owns it), so this reaches the same handler map a real
 * frame would, which keeps the view's own subscription under test rather than a mock of it.
 */
function deliver(realtime: ReturnType<typeof useRealtimeStore>, type: string, payload: unknown): void {
  const client = (realtime as unknown as { client: { handlers: Map<string, Set<(p: unknown) => void>> } }).client;
  for (const listener of client.handlers.get(type) ?? []) listener(payload);
}

/** Records everything the given realtime store is asked to send. */
function recordSends(realtime = useRealtimeStore()) {
  const sent: any[] = [];
  const binary: unknown[] = [];
  realtime.send = ((message: unknown) => {
    sent.push(message);
    return true;
  }) as never;
  realtime.sendBinary = ((frame: unknown) => {
    binary.push(frame);
    return true;
  }) as never;
  return { realtime, sent, binary };
}

/**
 * Renders, then patches the realtime store the component resolved.
 *
 * The store instance has to come from the same Pinia the component uses; patching a store created
 * before the mount records nothing because the component holds its own instance.
 */
async function renderPatched() {
  const rendered = await render();
  const { sent, binary } = recordSends(rendered.realtime);
  return { ...rendered, sent, binary };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  for (const message of [...useToast().messages.value]) useToast().dismiss(message.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('push-to-talk', () => {
  it('lists the peers it can call and starts with nothing selected', async () => {
    installAudioMocks();
    const { wrapper } = await render();
    const options = wrapper.findAll('#talk-target option');
    // The placeholder plus one peer.
    expect(options).toHaveLength(2);
    expect(options[1].text()).toContain('maryam.a');
    expect(wrapper.text()).toContain('آماده');
    wrapper.unmount();
  });

  it('asks for a peer instead of opening the microphone with no target', async () => {
    installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();

    expect(sent.some((message) => message.type === WS_EVENTS.TALK_START)).toBe(false);
    expect(useToast().messages.value.some((message) => message.tone === 'error')).toBe(true);
    wrapper.unmount();
  });

  it('opens a turn on press and closes it on release', async () => {
    installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await selectPeer(wrapper);

    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_START)).toBe(true);
    expect(wrapper.text()).toContain('در حال ارسال');
    expect(wrapper.find('.talk-button').attributes('aria-pressed')).toBe('true');

    await wrapper.find('.talk-button').trigger('pointerup');
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(true);
    expect(wrapper.text()).toContain('آماده');
    wrapper.unmount();
  });

  it('closes the turn when the pointer is cancelled mid-hold', async () => {
    installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await selectPeer(wrapper);

    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    // A cancelled pointer never fires `pointerup`: without this the microphone stays open.
    await wrapper.find('.talk-button').trigger('pointercancel');
    await flushPromises();

    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(true);
    expect(wrapper.text()).toContain('آماده');
    wrapper.unmount();
  });

  it('closes the turn when the pointer slides off the button', async () => {
    installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await selectPeer(wrapper);
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    await wrapper.find('.talk-button').trigger('pointerleave');
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(true);
    wrapper.unmount();
  });

  it('can be operated from the keyboard', async () => {
    installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await selectPeer(wrapper);

    // A button that only reacts to pointer events is unusable without a mouse.
    await wrapper.find('.talk-button').trigger('keydown', { key: ' ' });
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_START)).toBe(true);

    await wrapper.find('.talk-button').trigger('keyup', { key: ' ' });
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(true);
    wrapper.unmount();
  });

  it('releases the microphone when the user navigates away mid-sentence', async () => {
    const { track } = installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await selectPeer(wrapper);
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();

    wrapper.unmount();
    // Every track must be stopped; a live track keeps the browser's recording indicator on.
    expect(track.stop).toHaveBeenCalled();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(true);
  });

  it('stops streaming when the floor refuses the turn', async () => {
    const { track } = installAudioMocks();
    const { wrapper, sent, realtime } = await renderPatched();
    await selectPeer(wrapper);

    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    expect(wrapper.text()).toContain('در حال ارسال');

    // The peer is already in another call.
    deliver(realtime, WS_EVENTS.ACK, { kind: WS_EVENTS.TALK_START, accepted: false, reason: 'participant-is-busy' });
    await flushPromises();

    expect(wrapper.text()).toContain('آماده');
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(true);
    expect(track.stop).toHaveBeenCalled();
    expect(useToast().messages.value.some((message) => message.message.includes('گفت‌وگوی دیگری'))).toBe(true);
    wrapper.unmount();
  });

  it('plays incoming audio frames', async () => {
    installAudioMocks();
    const { wrapper, realtime } = await renderPatched();

    const frame = new ArrayBuffer(12);
    new DataView(frame).setUint8(0, 1);
    new DataView(frame).setUint8(1, 1);
    new DataView(frame).setUint32(2, 1, false);
    new DataView(frame).setUint32(6, 0, false);
    // A frame from the floor must be handled without throwing, even with no turn open.
    expect(() => deliver(realtime, 'binary', frame)).not.toThrow();
    await flushPromises();
    wrapper.unmount();
  });
});

describe('push-to-talk failure paths', () => {
  it('sends a captured audio frame to the realtime channel', async () => {
    const contexts: FakeAudioContext[] = [];
    class CapturingAudioContext extends FakeAudioContext {
      constructor(options?: { sampleRate?: number }) {
        super(options);
        contexts.push(this);
      }
    }
    vi.stubGlobal('AudioContext', CapturingAudioContext);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) }
    });
    const { wrapper, binary } = await renderPatched();
    await selectPeer(wrapper);

    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    // Drive the capture callback exactly the way the Web Audio runtime would during a hold.
    // The first context is playback, the second capture; find whichever installed the recorder.
    const capture = contexts.map((context) => context.processor).find((processor) => processor.onaudioprocess);
    expect(capture, 'capture callback must be installed once the turn opens').toBeTruthy();
    capture!.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(512) } });

    expect(binary).toHaveLength(1);
    expect(binary[0]).toBeInstanceOf(ArrayBuffer);
    wrapper.unmount();
  });

  it('ignores a stop when no turn is open', async () => {
    installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await selectPeer(wrapper);
    // Release without press: must not emit TALK_STOP for a turn that never opened.
    await wrapper.find('.talk-button').trigger('pointerup');
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(false);
    wrapper.unmount();
  });

  it('ignores an ACK of a different kind', async () => {
    installAudioMocks();
    const { wrapper, sent, realtime } = await renderPatched();
    await selectPeer(wrapper);
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    // A stop-ack must not be mistaken for a start-ack and adopt a bogus talk id.
    deliver(realtime, WS_EVENTS.ACK, { kind: WS_EVENTS.TALK_STOP, accepted: true, talkId: 999 });
    await flushPromises();
    await wrapper.find('.talk-button').trigger('pointerup');
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP && message.talkId === 999)).toBe(false);
    expect(useToast().messages.value).toHaveLength(0);
    wrapper.unmount();
  });

  it('shows a distinct message when the floor refuses for a non-busy reason', async () => {
    installAudioMocks();
    const { wrapper, realtime } = await renderPatched();
    await selectPeer(wrapper);
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    deliver(realtime, WS_EVENTS.ACK, { kind: WS_EVENTS.TALK_START, accepted: false, reason: 'malformed-request' });
    await flushPromises();
    // The user must see that the call did not start, with a neutral explanation rather than the
    // "busy" wording.
    expect(useToast().messages.value.some((message) => message.message.includes('گفت‌وگو آغاز نشد'))).toBe(true);
    wrapper.unmount();
  });

  it('adopts the talk id the floor assigned for both control frames and audio frames', async () => {
    const contexts: FakeAudioContext[] = [];
    class CapturingAudioContext extends FakeAudioContext {
      constructor(options?: { sampleRate?: number }) {
        super(options);
        contexts.push(this);
      }
    }
    vi.stubGlobal('AudioContext', CapturingAudioContext);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) }
    });
    const { wrapper, sent, binary, realtime } = await renderPatched();
    await selectPeer(wrapper);
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();

    deliver(realtime, WS_EVENTS.ACK, { kind: WS_EVENTS.TALK_START, accepted: true, talkId: 777 });
    await flushPromises();
    await wrapper.find('.talk-button').trigger('pointerup');
    await flushPromises();
    // The control plane carries the server-assigned id.
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP && message.talkId === 777)).toBe(true);

    // The data plane must carry it too: after adoption the next captured frame encodes 777 in its
    // header, or the floor drops every frame as talk-not-active.
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    deliver(realtime, WS_EVENTS.ACK, { kind: WS_EVENTS.TALK_START, accepted: true, talkId: 778 });
    await flushPromises();
    const capture = contexts.map((context) => context.processor).find((processor) => processor.onaudioprocess);
    capture!.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(512) } });
    expect(binary.length).toBeGreaterThan(0);
    const frame = binary[binary.length - 1] as ArrayBuffer;
    expect(new DataView(frame).getUint32(2, false)).toBe(778);
    wrapper.unmount();
  });

  it('accepts a floor ack that carries no talk id', async () => {
    installAudioMocks();
    const { wrapper, realtime } = await renderPatched();
    await selectPeer(wrapper);
    await wrapper.find('.talk-button').trigger('pointerdown');
    await flushPromises();
    // An accept without a talk id must not crash nor adopt a falsy id.
    deliver(realtime, WS_EVENTS.ACK, { kind: WS_EVENTS.TALK_START, accepted: true });
    await flushPromises();
    expect(wrapper.text()).toContain('در حال ارسال');
    wrapper.unmount();
  });

  it('surfaces a realtime error as a toast', async () => {
    installAudioMocks();
    const { wrapper, realtime } = await renderPatched();
    deliver(realtime, WS_EVENTS.ERROR, { message: 'boom' });
    await flushPromises();
    expect(useToast().messages.value.some((message) => message.message === 'boom')).toBe(true);
    wrapper.unmount();
  });

  it('shows a generic talk error when the server sends none', async () => {
    installAudioMocks();
    const { wrapper, realtime } = await renderPatched();
    // The payload is not guaranteed to carry a message; the banner must not print "undefined".
    deliver(realtime, WS_EVENTS.ERROR, {});
    await flushPromises();
    expect(useToast().messages.value.some((message) => message.message === 'خطای گفت‌وگو')).toBe(true);
    wrapper.unmount();
  });

  it('starts and stops with the Enter key and on blur', async () => {
    installAudioMocks();
    const { wrapper, sent } = await renderPatched();
    await selectPeer(wrapper);
    await wrapper.find('.talk-button').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_START)).toBe(true);
    await wrapper.find('.talk-button').trigger('keyup', { key: 'Enter' });
    await flushPromises();
    expect(sent.some((message) => message.type === WS_EVENTS.TALK_STOP)).toBe(true);

    await wrapper.find('.talk-button').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    // A focused hold that loses focus must end the turn, or the button keeps streaming.
    await wrapper.find('.talk-button').trigger('blur');
    await flushPromises();
    expect(wrapper.text()).toContain('آماده');
    wrapper.unmount();
  });

  it('falls back to the user id when a peer has no username', async () => {
    installAudioMocks();
    const { wrapper } = await render();
    const map = useMapStore();
    map.liveFixes = { usr_noname: { userId: 'usr_noname', username: undefined, latitude: 35.7, longitude: 51.3, accuracy: 4, recordedAt: Date.now() } } as never;
    await flushPromises();
    const option = wrapper.findAll('#talk-target option').find((entry) => entry.text().includes('usr_noname'));
    expect(option, 'peer without username must still be selectable by id').toBeTruthy();
    wrapper.unmount();
  });
});
