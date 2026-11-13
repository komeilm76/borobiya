// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TalkFloor } from '../src/server/services/talk.ts';
import { AUDIO } from '../src/shared/protocol.ts';

/**
 * The talk floor is the server side of push-to-talk, and it had no test of its own.
 *
 * This is the one place in the application where a wrong branch does not show up as a broken
 * screen: it shows up as audio delivered to someone who should not hear it. Every rule below
 * exists to prevent that, and each is asserted by its own reason string so a regression names
 * which rule broke rather than only that something is not `ok`.
 */

const SPEAKER = 'usr_responder';
const TARGET = 'usr_requester';
const OTHER = 'usr_companion';

/** A floor over a clock the test controls. */
function feed() {
  let now = 1_000_000;
  const floor = new TalkFloor(() => now);
  return {
    floor,
    advance: (ms: number) => {
      now += ms;
    },
    at: () => now
  };
}

/** Starts a talk between the two fixed participants. */
function startTalk(floor: TalkFloor) {
  const result = floor.start(SPEAKER, TARGET);
  expect(result.ok, result.reason).toBe(true);
  return result.state!;
}

let f: ReturnType<typeof feed>;

beforeEach(() => {
  f = feed();
});

describe('opening the floor', () => {
  it('grants the floor to the speaker with a bounded lifetime', () => {
    const state = startTalk(f.floor);
    expect(state.speakerId).toBe(SPEAKER);
    expect(state.targetId).toBe(TARGET);
    expect(state.expiresAt).toBe(f.at() + AUDIO.HOLD_MS);
    expect(state.active).toBe(true);
    // -1 means "no frame accepted yet", so the first frame must be sequence 0 or higher.
    expect(state.lastSequence).toBe(-1);
  });

  it('refuses a talk with oneself', () => {
    const result = f.floor.start(SPEAKER, SPEAKER);
    expect(result.ok).toBe(false);
    // Talking to yourself is not an error a user can act on, but it must not create a floor.
    expect(result.reason).toBe('self-talk-is-not-allowed');
  });

  it('refuses a second talk while either participant is already in one', () => {
    startTalk(f.floor);
    // The speaker is busy.
    expect(f.floor.start(SPEAKER, OTHER)).toMatchObject({ ok: false, reason: 'participant-is-busy' });
    // So is the target — the one who would otherwise have two incoming streams.
    expect(f.floor.start(OTHER, TARGET)).toMatchObject({ ok: false, reason: 'participant-is-busy' });
  });

  it('allows an unrelated pair to talk at the same time', () => {
    startTalk(f.floor);
    expect(f.floor.start('usr_a', 'usr_b').ok).toBe(true);
    expect(f.floor.stats()).toEqual({ active: 2, users: 4 });
  });

  it('reuses an id after the floor is released', () => {
    const first = startTalk(f.floor);
    f.floor.stop(SPEAKER, first.talkId);
    const second = startTalk(f.floor);
    // Ids increase monotonically; a reused id would let a stale client frame apply to a new talk.
    expect(second.talkId).toBeGreaterThan(first.talkId);
  });
});

describe('the speaker keeps control', () => {
  it('releases the floor when the speaker stops', () => {
    const state = startTalk(f.floor);
    const released = f.floor.stop(SPEAKER, state.talkId);
    expect(released?.active).toBe(false);
    expect(released?.reason).toBe('released');
    expect(f.floor.activeForUser(SPEAKER)).toBe(null);
    expect(f.floor.activeForUser(TARGET)).toBe(null);
  });

  it('does not let the listener stop the speaker\'s floor', () => {
    const state = startTalk(f.floor);
    // The listener can hang up, but must not cut the speaker off mid-word by ending the talk.
    expect(f.floor.stop(TARGET, state.talkId)).toBe(null);
    expect(f.floor.activeForUser(SPEAKER)?.active).toBe(true);
  });

  it('does not let an unrelated user stop someone else\'s floor', () => {
    const state = startTalk(f.floor);
    expect(f.floor.stop(OTHER, state.talkId)).toBe(null);
  });

  it('answers null for an unknown talk id rather than throwing', () => {
    expect(f.floor.stop(SPEAKER, 999)).toBe(null);
  });
});

