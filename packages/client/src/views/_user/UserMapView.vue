<template>
  <section class="user-map-view" aria-label="نقشهٔ تعاملی همراهان">
    <MapCanvas
      class="user-map-view__canvas"
      :style-url="mapStyleUrl"
      aria-label="نقشهٔ تعاملی"
      @ready="onMapReady"
    />

    <!-- Isolate Vuetify's layout registration from the app shell: the map must stay full-screen. -->
    <div v-if="isPhone" class="user-map-view__dock-frame" @keydown.esc.stop="closeTool()">
      <v-layout class="user-map-view__dock-layout">
        <v-bottom-navigation
          class="user-map-view__dock"
          name="map-tools"
          tag="nav"
          aria-label="ابزارهای نقشه"
          :model-value="activeTool"
          :height="64"
          :mandatory="false"
          grow
          absolute
          @update:model-value="selectTool"
        >
          <v-btn
            v-for="tool in mapTools"
            :id="`map-tool-${tool.id}`"
            :key="tool.id"
            :value="tool.id"
            :color="activeTool === tool.id ? 'primary' : undefined"
            variant="text"
            :aria-label="tool.label"
            :title="tool.label"
            :aria-expanded="activeTool === tool.id"
            :aria-controls="`map-${tool.id}-panel`"
          >
            <v-icon :icon="tool.icon" size="20" aria-hidden="true" />
            <span class="user-map-view__dock-label">{{ tool.shortLabel }}</span>
          </v-btn>
        </v-bottom-navigation>
      </v-layout>
    </div>

    <ReverseAddressSheet :api="reverse" />

    <!-- One eager Vuetify sheet for all four panels. On tablet/desktop the host is a
         boxless div, so the original panels keep their normal positions and order. -->
    <component
      :is="isPhone ? VBottomSheet : 'div'"
      class="user-map-view__tool-host"
      :class="isPhone ? 'user-map-view__tool-sheet' : undefined"
      v-bind="isPhone ? phoneSheetProps : {}"
      @update:model-value="onSheetVisibilityChange"
    >
      <aside id="map-search-panel" v-show="!isPhone || activeTool === 'search'"
        class="user-map-view__search user-map-view__panel" :role="isPhone ? 'region' : undefined"
        :aria-label="isPhone ? 'جست‌وجوی مکان' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
        <div v-if="isPhone" class="user-map-view__panel-head">
          <strong>جست‌وجوی مکان</strong>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن جست‌وجو" @click="closeTool()" />
        </div>
        <PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" />
      </aside>

      <aside id="map-history-panel" v-show="!isPhone || activeTool === 'history'"
        class="user-map-view__playback user-map-view__panel" :role="isPhone ? 'region' : undefined"
        :aria-label="isPhone ? 'تاریخچهٔ مسیر' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
        <div v-if="isPhone" class="user-map-view__panel-head">
          <strong>تاریخچهٔ مسیر</strong>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن تاریخچه" @click="closeTool()" />
        </div>
        <HistoryPlaybackPanel
          :api="playback"
          :show-return-to-track="userControlledCamera && playback.frames.value.length > 0"
          @return-to-track="showTrack"
        />
      </aside>

      <aside id="map-own-panel" v-show="!isPhone || activeTool === 'own'"
        class="user-map-view__own user-map-view__panel" :role="isPhone ? 'region' : undefined"
        :aria-label="isPhone ? 'موقعیت من' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
        <div v-if="isPhone" class="user-map-view__panel-head">
          <strong>موقعیت من</strong>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن موقعیت من" @click="closeTool()" />
        </div>
        <OwnPositionBar :api="own" :ready="!!map" @start="startOwnLocation" @center="centerOnOwnLocation" />
      </aside>

      <aside id="map-live-panel" v-show="!isPhone || activeTool === 'live'"
        class="user-map-view__live user-map-view__panel" :role="isPhone ? 'region' : undefined"
        :aria-label="isPhone ? 'اشتراک و همراهان' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
        <div v-if="isPhone" class="user-map-view__panel-head">
          <strong>اشتراک و همراهان</strong>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن همراهان" @click="closeTool()" />
        </div>
        <LiveBroadcastBar compact />
        <LiveCompanionPanel :api="live" />
      </aside>
    </component>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { VBottomSheet } from "vuetify/components";
