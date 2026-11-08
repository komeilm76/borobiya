/** Ephemeral one-to-one push-to-talk audio. Nothing is recorded or stored. */
import { AUDIO } from './protocol.js';

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 512;

export class TalkAudio {
  /** @param {(frame: ArrayBuffer) => boolean} sendBinary */
  constructor(sendBinary) {
    this.sendBinary = sendBinary;
    /** @type {MediaStream|null} */
    this.stream = null;
    /** @type {AudioContext|null} */
    this.capture = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this.input = null;
    /** @type {ScriptProcessorNode|null} */
    this.processor = null;
    /** @type {GainNode|null} */
    this.mute = null;
    /** @type {AudioContext|null} */
    this.playback = null;
    /** @type {AudioBufferSourceNode[]} */
    this.sources = [];
    this.nextTime = 0;
    this.active = false;
    this.talkId = 0;
    this.sequence = 0;
  }

  /** Creates or resumes the playback context from a user gesture. */
  preparePlayback() {
    if (!this.playback || this.playback.state === 'closed') this.playback = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.playback.state === 'suspended') void this.playback.resume();
  }

  /** @param {number} talkId */
  async start(talkId) {
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
    this.input = input;
    this.processor = processor;
    this.mute = mute;
    this.active = true;
    this.talkId = talkId >>> 0;
    this.sequence = 0;
    processor.onaudioprocess = (event) => {
      if (!this.active) return;
      const pcm = event.inputBuffer.getChannelData(0);
      const frame = new ArrayBuffer(AUDIO.HEADER_BYTES + pcm.length * 2);
      const header = new DataView(frame);
      header.setUint8(0, AUDIO.VERSION);
      header.setUint8(1, AUDIO.TYPE);
      header.setUint32(2, this.talkId, false);
      header.setUint32(6, ++this.sequence, false);
      const samples = new Int16Array(frame, AUDIO.HEADER_BYTES, pcm.length);
      for (let index = 0; index < pcm.length; index++) {
        const value = Math.max(-1, Math.min(1, pcm[index]));
        samples[index] = value < 0 ? value * 0x8000 : value * 0x7FFF;
      }
      this.sendBinary(frame);
    };
    input.connect(processor);
    processor.connect(mute);
    mute.connect(capture.destination);
  }

  /** @param {ArrayBuffer} frame */
  async play(frame) {
    if (frame.byteLength < AUDIO.HEADER_BYTES + 2) return;
    const header = new DataView(frame);
    if (header.getUint8(0) !== AUDIO.VERSION || header.getUint8(1) !== AUDIO.TYPE) return;
    this.preparePlayback();
    const context = this.playback;
    if (!context) return;
    const sampleCount = Math.floor((frame.byteLength - AUDIO.HEADER_BYTES) / 2);
    if (!sampleCount) return;
    const incoming = new Int16Array(frame, AUDIO.HEADER_BYTES, sampleCount);
    const buffer = context.createBuffer(1, sampleCount, SAMPLE_RATE);
    const output = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index++) output[index] = incoming[index] / 0x8000;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const now = context.currentTime;
    this.nextTime = Math.max(now + 0.015, this.nextTime);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
      try { source.disconnect(); } catch { /* already disconnected */ }
    };
  }

  stop() {
    this.active = false;
    try { this.processor?.disconnect(); } catch { /* no-op */ }
    try { this.input?.disconnect(); } catch { /* no-op */ }
    try { this.mute?.disconnect(); } catch { /* no-op */ }
    for (const source of this.sources.splice(0)) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    for (const track of this.stream?.getTracks() || []) track.stop();
    if (this.capture && this.capture.state !== 'closed') void this.capture.close();
    this.stream = null;
    this.capture = null;
    this.input = null;
    this.processor = null;
    this.mute = null;
    this.sequence = 0;
  }

  destroy() {
    this.stop();
    if (this.playback && this.playback.state !== 'closed') void this.playback.close();
    this.playback = null;
  }
}
