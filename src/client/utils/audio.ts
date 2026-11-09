import { AUDIO } from '@shared/protocol.ts';

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 512;

/**
 * Ephemeral one-to-one push-to-talk audio. Nothing is recorded or stored.
 * Capture uses the Web Audio API; encoding writes the shared 10-byte binary header.
 */
export class TalkAudio {
  private stream: MediaStream | null = null;
  private capture: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private playback: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private nextTime = 0;
  private active = false;
  private talkId = 0;
  private sequence = 0;

  /**
   * @param sendBinary Transport for encoded frames.
   */
  constructor(private readonly sendBinary: (frame: ArrayBuffer) => boolean) {}

  /** Creates or resumes the playback context from a user gesture. */
  preparePlayback(): AudioContext {
    if (!this.playback || this.playback.state === 'closed') this.playback = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.playback.state === 'suspended') void this.playback.resume();
    return this.playback;
  }

  /**
   * Starts capturing and streaming microphone audio for a talk session.
   *
   * @param talkId Identifier issued by the server floor control.
   */
  async start(talkId: number): Promise<void> {
    this.stop();
    this.preparePlayback();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('میکروفن در این مرورگر پشتیبانی نمی‌شود.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    const capture = new AudioContext({ sampleRate: SAMPLE_RATE });
    await capture.resume();
    const input = capture.createMediaStreamSource(stream);
    const processor = capture.createScriptProcessor(BUFFER_SIZE, 1, 1);
    const mute = capture.createGain();
    mute.gain.value = 0;
    this.stream = stream;
    this.capture = capture;
    this.processor = processor;
    this.mute = mute;
    this.active = true;
    this.talkId = talkId >>> 0;
    this.sequence = 0;
    processor.onaudioprocess = (event) => {
      if (!this.active) return;
      const samples = event.inputBuffer.getChannelData(0);
      const frame = this.encode(samples);
      if (frame) this.sendBinary(frame);
    };
    input.connect(processor);
    processor.connect(mute);
    mute.connect(capture.destination);
  }

  /** Encodes float samples into the shared binary frame layout. */
  private encode(samples: Float32Array): ArrayBuffer | null {
    // `AUDIO.MAX_PAYLOAD_BYTES` is the server's per-frame ceiling (see `TalkFloor.authorizeAudio`),
    // not a budget for the whole talk session: a 30-second hold is ~960 kB of 16 kHz PCM16 and is
    // expected to be streamed frame by frame. Only skip a frame that would itself be too large.
    if (samples.length * 2 > AUDIO.MAX_PAYLOAD_BYTES) return null;
    const payload = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index++) {
      const clamped = Math.max(-1, Math.min(1, samples[index]));
      payload[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    const frame = new ArrayBuffer(AUDIO.HEADER_BYTES + payload.byteLength);
    const header = new DataView(frame);
    header.setUint8(0, AUDIO.VERSION);
    header.setUint8(1, AUDIO.TYPE);
    header.setUint32(2, this.talkId, false);
    header.setUint32(6, this.sequence++, false);
    new Uint8Array(frame, AUDIO.HEADER_BYTES).set(new Uint8Array(payload.buffer));
    return frame;
  }

  /**
   * Queues a received audio frame for playback.
   *
   * @param frame Incoming binary frame from the shared socket.
   */
  play(frame: ArrayBuffer): void {
    if (frame.byteLength <= AUDIO.HEADER_BYTES) return;
    const context = this.preparePlayback();
    const samples = new Int16Array(frame.byteLength - AUDIO.HEADER_BYTES);
    const payload = new Uint8Array(frame, AUDIO.HEADER_BYTES);
    new Uint8Array(samples.buffer).set(payload);
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) channel[index] = samples[index] / 0x8000;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
    };
  }

  /**
   * Adopts the session identifier the server assigned.
   *
   * The screen starts capture before the floor has answered, so the first frames carry a
   * client-chosen id. Once the server replies with the real one, later frames must switch to it or
   * the floor drops them as `talk-not-active`. The sequence keeps counting from where it was, which
   * is what the floor expects for a single turn.
   *
   * @param talkId Identifier from the `talk.start` acknowledgement.
   */
  adoptTalkId(talkId: number): void {
    this.talkId = talkId >>> 0;
  }

  /** Stops capture and releases every audio resource. */
  stop(): void {
    this.active = false;
    this.processor?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.capture && this.capture.state !== 'closed') void this.capture.close();
    for (const source of this.sources.splice(0)) {
      try {
        source.stop();
      } catch {
        // Source already ended.
      }
    }
    this.stream = null;
    this.capture = null;
    this.processor = null;
    this.mute = null;
    this.nextTime = 0;
  }

  /** Releases every resource; used when the session ends. */
  destroy(): void {
    this.stop();
    if (this.playback && this.playback.state !== 'closed') void this.playback.close();
    this.playback = null;
  }
}