import type { Map as MapLibreMap, MapMouseEvent, MapMovementEvent, Marker } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import HistoryPlaybackPanel from "@/components/map/HistoryPlaybackPanel.vue";
import OwnPositionBar from "@/components/map/OwnPositionBar.vue";
import PlaceSearchPanel from "@/components/map/PlaceSearchPanel.vue";
import ReverseAddressSheet from "@/components/map/ReverseAddressSheet.vue";
import { useReversePlace } from "@/composables/use-reverse-place";
import type { GeocodeResult } from "@shared/index";
import { usePlaceSearch } from "@/composables/use-place-search";
import { placeSearchArea } from "@/map/place-search-area";
import LiveCompanionPanel from "@/components/map/LiveCompanionPanel.vue";
import LiveBroadcastBar from "@/components/sharing/LiveBroadcastBar.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { shareSessionKey } from "@/sharing/share-submission-fence";
import { useHistoryPlayback } from "@/composables/use-history-playback";
import { historyPlaybackStyle } from "@/history/playback";
import { historyCameraPadding } from "@/history/camera-padding";
import { planPlaybackRemoval, planPlaybackSync } from "@/history/playback-map-sync";
import { LIVE_BOTTOM_LAYER_ID, liveCompanionsStyle } from "@/live/companion-locations";
import { planOverlayRemoval, planOverlaySync, type OverlayOp } from "@/map/overlay-sync";
import { needsOverlayRestore } from "@/map/overlay-restore";
import { useLiveCompanions } from "@/composables/use-live-companions";
import { useOwnMapPosition } from "@/composables/use-own-map-position";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
const auth = useAuthStore();
const mapStyleUrl = computed(() => mapStyleForTheme(theme.isDark));
const mapPlaybackSession = computed(() => shareSessionKey(auth.user?.id ?? null, auth.accessToken));

// Only phones replace the full cards with a dock and an eager bottom sheet. v-show keeps
// every panel mounted (GPS, socket and playback included) while the sheet is closed.
type MapTool = "search" | "history" | "own" | "live";
const mapTools: { id: MapTool; label: string; shortLabel: string; icon: string }[] = [
  { id: "search", label: "جست‌وجوی مکان", shortLabel: "جست‌وجو", icon: "mdi-magnify" },
  { id: "history", label: "تاریخچهٔ مسیر", shortLabel: "تاریخچه", icon: "mdi-map-clock-outline" },
  { id: "own", label: "موقعیت من", shortLabel: "موقعیت", icon: "mdi-crosshairs-gps" },
  { id: "live", label: "اشتراک و همراهان", shortLabel: "همراهان", icon: "mdi-account-group-outline" }
];
const isPhone = useMediaQuery("(max-width: 599px)");
const activeTool = ref<MapTool | null>(null);
// A popstate changes Vue Router's history position before route-leave guards run.
// Vuetify's overlay Back hook is not guaranteed to intercept that navigation;
// keep the map visible on the first Back and dismiss just the open tool. Ordinary
// menu/link navigation (a push) must still leave immediately.
let mapEntryPosition: number | undefined;
onMounted(() => {
  const position: unknown = window.history.state?.position;
  mapEntryPosition = typeof position === "number" ? position : undefined;
});
onBeforeRouteLeave(() => {
  const position: unknown = window.history.state?.position;
  if (isPhone.value && activeTool.value && typeof position === "number" &&
    mapEntryPosition !== undefined && position < mapEntryPosition) {
    closeTool();
    return false;
  }
});