describe('audio authorization', () => {
  it('delivers to the target for the speaker', () => {
    const state = startTalk(f.floor);
    const result = f.floor.authorizeAudio(SPEAKER, state.talkId, 0, 160);
    expect(result).toEqual({ ok: true, targetId: TARGET });
  });

  it('refuses a listener trying to send audio', () => {
    const state = startTalk(f.floor);
    // The whole point of the floor: the listener hears, and cannot be heard.
    expect(f.floor.authorizeAudio(TARGET, state.talkId, 0, 160)).toMatchObject({ ok: false, reason: 'not-the-speaker' });
  });

  it('refuses an unrelated user', () => {
    const state = startTalk(f.floor);
    expect(f.floor.authorizeAudio(OTHER, state.talkId, 0, 160)).toMatchObject({ ok: false, reason: 'not-the-speaker' });
  });

  it('refuses frames for a talk that never existed or has ended', () => {
    expect(f.floor.authorizeAudio(SPEAKER, 999, 0, 160)).toMatchObject({ ok: false, reason: 'talk-not-active' });

    const state = startTalk(f.floor);
    f.floor.stop(SPEAKER, state.talkId);
    // Audio still in flight after release must not be delivered.
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 1, 160)).toMatchObject({ ok: false, reason: 'talk-not-active' });
  });

  it('refuses a frame after the hold expired, and ends the floor', () => {
    const state = startTalk(f.floor);
    f.advance(AUDIO.HOLD_MS + 1);
    const result = f.floor.authorizeAudio(SPEAKER, state.talkId, 0, 160);
    expect(result).toMatchObject({ ok: false, reason: 'talk-expired' });
    // The expiry must also release the floor, or both participants stay busy forever.
    expect(f.floor.activeForUser(SPEAKER)).toBe(null);
    expect(f.floor.stats().active).toBe(0);
  });

  it('refuses a sequence that does not move forward', () => {
    const state = startTalk(f.floor);
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 5, 160).ok).toBe(true);
    // Replaying an accepted frame would duplicate audio into the listener's ear.
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 5, 160)).toMatchObject({ ok: false, reason: 'invalid-sequence' });
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 4, 160)).toMatchObject({ ok: false, reason: 'invalid-sequence' });
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 6, 160).ok).toBe(true);
  });

  it('refuses a sequence that is not an integer', () => {
    const state = startTalk(f.floor);
    for (const sequence of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(f.floor.authorizeAudio(SPEAKER, state.talkId, sequence, 160), String(sequence)).toMatchObject({
        ok: false,
        reason: 'invalid-sequence'
      });
    }
  });

  it('refuses an empty or oversized payload', () => {
    const state = startTalk(f.floor);
    // The ceiling is the server's per-frame limit; the client mirrors it, but the server is the
    // authority because a client can be modified.
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 0, 0)).toMatchObject({ ok: false, reason: 'invalid-payload-size' });
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 0, AUDIO.MAX_PAYLOAD_BYTES + 1)).toMatchObject({
      ok: false,
      reason: 'invalid-payload-size'
    });
    // The boundary itself is allowed.
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 0, AUDIO.MAX_PAYLOAD_BYTES).ok).toBe(true);
  });

  it('does not advance the sequence when a frame is refused', () => {
    const state = startTalk(f.floor);
    f.floor.authorizeAudio(SPEAKER, state.talkId, 3, 160);
    // A refused oversized frame must not consume its sequence number, or the next legitimate frame
    // (which the client already numbered) would be rejected as a replay.
    f.floor.authorizeAudio(SPEAKER, state.talkId, 4, AUDIO.MAX_PAYLOAD_BYTES + 1);
    expect(f.floor.authorizeAudio(SPEAKER, state.talkId, 4, 160).ok).toBe(true);
  });
});

describe('sweeping idle and expired floors', () => {
  it('releases a floor that has gone quiet', () => {
    startTalk(f.floor);
    f.advance(AUDIO.IDLE_MS + 1);
    const released = f.floor.sweep();
    expect(released).toHaveLength(1);
    expect(released[0].reason).toBe('idle');
    expect(f.floor.stats()).toEqual({ active: 0, users: 0 });
  });

  it('does not release a floor that is still being spoken into', () => {
    const state = startTalk(f.floor);
    f.advance(AUDIO.IDLE_MS + 1);
    // A speaker still sending frames must not be cut off every two seconds.
    f.floor.authorizeAudio(SPEAKER, state.talkId, 0, 160);
    expect(f.floor.sweep()).toHaveLength(0);
    expect(f.floor.activeForUser(SPEAKER)?.active).toBe(true);
  });

  it('reports expiry rather than idleness once the hold has passed', () => {
    startTalk(f.floor);
    f.advance(AUDIO.HOLD_MS + 1);
    const released = f.floor.sweep();
    expect(released).toHaveLength(1);
    // Expiry is the longer limit, so it is the reason that must win.
    expect(released[0].reason).toBe('expired');
  });

  it('leaves an already released floor out of the sweep', () => {
    const state = startTalk(f.floor);
    f.floor.stop(SPEAKER, state.talkId);
    f.advance(AUDIO.HOLD_MS + 1);
    // Released talks are deleted, so a sweep must not report them a second time.
    expect(f.floor.sweep()).toHaveLength(0);
  });

  it('sweeps many floors at once', () => {
    f.floor.start('usr_a', 'usr_b');
    f.floor.start('usr_c', 'usr_d');
    f.advance(AUDIO.HOLD_MS + 1);
    expect(f.floor.sweep()).toHaveLength(2);
    expect(f.floor.stats()).toEqual({ active: 0, users: 0 });
  });
});

