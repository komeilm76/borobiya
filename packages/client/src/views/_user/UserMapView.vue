<template>
  <section class="user-map-view" aria-label="نقشهٔ تعاملی همراهان">
    <MapCanvas
      class="user-map-view__canvas"
      :style-url="mapStyleUrl"
      aria-label="نقشهٔ تعاملی"
      @ready="onMapReady"
    />

    <header class="user-map-view__toolbar">
      <v-card class="user-map-view__toolbar-card" elevation="3" rounded="xl">
        <v-btn
          class="user-map-view__dashboard-button"
          to="/_user/dashboard"
          variant="tonal"
          color="primary"
          icon
          aria-label="بازگشت به پیشخوان"
          title="بازگشت به پیشخوان"
        >
          <v-icon icon="mdi-view-dashboard-outline" />
        </v-btn>
        <div class="user-map-view__title-block">
          <p>نقشهٔ محلی</p>
          <h1>نقشهٔ همراهان</h1>
        </div>
        <v-chip class="user-map-view__map-chip" color="primary" variant="tonal" size="small">
          تهران
        </v-chip>
      </v-card>
    </header>

    <aside class="user-map-view__search">
      <PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" />
      <v-btn v-if="userPickedPlace && playback.frames.value.length" size="small" color="primary"
        variant="tonal" @click="showTrack">بازگشت به مسیر</v-btn>
    </aside>

    <ReverseAddressSheet :api="reverse" />

    <aside class="user-map-view__playback">
      <HistoryPlaybackPanel :api="playback" />
    </aside>

    <aside class="user-map-view__own" aria-label="موقعیت من">
      <v-card class="user-map-view__own-card" elevation="2" rounded="lg">
        <strong>موقعیت من</strong>
        <p role="status" aria-live="polite">
          {{ ownPositionLabel(own.position.value, own.active.value, own.error.value) }}
        </p>
        <div class="user-map-view__own-actions">
          <v-btn v-if="!own.active.value" size="small" color="primary" :disabled="!map" @click="startOwnLocation">نمایش زندهٔ موقعیت من</v-btn>
          <v-btn v-else size="small" color="primary" variant="tonal" @click="own.stop()">توقف نمایش</v-btn>
          <v-btn v-if="own.position.value" size="small" variant="text" color="primary" @click="centerOnOwnLocation">مرکز روی من</v-btn>
        </div>
        <small>فقط روی این دستگاه؛ نمایش موقعیت، اشتراک‌گذاری را فعال نمی‌کند.</small>
      </v-card>
    </aside>

    <aside class="user-map-view__live">
      <LiveBroadcastBar compact />
      <LiveCompanionPanel :api="live" />
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { Map as MapLibreMap, MapMouseEvent, Marker } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import HistoryPlaybackPanel from "@/components/map/HistoryPlaybackPanel.vue";
import PlaceSearchPanel from "@/components/map/PlaceSearchPanel.vue";
import ReverseAddressSheet from "@/components/map/ReverseAddressSheet.vue";
import { useReversePlace } from "@/composables/use-reverse-place";
import type { GeocodeResult } from "@shared/index";
import { usePlaceSearch } from "@/composables/use-place-search";
import LiveCompanionPanel from "@/components/map/LiveCompanionPanel.vue";
import LiveBroadcastBar from "@/components/sharing/LiveBroadcastBar.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { useHistoryPlayback } from "@/composables/use-history-playback";
import { historyPlaybackStyle } from "@/history/playback";
import { historyCameraPadding } from "@/history/camera-padding";
import { planPlaybackRemoval, planPlaybackSync } from "@/history/playback-map-sync";
import { LIVE_BOTTOM_LAYER_ID, liveCompanionsStyle } from "@/live/companion-locations";
import { planOverlayRemoval, planOverlaySync, type OverlayOp } from "@/map/overlay-sync";
import { needsOverlayRestore } from "@/map/overlay-restore";
import { useLiveCompanions } from "@/composables/use-live-companions";
import { useOwnMapPosition } from "@/composables/use-own-map-position";
import { ownPositionLabel } from "@/map/own-position";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
const auth = useAuthStore();
const mapStyleUrl = computed(() => mapStyleForTheme(theme.isDark));

