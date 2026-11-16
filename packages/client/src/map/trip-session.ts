import { ref } from "vue";

/** Foreground bridge between the map-owned trip and the App-owned proposal inbox.
 * No GPS coordinates or routing data are stored. The map revokes its registration
 * on unmount; a stale disposer cannot clear a later map instance. */
export function createTripSession() {
  const navigating = ref(false);
  let endTrip: (() => void) | null = null;
  let generation = 0;
  function register(end: () => void): () => void {
    const current = ++generation;
    navigating.value = false;
    endTrip = end;
    return () => {
      if (current !== generation) return;
      generation++;
      endTrip = null;
      navigating.value = false;
    };
  }
  function update(active: boolean): void { if (endTrip) navigating.value = active; }
  function endForMission(): boolean {
    if (!navigating.value) return true;
    if (!endTrip) return false;
    try { endTrip(); } catch { return false; }
    return !navigating.value; // Caller must synchronously revoke GPS and clear the route.
  }
  return { navigating, register, update, endForMission };
}

export const mapTripSession = createTripSession();
