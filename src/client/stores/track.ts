import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { errorMessage, get, patch, post } from '@/api/client.ts';
import { MISSION_STATUS, WS_EVENTS } from '@shared/protocol.ts';
import { useAuthStore } from '@/stores/auth.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { useSosStore } from '@/stores/sos.ts';
import { useTripsStore } from '@/stores/trips.ts';
import type { LiveFixView, TrackAvailability, TrackConsentDecision, TrackResponse } from '@/api/types.ts';

/** The context a fix should be recorded against (or the one awaiting a consent decision). */
export interface TrackContextRef {
  type: 'trip' | 'mission';
  id: string;
  label: string;
  availability: TrackAvailability;
  consent: TrackConsentDecision | null;
}

/** Minimum gap between recorded fixes; the geolocation watch can fire faster than this. */
const MIN_PUBLISH_INTERVAL_MS = 10_000;
const TERMINAL_MISSION = new Set([MISSION_STATUS.COMPLETED, MISSION_STATUS.CANCELLED] as const);

/**
 * Consented trajectory recording (Stage D). Two gates must both be open before any fix leaves
 * the device: the account-level opt-in (server truth, mirrored to local storage so the toggle
 * survives a reload before `refresh()` resolves) and the per-trip/per-mission consent prompt.
 * Recording targets are resolved from the server-owned trip/mission lists — never from local
 * guesses — and every publish is best-effort: the live socket path must keep working even when
 * the recording gate refuses.
 */