// The desktop host is a boxless div; do not put dialog/overlay attributes on it.
const phoneSheetProps = computed(() => ({
  modelValue: activeTool.value !== null,
  scrim: false,
  // The map (including its dock and controls) is part of the activator, so a
  // dock switch isn't an outside click. Let Vuetify handle Back and outside clicks.
  activator: ".user-map-view",
  activatorProps: { "aria-haspopup": undefined },
  openOnClick: false,
  persistent: false,
  closeOnBack: true,
  retainFocus: false,
  captureFocus: false,
  scrollStrategy: "none" as const,
  eager: true,
  "aria-modal": "false",
  "aria-hidden": activeTool.value === null ? "true" : undefined,
  "aria-label": mapTools.find(tool => tool.id === activeTool.value)?.label
}));

// Vuetify's non-mandatory selection lets tapping the active tool close it again.
// Keep selection and panel visibility on the same state, then move keyboard focus.
async function selectTool(next: MapTool | null): Promise<void> {
  const previous = activeTool.value;
  if (next === previous) return;
  activeTool.value = next;
  await nextTick();
  if (next) document.getElementById(`map-${next}-panel`)?.focus();
  else if (previous) document.getElementById(`map-tool-${previous}`)?.focus();
}

// Keep Vuetify's model and the dock selection in sync on all other close paths.
function onSheetVisibilityChange(visible: boolean): void {
  if (!visible && activeTool.value) closeTool();
}

function closeTool(restoreFocus = true): void {
  const tool = activeTool.value;
  if (!tool) return;
  activeTool.value = null;
  // A map tap may open the *modal* reverse-address sheet immediately afterwards.
  // Do not move focus behind that dialog when dismissing the nonmodal tool.
  if (restoreFocus) void nextTick(() => document.getElementById(`map-tool-${tool}`)?.focus());
}

function onPanelEscape(event: KeyboardEvent): void {
  if (!isPhone.value) return;
  event.stopPropagation();
  closeTool();
}

watch(isPhone, (phone) => {
  if (!phone) activeTool.value = null;
  fittedFor = null;
  frameCamera(); // A phone/tablet switch changes both the canvas and its reserved camera edges.
});

/**
 * History playback, wired to the map.
 *
 * The view owns the composable rather than the panel because the *map* has to follow the cursor, not a
 * control: the panel is a renderer and this file is where a `MapLibreMap` exists.
 */
const playback = useHistoryPlayback({
  accessToken: computed(() => auth.accessToken),
  ownerId: computed(() => auth.user?.id ?? null),
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
  userControlledCamera.value = true; // A late history fetch must not pan away from the GPS fix.
  instance.flyTo({ center: [fix.lon, fix.lat], zoom: Math.min(16, instance.getMaxZoom()), duration: 700 });
  if (isPhone.value && activeTool.value === "own") closeTool();
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
  area: (scope) => {
    const library = map.value?.getMaxBounds() ?? null;
    return placeSearchArea(library, scope === "viewport" ? map.value?.getBounds() ?? null : library);
  }
});
let fittedFor: string | null = null;
const userControlledCamera = ref(false);
let selectedPlaceMarker: Marker | null = null;

function syncSelectedPlaceMarker(): void {
  const instance = map.value;
  const place = placeSearch.results.value.find((result) => result.placeId === placeSearch.selectedPlaceId.value);
  if (!instance || !markerConstructor || !place) {
    selectedPlaceMarker?.remove();
    selectedPlaceMarker = null;
    return;
  }
  // Keep one distinct pin for the currently selected POI, not a pin for every search hit.
  // Marker is supplied by MapCanvas after its lazy MapLibre import; no eager map chunk here.
  if (!selectedPlaceMarker) {
    selectedPlaceMarker = new markerConstructor({ color: "#7c3aed" })
      .setLngLat([place.lon, place.lat]).addTo(instance);
  } else selectedPlaceMarker.setLngLat([place.lon, place.lat]);
  selectedPlaceMarker.getElement().setAttribute("aria-label", `مکان انتخاب‌شده: ${place.name}`);
  selectedPlaceMarker.getElement().setAttribute("title", place.name);
}
watch(() => placeSearch.selectedPlaceId.value, syncSelectedPlaceMarker, { flush: "sync" });