/**
 * History playback, wired to the map.
 *
 * The view owns the composable rather than the panel because the *map* has to follow the cursor, not a
 * control: the panel is a renderer and this file is where a `MapLibreMap` exists.
 */
const playback = useHistoryPlayback({
  accessToken: computed(() => auth.accessToken),
  ensureSession: () => auth.ensureSession(),
  refreshSession: () => auth.refreshSession()
});
const map = shallowRef<MapLibreMap | null>(null);
const own = useOwnMapPosition(computed(() => auth.user?.id ?? null));
let ownMarker: Marker | null = null;
let markerConstructor: typeof Marker | null = null;
let focusOnNextFix = false;

function syncOwnMarker(): void {
  const instance = map.value;
  const fix = own.position.value;
  if (!instance || !fix || !markerConstructor) { ownMarker?.remove(); ownMarker = null; return; }
  if (!ownMarker) {
    ownMarker = new markerConstructor({ color: "#2563eb" }).setLngLat([fix.lon, fix.lat]).addTo(instance);
    ownMarker.getElement().setAttribute("aria-label", "موقعیت زندهٔ من");
  } else ownMarker.setLngLat([fix.lon, fix.lat]);
}
function centerOnOwnLocation(): void {
  const instance = map.value;
  const fix = own.position.value;
  if (!instance || !fix) return;
  userPickedPlace.value = true; // A late history fetch must not pan away from the GPS fix.
  instance.flyTo({ center: [fix.lon, fix.lat], zoom: Math.min(16, instance.getMaxZoom()), duration: 700 });
}
function startOwnLocation(): void {
  focusOnNextFix = own.start();
}
function focusOwnIfRequested(): void {
  if (!focusOnNextFix || !own.position.value || !map.value) return;
  focusOnNextFix = false;
  centerOnOwnLocation(); // Recenter only on the first fix or an explicit press, not on every update.
}
watch(() => own.position.value, () => { syncOwnMarker(); focusOwnIfRequested(); });
watch(() => own.active.value, (active) => { if (!active) focusOnNextFix = false; });
const reverse = useReversePlace();
const placeSearch = usePlaceSearch({
  // Search the loaded library's coverage, not just the currently visible few streets. MapCanvas
  // updates these bounds after /map-config arrives; the gateway keeps the query local to Photon.
  bbox: () => map.value?.getMaxBounds()?.toArray().flat().join(","),
  withinBounds: (place) => map.value?.getMaxBounds()?.contains([place.lon, place.lat]) ?? true
});
let fittedFor: string | null = null;
const userPickedPlace = ref(false);

function selectPlace(place: GeocodeResult): void {
  const instance = map.value;
  if (!instance || !placeSearch.results.value.some((result) => result.placeId === place.placeId)) return;
  // A map restricted to an installed region would silently clamp a hit outside that region.
  const bounds = instance.getMaxBounds();
  if (bounds && !bounds.contains([place.lon, place.lat])) return;
  userPickedPlace.value = true;
  placeSearch.clear();
  instance.flyTo({ center: [place.lon, place.lat], zoom: Math.min(16, instance.getMaxZoom()), duration: 700 });
}

const playbackStyle = computed(() => historyPlaybackStyle(theme.isDark));

/**
 * Live companion markers (T2.1.8): the peer positions the socket hands us, painted from the same planner
 * playback uses so the two overlays agree on ordering and on teardown.
 */
const live = useLiveCompanions({
  accessToken: computed(() => auth.accessToken),
  ensureSession: () => auth.refreshSession(),
  // The server echoes an accepted fix into the sender's own room, so without our own id a user who is
  // both broadcasting and receiving would draw themselves as one of their own companions.
  ownUserId: computed(() => auth.user?.id ?? null)
});
const liveStyle = computed(() => liveCompanionsStyle(theme.isDark));