export const useTrackStore = defineStore('track', () => {
  const auth = useAuthStore();
  const realtime = useRealtimeStore();
  const trips = useTripsStore();
  const sos = useSosStore();

  const persisted = useLocalStorage<'0' | '1'>('bb-record-track', '0', {
    serializer: {
      read: (value: string): '0' | '1' => (value === '1' ? '1' : '0'),
      write: (value: '0' | '1'): string => value
    }
  });

  watch(() => auth.user?.recordTrack, (value) => {
    if (typeof value === 'boolean') persisted.value = value ? '1' : '0';
  }, { immediate: true });

  const optIn = computed<boolean>(() => auth.user?.recordTrack ?? persisted.value === '1');
  const optInBusy = ref(false);
  const optInError = ref<string | null>(null);
  const decisionBusy = ref(false);
  const decisionError = ref<string | null>(null);
  const lastPublishAt = ref(0);

  /**
   * A recording party for a mission: the assigned responder or an active team member — never a
   * pure requester (see the approved Stage D decision). Unknown team membership is resolved
   * optimistically (shown) and enforced authoritatively by the server, which answers 404.
   */
  const missionRole = (item: { requesterId: string; responderId: string }): 'recording' | 'observer' =>
    item.responderId === (auth.user?.id ?? '') || item.requesterId !== (auth.user?.id ?? '') ? 'recording' : 'observer';

  /** First context awaiting a consent decision, or null. Missions win: loss of life outweighs a trip. */
  const pendingPrompt = computed<TrackContextRef | null>(() => {
    if (!optIn.value) return null;
    const mission = sos.missions.find((item) => !TERMINAL_MISSION.has(item.status as never) && item.trackConsent === null && missionRole(item) === 'recording');
    if (mission) return { type: 'mission', id: mission.id, label: mission.incidentLabel, availability: mission.trackStatus ?? 'none', consent: null };
    const trip = trips.trips.find((item) => item.status === 'active' && item.trackConsent === null);
    if (trip) return { type: 'trip', id: trip.id, label: trip.name, availability: trip.trackStatus ?? 'none', consent: null };
    return null;
  });

  /** The context fixes are currently recorded against, or null. Same precedence as the prompt. */
  const recordingContext = computed<TrackContextRef | null>(() => {
    if (!optIn.value) return null;
    const mission = sos.missions.find((item) => !TERMINAL_MISSION.has(item.status as never) && item.trackConsent === 'accepted' && missionRole(item) === 'recording');
    if (mission) return { type: 'mission', id: mission.id, label: mission.incidentLabel, availability: mission.trackStatus ?? 'none', consent: 'accepted' };
    const trip = trips.trips.find((item) => item.status === 'active' && item.trackConsent === 'accepted');
    if (trip) return { type: 'trip', id: trip.id, label: trip.name, availability: trip.trackStatus ?? 'none', consent: 'accepted' };
    return null;
  });

  const isRecording = computed(() => recordingContext.value !== null);

  /** Toggles the account-level opt-in (PATCH /_user/me). Optimistic mirror; reverts on failure. */
  async function setOptIn(next: boolean): Promise<void> {
    if (optInBusy.value) return;
    optInBusy.value = true;
    optInError.value = null;
    const previous = persisted.value;
    persisted.value = next ? '1' : '0';
    try {
      await patch('/_user/me', { recordTrack: next });
      if (auth.user) auth.user = { ...auth.user, recordTrack: next };
    } catch (caught) {
      persisted.value = previous;
      optInError.value = errorMessage(caught);
      throw caught;
    } finally {
      optInBusy.value = false;
    }
  }

  /** Records the caller's decision on the pending context's consent prompt. */
  async function decide(decision: TrackConsentDecision): Promise<void> {
    const target = pendingPrompt.value;
    if (!target || decisionBusy.value) return;
    decisionBusy.value = true;
    decisionError.value = null;
    try {
      await post(`/_${target.type === 'trip' ? 'user/trips' : 'user/missions'}/${encodeURIComponent(target.id)}/track-consent`, { decision });
      // Re-read from the server: the projection is the only honest source for consent state.
      await Promise.allSettled([trips.load(), sos.load()]);
    } catch (caught) {
      decisionError.value = errorMessage(caught);
      throw caught;
    } finally {
      decisionBusy.value = false;
    }
  }

  /**
   * Best-effort publish of one fix with the recording context attached. Returns false whenever
   * the gate refuses; never throws into the geolocation callback.
   */
  function publishFix(fix: LiveFixView): boolean {
    const context = recordingContext.value;
    if (!context) return false;
    const now = Date.now();
    if (now - lastPublishAt.value < MIN_PUBLISH_INTERVAL_MS) return false;
    const payload: Record<string, unknown> = {
      type: WS_EVENTS.LOCATION_UPDATE,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      recordedAt: fix.recordedAt ?? now,
      contextType: context.type,
      contextId: context.id
    };
    if (typeof fix.heading === 'number') payload.heading = fix.heading;
    if (typeof fix.speed === 'number') payload.speed = fix.speed;
    const sent = realtime.send(payload);
    if (sent) lastPublishAt.value = now;
    return sent;
  }

  /* ---------- replay ---------- */

  const replay = ref<Record<string, TrackResponse | undefined>>({});
  const replayLoading = ref<Record<string, boolean>>({});
  const replayError = ref<Record<string, string | null>>({});

  const replayKey = (type: 'trip' | 'mission', id: string, from?: number, to?: number): string =>
    `${type}:${id}:${from ?? ''}:${to ?? ''}`;

  /** Fetches (and caches) the replay payload for a context window. */
  async function loadReplay(type: 'trip' | 'mission', id: string, from?: number, to?: number): Promise<TrackResponse | null> {
    const key = replayKey(type, id, from, to);
    if (replay.value[key]) return replay.value[key] ?? null;
    if (replayLoading.value[key]) return null;
    replayLoading.value = { ...replayLoading.value, [key]: true };
    replayError.value = { ...replayError.value, [key]: null };
    try {
      const params: Record<string, number> = {};
      if (typeof from === 'number') params.from = from;
      if (typeof to === 'number') params.to = to;
      const base = type === 'trip' ? `/_user/trips/${encodeURIComponent(id)}/track` : `/_user/missions/${encodeURIComponent(id)}/track`;
      const response = await get<TrackResponse>(base, params);
      replay.value = { ...replay.value, [key]: response };
      return response;
    } catch (caught) {
      replayError.value = { ...replayError.value, [key]: errorMessage(caught) };
      return null;
    } finally {
      replayLoading.value = { ...replayLoading.value, [key]: false };
    }
  }

  function clearReplay(type: 'trip' | 'mission', id: string, from?: number, to?: number): void {
    const key = replayKey(type, id, from, to);
    const next = { ...replay.value };
    delete next[key];
    replay.value = next;
  }

  return {
    optIn,
    optInBusy,
    optInError,
    decisionBusy,
    decisionError,
    pendingPrompt,
    recordingContext,
    isRecording,
    setOptIn,
    decide,
    publishFix,
    replay,
    replayLoading,
    replayError,
    loadReplay,
    clearReplay
  };
});
