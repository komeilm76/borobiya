import { computed, ref, type Ref } from "vue";
import { coordinatesSchema, type MissionNavigationTarget } from "@shared/index";
import {
  getMissionNavigationTarget, getMissionRouteChoices, type RouteChoice, type TransportProfile
} from "@/api/mission-routing";
import { decodeRoutePolyline } from "@/sos/route-preview";

export interface MissionRoutingRuntime {
  getTarget?: typeof getMissionNavigationTarget;
  getRoutes?: typeof getMissionRouteChoices;
  getPosition?: () => Promise<{ lat: number; lon: number }>;
}

function browserPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNAVAILABLE")); return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }), reject,
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 }
    );
  });
}

/** Private route-picker lifecycle. Abort/reject late replies on mission switch, sign-out and profile change. */
export function useMissionRoutes(
  token: Ref<string | null>, userId: Ref<string | null>, missionId: Ref<string | null>,
  ensureSession?: () => Promise<unknown>, runtime: MissionRoutingRuntime = {}
) {
  const visible = ref(false);
  const target = ref<MissionNavigationTarget | null>(null);
  const targetLoading = ref(false);
  const profile = ref<TransportProfile>("car");
  const from = ref<{ lat: number; lon: number } | null>(null);
  const routes = ref<RouteChoice[]>([]);
  const selectedIndex = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let generation = 0;
  let controller: AbortController | null = null;
  const selectedRoute = computed(() => routes.value[selectedIndex.value] ?? null);

  function invalidate(): number {
    controller?.abort();
    controller = null;
    return ++generation;
  }
  function reset(): void {
    invalidate();
    visible.value = false;
    target.value = null;
    targetLoading.value = false;
    from.value = null;
    routes.value = [];
    selectedIndex.value = 0;
    loading.value = false;
    error.value = null;
    profile.value = "car";
  }
  async function open(): Promise<void> {
    if (!missionId.value || !token.value || !userId.value) return;
    const mission = missionId.value;
    const owner = userId.value;
    const current = invalidate();
    const signal = (controller = new AbortController()).signal;
    visible.value = true;
    target.value = null;
    from.value = null;
    routes.value = [];
    selectedIndex.value = 0;
    loading.value = false;
    targetLoading.value = true;
    error.value = null;
    try {
      await ensureSession?.();
      if (current !== generation || owner !== userId.value || mission !== missionId.value || !token.value) return;
      const result = await (runtime.getTarget ?? getMissionNavigationTarget)(token.value, mission, signal);
      if (current === generation && owner === userId.value && mission === missionId.value) target.value = result;
    } catch {
      if (current === generation && owner === userId.value && mission === missionId.value) {
        target.value = null;
        error.value = "محل حادثه در دسترس نیست؛ فقط امدادگر مأموریت فعال می‌تواند آن را مشاهده کند. دوباره تلاش کنید.";
      }
    } finally {
      if (current === generation) targetLoading.value = false;
    }
  }
  function selectProfile(next: TransportProfile): void {
    if (profile.value === next) return;
    invalidate();
    profile.value = next;
    routes.value = [];
    selectedIndex.value = 0;
    loading.value = false;
    error.value = null;
  }
  async function findRoutes(refreshPosition = false): Promise<void> {
    const incident = target.value?.incident;
    const mission = missionId.value;
    const owner = userId.value;
    if (!incident || !mission || !owner || !token.value || loading.value) return;
    const current = invalidate();
    const signal = (controller = new AbortController()).signal;
    loading.value = true;
    error.value = null;
    routes.value = [];
    selectedIndex.value = 0;
    try {
      if (!from.value || refreshPosition) {
        const candidate = await (runtime.getPosition ?? browserPosition)();
        if (current !== generation || owner !== userId.value || mission !== missionId.value) return;
        from.value = coordinatesSchema.parse(candidate);
      }
      const choices = await (runtime.getRoutes ?? getMissionRouteChoices)(from.value!, incident, profile.value, signal);
      // Validate geometry before showing alternatives; never paint an arbitrary or malformed polyline.
      choices.forEach((choice) => decodeRoutePolyline(choice.polyline));
      if (current === generation && owner === userId.value && mission === missionId.value) routes.value = choices;
    } catch (cause) {
      if (current === generation && owner === userId.value && mission === missionId.value) {
        error.value = cause instanceof Error && cause.message === "NO_ROUTE"
          ? "برای این وسیله و این دو نقطه مسیر قابل‌استفاده‌ای پیدا نشد؛ وسیلهٔ دیگری را امتحان کنید."
          : !from.value ? "مکان‌یابی در دسترس نیست یا اجازه داده نشد؛ برای دریافت مسیر، دسترسی موقعیت را فعال و دوباره تلاش کنید."
            : "مسیریابی محلی در دسترس نیست یا پاسخ معتبری نداد؛ اتصال به سرور نقشه را بررسی و دوباره تلاش کنید.";
      }
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function selectRoute(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < routes.value.length) selectedIndex.value = index;
  }
  return { visible, target, targetLoading, profile, from, routes, selectedIndex, selectedRoute,
    loading, error, open, reset, selectProfile, findRoutes, selectRoute };
}