/**
 * The maplibre calls the plan asked for, and nothing else. `data` and the layer spec cross a boundary
 * whose types come from a package (`@types/geojson`) this workspace does not resolve, so the values are
 * cast here once; the shapes themselves are pinned in `history/playback.test.ts` and
 * `live/companion-locations.test.ts`.
 */
type GeoJsonTarget = { setData(data: unknown): unknown };

function applyOp(instance: MapLibreMap, op: OverlayOp): void {
  switch (op.op) {
    case "addSource":
      instance.addSource(op.id, { type: "geojson", data: op.data } as Parameters<MapLibreMap["addSource"]>[1]);
      break;
    case "setData":
      (instance.getSource(op.id) as GeoJsonTarget | undefined)?.setData(op.data);
      break;
    case "addLayer":
      instance.addLayer(op.layer as Parameters<MapLibreMap["addLayer"]>[0], op.beforeId);
      break;
    case "setPaintProperty":
      // maplibre narrows the property name to its own union of known paint keys; the descriptor's keys
      // are literals pinned in `history/playback.test.ts`, so the call site widens the name, not the value.
      const setPaint = instance.setPaintProperty.bind(instance) as (layerId: string, key: string, value: unknown) => void;
      for (const [key, value] of Object.entries(op.paint)) setPaint(op.id, key, value);
      break;
    case "removeLayer":
      instance.removeLayer(op.id);
      break;
    case "removeSource":
      instance.removeSource(op.id);
      break;
  }
}

function mapState(instance: MapLibreMap) {
  return {
    styleLoaded: Boolean(instance.isStyleLoaded()),
    hasSource: (id: string) => Boolean(instance.getSource(id)),
    hasLayer: (id: string) => Boolean(instance.getLayer(id))
  };
}

function paintLive(): void {
  const instance = map.value;
  if (!instance) return;
  // The live overlay owns the top of the stack, so it names no `beforeLayerId`: appending is the only
  // order that does not depend on a layer the base style might not declare.
  for (const op of planOverlaySync(mapState(instance), liveStyle.value, () => live.overlay.value)) applyOp(instance, op);
}

function playbackMapState(instance: MapLibreMap) {
  const state = mapState(instance);
  // Only name a layer maplibre can actually find: an unknown `beforeId` throws, and during the first
  // paint after a theme switch the markers may not be re-added yet. Painted without it, playback sits on
  // top for one frame instead of the map refusing to paint at all.
  return instance.getLayer(LIVE_BOTTOM_LAYER_ID) ? { ...state, beforeLayerId: LIVE_BOTTOM_LAYER_ID } : state;
}

function paintPlayback(): void {
  const instance = map.value;
  if (!instance) return;
  for (const op of planPlaybackSync(playbackMapState(instance), playbackStyle.value, playback.frame.value)) applyOp(instance, op);
}

function frameCamera(): void {
  const instance = map.value;
  const track = playback.frames.value;
  if (!instance || track.length === 0 || userPickedPlace.value) return;
  const compact = window.matchMedia("(max-width: 1023px)").matches;
  const key = `${track[0]!.ms}:${track[track.length - 1]!.ms}:${track.length}:${compact}`;
  if (fittedFor === key) return;
  fittedFor = key;
  const bounds = playback.boundsForMap.value;
  if (bounds) {
    // In the narrow layout controls sit outside the map, so they need no reserved viewport space.
    instance.fitBounds(bounds, { padding: historyCameraPadding(compact), maxZoom: 15, duration: 700 });
    return;
  }
  const only = track[0]!;
  instance.easeTo({ center: [only.lon, only.lat], duration: 500 });
}

function showTrack(): void {
  userPickedPlace.value = false;
  fittedFor = null;
  frameCamera();
}

