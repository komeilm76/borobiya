import { AUDIO } from '../../shared/protocol.ts';
import type { Clock } from '../core/cache.ts';

export interface TalkState {
  talkId: number;
  speakerId: string;
  targetId: string;
  startedAt: number;
  expiresAt: number;
  lastAudioAt: number;
  lastSequence: number;
  active: boolean;
  reason?: string;
}

export interface TalkStartResult {
  ok: boolean;
  state?: TalkState;
  reason?: string;
}

export interface AudioAuthorization {
  ok: boolean;
  targetId?: string;
  reason?: string;
}

/**
 * One-to-one push-to-talk floor control. State is in memory because voice frames are ephemeral;
 * durable mission/share events remain in SQLite. No group calls are represented.
 */
export class TalkFloor {
  private readonly talks = new Map<number, TalkState>();
  private readonly byUser = new Map<string, number>();
  private counter = 0;

  constructor(private readonly clock: Clock = () => Date.now()) {}

  start(speakerId: string, targetId: string): TalkStartResult {
    if (speakerId === targetId) return { ok: false, reason: 'self-talk-is-not-allowed' };
    if (this.byUser.has(speakerId) || this.byUser.has(targetId)) return { ok: false, reason: 'participant-is-busy' };
    const now = this.clock();
    const talkId = ++this.counter;
    const state: TalkState = {
      talkId, speakerId, targetId, startedAt: now, expiresAt: now + AUDIO.HOLD_MS,
      lastAudioAt: now, lastSequence: -1, active: true
    };
    this.talks.set(talkId, state);
    this.byUser.set(speakerId, talkId);
    this.byUser.set(targetId, talkId);
    return { ok: true, state };
  }

  stop(userId: string, talkId: number): TalkState | null {
    const state = this.talks.get(talkId);
    if (!state || !state.active || state.speakerId !== userId) return null;
    return this.release(state, 'released');
  }

  releaseUser(userId: string, reason = 'disconnected'): TalkState[] {
    const talkId = this.byUser.get(userId);
    if (!talkId) return [];
    const state = this.talks.get(talkId);
    return state && state.active ? [this.release(state, reason)] : [];
  }

  authorizeAudio(userId: string, talkId: number, sequence: number, payloadLength: number): AudioAuthorization {
    const state = this.talks.get(talkId);
    if (!state || !state.active) return { ok: false, reason: 'talk-not-active' };
    if (state.speakerId !== userId) return { ok: false, reason: 'not-the-speaker' };
    if (this.clock() > state.expiresAt) { this.release(state, 'expired'); return { ok: false, reason: 'talk-expired' }; }
    if (!Number.isSafeInteger(sequence) || sequence <= state.lastSequence) return { ok: false, reason: 'invalid-sequence' };
    if (payloadLength < 1 || payloadLength > AUDIO.MAX_PAYLOAD_BYTES) return { ok: false, reason: 'invalid-payload-size' };
    state.lastSequence = sequence;
    state.lastAudioAt = this.clock();
    return { ok: true, targetId: state.targetId };
  }

  sweep(now = this.clock()): TalkState[] {
    const released: TalkState[] = [];
    for (const state of [...this.talks.values()]) {
      if (!state.active) continue;
      if (now > state.expiresAt) released.push(this.release(state, 'expired'));
      else if (now - state.lastAudioAt > AUDIO.IDLE_MS) released.push(this.release(state, 'idle'));
    }
    return released;
  }

  activeForUser(userId: string): TalkState | null {
    const talkId = this.byUser.get(userId);
    const state = talkId ? this.talks.get(talkId) : undefined;
    return state?.active ? { ...state } : null;
  }

  stats(): { active: number; users: number } {
    return { active: [...this.talks.values()].filter((state) => state.active).length, users: this.byUser.size };
  }

  private release(state: TalkState, reason: string): TalkState {
    state.active = false;
    state.reason = reason;
    this.talks.delete(state.talkId);
    this.byUser.delete(state.speakerId);
    this.byUser.delete(state.targetId);
    return { ...state };
  }
}
