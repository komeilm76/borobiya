import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { get } from '@/api/client.ts';
import type { LiveFixView, MapConfigView, SavedPlaceView, ShareView } from '@/api/types.ts';
import { useGeolocation } from '@vueuse/core';

/** Bottom-sheet detents of the mobile map. */
export type SheetDetent = 'closed' | 'half' | 'open';

/**
 * Map state: the deterministic tile configuration, saved places, live shares,
 * the user's own fix and the detent of the mobile sheet.
 */
export const useMapStore = defineStore('map', () => {
  const config = ref<MapConfigView | null>(null);
  const places = ref<SavedPlaceView[]>([]);
  const shares = ref<ShareView[]>([]);
  const liveFixes = ref<Record<string, LiveFixView>>({});
  const detent = ref<SheetDetent>('half');
  const zoom = ref(14);
  const center = ref({ latitude: 35.7219, longitude: 51.3347 });
  const loading = ref(false);
  const error = ref<string | null>(null);

  // VueUse owns the geolocation watch, pause/resume and permission state.
  const geolocation = useGeolocation({
    enableHighAccuracy: true,
    maximumAge: 15000,
    timeout: 20000,
    immediate: false
  });

  const ownFix = computed<LiveFixView | null>(() => {
    const coords = geolocation.coords.value;
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || coords.latitude === 0) return null;
    return {
      userId: 'self',
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : 25,
      heading: Number.isFinite(coords.heading as number) ? (coords.heading as number) : null,
      speed: Number.isFinite(coords.speed as number) ? (coords.speed as number) : null,
      recordedAt: Date.now()
    };
  });

  const peers = computed(() => Object.values(liveFixes.value));

  /** Loads the offline map configuration and the user's saved places and shares. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [mapConfig, placeList, shareList] = await Promise.all([
        get<MapConfigView>('/_public/map/config'),
        get<{ items: SavedPlaceView[] }>('/_user/places'),
        get<{ items: ShareView[] }>('/_user/location/shares')
      ]);
      config.value = mapConfig;
      places.value = placeList.items ?? [];
      shares.value = shareList.items ?? [];
      if (mapConfig?.center) center.value = { latitude: mapConfig.center.latitude, longitude: mapConfig.center.longitude };
      if (mapConfig?.defaultZoom) zoom.value = mapConfig.defaultZoom;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'داده‌های نقشه خوانده نشد.';
    } finally {
      loading.value = false;
    }
  }

  /**
   * Applies a realtime live fix for a peer.
   *
   * @param fix Latest fix broadcast for that user.
   */
  function applyLiveFix(fix: LiveFixView): void {
    liveFixes.value = { ...liveFixes.value, [fix.userId]: fix };
  }

  /** Removes a peer marker, for example when sharing is revoked. */
  function removeLiveFix(userId: string): void {
    const next = { ...liveFixes.value };
    delete next[userId];
    liveFixes.value = next;
  }

  /** Sets the bottom-sheet detent. */
  function setDetent(next: SheetDetent): void {
    detent.value = next;
  }

  /** Starts the geolocation watch. */
  function startLocation(): void {
    geolocation.resume();
  }

  /** Stops the geolocation watch; called when leaving the map. */
  function stopLocation(): void {
    geolocation.pause();
  }

  /** Adds or updates a saved place locally after a successful API call. */
  function upsertPlace(place: SavedPlaceView): void {
    places.value = [...places.value.filter((item) => item.id !== place.id), place].sort((a, b) => a.rank - b.rank);
  }

  /** Removes a saved place locally after deletion. */
  function removePlace(placeId: string): void {
    places.value = places.value.filter((item) => item.id !== placeId);
  }

  return {
    config,
    places,
    shares,
    liveFixes,
    peers,
    detent,
    zoom,
    center,
    loading,
    error,
    geolocation,
    ownFix,
    load,
    applyLiveFix,
    removeLiveFix,
    setDetent,
    startLocation,
    stopLocation,
    upsertPlace,
    removePlace
  };
});
