import { onScopeDispose, ref, watch, type Ref } from "vue";
import { coordinatesSchema } from "@shared/index";

export interface OwnMapFix { lat: number; lon: number; accuracy: number | null }
export interface OwnMapPositionRuntime {
  subscribe: (onFix: (fix: { lat: number; lon: number; accuracy?: number }) => void,
    onError: (denied: boolean) => void) => () => void;
}

const browserRuntime: OwnMapPositionRuntime = {
  subscribe(onFix, onError) {
    if (typeof navigator === "undefined" || !navigator.geolocation) throw new Error("GEOLOCATION_UNAVAILABLE");
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => onFix({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }),
      (error) => onError(error.code === 1),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }
};

/** Explicit, private, foreground-only GPS display. Viewing yourself never publishes a fix or starts a share. */
export function useOwnMapPosition(owner: Ref<string | null>, runtime: OwnMapPositionRuntime = browserRuntime) {
  const active = ref(false);
  const position = ref<OwnMapFix | null>(null);
  const error = ref<string | null>(null);
  let cleanup: (() => void) | null = null;
  let generation = 0;

  function stop(): void {
    generation++;
    active.value = false;
    position.value = null;
    const dispose = cleanup;
    cleanup = null;
    try { dispose?.(); } catch { /* Already invalidated. Do not retain a private fix on a failed clearWatch. */ }
  }

  function start(): boolean {
    if (!owner.value || active.value) return false;
    stop();
    const current = generation;
    const account = owner.value;
    error.value = null;
    active.value = true;
    try {
      const dispose = runtime.subscribe((fix) => {
        if (current !== generation || owner.value !== account) return;
        const parsed = coordinatesSchema.safeParse({ lat: fix.lat, lon: fix.lon });
        if (!parsed.success || (fix.accuracy !== undefined &&
          (!Number.isFinite(fix.accuracy) || fix.accuracy < 0))) return;
        position.value = { ...parsed.data, accuracy: fix.accuracy ?? null };
        error.value = null;
      }, (denied) => {
        if (current !== generation || owner.value !== account) return;
        if (denied) stop();
        else position.value = null; // Do not label an old fix as live during a GPS outage.
        error.value = denied ? "دسترسی مکان قطع شد؛ نمایش موقعیت متوقف شد." :
          "موقعیت تازه دریافت نشد؛ اتصال GPS را بررسی کنید.";
      });
      // Native/test bridges can report denial before returning their disposer.
      if (current !== generation || !active.value) { dispose(); return false; }
      cleanup = dispose;
      return true;
    } catch {
      stop();
      error.value = "مکان‌یابی در این دستگاه در دسترس نیست؛ HTTPS و مجوز مکان را بررسی کنید.";
      return false;
    }
  }

  watch(owner, () => { stop(); error.value = null; }, { flush: "sync" });
  onScopeDispose(stop);
  return { active, position, error, start, stop };
}