function selectPlace(place: GeocodeResult): void {
  const instance = map.value;
  if (!instance || !placeSearch.results.value.some((result) => result.placeId === place.placeId)) return;
  // A map restricted to an installed region would silently clamp a hit outside that region.
  const bounds = instance.getMaxBounds();
  if (bounds && !bounds.contains([place.lon, place.lat])) return;
  if (!placeSearch.select(place)) return;
  userControlledCamera.value = true;
  // MapLibre forwards eventData to moveend. This camera flight must keep the other search
  // results selectable; an actual pan/zoom afterwards will refresh the visible-bbox search.
  instance.flyTo({ center: [place.lon, place.lat], zoom: Math.min(16, instance.getMaxZoom()), duration: 700 },
    { placeSearchSelection: true });
  // Reveal the pin rather than flying beneath the phone panel. Results remain mounted for
  // picking another hit when the search tool is opened again.
  if (isPhone.value && activeTool.value === "search") closeTool();
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
  if (!instance || track.length === 0 || userControlledCamera.value) return;
  const compact = window.matchMedia("(max-width: 1023px)").matches;
  const key = `${track[0]!.ms}:${track[track.length - 1]!.ms}:${track.length}:${compact}:${isPhone.value}`;
  if (fittedFor === key) return;
  fittedFor = key;
  const bounds = playback.boundsForMap.value;
  if (bounds) {
    // Tablet controls are in flow; phone chrome and SOS sit over the full-screen canvas.
    const padding = historyCameraPadding(compact, isPhone.value ? window.innerHeight : undefined);
    instance.fitBounds(bounds, { padding, maxZoom: 15, duration: 700 });
    return;
  }
  const only = track[0]!;
  instance.easeTo({ center: [only.lon, only.lat], duration: 500 });
}

function showTrack(): void {
  // Stop any in-flight gesture/inertia first: its moveend still carries the original DOM event.
  // Otherwise it can immediately mark the just-restored track as user-controlled again.
  map.value?.stop();
  userControlledCamera.value = false;
  fittedFor = null;
  frameCamera();
  if (isPhone.value && activeTool.value === "history") closeTool();
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
  if (isPhone.value && activeTool.value) closeTool(false);
  reverse.select(event.lngLat.lat, event.lngLat.lng);
}
function onMapLongPress(event: MapMouseEvent): void {
  event.preventDefault();
  lastLongPressAt = Date.now();
  if (isPhone.value && activeTool.value) closeTool(false);
  reverse.select(event.lngLat.lat, event.lngLat.lng);
}

function markUserCameraMove(event: MapMovementEvent): void {
  // MapLibre forwards originalEvent from drag/wheel/keyboard gestures and its zoom controls,
  // but not from our fitBounds/easeTo. Mark intent at movestart so a history read that finishes
  // while the user is still dragging cannot snap the camera back to the track.
  if (event.originalEvent) userControlledCamera.value = true;
}

function onMapMoveEnd(event: MapMovementEvent): void {
  markUserCameraMove(event); // Also cover gestures whose start preceded this listener.
  // Choosing a search hit already marks the camera as user-chosen, but its own flyTo must not
  // discard the other hits. A subsequent physical map move can refresh the visible-bbox list.
  if ("placeSearchSelection" in event && event.placeSearchSelection === true) return;
  placeSearch.refreshForViewport();
}

