import { computed, effectScope, onScopeDispose, ref, shallowRef, watch, type EffectScope, type Ref } from "vue";
import type { Mission } from "@shared/index";
import { listRequesterMissions } from "@/api/mission";
import { accountSessionKey } from "./device-identity";
import { isActiveMission } from "./use-mission-desk";
import { browserWatch, useMissionLiveLocations, type MissionLiveRuntime, type LiveMissionIdentity } from "./use-mission-live-locations";

const POLL_MS = 30_000;
export interface RequesterAutoShareRuntime {
  list?: typeof listRequesterMissions;
  live?: MissionLiveRuntime;
}
type Publisher = { scope: EffectScope; mission: Ref<LiveMissionIdentity | null>;
  live: ReturnType<typeof useMissionLiveLocations> };

/** One requester can have several accepted rescuers. Publish separately to *each*
 * verified active mission; no map page or single selected SOS owns these watches. */
export function useRequesterMissionAutoShare(
  token: Ref<string | null>, owner: Ref<string | null>, ensureSession?: () => Promise<unknown>,
  runtime: RequesterAutoShareRuntime = {}
) {
  const session = computed(() => accountSessionKey(owner.value, token.value));
  const missions = ref<LiveMissionIdentity[]>([]);
  const error = ref<string | null>(null);
  const refreshing = ref(false);
  const verified = ref(false);
  const publishers = shallowRef(new Map<string, Publisher>());
  let generation = 0;
  // Each accepted rescuer has a separate authorized room/socket, but the requester's
  // device needs only one native GPS watch. Multiplex fixes to active publishers.
  type Fix = { lat: number; lon: number; accuracy?: number };
  const observers = new Set<{ fix: (value: Fix) => void; error: (denied: boolean) => void }>();
  let stopNative: (() => void) | null = null;
  const watchPosition: NonNullable<MissionLiveRuntime["watchPosition"]> = (fix, error) => {
    const observer = { fix, error };
    observers.add(observer);
    if (!stopNative) {
      try {
        stopNative = (runtime.live?.watchPosition ?? browserWatch)(
          (value) => { for (const item of [...observers]) item.fix(value); },
          (denied) => { for (const item of [...observers]) item.error(denied); }
        );
      } catch (caught) { observers.delete(observer); throw caught; }
    }
    return () => {
      observers.delete(observer);
      if (!observers.size && stopNative) {
        const stop = stopNative;
        stopNative = null;
        try { stop(); } catch { /* All observers are fenced; native cleanup is best-effort. */ }
      }
    };
  };

  function stopAll(): void {
    for (const publisher of publishers.value.values()) {
      publisher.mission.value = null; // fence GPS callbacks before closing their socket scope
      publisher.scope.stop();
    }
    publishers.value = new Map();
    missions.value = [];
  }
  function reconcile(next: LiveMissionIdentity[]): void {
    const wanted = new Map(next.map((mission) => [mission.id, mission]));
    const updated = new Map(publishers.value);
    for (const [id, publisher] of updated) {
      if (wanted.has(id)) continue;
      publisher.mission.value = null;
      publisher.scope.stop();
      updated.delete(id);
    }
    for (const [id, mission] of wanted) {
      if (updated.has(id)) continue;
      const scope = effectScope(true);
      const entry = scope.run(() => {
        const identity = ref<LiveMissionIdentity | null>(mission);
        const live = useMissionLiveLocations(identity, token, owner, ensureSession,
          { ...runtime.live, watchPosition }, true);
        watch(live.endedMissionId, (ended) => {
          if (ended !== id) return;
          identity.value = null;
          void refresh(); // A terminal ack must be checked against the authoritative list.
        }, { flush: "sync" });
        return { scope, mission: identity, live };
      });
      if (entry) updated.set(id, entry);
      else scope.stop();
    }
    publishers.value = updated;
    missions.value = next;
  }

  async function refresh(): Promise<void> {
    const key = session.value;
    const userId = owner.value;
    if (!key || !userId) return;
    const current = ++generation;
    refreshing.value = true;
    try {
      await ensureSession?.();
      if (current !== generation || session.value !== key || !token.value) return;
      const next: LiveMissionIdentity[] = [];
      for (let page = 1; ; page++) {
        const result = await (runtime.list ?? listRequesterMissions)(token.value, page);
        if (current !== generation || session.value !== key) return;
        for (const mission of result.items as Mission[]) {
          if (mission.requesterId === userId && isActiveMission(mission.status)) {
            next.push({ id: mission.id, rescuerId: mission.rescuerId, requesterId: mission.requesterId });
          }
        }
        // Server ordering puts all active assignments before terminal history.
        if (page >= result.totalPages || result.items.some((item) => !isActiveMission(item.status))) break;
      }
      if (current !== generation || session.value !== key) return;
      reconcile(next);
      verified.value = true;
      error.value = null;
    } catch {
      if (current === generation && session.value === key) {
        stopAll(); // An unverified read may hide a terminal transition: fail closed.
        verified.value = false;
        error.value = "وضعیت مأموریت‌ها تأیید نشد؛ اشتراک موقعیت متوقف شد. دوباره بررسی کنید.";
      }
    } finally {
      if (current === generation) refreshing.value = false;
    }
  }
  function isSharingMission(id: string): boolean { return publishers.value.get(id)?.live.sharing.value ?? false; }
  function gpsError(id: string): string | null { return publishers.value.get(id)?.live.error.value ?? null; }
  function retry(id: string): void {
    const live = publishers.value.get(id)?.live;
    if (!live) { void refresh(); return; }
    if (live.connected.value && !live.recoveryPending.value) live.startSharing();
    else void live.start();
  }
  watch(session, (next) => {
    ++generation;
    stopAll();
    verified.value = false;
    refreshing.value = false;
    error.value = null;
    if (next) void refresh();
  }, { immediate: true, flush: "sync" });
  const timer = setInterval(() => { if (session.value) void refresh(); }, POLL_MS);
  timer.unref?.();
  onScopeDispose(() => { clearInterval(timer); ++generation; stopAll(); });
  return { missions, publishers, refreshing, verified, error, refresh, isSharingMission, gpsError, retry };
}