function repaintOverlays(): void {
  const instance = map.value;
  if (!instance) return;
  const state = mapState(instance);
  const styles = [liveStyle.value, playbackStyle.value];
  // `setData`/`setPaintProperty` from paintLive/paintPlayback can themselves trigger styledata
  // and then idle. Event-driven writes must be restore-only, or an unchanged map repaints forever.
  if (!needsOverlayRestore(state, styles.flatMap((style) => style.sources.map((source) => source.id)),
    styles.flatMap((style) => style.layers.map((layer) => layer.id)))) return;
  paintLive();
  paintPlayback();
}

let lastLongPressAt = 0;
function onMapClick(event: MapMouseEvent): void {
  // Some touch browsers synthesize a click after a long-press contextmenu event.
  if (Date.now() - lastLongPressAt < 700) return;
  reverse.select(event.lngLat.lat, event.lngLat.lng);
}
function onMapLongPress(event: MapMouseEvent): void {
  event.preventDefault();
  lastLongPressAt = Date.now();
  reverse.select(event.lngLat.lat, event.lngLat.lng);
}

function onMapReady(instance: MapLibreMap, MarkerClass: typeof Marker): void {
  markerConstructor = MarkerClass;
  map.value = instance;
  // A theme change calls `setStyle`, whose diff drops layers the new style does not declare — so every
  // `ready` (and every `styledata`/`idle` after an async style reload) re-ensures the overlay instead
  // of assuming it is still there. Live markers go first because playback asks to be inserted beneath them.
  instance.on("styledata", repaintOverlays);
  instance.on("idle", repaintOverlays);
  instance.on("click", onMapClick);
  instance.on("contextmenu", onMapLongPress);
  instance.on("resize", frameCamera);
  paintLive();
  paintPlayback();
  syncOwnMarker();
  frameCamera();
  focusOwnIfRequested();
}

watch(() => playback.frame.value, paintPlayback);
watch(() => playbackStyle.value, () => {
  paintLive();
  paintPlayback();
});
watch(() => live.overlay.value, paintLive);
// A peer arriving or ageing must never move the camera: the user chose where to look, and a dot that
// yanks the viewport every few seconds makes the map unusable. Playback frames the camera once per track.
watch(() => live.peers.value.length, paintLive);
watch(
  () => playback.frames.value,
  () => {
    paintPlayback();
    frameCamera();
  }
);
watch(
  () => auth.accessToken,
  (token) => {
    // Signing out must not leave somebody else's track on the screen; signing in offers the last 7 days
    // without the user having to press anything, which is the shortcut this panel exists for.
    fittedFor = null;
    if (!token) playback.points.value = [];
    else void playback.selectPreset(playback.presetDays.value || 7);
  }
);

onBeforeUnmount(() => {
  // `map.value` is cleared first: Vue runs a parent's `beforeUnmount` before the child's, so the map is
  // still alive here and nothing else can paint after this point.
  const instance = map.value;
  map.value = null;
  markerConstructor = null;
  own.stop();
  ownMarker?.remove();
  ownMarker = null;
  if (instance) {
    instance.off("styledata", repaintOverlays);
    instance.off("idle", repaintOverlays);
    instance.off("click", onMapClick);
    instance.off("contextmenu", onMapLongPress);
    instance.off("resize", frameCamera);
    for (const op of planPlaybackRemoval(mapState(instance), playbackStyle.value)) applyOp(instance, op);
    for (const op of planOverlayRemoval(mapState(instance), liveStyle.value)) applyOp(instance, op);
  }
});

// The first paint for a signed-in visitor: without this the map is empty until they touch a chip.
if (auth.accessToken) void playback.selectPreset(playback.presetDays.value);
</script>

<style scoped>
.user-map-view {
  position: relative;
  width: 100%;
  height: calc(100dvh - 132px);
  min-height: 28rem;
  overflow: hidden;
  background: #e8efec;
  isolation: isolate;
}

.user-map-view__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
}