function onMapReady(instance: MapLibreMap, MarkerClass: typeof Marker): void {
  if (map.value !== instance) { selectedPlaceMarker?.remove(); selectedPlaceMarker = null; }
  markerConstructor = MarkerClass;
  map.value = instance;
  // A theme change calls `setStyle`, whose diff drops layers the new style does not declare — so every
  // `ready` (and every `styledata`/`idle` after an async style reload) re-ensures the overlay instead
  // of assuming it is still there. Live markers go first because playback asks to be inserted beneath them.
  instance.on("styledata", repaintOverlays);
  instance.on("idle", repaintOverlays);
  instance.on("click", onMapClick);
  instance.on("contextmenu", onMapLongPress);
  instance.on("movestart", markUserCameraMove);
  instance.on("moveend", onMapMoveEnd);
  instance.on("resize", frameCamera);
  paintLive();
  paintPlayback();
  syncOwnMarker();
  syncSelectedPlaceMarker();
  frameCamera();
  focusOwnIfRequested();
}

watch(() => playback.frame.value, paintPlayback);
watch(() => playbackStyle.value, () => {
  paintLive();
  paintPlayback();
});
watch(() => live.overlay.value, paintLive);
// The overlay already changes when peers arrive or leave; a second peer-count watcher would
// duplicate MapLibre setData on those updates. An age-only tick updates the status panel, not
// map GeoJSON. Peers never move the camera: the user chose where to look.
watch(
  () => playback.frames.value,
  () => {
    paintPlayback();
    frameCamera();
  }
);
// A fresh login needs a fresh own-history read, but a bearer rotated within the *same* JWT
// session must not reset a selected grant, playback cursor or timer. Follow the account/session
// boundary instead of the raw token; clear the old overlay synchronously on logout/mismatch.
watch(
  mapPlaybackSession,
  (next, previous) => {
    if (next === previous) return;
    fittedFor = null;
    if (!next) playback.points.value = [];
    else void playback.selectPreset(playback.presetDays.value || 7);
  },
  { flush: "sync" }
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
  selectedPlaceMarker?.remove();
  selectedPlaceMarker = null;
  if (instance) {
    instance.off("styledata", repaintOverlays);
    instance.off("idle", repaintOverlays);
    instance.off("click", onMapClick);
    instance.off("contextmenu", onMapLongPress);
    instance.off("movestart", markUserCameraMove);
    instance.off("moveend", onMapMoveEnd);
    instance.off("resize", frameCamera);
    for (const op of planPlaybackRemoval(mapState(instance), playbackStyle.value)) applyOp(instance, op);
    for (const op of planOverlayRemoval(mapState(instance), liveStyle.value)) applyOp(instance, op);
  }
});

// The first paint for a verified login: without this the map is empty until they touch a chip.
if (mapPlaybackSession.value) void playback.selectPreset(playback.presetDays.value);
</script>

<style scoped>
.user-map-view {
  position: relative;
  width: 100%;
  height: calc(100dvh - 120px);
  min-height: 28rem;
  overflow: hidden;
  background: #e8efec;
  isolation: isolate;
}

/* Without a box, desktop absolute offsets and tablet flex order stay unchanged. */
.user-map-view__tool-host { display: contents; }

.user-map-view__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
}

/* This page is RTL: MapLibre's physical top-right rail sits directly behind the history card.
 * Dock only this map's native navigation controls in the gap between history and search;
 * other MapCanvas users keep their own edge controls and MapLibre button behavior. */
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
  top: 1rem;
  left: 50%;
  right: auto;
  width: 132px;
  transform: translateX(-50%);
}

.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl) {
  margin: 0;
}

/* A short horizontal rail stays within the existing top camera padding, rather than
 * running down the middle of the map. MapLibre still owns click, keyboard and compass logic. */
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group) {
  display: flex;
}

.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group button + button) {
  border-top: 0;
  border-inline-start: 1px solid #627a7a;
}

.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group button) {
  min-width: 44px;
  min-height: 44px;
}