describe('users dropping out', () => {
  it('releases the floor when either participant disconnects', () => {
    const state = startTalk(f.floor);
    const released = f.floor.releaseUser(TARGET);
    expect(released).toHaveLength(1);
    expect(released[0].talkId).toBe(state.talkId);
    // A dropped listener must free the speaker, not leave them holding a dead floor.
    expect(f.floor.activeForUser(SPEAKER)).toBe(null);
  });

  it('returns nothing for a user who was not talking', () => {
    startTalk(f.floor);
    expect(f.floor.releaseUser(OTHER)).toEqual([]);
  });

  it('carries the reason a call ended', () => {
    startTalk(f.floor);
    const released = f.floor.releaseUser(SPEAKER, 'socket-closed');
    expect(released[0].reason).toBe('socket-closed');
  });

  it('returns nothing when the user is already free', () => {
    const state = startTalk(f.floor);
    f.floor.stop(SPEAKER, state.talkId);
    // The second disconnect is not an error; it simply has nothing to release.
    expect(f.floor.releaseUser(SPEAKER)).toEqual([]);
  });
});

describe('the real clock', () => {
  it('uses the system clock when none is injected', () => {
    // The injected-clock tests above never exercise the default argument, which is what production
    // actually uses. Pin the system time so this stays deterministic.
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      const floor = new TalkFloor();
      const state = floor.start(SPEAKER, TARGET).state!;
      expect(state.startedAt).toBe(Date.now());
      expect(state.expiresAt).toBe(Date.now() + AUDIO.HOLD_MS);
      // And expiry works against that same clock.
      vi.setSystemTime(1_700_000_000_000 + AUDIO.HOLD_MS + 1);
      expect(floor.authorizeAudio(SPEAKER, state.talkId, 0, 160)).toMatchObject({ ok: false, reason: 'talk-expired' });
    } finally {
      vi.useRealTimers();
    }
  });
});

/*
 * Two arms in `talk.ts` are unreachable through the public API and stay uncovered on purpose:
 *
 *   releaseUser:  state && state.active ? … : []      the false arm
 *   sweep:        if (!state.active) continue         the true arm
 *
 * Both guard the same invariant: `byUser` only ever points at a talk in `talks`, and `talks` only
 * ever holds active talks, because `release()` marks the state inactive and deletes it from both
 * maps in one step. They are defensive checks, not behaviour — reaching either would mean the
 * invariant had already broken. Trying to force them through the API would mean exposing internal
 * maps for tests, which is worse than leaving two arms uncovered.
 */

describe('inspection', () => {
  it('reports the floor a user is in without handing out the live record', () => {
    const state = startTalk(f.floor);
    const view = f.floor.activeForUser(SPEAKER);
    expect(view?.talkId).toBe(state.talkId);

    // The snapshot is a copy: mutating it must not touch the committed state, or a caller could
    // lower `lastSequence` and replay audio.
    view!.lastSequence = 99;
    expect(f.floor.activeForUser(SPEAKER)?.lastSequence).toBe(-1);
  });

  it('answers null for a user with no floor', () => {
    expect(f.floor.activeForUser(OTHER)).toBe(null);
  });

  it('counts both participants of each active floor', () => {
    expect(f.floor.stats()).toEqual({ active: 0, users: 0 });
    startTalk(f.floor);
    expect(f.floor.stats()).toEqual({ active: 1, users: 2 });
  });
});

describe('floor bookkeeping', () => {
  it('releases nothing when the by-user index dangles above a retired talk', () => {
    const state = startTalk(f.floor);
    // Simulate a partially torn-down floor: the index entry survives, the talk does not.
    (f.floor as unknown as { talks: Map<number, unknown> }).talks.delete(state.talkId);
    expect(f.floor.releaseUser(SPEAKER, 'disconnected')).toEqual([]);
  });
});