.user-map-view__toolbar {
  position: absolute;
  z-index: 2;
  inset-block-start: 1rem;
  inset-inline-end: 1rem;
  width: min(25rem, calc(100% - 2rem));
  pointer-events: none;
}

.user-map-view__toolbar-card {
  display: flex;
  min-height: 4.6rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}

.user-map-view__dashboard-button {
  flex: 0 0 auto;
}

.user-map-view__title-block {
  min-width: 0;
  flex: 1 1 auto;
}

.user-map-view__title-block p {
  margin: 0;
  color: #718584;
  font-size: 0.72rem;
  font-weight: 700;
}

.user-map-view__title-block h1 {
  margin: 0.15rem 0 0;
  color: #193536;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.45;
}

.user-map-view__map-chip {
  flex: 0 0 auto;
}

.user-map-view__search {
  position: absolute;
  z-index: 3;
  inset-block-start: 6rem;
  inset-inline-end: 1rem;
  width: min(25rem, calc(100% - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.user-map-view__playback {
  position: absolute;
  z-index: 2;
  inset-block-start: 1rem;
  inset-inline-start: 1rem;
  width: min(24rem, calc(100% - 2rem));
  max-height: calc(100% - 2rem);
  pointer-events: none;
}

/*
 * The live panel replaces the placeholder notice that used to sit here. It is interactive (a retry
 * button) so unlike the playback column it does not set `pointer-events: none` — a card that swallows
 * drags is the price of a button that works, and the panel is small enough to live at the edge.
 */
.user-map-view__own {
  position: absolute;
  z-index: 2;
  inset-block-end: 1rem;
  inset-inline-end: 1rem;
  width: min(22rem, calc(100% - 2rem));
}

.user-map-view__own-card {
  display: grid;
  gap: 0.4rem;
  padding: 0.7rem 0.85rem;
  background: rgba(var(--v-theme-surface), 0.94);
  color: rgb(var(--v-theme-on-surface));
}

.user-map-view__own-card p { margin: 0; font-size: 0.8rem; direction: rtl; }
.user-map-view__own-card small { opacity: 0.8; }
.user-map-view__own-actions { display: flex; flex-wrap: wrap; gap: 0.25rem; }

.user-map-view__live {
  position: absolute;
  z-index: 2;
  inset-block-end: 1rem;
  inset-inline-start: 1rem;
  width: min(21rem, calc(100% - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

:global(:root.dark) .user-map-view__toolbar-card {
  background: rgba(27, 41, 42, 0.94);
}

:global(:root.dark) .user-map-view__title-block p {
  color: #a0b6b2;
}

:global(:root.dark) .user-map-view__title-block h1 {
  color: #edf5f2;
}

/* At narrow/tablet widths, side panels would overlap each other and cover the map.
 * Stack them in page flow instead; keep a definite canvas height for MapLibre. */
@media (max-width: 1023px) {
  .user-map-view {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    height: auto;
    min-height: calc(100dvh - 132px);
    padding: 0.65rem;
    overflow: visible;
  }

  .user-map-view > .user-map-view__canvas {
    position: relative;
    order: 2;
    flex: 0 0 auto;
    height: clamp(20rem, 55dvh, 32rem);
    min-height: 20rem;
    border-radius: 0.85rem;
  }

  .user-map-view__toolbar,
  .user-map-view__search,
  .user-map-view__playback,
  .user-map-view__own,
  .user-map-view__live {
    position: static;
    width: 100%;
    max-height: none;
    overflow: visible;
    pointer-events: auto;
  }

  .user-map-view__toolbar { order: 0; }
  .user-map-view__search { order: 1; }
  .user-map-view__playback { order: 3; }
  .user-map-view__own { order: 4; }
  .user-map-view__live { order: 5; }

  .user-map-view__toolbar-card {
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
  }

  .user-map-view__title-block h1 { font-size: 0.92rem; }
}

:global(:root.dark) .user-map-view { background: var(--bb-color-background); }
</style>