.user-map-view__search {
  position: absolute;
  z-index: 3;
  inset-block-start: 1rem;
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

/* At narrow/tablet widths, side panels would overlap each other and cover the map.
 * Stack them in page flow instead; keep a definite canvas height for MapLibre. */
@media (max-width: 1023px) {
  .user-map-view {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    height: auto;
    min-height: calc(100dvh - 120px);
    padding: 0.65rem;
    overflow: visible;
  }

  .user-map-view > .user-map-view__canvas {
    position: relative;
    order: 2;
    flex: 0 0 auto;
    height: clamp(20rem, 55dvh, 32rem);
    min-height: 20rem;
    border-radius: var(--bb-radius-nested, 16px);
  }

  /* In flow there are no cards over the canvas; return navigation to its familiar edge. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    top: 0;
    right: 0;
    left: auto;
    width: auto;
    transform: none;
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl) {
    margin: 10px 10px 0 0;
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group) {
    display: block;
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group button + button) {
    border-top: 1px solid #627a7a;
    border-inline-start: 0;
  }

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

  .user-map-view__search { order: 1; }
  .user-map-view__playback { order: 3; }
  .user-map-view__own { order: 4; }
  .user-map-view__live { order: 5; }
}

/* Phone map: an edge-to-edge viewport behind the slim app rail, not a map squeezed between
 * stacked cards. The four complete tools remain mounted, but one scrollable surface opens over
 * the tiles at a time. Short screens reserve space for the safety SOS control and launcher. */
@media (max-width: 599px) {
  .user-map-view {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: block;
    width: 100%;
    height: 100dvh;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .user-map-view > .user-map-view__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: 0;
  }

  /* Keep native zoom and compass together at the top edge, clear of the app bar. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    top: calc(4rem + env(safe-area-inset-top, 0px));
    right: 0.75rem;
    left: auto;
    width: 132px;
    transform: none;
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl) { margin: 0; }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group) { display: flex; }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group button + button) {
    border-top: 0;
    border-inline-start: 1px solid #627a7a;
  }
  /* Attribution stays visible between the app bar and the bottom sheet, never
   * buried beneath an open tool or the SOS pill. Preserve MapLibre's own control. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right) {
    top: calc(4rem + env(safe-area-inset-top, 0px));
    bottom: auto;
    left: 0.25rem;
    right: auto;
  }
  /* The map's real OSM/OpenMapTiles credit is much wider than a compact phone.
   * Include its built-in padding in the cap, so its expanded text wraps beside
   * (not over) the native zoom rail and remains fully readable. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib) {
    box-sizing: border-box;
    max-width: calc(100vw - 9.5rem);
    margin: 0;
  }

  /* A nested Vuetify layout keeps bottom-navigation from reserving space in
   * the app shell. The frame positions the dock; Vuetify owns its selection. */
  .user-map-view__dock-frame {
    position: absolute;
    z-index: 5;
    inset-block-end: calc(0.75rem + env(safe-area-inset-bottom, 0px));
    left: 50%;
    width: min(19rem, calc(100% - 1.5rem));
    height: 4rem;
    flex: none;
    transform: translateX(-50%);
  }
  .user-map-view__dock-layout { width: 100%; height: 100%; }
  .user-map-view__dock {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    border-radius: 1.25rem;
    background: rgba(var(--v-theme-surface), 0.97);
    box-shadow: var(--bb-shadow-overlay);
    backdrop-filter: blur(12px);
  }
  .user-map-view__dock :deep(.v-bottom-navigation__content) {
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem;
  }
  /* Vuetify's 80px minimum would clip four tools on a 320px-wide phone. */
  .user-map-view__dock :deep(.v-bottom-navigation__content > .v-btn) {
    flex: 1 1 0;
    min-width: 44px;
    max-width: none;
    height: 56px;
    border-radius: 1rem;
  }
  .user-map-view__dock :deep(.v-bottom-navigation__content > .v-btn.v-btn--selected) {
    background: rgba(var(--v-theme-primary), 0.14);
  }
  .user-map-view__dock-label { font-size: 0.75rem; font-weight: 700; line-height: 1.2; white-space: nowrap; }
  .user-map-view__dock :deep(.v-btn:focus-visible) { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }

  /* Vuetify owns the sheet transition and portal; place its interactive content
   * above SOS + dock, leaving the rest of the overlay click-through. The long
   * widgets scroll here (not inside a shrunken flex child). */
  :global(.user-map-view__tool-sheet.v-bottom-sheet > .v-bottom-sheet__content.v-overlay__content) {
    inset-block-start: auto;
    inset-inline: 0;
    inset-block-end: calc(9.75rem + env(safe-area-inset-bottom, 0px));
    margin: 0 auto;
    width: min(26rem, calc(100% - 1.5rem));
    max-height: min(60dvh, calc(100dvh - 18.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
    border-radius: var(--bb-radius-card, 24px);
    background: rgba(var(--v-theme-surface), 0.97);
    box-shadow: var(--bb-shadow-overlay);
    backdrop-filter: blur(12px);
  }
  /* Vuetify slides a bottom sheet by its entire height. Here the sheet sits
   * ABOVE SOS + dock: that slide would sweep through and intercept both controls
   * until the animation finishes (even an 8px shift hits the landscape dock).
   * Fade in place so a quick second tap always reaches the navigation. */
  :global(.user-map-view__tool-sheet .bottom-sheet-transition-enter-from),
  :global(.user-map-view__tool-sheet .bottom-sheet-transition-leave-to) {
    transform: none;
    opacity: 0;
  }
  .user-map-view__panel {
    position: static;
    width: 100%;
    max-height: none;
    overflow: visible;
    /* The Vuetify content is the scrollable/card surface, not each aside. */
    pointer-events: auto;
  }
  /* Flex containers must overflow the aside, not squeeze card contents into
   * their own hidden overflow (which leaves the bottom actions unreachable). */
  .user-map-view__panel > :not(.user-map-view__panel-head) { flex-shrink: 0; }
  .user-map-view__panel:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
  .user-map-view__panel-head {
    position: sticky;
    top: 0;
    z-index: 2;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding-inline: 0.75rem 0.25rem;
    color: rgb(var(--v-theme-on-surface));
    background: rgb(var(--v-theme-surface));
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  }
  .user-map-view__panel-head :deep(.v-btn) { min-width: 44px; min-height: 44px; }
  .user-map-view__search, .user-map-view__playback, .user-map-view__own, .user-map-view__live {
    pointer-events: auto;
  }
  .user-map-view__playback :deep(.history-playback) { width: 100%; max-height: none; overflow: visible; }
}

/* Landscape/keyboard-short viewports: scroll the full-sized tool above the dock.
 * Leave room for attribution at the top; SOS remains above the sheet in z-order. */
@media (max-width: 599px) and (max-height: 480px) {
  :global(.user-map-view__tool-sheet.v-bottom-sheet > .v-bottom-sheet__content.v-overlay__content) {
    top: calc(7rem + env(safe-area-inset-top, 0px));
    inset-block-end: auto;
    max-height: calc(100dvh - 11.75rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
}

/* Very short portrait widths cannot fit a side lane. Cap the sheet before the
 * SOS button instead, while its original content remains scrollable. */
@media (max-width: 479px) and (max-height: 480px) {
  :global(.user-map-view__tool-sheet.v-bottom-sheet > .v-bottom-sheet__content.v-overlay__content) {
    top: calc(8.25rem + env(safe-area-inset-top, 0px));
    max-height: calc(100dvh - 17.25rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
}

/* In short landscape, a left-aligned sheet leaves a separate lane for SOS and
 * the native zoom rail. Put the noninteractive scale beside, not under, the dock. */
@media (min-width: 480px) and (max-width: 599px) and (max-height: 480px) {
  :global(.user-map-view__tool-sheet.v-bottom-sheet > .v-bottom-sheet__content.v-overlay__content) {
    inset-inline: auto;
    left: 0.75rem;
    right: auto;
    margin-inline: 0;
    width: min(23rem, calc(100% - 11.5rem));
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }
}

:global(:root.dark .user-map-view) { background: var(--bb-color-background); }
</style>
