import { onScopeDispose, ref } from "vue";
import { coordinatesSchema } from "@shared/index";

export const OFFER_GPS_DEADLINE_MS = 10_000;
export type OfferPositionRuntime = (success: (position: { lat: number; lon: number }) => void, failure: () => void) => void;

function browserPosition(success: Parameters<OfferPositionRuntime>[0], failure: Parameters<OfferPositionRuntime>[1]): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) throw new Error("GEOLOCATION_UNAVAILABLE");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => success({ lat: coords.latitude, lon: coords.longitude }), failure,
    { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 }
  );
}

/** Distance is optional; never keep a spinner or a stale private fix across offers/accounts. */
export function useOfferDistancePosition(getPosition: OfferPositionRuntime = browserPosition) {
  const myPosition = ref<{ lat: number; lon: number } | null>(null);
  const locationError = ref<string | null>(null);
  const locating = ref(false);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const unavailable = "دسترسی به موقعیت ممکن نشد؛ همچنان می‌توانید نشانی روی نقشه را ببینید.";

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function reset(): void {
    generation++;
    clearTimer();
    myPosition.value = null;
    locationError.value = null;
    locating.value = false;
  }

  function locate(): void {
    if (disposed) return;
    reset();
    const current = generation;
    locating.value = true;
    function fail(): void {
      if (disposed || current !== generation) return;
      generation++; // The first terminal result wins if a bridge calls back twice.
      clearTimer();
      locating.value = false;
      locationError.value = unavailable;
    }
    timer = setTimeout(() => {
      if (disposed || current !== generation) return;
      generation++; // Discard a fix arriving after the fallback has been shown.
      timer = null;
      locating.value = false;
      locationError.value = unavailable;
    }, OFFER_GPS_DEADLINE_MS);
    try {
      getPosition((candidate) => {
        if (disposed || current !== generation) return;
        const valid = coordinatesSchema.safeParse(candidate);
        if (!valid.success) { fail(); return; }
        generation++;
        clearTimer();
        myPosition.value = valid.data;
        locating.value = false;
      }, fail);
    } catch { fail(); } // Some native bridges throw before invoking the error callback.
  }

  onScopeDispose(() => { disposed = true; reset(); });
  return { myPosition, locationError, locating, locate, reset };
}
