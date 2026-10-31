<template>
  <section class="user-map-view" aria-label="نقشهٔ تعاملی همراهان">
    <MapCanvas
      class="user-map-view__canvas"
      :style-url="mapStyleUrl"
      :show-zoom="false"
      aria-label="نقشهٔ تعاملی"
      @ready="onMapReady"
    />

    <!-- On phones Search is modal; this map-side action makes other POIs reachable
         again after zooming into one without reopening the full-screen dialog. -->
    <div v-if="isPhone && showAllResultsOnMap" v-show="!activeTool && !placeDetailOpen"
      class="user-map-view__search-map-actions">
      <v-btn color="primary" variant="flat" prepend-icon="mdi-map-marker-multiple" size="small"
        :disabled="!placeSearch.mapResults.value.length" aria-label="نمایش دوبارهٔ همهٔ نتایج روی نقشه"
        @click="showAllSearchResults">
        همهٔ نتایج ({{ placeSearch.mapResults.value.length.toLocaleString('fa-IR') }})
      </v-btn>
      <span v-if="placeSearch.loading.value" role="status">در حال به‌روزرسانی نتایج…</span>
      <template v-else-if="placeSearch.failed.value">
        <span role="alert">به‌روزرسانی ناموفق؛ فقط نتایج داخل محدوده.</span>
        <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-refresh"
          aria-label="تلاش دوباره برای نتایج این محدوده" @click="placeSearch.retry()">تلاش دوباره</v-btn>
      </template>
      <span v-else-if="!placeSearch.results.value.length" role="status">در این محدوده نتیجهٔ جدیدی نیست.</span>
    </div>

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

    <!-- Keep location a map feature, not a fourth panel. This is a private GPS
         watcher; opening the map never starts outgoing location sharing. -->
    <v-btn
      class="user-map-view__recenter"
      v-show="!(isShortPhone && activeTool)"
      :icon="own.error.value || recenterError ? 'mdi-crosshairs-question' : 'mdi-crosshairs-gps'"
      :color="own.error.value || recenterError ? 'warning' : 'primary'"
      :aria-label="recenterLabel"
      :title="recenterLabel"
      :disabled="!map || !auth.user"
      variant="flat"
      @click="centerOnOwnLocation"
    />
    <!-- Sharing is opt-in, independent of the private map GPS watcher. The same
         broadcast store powers the full companion dialog and dashboard. -->
    <v-btn
      class="user-map-view__share"
      v-show="!(isShortPhone && activeTool)"
      :icon="broadcast.view.isActive ? 'mdi-broadcast' : 'mdi-broadcast-off'"
      :color="broadcast.view.tone === 'error' || broadcast.view.tone === 'warn' ? 'warning' : broadcast.view.isActive ? 'success' : 'primary'"
      :aria-label="broadcast.view.actionLabel"
      :title="`${broadcast.view.headline}؛ ${broadcast.view.detail}`"
      :aria-pressed="broadcast.view.isActive"
      :disabled="!auth.user || auth.mustCompleteSecurityQuestions || !broadcast.isSupported"
      variant="flat"
      @click="broadcast.toggle()"
    />
    <span v-if="isPhone && activeTool !== 'live' && (broadcast.view.tone === 'warn' || broadcast.view.tone === 'error')"
      class="sr-only" role="status" aria-live="polite">{{ broadcast.view.headline }}؛ {{ broadcast.view.detail }}</span>
    <span v-if="own.error.value || recenterError" class="sr-only" role="status" aria-live="polite">
      {{ recenterError ?? own.error.value }}
    </span>

    <p v-if="!journey.point.value && !activeTool" class="user-map-view__hold-hint">برای انتخاب مقصد، انگشت یا کلیک چپ را روی نقشه نگه دارید.</p>
    <div v-if="journey.point.value && !journey.sheetOpen.value && !placeDetailOpen" class="user-map-view__journey-bar" role="status">
      <v-icon :icon="journey.navigating.value ? 'mdi-navigation-variant' : 'mdi-map-marker'" size="21" aria-hidden="true" />
      <span>{{ journey.navigating.value ? (own.position.value ? `فاصلهٔ مستقیم تا مقصد: ${journey.remaining.value === null ? 'نامشخص' : formatRouteDistance(journey.remaining.value)}` : 'در انتظار GPS؛ موقعیت زنده در دسترس نیست') : journey.title.value }}</span>
      <v-btn v-if="journey.navigating.value" variant="tonal" color="error" @click="stopPointNavigation">توقف</v-btn>
      <v-btn v-else variant="tonal" color="primary" @click="journey.sheetOpen.value = true">جزئیات مسیر</v-btn>
    </div>
    <PointRouteSheet :api="journey" :reverse="reverse" :own-fix="own.position.value"
      :can-show-place-details="!!destinationSearchPlace" @start="startPointNavigation" @details="openSelectedPlaceDetail" />
    <CompanionDetailSheet :peer="selectedCompanion" :observed-at-ms="selectedObservedAtMs"
      :profile="selectedProfile" :profile-loading="profileLoading" :profile-failed="profileFailed"
      :place="selectedPlace" :place-loading="placeLoading" :place-failed="placeFailed"
      @close="removeSelectedCompanion" @retry-profile="loadSelectedProfile" @retry-place="loadSelectedPlace" />

    <!-- Phone search gets the same full-height dialog treatment as Companions;
         wider maps retain the existing in-flow/side search panel. -->
    <component :is="isPhone ? VDialog : 'div'" class="user-map-view__search-dialog"
      v-bind="isPhone ? phoneSearchDialogProps : {}"
      @update:model-value="onSearchDialogVisibilityChange">
      <v-card class="user-map-view__search-surface" rounded="xl">
        <v-card-title v-if="isPhone" class="user-map-view__search-title">
          <h2>جست‌وجوی مکان</h2>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن جست‌وجو" @click="closeTool()" />
        </v-card-title>
        <v-card-text class="user-map-view__search-body">
          <aside id="map-search-panel" v-show="!isPhone || activeTool === 'search'"
            class="user-map-view__search user-map-view__panel" :role="isPhone ? 'region' : undefined"
            :aria-label="isPhone ? 'جست‌وجوی مکان' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
            <PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" @show-all="showAllSearchResults" />
          </aside>
        </v-card-text>
      </v-card>
    </component>

    <PlaceDetailSheet :place="placeDetailOpen ? destinationSearchPlace : null"
      @close="closePlaceDetail" @after-leave="onPlaceDetailAfterLeave" />

    <!-- History needs the full phone viewport for range, transport and scrub controls.
         Tablet/desktop keep the existing in-flow/side playback panel. -->
    <component :is="isPhone ? VDialog : 'div'" class="user-map-view__history-dialog"
      v-bind="isPhone ? phoneHistoryDialogProps : {}"
      @update:model-value="onHistoryDialogVisibilityChange">
      <v-card class="user-map-view__history-surface" rounded="xl">
        <v-card-title v-if="isPhone" class="user-map-view__history-title">
          <h2>تاریخچهٔ مسیر</h2>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن تاریخچه" @click="closeTool()" />
        </v-card-title>
        <v-card-text class="user-map-view__history-body">
          <aside id="map-history-panel" v-show="!isPhone || activeTool === 'history'"
            class="user-map-view__playback user-map-view__panel" :role="isPhone ? 'region' : undefined"
            :aria-label="isPhone ? 'تاریخچهٔ مسیر' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
            <HistoryPlaybackPanel
              :api="playback"
              :expanded="isPhone && activeTool === 'history'"
              :show-return-to-track="userControlledCamera && playback.frames.value.length > 0"
              @return-to-track="showTrack"
            />
          </aside>
        </v-card-text>
      </v-card>
    </component>

    <!-- A phone's companions tool is a true fullscreen dialog, not another cramped
         bottom sheet. Desktop/tablet keep their original map-side position. -->
    <component
      :is="isPhone ? VDialog : 'div'"
      class="user-map-view__live-dialog"
      v-bind="isPhone ? phoneLiveDialogProps : {}"
      @update:model-value="onLiveDialogVisibilityChange"
    >
      <v-card class="user-map-view__live-surface" rounded="xl">
        <v-card-title v-if="isPhone" class="user-map-view__live-title">
          <h2>همراهان</h2>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن همراهان" @click="closeTool()" />
        </v-card-title>
        <v-card-text class="user-map-view__live-body">
          <aside id="map-live-panel" class="user-map-view__live user-map-view__panel"
            :role="isPhone ? 'region' : undefined" aria-label="همراهان"
            tabindex="-1" @keydown.esc="onPanelEscape">
            <LiveCompanionPanel :api="live" :visible="showCompanions" :selected-user-id="selectedCompanionId"
              :broadcast-status="broadcast.view.tone === 'warn' || broadcast.view.tone === 'error' ? broadcast.view : null"
              @update:visible="showCompanions = $event" @select="selectCompanion" @create-share="shareOpen = true" />
            <p v-if="peerSelectionError" class="user-map-view__peer-error" role="status" aria-live="polite">{{ peerSelectionError }}</p>
          </aside>
        </v-card-text>
      </v-card>
    </component>

    <ShareDialog v-model="shareOpen" :fullscreen="isPhone" @shared="onShareCreated" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { VDialog } from "vuetify/components";
import type { Map as MapLibreMap, MapMovementEvent, Marker } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import HistoryPlaybackPanel from "@/components/map/HistoryPlaybackPanel.vue";
import PlaceSearchPanel from "@/components/map/PlaceSearchPanel.vue";
import { resultCameraPadding, resultExtent, resultMarkerOffsets } from "@/map/search-result-markers";
import PointRouteSheet from "@/components/map/PointRouteSheet.vue";
import { createHoldToSelect, type HoldPointer } from "@/map/hold-to-select";
import { usePointRoute } from "@/composables/use-point-route";
import { formatRouteDistance } from "@/sos/route-preview";
import PlaceDetailSheet from "@/components/map/PlaceDetailSheet.vue";
import CompanionDetailSheet from "@/components/map/CompanionDetailSheet.vue";
import { reversePlace } from "@/api/geocoding";
import { searchUsers } from "@/api/location";
import { avatarInitial } from "@/live/avatar-initial";
import { useReversePlace } from "@/composables/use-reverse-place";
import type { GeocodeResult, ReverseGeocodeResult, UserSearchResult } from "@shared/index";
import { usePlaceSearch } from "@/composables/use-place-search";
import { placeSearchArea } from "@/map/place-search-area";
import LiveCompanionPanel from "@/components/map/LiveCompanionPanel.vue";
import ShareDialog from "@/components/sharing/ShareDialog.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { shareSessionKey } from "@/sharing/share-submission-fence";
import { useHistoryPlayback } from "@/composables/use-history-playback";
import { historyPlaybackStyle } from "@/history/playback";
import { historyCameraPadding } from "@/history/camera-padding";
import { planPlaybackRemoval, planPlaybackSync } from "@/history/playback-map-sync";
import { LIVE_BOTTOM_LAYER_ID, liveCompanionsStyle } from "@/live/companion-locations";
import { planOverlayRemoval, planOverlaySync, pointsOverlay, type OverlayOp } from "@/map/overlay-sync";
import { needsOverlayRestore } from "@/map/overlay-restore";
import { useLiveCompanions } from "@/composables/use-live-companions";
import { useOwnMapPosition } from "@/composables/use-own-map-position";
import { useAuthStore } from "@/stores/auth";
import { useBroadcastStore } from "@/stores/broadcast";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
const auth = useAuthStore();
const broadcast = useBroadcastStore();
const mapStyleUrl = computed(() => mapStyleForTheme(theme.isDark));
const mapPlaybackSession = computed(() => shareSessionKey(auth.user?.id ?? null, auth.accessToken));

// Phones put search and companions in separate fullscreen dialogs, with a small
// history sheet. The view owns the sockets so closing a tool does not stop sharing.
type MapTool = "search" | "history" | "live";
const mapTools: { id: MapTool; label: string; shortLabel: string; icon: string }[] = [
  { id: "search", label: "جست‌وجوی مکان", shortLabel: "جست‌وجو", icon: "mdi-magnify" },
  { id: "history", label: "تاریخچهٔ مسیر", shortLabel: "تاریخچه", icon: "mdi-map-clock-outline" },
  { id: "live", label: "همراهان", shortLabel: "همراهان", icon: "mdi-account-group-outline" }
];
const isPhone = useMediaQuery("(max-width: 599px)");
const isShortPhone = useMediaQuery("(max-width: 479px) and (max-height: 560px)");
const activeTool = ref<MapTool | null>(null);
const shareOpen = ref(false);
function onShareCreated(): void {
  // A new outgoing grant can change the device assigned to broadcast; do not start GPS here.
  void broadcast.refreshPriority();
}
watch(shareOpen, (open, previous) => {
  if (!open && previous) void nextTick(() => document.getElementById("map-share-location-button")?.focus());
});
// A popstate changes Vue Router's history position before route-leave guards run.
// Vuetify's overlay Back hook is not guaranteed to intercept that navigation;
// keep the map visible on the first Back and dismiss just the open tool. Ordinary
// menu/link navigation (a push) must still leave immediately.
let mapEntryPosition: number | undefined;
onMounted(() => {
  const position: unknown = window.history.state?.position;
  mapEntryPosition = typeof position === "number" ? position : undefined;
  // The modal no longer mounts LiveBroadcastBar; keep the map share control's
  // multi-device status fresh without starting outgoing location sharing.
  void broadcast.refreshPriority();
});
onBeforeRouteLeave(() => {
  const position: unknown = window.history.state?.position;
  if (isPhone.value && (shareOpen.value || activeTool.value || selectedCompanionId.value || placeDetailOpen.value || journey.sheetOpen.value) && typeof position === "number" &&
    mapEntryPosition !== undefined && position < mapEntryPosition) {
    if (shareOpen.value) shareOpen.value = false;
    else if (journey.sheetOpen.value) journey.sheetOpen.value = false;
    else if (placeDetailOpen.value) closePlaceDetail();
    else if (selectedCompanionId.value) removeSelectedCompanion();
    else closeTool();
    return false;
  }
});

// The desktop hosts are boxless divs; only phones register Vuetify overlays.
const phoneHistoryDialogProps = computed(() => ({
  modelValue: activeTool.value === "history",
  fullscreen: true,
  scrollable: true,
  eager: true,
  // The route-leave guard consumes the first Back; a second Vuetify handler
  // would leave the map altogether rather than close History.
  closeOnBack: false,
  "aria-label": "تاریخچهٔ مسیر"
}));

// Vuetify's non-mandatory group emits undefined when the selected button is tapped
// again. Normalize it to null: otherwise the sheet's `activeTool !== null` stays
// true while its panels are hidden, leaving an empty interactive overlay.
// Keep selection and panel visibility on the same state, then move keyboard focus.
async function selectTool(next: MapTool | null | undefined): Promise<void> {
  const selected = next ?? null;
  const previous = activeTool.value;
  if (selected === previous) return;
  if (selected) closePlaceDetail(false);
  activeTool.value = selected;
  await nextTick();
  if (selected) document.getElementById(`map-${selected}-panel`)?.focus();
  else if (previous) document.getElementById(`map-tool-${previous}`)?.focus();
}

const phoneSearchDialogProps = computed(() => ({
  modelValue: activeTool.value === "search",
  fullscreen: true,
  scrollable: true,
  eager: true,
  // Router's first-Back guard dismisses this modal; don't traverse history twice.
  closeOnBack: false,
  "aria-label": "جست‌وجوی مکان"
}));

const phoneLiveDialogProps = computed(() => ({
  modelValue: activeTool.value === "live",
  fullscreen: true,
  scrollable: true,
  eager: true,
  // The route-leave guard dismisses the phone modal on Back. Enabling Vuetify's
  // own Back handler too makes both handlers traverse history (skipping the map).
  closeOnBack: false,
  "aria-label": "همراهان"
}));

// Keep Vuetify's models and the dock selection in sync on other close paths.
function onHistoryDialogVisibilityChange(visible: boolean): void {
  if (!visible && activeTool.value === "history") closeTool();
}
function onSearchDialogVisibilityChange(visible: boolean): void {
  if (!visible && activeTool.value === "search") closeTool();
}
function onLiveDialogVisibilityChange(visible: boolean): void {
  if (!visible && activeTool.value === "live") closeTool();
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
let automaticFocus = false;
const recenterError = ref<string | null>(null);
const recenterLabel = computed(() => {
  if (recenterError.value) return recenterError.value;
  if (own.error.value) return `${own.error.value} برای تلاش دوباره روی موقعیت من بزنید.`;
  if (!own.position.value) return "نمایش موقعیت من؛ پس از دریافت GPS نقشه روی من مرکز می‌شود";
  return "مرکز کردن نقشه روی موقعیت من";
});

function syncOwnMarker(): void {
  const instance = map.value;
  const fix = own.position.value;
  if (!instance || !fix || !markerConstructor) { ownMarker?.remove(); ownMarker = null; return; }
  if (!ownMarker) {
    // An explicit private-GPS target, not MapLibre's default destination pin.
    // Never confuse seeing one's location with opting into outgoing sharing.
    const element = document.createElement("div");
    element.className = "user-map-view__own-marker";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "موقعیت زندهٔ من");
    element.setAttribute("title", "موقعیت من (فقط روی این دستگاه)");
    const icon = document.createElement("span");
    icon.className = "mdi mdi-crosshairs-gps user-map-view__own-marker-icon";
    icon.setAttribute("aria-hidden", "true");
    element.append(icon);
    element.addEventListener("click", (event) => event.stopPropagation());
    ownMarker = new markerConstructor({ element, anchor: "center" })
      .setLngLat([fix.lon, fix.lat]).addTo(instance);
  } else ownMarker.setLngLat([fix.lon, fix.lat]);
  const element = ownMarker.getElement();
  element.classList.toggle("user-map-view__own-marker--navigating", journey.navigating.value);
  element.setAttribute("aria-label", journey.navigating.value ? "موقعیت زندهٔ من؛ جهت راهبری" : "موقعیت زندهٔ من");
  const icon = element.querySelector(".user-map-view__own-marker-icon");
  icon?.classList.toggle("mdi-navigation-variant", journey.navigating.value);
  icon?.classList.toggle("mdi-crosshairs-gps", !journey.navigating.value);
}
function centerOnOwnLocation(initiatedByUser = true): void {
  const instance = map.value;
  if (!instance) return;
  // An explicit recenter should reveal the marker instead of leaving it hidden
  // under a phone dialog. A delayed automatic fix must not close the dialog.
  if (initiatedByUser && isPhone.value && activeTool.value) closeTool(false);
  const fix = own.position.value;
  if (!fix) {
    // The button is also a retry after a denied/unavailable fix and a request to
    // center on the next fix when the watcher is still waiting.
    if (own.active.value) { focusOnNextFix = true; automaticFocus = false; }
    else startOwnLocation(false);
    return;
  }
  const bounds = instance.getMaxBounds();
  if (bounds && !bounds.contains([fix.lon, fix.lat])) {
    // Tiles are installed only for the configured local region. Never claim to
    // center on a point the bounded offline map cannot actually show.
    recenterError.value = "موقعیت من خارج از محدودهٔ نقشهٔ آفلاین است.";
    return;
  }
  recenterError.value = null;
  userControlledCamera.value = true; // A late history fetch must not pan away from the GPS fix.
  instance.flyTo({ center: [fix.lon, fix.lat], zoom: Math.min(16, instance.getMaxZoom()), duration: 700 });
}
function startOwnLocation(auto: boolean): void {
  focusOnNextFix = true;
  automaticFocus = auto;
  if (!own.start()) { focusOnNextFix = false; automaticFocus = false; }
  else focusOwnIfRequested(); // A native bridge may deliver the first fix synchronously.
}
function focusOwnIfRequested(): void {
  if (!focusOnNextFix || !own.position.value || !map.value) return;
  focusOnNextFix = false;
  // A slow first GPS fix must not undo a search hit or a manual map gesture.
  if (automaticFocus && userControlledCamera.value) { automaticFocus = false; return; }
  automaticFocus = false;
  centerOnOwnLocation(false); // Recenter once, not on every update.
}
watch(() => own.position.value, () => { recenterError.value = null; syncOwnMarker(); focusOwnIfRequested(); });
watch(() => own.active.value, (active) => { if (!active) { focusOnNextFix = false; automaticFocus = false; } });
// Start only after the authenticated map is ready. Watch owner as well: the map
// can finish loading before session restoration. A denial is not auto-retried.
watch([map, () => auth.user?.id ?? null], ([instance, ownerId]) => {
  if (!instance || !ownerId || own.active.value || own.error.value) return;
  startOwnLocation(true);
}, { immediate: true });
const reverse = useReversePlace();
const journey = usePointRoute(computed(() => auth.user?.id ?? null), own.position, own.error, reverse,
  (camera) => map.value?.easeTo(camera), undefined,
  () => map.value?.easeTo({ pitch: 0, bearing: 0, duration: 450 }));
let destinationMarker: Marker | null = null;
let detachHold: (() => void) | null = null;
const ROUTE_SOURCE = "user-selected-destination-route";
const ROUTE_LAYER = "user-selected-destination-route-line";
function stopPointNavigation(): void { journey.stop(); journey.sheetOpen.value = true; }
const placeSearch = usePlaceSearch({
  area: (scope) => {
    const library = map.value?.getMaxBounds() ?? null;
    return placeSearchArea(library, scope === "viewport" ? map.value?.getBounds() ?? null : library);
  }
});
let fittedFor: string | null = null;
const userControlledCamera = ref(false);
let selectedPlaceMarker: Marker | null = null;
const resultMarkers = new Map<string, Marker>();
const showAllResultsOnMap = placeSearch.mapActive;
function clearResultMarkers(): void {
  for (const marker of resultMarkers.values()) marker.remove();
  resultMarkers.clear();
}
function syncResultMarkers(): void {
  const instance = map.value;
  const places = showAllResultsOnMap.value && instance && markerConstructor && auth.user?.id
    ? placeSearch.mapResults.value : [];
  const current = new Set(places.filter(place => place.placeId !== placeSearch.selectedPlaceId.value)
    .map(place => place.placeId));
  for (const [id, marker] of resultMarkers) {
    if (!current.has(id)) { marker.remove(); resultMarkers.delete(id); }
  }
  if (!instance || !markerConstructor) return;
  const offsets = resultMarkerOffsets(places);
  for (const [index, place] of places.entries()) {
    if (place.placeId === placeSearch.selectedPlaceId.value) continue; // The selected POI has its own purple pin.
    let marker = resultMarkers.get(place.placeId);
    if (!marker) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "user-map-view__result-marker";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", "map-place-detail-sheet");
      const number = document.createElement("span");
      number.setAttribute("aria-hidden", "true");
      button.append(number);
      button.addEventListener("click", (event) => {
        event.stopPropagation(); // Do not reverse-geocode a POI tap as an arbitrary map click.
        // Read the current result, never the captured response: a new query may have invalidated it.
        const currentPlace = placeSearch.mapResults.value.find(hit => hit.placeId === place.placeId);
        if (showAllResultsOnMap.value && currentPlace) selectPlace(currentPlace, true);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }); // Native button keyboard activation fires click once; Tab must still move focus.
      marker = new markerConstructor({ element: button, anchor: "center", offset: offsets.get(place.placeId) })
        .setLngLat([place.lon, place.lat]).addTo(instance);
      resultMarkers.set(place.placeId, marker);
    } else marker.setLngLat([place.lon, place.lat]).setOffset(offsets.get(place.placeId) ?? [0, 0]);
    const button = marker.getElement();
    button.setAttribute("aria-label", `نتیجهٔ ${(index + 1).toLocaleString("fa-IR")} از ${places.length.toLocaleString("fa-IR")}: ${place.name}، ${place.address}`);
    button.setAttribute("title", place.name);
    const number = button.firstElementChild;
    if (number) number.textContent = (index + 1).toLocaleString("fa-IR");
  }
}
function showAllSearchResults(): void {
  const instance = map.value;
  if (!instance || !markerConstructor || !auth.user?.id) return;
  const bounds = instance.getMaxBounds();
  if (bounds && placeSearch.results.value.some(place => !bounds.contains([place.lon, place.lat]))) return;
  if (!placeSearch.showOnMap()) return;
  const places = placeSearch.mapResults.value;
  if (bounds && places.some(place => !bounds.contains([place.lon, place.lat]))) return;
  const extent = resultExtent(places);
  if (!extent) return;
  closePlaceDetail(false);
  syncResultMarkers();
  userControlledCamera.value = true;
  const container = instance.getContainer();
  instance.fitBounds(extent, {
    padding: resultCameraPadding(container.clientWidth, container.clientHeight, isPhone.value),
    maxZoom: 15, duration: 700
  }, { placeSearchSelection: true }); // Framing must not requery its own viewport.
  if (isPhone.value && activeTool.value === "search") closeTool(false);
}
const placeDetailOpen = ref(false);
const selectedSearchPlace = computed(() => placeSearch.results.value.find(
  result => result.placeId === placeSearch.selectedPlaceId.value) ??
  placeSearch.mapResults.value.find(result => result.placeId === placeSearch.selectedPlaceId.value) ?? null);
// Search results are scoped to a moving viewport. Keep the selected POI facts with
// the route, not with a list that can be pruned while the detail sheet is open.
const destinationSearchPlace = computed(() => {
  const place = journey.knownPlace.value, point = journey.point.value;
  return place && point && place.lat === point.lat && place.lon === point.lon ? place : null;
});
const isSelectedSearchDestination = computed(() => !!destinationSearchPlace.value &&
  !!selectedSearchPlace.value && selectedSearchPlace.value.placeId === destinationSearchPlace.value.placeId &&
  selectedSearchPlace.value.lat === destinationSearchPlace.value.lat &&
  selectedSearchPlace.value.lon === destinationSearchPlace.value.lon &&
  selectedSearchPlace.value.name === destinationSearchPlace.value.name &&
  selectedSearchPlace.value.address === destinationSearchPlace.value.address);
let restorePlaceFocus = false;
function closePlaceDetail(restoreFocus = true): void {
  restorePlaceFocus = restoreFocus && placeDetailOpen.value;
  placeDetailOpen.value = false;
}
function onPlaceDetailAfterLeave(): void {
  const shouldRestore = restorePlaceFocus;
  restorePlaceFocus = false;
  if (!shouldRestore || placeDetailOpen.value || activeTool.value || selectedCompanionId.value ||
      !destinationSearchPlace.value) return;
  journey.sheetOpen.value = true;
}
function openSelectedPlaceDetail(): void {
  if (!destinationSearchPlace.value || !auth.user?.id || !map.value) return;
  removeSelectedCompanion();
  journey.sheetOpen.value = false;
  restorePlaceFocus = false;
  placeDetailOpen.value = true;
}

function openSelectedPlaceRoute(): void {
  if (selectedSearchPlace.value) selectPlace(selectedSearchPlace.value, true);
}
function syncSelectedPlaceMarker(): void {
  const instance = map.value;
  // The amber route pin owns this POI during navigation; do not stack two pins.
  const place = isSelectedSearchDestination.value ? null : selectedSearchPlace.value;
  if (!instance || !markerConstructor || !place) {
    selectedPlaceMarker?.remove();
    selectedPlaceMarker = null;
    return;
  }
  // Selected POI stays distinct from the optional set of numbered result markers.
  // Marker is supplied by MapCanvas after its lazy MapLibre import; no eager map chunk here.
  if (!selectedPlaceMarker) {
    selectedPlaceMarker = new markerConstructor({ color: "#7c3aed" })
      .setLngLat([place.lon, place.lat]).addTo(instance);
    const element = selectedPlaceMarker.getElement();
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-haspopup", "dialog");
    element.addEventListener("click", (event) => { event.stopPropagation(); openSelectedPlaceRoute(); });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); event.stopPropagation(); openSelectedPlaceRoute();
    });
  } else selectedPlaceMarker.setLngLat([place.lon, place.lat]);
  selectedPlaceMarker.getElement().setAttribute("aria-label", `مکان انتخاب‌شده: ${place.name}؛ نمایش مسیر`);
  selectedPlaceMarker.getElement().setAttribute("title", place.name);
}
watch(() => isSelectedSearchDestination.value, syncSelectedPlaceMarker);
watch(() => destinationSearchPlace.value, (place) => { if (!place) closePlaceDetail(false); }, { flush: "sync" });
watch(() => placeSearch.selectedPlaceId.value, () => {
  syncSelectedPlaceMarker();
  syncResultMarkers();
}, { flush: "sync" });
watch(() => placeSearch.mapResults.value, () => {
  syncResultMarkers();
  syncSelectedPlaceMarker();
}, { flush: "sync" });
watch(() => placeSearch.results.value, syncSelectedPlaceMarker, { flush: "sync" });

function selectPlace(place: GeocodeResult, fromMap = false): void {
  const instance = map.value;
  if (!instance) return;
  // A map restricted to an installed region would silently clamp a hit outside that region.
  const bounds = instance.getMaxBounds();
  if (bounds && !bounds.contains([place.lon, place.lat])) return;
  // A prior result with the same ID is not proof that this captured card is current.
  const current = placeSearch.results.value.find(hit => hit.placeId === place.placeId) ??
    (showAllResultsOnMap.value ? placeSearch.mapResults.value.find(hit => hit.placeId === place.placeId) : null);
  if (current !== place || !placeSearch.select(place)) return;
  userControlledCamera.value = true;
  // MapLibre forwards eventData to moveend. This camera flight must keep the other search
  // results selectable; an actual pan/zoom afterwards will refresh the visible-bbox search.
  // Leave the selected pin in the visible map area above the phone details sheet.
  const offsetY = isPhone.value ? -Math.min(150, Math.round(window.innerHeight * 0.22)) : 0;
  // A marker tap keeps the user's zoom; list selection still zooms in explicitly.
  const zoom = fromMap ? instance.getZoom() : Math.min(16, instance.getMaxZoom());
  instance.flyTo({ center: [place.lon, place.lat], zoom, offset: [0, offsetY], duration: 700 },
    { placeSearchSelection: true });
  // Dismiss the full-screen search before opening route choices over the map.
  // Keep results mounted; a later query refresh must not change this destination.
  if (isPhone.value && activeTool.value === "search") closeTool(false);
  closePlaceDetail(false); removeSelectedCompanion();
  journey.select({ lat: place.lat, lon: place.lon }, place);
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
const showCompanions = ref(true);
const emptyCompanionOverlay = pointsOverlay([]);
const selectedCompanionId = ref<string | null>(null);
const peerSelectionError = ref<string | null>(null);
// This is a selection of an active inbound grant, not an arbitrary public-search result.
// Never retain a peer's profile/address after that grant or the account goes away.
const selectedCompanion = computed(() => {
  const userId = selectedCompanionId.value;
  return userId && showCompanions.value && live.registry.value[userId]
    ? live.peers.value.find((peer) => peer.userId === userId) ?? null : null;
});
const selectedObservedAtMs = computed(() => selectedCompanionId.value
  ? live.registry.value[selectedCompanionId.value]?.fix?.observedAtMs ?? null : null);
const selectedProfile = shallowRef<UserSearchResult | null>(null);
const selectedPlace = shallowRef<ReverseGeocodeResult | null>(null);
const profileLoading = ref(false);
const profileFailed = ref(false);
const placeLoading = ref(false);
const placeFailed = ref(false);
let profileController: AbortController | null = null;
let placeController: AbortController | null = null;
const peerMarkers = new Map<string, Marker>();

function removeSelectedCompanion(): void {
  selectedCompanionId.value = null;
  for (const marker of peerMarkers.values()) {
    marker.getElement().setAttribute("aria-pressed", "false");
    marker.getElement().setAttribute("aria-expanded", "false");
    marker.getElement().classList.remove("user-map-view__peer-avatar--selected");
  }
  profileController?.abort();
  profileController = null;
  placeController?.abort();
  placeController = null;
  selectedProfile.value = null;
  selectedPlace.value = null;
  profileLoading.value = false;
  placeLoading.value = false;
  profileFailed.value = false;
  placeFailed.value = false;
}

function syncSelectedCompanion(): void {
  const userId = selectedCompanionId.value;
  if (!userId) return;
  if (!live.registry.value[userId] || !live.peers.value.some((peer) => peer.userId === userId) ||
      !showCompanions.value || !map.value || !auth.user?.id) removeSelectedCompanion();
}

/** An ID match is mandatory: search is public and the result order/name is not an authorization grant. */
async function loadSelectedProfile(): Promise<void> {
  profileController?.abort();
  profileController = null;
  selectedProfile.value = null;
  profileFailed.value = false;
  profileLoading.value = false;
  const peer = selectedCompanion.value;
  const userId = peer?.userId;
  const token = auth.accessToken;
  if (!peer || !userId || !token || peer.name.length < 2 || peer.name.length > 30) return;
  const controller = new AbortController();
  profileController = controller;
  profileLoading.value = true;
  try {
    const result = await searchUsers({ q: peer.name, sort: "username", limit: 20 }, token, controller.signal);
    if (controller !== profileController || userId !== selectedCompanionId.value ||
        !live.registry.value[userId] || token !== auth.accessToken) return;
    selectedProfile.value = result.items.find((item) => item.id === userId) ?? null;
  } catch {
    if (controller === profileController && userId === selectedCompanionId.value &&
        live.registry.value[userId] && !controller.signal.aborted) profileFailed.value = true;
  } finally {
    if (controller === profileController) { profileController = null; profileLoading.value = false; }
  }
}

/** Address comes only from the installed same-origin map gateway, never an external browser API. */
async function loadSelectedPlace(): Promise<void> {
  placeController?.abort();
  placeController = null;
  selectedPlace.value = null;
  placeFailed.value = false;
  placeLoading.value = false;
  const peer = selectedCompanion.value;
  const userId = peer?.userId;
  if (!peer || !userId) return;
  const position = peer.position;
  const controller = new AbortController();
  placeController = controller;
  placeLoading.value = true;
  try {
    const address = await reversePlace({ lat: peer.position[1], lon: peer.position[0] }, controller.signal);
    const current = selectedCompanion.value;
    if (controller !== placeController || current?.userId !== userId ||
        current.position[0] !== position[0] || current.position[1] !== position[1]) return;
    selectedPlace.value = address;
  } catch {
    if (controller === placeController && selectedCompanion.value?.userId === userId &&
        !controller.signal.aborted) placeFailed.value = true;
  } finally {
    if (controller === placeController) { placeController = null; placeLoading.value = false; }
  }
}

// An age-only tick does not re-fetch an address. A new fix at a new coordinate
// cancels the previous lookup; a changed public username also refreshes its exact-ID match.
watch(() => selectedCompanion.value && `${selectedCompanion.value.userId}:${selectedCompanion.value.name}`,
  () => { void loadSelectedProfile(); }, { flush: "sync" });
watch(() => selectedCompanion.value && `${selectedCompanion.value.userId}:${selectedCompanion.value.position.join(",")}`,
  () => { void loadSelectedPlace(); }, { flush: "sync" });
watch(() => auth.accessToken, () => {
  if (!auth.accessToken || !auth.user?.id) removeSelectedCompanion();
  else if (selectedCompanionId.value) void loadSelectedProfile();
}, { flush: "sync" });

/** MapLibre DOM markers keep a 44px focus/tap target; changing a fix moves rather than rebuilds it. */
function syncPeerAvatars(): void {
  const instance = map.value;
  const permitted = instance && markerConstructor && showCompanions.value ? live.peers.value : [];
  const ids = new Set(permitted.map((peer) => peer.userId));
  for (const [id, marker] of peerMarkers) {
    if (ids.has(id)) continue;
    marker.remove();
    peerMarkers.delete(id);
  }
  if (!instance || !markerConstructor) return;
  for (const peer of permitted) {
    let marker = peerMarkers.get(peer.userId);
    if (!marker) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", "companion-detail-sheet");
      button.className = "user-map-view__peer-avatar";
      button.dataset.userId = peer.userId;
      const avatar = document.createElement("span");
      avatar.className = "user-map-view__peer-avatar-face";
      avatar.setAttribute("aria-hidden", "true");
      button.append(avatar);
      button.addEventListener("click", (event) => {
        event.stopPropagation(); // Don't reverse-geocode a companion tap as a map click.
        selectCompanion(peer.userId, false);
      });
      marker = new markerConstructor({ element: button, anchor: "center" })
        .setLngLat(peer.position).addTo(instance);
      peerMarkers.set(peer.userId, marker);
    }
    const button = marker.getElement();
    const face = button.firstElementChild;
    if (face) face.textContent = avatarInitial(peer.name);
    button.setAttribute("aria-label", `اطلاعات همراه ${peer.name}؛ ${peer.stale ? "موقعیت قدیمی" : "موقعیت تازه"}`);
    button.setAttribute("title", peer.name);
    button.setAttribute("aria-pressed", String(selectedCompanionId.value === peer.userId));
    button.setAttribute("aria-expanded", String(selectedCompanionId.value === peer.userId));
    button.classList.toggle("user-map-view__peer-avatar--stale", peer.stale);
    button.classList.toggle("user-map-view__peer-avatar--selected", selectedCompanionId.value === peer.userId);
    const current = marker.getLngLat();
    if (current.lng !== peer.position[0] || current.lat !== peer.position[1]) marker.setLngLat(peer.position);
  }
}

function selectCompanion(userId: string, centerMap = true): void {
  const instance = map.value;
  const authorized = live.registry.value[userId];
  const peer = live.peers.value.find((candidate) => candidate.userId === userId);
  if (!instance || !authorized || !peer || !auth.user?.id) return;
  const bounds = instance.getMaxBounds();
  // The sheet still gives useful coordinates for a valid shared fix outside an installed region.
  if (centerMap && bounds && !bounds.contains(peer.position)) {
    peerSelectionError.value = "موقعیت این همراه خارج از محدودهٔ نقشهٔ آفلاین است.";
  } else peerSelectionError.value = null;
  showCompanions.value = true;
  closePlaceDetail(false);
  if (selectedCompanionId.value !== userId) removeSelectedCompanion();
  selectedCompanionId.value = userId;
  syncPeerAvatars();
  if (centerMap && (!bounds || bounds.contains(peer.position))) {
    userControlledCamera.value = true;
    instance.flyTo({ center: peer.position, zoom: Math.min(15, instance.getMaxZoom()), duration: 700 });
  }
  if (isPhone.value && activeTool.value === "live") closeTool(false);
}

watch(showCompanions, (visible) => { if (!visible) removeSelectedCompanion(); paintLive(); syncPeerAvatars(); }, { flush: "sync" });
watch(() => live.registry.value, syncSelectedCompanion, { flush: "sync" });
watch(() => live.peers.value, () => { syncSelectedCompanion(); syncPeerAvatars(); }, { flush: "sync" });
watch(() => auth.user?.id, () => {
  removeSelectedCompanion(); closePlaceDetail(false); placeSearch.clear();
  peerSelectionError.value = null; showCompanions.value = true;
}, { flush: "sync" });

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
  for (const op of planOverlaySync(mapState(instance), liveStyle.value, () => showCompanions.value ? live.overlay.value : emptyCompanionOverlay)) applyOp(instance, op);
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
  // Route planning owns the map while a destination is selected; a historical track
  // behind the live route is misleading. The history panel's data remains intact.
  if (journey.point.value) {
    for (const op of planPlaybackRemoval(mapState(instance), playbackStyle.value)) applyOp(instance, op);
    return;
  }
  for (const op of planPlaybackSync(playbackMapState(instance), playbackStyle.value, playback.frame.value)) applyOp(instance, op);
}

function frameCamera(): void {
  const instance = map.value;
  const track = playback.frames.value;
  if (!instance || journey.point.value || track.length === 0 || userControlledCamera.value) return;
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
  if (journey.selectedRoute.value && (!instance.getSource(ROUTE_SOURCE) || !instance.getLayer(ROUTE_LAYER))) paintPointRoute();
  const state = mapState(instance);
  const styles = journey.point.value ? [liveStyle.value] : [liveStyle.value, playbackStyle.value];
  // `setData`/`setPaintProperty` from paintLive/paintPlayback can themselves trigger styledata
  // and then idle. Event-driven writes must be restore-only, or an unchanged map repaints forever.
  if (!needsOverlayRestore(state, styles.flatMap((style) => style.sources.map((source) => source.id)),
    styles.flatMap((style) => style.layers.map((layer) => layer.id)))) return;
  paintLive();
  paintPlayback();
}

function syncDestinationMarker(): void {
  const instance = map.value, point = journey.point.value;
  if (!instance || !markerConstructor || !point) { destinationMarker?.remove(); destinationMarker = null; return; }
  if (!destinationMarker) {
    // MapLibre's standard bottom-anchored destination pin; selected search POIs have their own marker.
    destinationMarker = new markerConstructor({ color: "#d97706" }).setLngLat([point.lon, point.lat]).addTo(instance);
    const element = destinationMarker.getElement();
    element.classList.add("user-map-view__destination-marker");
    element.setAttribute("role", "button"); element.setAttribute("tabindex", "0");
    element.setAttribute("aria-haspopup", "dialog");
    element.addEventListener("click", (event) => { event.stopPropagation(); journey.sheetOpen.value = true; });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); event.stopPropagation(); journey.sheetOpen.value = true;
    });
  } else destinationMarker.setLngLat([point.lon, point.lat]);
  destinationMarker.getElement().setAttribute("aria-label", `مقصد انتخاب‌شده: ${journey.title.value}؛ نمایش جزئیات مسیر`);
  destinationMarker.getElement().setAttribute("title", journey.title.value);
}
function paintPointRoute(): void {
  const instance = map.value;
  if (!instance || !instance.isStyleLoaded()) return;
  const points = journey.routePoints.value;
  if (points.length < 2) {
    if (instance.getLayer(ROUTE_LAYER)) instance.removeLayer(ROUTE_LAYER);
    if (instance.getSource(ROUTE_SOURCE)) instance.removeSource(ROUTE_SOURCE);
    return;
  }
  const data = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } } as const;
  const source = instance.getSource(ROUTE_SOURCE) as { setData(data: unknown): void } | undefined;
  if (source) source.setData(data);
  else instance.addSource(ROUTE_SOURCE, { type: "geojson", data } as Parameters<MapLibreMap["addSource"]>[1]);
  if (!instance.getLayer(ROUTE_LAYER)) instance.addLayer({ id: ROUTE_LAYER, source: ROUTE_SOURCE, type: "line",
    paint: { "line-color": "#0d7770", "line-width": 6, "line-opacity": .92 } });
}
function attachHold(instance: MapLibreMap): () => void {
  const canvas = instance.getCanvasContainer();
  let suppressContextUntil = 0;
  const hold = createHoldToSelect((x, y, type) => {
    if (type === "touch") suppressContextUntil = Date.now() + 900; // Native contextmenu can follow the timer.
    if (!auth.user?.id || journey.navigating.value || map.value !== instance) return;
    const rect = canvas.getBoundingClientRect();
    const location = instance.unproject([x - rect.left, y - rect.top]);
    const bounds = instance.getMaxBounds();
    if (bounds && !bounds.contains(location)) return;
    if (isPhone.value && activeTool.value) closeTool(false);
    closePlaceDetail(false); removeSelectedCompanion();
    userControlledCamera.value = true;
    journey.select({ lat: location.lat, lon: location.lng });
  });
  const pointer = (event: PointerEvent): HoldPointer => ({ id: event.pointerId, x: event.clientX, y: event.clientY,
    button: event.button, primary: event.isPrimary, type: event.pointerType });
  const down = (event: PointerEvent) => { if (!journey.navigating.value) hold.down(pointer(event)); };
  const move = (event: PointerEvent) => hold.move(pointer(event));
  const up = (event: PointerEvent) => hold.up(event.pointerId);
  const context = (event: Event) => { if (hold.isTouchPending() || Date.now() < suppressContextUntil) event.preventDefault(); };
  canvas.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("blur", hold.cancel);
  canvas.addEventListener("contextmenu", context);
  return () => {
    hold.cancel(); canvas.removeEventListener("pointerdown", down);
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up); window.removeEventListener("blur", hold.cancel);
    canvas.removeEventListener("contextmenu", context);
  };
}
function startPointNavigation(): void {
  const fix = own.position.value, bounds = map.value?.getMaxBounds();
  if (fix && bounds && !bounds.contains([fix.lon, fix.lat])) {
    journey.error.value = "موقعیت شما خارج از محدودهٔ نقشهٔ آفلاین است؛ راهبری روی این نقشه ممکن نیست.";
    return;
  }
  if (journey.start()) { userControlledCamera.value = true; syncOwnMarker(); }
}
watch(() => journey.point.value, () => { syncDestinationMarker(); paintPlayback(); paintPointRoute(); }, { flush: "sync" });
watch(() => journey.title.value, syncDestinationMarker);
watch(() => journey.selectedRoute.value, (route) => {
  paintPointRoute();
  const instance = map.value;
  if (!instance || !route || journey.navigating.value) return;
  const coords = journey.routePoints.value;
  if (!coords.length) return;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lon, lat] of coords) { west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat); }
  const inset = Math.min(260, Math.round(window.innerHeight * .34));
  instance.fitBounds([[west, south], [east, north]],
    { padding: { top: 48, bottom: inset, left: 36, right: 36 }, maxZoom: 15, duration: 500 }, { placeSearchSelection: true });
  userControlledCamera.value = true;
});
watch(() => journey.navigating.value, syncOwnMarker);

function markUserCameraMove(event: MapMovementEvent): void {
  // MapLibre forwards originalEvent from drag/wheel/keyboard gestures and its zoom controls,
  // but not from our fitBounds/easeTo. Mark intent at movestart so a history read that finishes
  // while the user is still dragging cannot snap the camera back to the track.
  if (event.originalEvent) userControlledCamera.value = true;
}

function onMapMoving(event: MapMovementEvent): void {
  if ("placeSearchSelection" in event && event.placeSearchSelection === true) return;
  placeSearch.pruneForViewport(!!event.originalEvent || showAllResultsOnMap.value);
}

function onMapMoveEnd(event: MapMovementEvent): void {
  markUserCameraMove(event); // Also cover gestures whose start preceded this listener.
  // Choosing a search hit already marks the camera as user-chosen, but its own flyTo must not
  // discard the other hits. A subsequent physical map move can refresh the visible-bbox list.
  if ("placeSearchSelection" in event && event.placeSearchSelection === true) {
    // The flight must not search again, but a zoomed-in camera must not retain
    // unrelated out-of-bbox POIs in the list or on the map.
    placeSearch.pruneForViewport(showAllResultsOnMap.value, false);
    return;
  }
  const followViewport = !!event.originalEvent || showAllResultsOnMap.value;
  placeSearch.pruneForViewport(followViewport);
  placeSearch.refreshForViewport(followViewport);
}

function onMapReady(instance: MapLibreMap, MarkerClass: typeof Marker): void {
  if (map.value !== instance) {
    detachHold?.(); detachHold = null;
    ownMarker?.remove(); ownMarker = null;
    destinationMarker?.remove(); destinationMarker = null;
    selectedPlaceMarker?.remove(); selectedPlaceMarker = null;
    clearResultMarkers();
  }
  if (map.value !== instance) {
    for (const marker of peerMarkers.values()) marker.remove();
    peerMarkers.clear();
    removeSelectedCompanion();
  }
  markerConstructor = MarkerClass;
  map.value = instance;
  // A theme change calls `setStyle`, whose diff drops layers the new style does not declare — so every
  // `ready` (and every `styledata`/`idle` after an async style reload) re-ensures the overlay instead
  // of assuming it is still there. Live markers go first because playback asks to be inserted beneath them.
  instance.on("styledata", repaintOverlays);
  instance.on("idle", repaintOverlays);
  detachHold = attachHold(instance);
  instance.on("movestart", markUserCameraMove);
  instance.on("move", onMapMoving);
  instance.on("moveend", onMapMoveEnd);
  instance.on("resize", frameCamera);
  paintLive();
  paintPlayback();
  paintPointRoute();
  syncOwnMarker();
  syncDestinationMarker();
  syncSelectedPlaceMarker();
  syncResultMarkers();
  syncPeerAvatars();
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
// map GeoJSON. Updates never move the camera; selecting a peer explicitly can.
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
  removeSelectedCompanion();
  closePlaceDetail(false);
  for (const marker of peerMarkers.values()) marker.remove();
  peerMarkers.clear();
  ownMarker?.remove();
  ownMarker = null;
  destinationMarker?.remove(); destinationMarker = null;
  selectedPlaceMarker?.remove();
  selectedPlaceMarker = null;
  clearResultMarkers();
  detachHold?.(); detachHold = null;
  if (instance) {
    instance.off("styledata", repaintOverlays);
    instance.off("idle", repaintOverlays);
    instance.off("movestart", markUserCameraMove);
    instance.off("move", onMapMoving);
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
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background: #e8efec;
  isolation: isolate;
}

.user-map-view__search-map-actions { display: none; }

/* Numbered search pins are a separate keyboard/touch layer from purple selection,
   teal companion avatars and the blue private GPS icon. */
:global(.user-map-view .user-map-view__result-marker) {
  display: grid; place-items: center; width: 44px; height: 44px; padding: 0;
  border: 3px solid rgb(var(--v-theme-surface)); border-radius: 50%;
  color: #fff; background: #a95010; box-shadow: 0 2px 8px rgba(3, 29, 31, 0.38);
  cursor: pointer; font-size: 0.92rem; font-weight: 800;
}
:global(.user-map-view .user-map-view__result-marker:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}

/* Without boxes, desktop absolute offsets and tablet flex order stay unchanged. */
.user-map-view__search-dialog:not(.v-overlay), .user-map-view__history-dialog:not(.v-overlay),
.user-map-view__live-dialog:not(.v-overlay) { display: contents; }
.user-map-view__search-surface, .user-map-view__search-body,
.user-map-view__history-surface, .user-map-view__history-body,
.user-map-view__live-surface, .user-map-view__live-body { display: contents !important; }
.user-map-view__peer-error { color: rgb(var(--v-theme-error)); margin: 0.5rem 0; }
:global(.user-map-view .user-map-view__peer-avatar) {
  display: grid; place-items: center; width: 44px; height: 44px;
  padding: 0; border: 0; border-radius: 50%; background: transparent;
  appearance: none; cursor: pointer;
}
:global(.user-map-view .user-map-view__peer-avatar-face) {
  display: grid; place-items: center; width: 32px; height: 32px;
  border: 3px solid rgb(var(--v-theme-surface)); border-radius: 50%;
  color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary));
  box-shadow: 0 2px 7px rgba(3, 29, 31, 0.4);
  font-size: 0.82rem; font-weight: 800; line-height: 1; text-transform: none;
}
:global(.user-map-view .user-map-view__peer-avatar--stale .user-map-view__peer-avatar-face) { background: #526b6b; color: #fff; }
:global(.user-map-view .user-map-view__peer-avatar--selected .user-map-view__peer-avatar-face) { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
:global(.user-map-view .user-map-view__peer-avatar:focus-visible) { outline: 3px solid #f0a127; outline-offset: 2px; }

/* Hold guidance and active journey remain compact; the map stays edge-to-edge. */
.user-map-view__hold-hint, .user-map-view__journey-bar {
  position: fixed; z-index: 7; left: 50%; transform: translateX(-50%);
  max-width: calc(100vw - 2rem); border: 1px solid rgba(var(--v-theme-on-surface), .15);
  border-radius: 16px; color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-surface), .96); box-shadow: var(--bb-shadow-overlay);
}
.user-map-view__hold-hint { top: calc(5rem + env(safe-area-inset-top, 0px)); width: max-content; margin: 0; padding: .55rem .85rem; text-align: center; font-size: .82rem; pointer-events: none; }
.user-map-view__journey-bar { top: calc(5rem + env(safe-area-inset-top, 0px)); width: min(28rem, calc(100vw - 2rem)); display: flex; align-items: center; gap: .65rem; padding: .55rem; }
.user-map-view__journey-bar > span { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: .86rem; font-weight: 700; }
.user-map-view__journey-bar .v-btn { flex: 0 0 auto; min-height: 44px; }
:global(.user-map-view__destination-marker:focus-visible) { outline: 3px solid #f0a127; outline-offset: 2px; }
/* Blue private-GPS target with a decorative halo (not a GPS accuracy radius); unlike the purple search
 * pin or a route endpoint, it remains upright and moves with each fresh fix. */
:global(.user-map-view .user-map-view__own-marker) {
  display: grid; place-items: center; width: 48px; height: 48px;
  border-radius: 50%; background: rgba(37, 99, 235, 0.18);
  cursor: default;
}
:global(.user-map-view .user-map-view__own-marker-icon) {
  display: grid; place-items: center; width: 32px; height: 32px;
  border: 3px solid #fff; border-radius: 50%;
  color: #fff; background: #2563eb;
  box-shadow: 0 2px 8px rgba(13, 48, 106, 0.45); font-size: 18px;
}
/* A raised directional arrow follows the private GPS fix while the camera pitches and bears
 * along the selected route. Never rotate the MapLibre marker itself (it would drift off its anchor). */
:global(.user-map-view .user-map-view__own-marker--navigating) { width: 60px; height: 60px; border-radius: 20px; background: rgba(37, 99, 235, .24); }
:global(.user-map-view .user-map-view__own-marker--navigating .user-map-view__own-marker-icon) {
  width: 46px; height: 46px; border-radius: 14px; border-color: #e2efff;
  background: linear-gradient(145deg, #4e9aff, #1745a9); font-size: 27px;
  box-shadow: 0 8px 0 #122d70, 0 14px 20px rgba(10, 31, 83, .5);
  transform: perspective(120px) rotateX(18deg);
}
:global(:root.dark .user-map-view .user-map-view__own-marker) { background: rgba(96, 165, 250, 0.26); }
@media (forced-colors: active) {
  :global(.user-map-view .user-map-view__own-marker-icon) { border-color: CanvasText; background: Highlight; color: HighlightText; }
  :global(.user-map-view .user-map-view__peer-avatar-face) { border-color: CanvasText; background: Highlight; color: HighlightText; }
}


.user-map-view__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
}

/* Keep MapLibre's native compass (tap to reset north, drag to rotate/pitch),
 * but place its sole button in the same physical-right 48px rail as the SOS,
 * sharing and recenter actions. Other MapCanvas users retain their +/- controls. */
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
  position: fixed;
  z-index: 6;
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  inset-inline-start: 1.25rem;
  inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 10.5rem);
  width: 48px;
}
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl) { margin: 0; }
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group:not(:empty)) {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  box-shadow: var(--bb-shadow-overlay);
}
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass) {
  width: 48px;
  height: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 50%;
}
/* MapLibre's stock #333/#ccc arrows disappear on the themed primary surface.
 * Keep its real rotating icon element and pointer/keyboard behavior, but paint
 * two distinct high-contrast halves (>=4:1 against each theme's primary). */
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass .maplibregl-ctrl-icon) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'%3E%3Cpath fill='%23ffffff' d='m10.5 14 4-8 4 8z'/%3E%3Cpath fill='%23f4c06a' d='m10.5 16 4 8 4-8z'/%3E%3C/svg%3E");
}
:global(:root.dark .user-map-view__canvas .maplibregl-ctrl-top-right .maplibregl-ctrl-compass .maplibregl-ctrl-icon) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'%3E%3Cpath fill='%23111c1d' d='m10.5 14 4-8 4 8z'/%3E%3Cpath fill='%23315555' d='m10.5 16 4 8 4-8z'/%3E%3C/svg%3E");
}
@media (forced-colors: active) {
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass .maplibregl-ctrl-icon) {
    background-image: none;
    background-color: ButtonText;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'%3E%3Cpath d='m10.5 14 4-8 4 8z m0 2 4 8 4-8z'/%3E%3C/svg%3E") center / contain no-repeat;
  }
}
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass:hover) {
  background: rgba(var(--v-theme-on-primary), 0.12);
}
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
}

/* Keep MapLibre's scale visible beside, rather than underneath, the bottom-left
 * companions card. Its own bottom-left control slot is still used on narrow maps. */
.user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
  left: calc(27rem + env(safe-area-inset-left, 0px));
}

.user-map-view__search {
  position: absolute;
  z-index: 3;
  /* Leave the physical top-left corner free for the map-only sidebar launcher. */
  inset-block-start: calc(5rem + env(safe-area-inset-top, 0px));
  inset-inline-end: 1rem;
  width: min(25rem, calc(100% - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.user-map-view__playback {
  position: absolute;
  z-index: 2;
  /* The right-hand notifications launcher needs its own 48px hit area. */
  inset-block-start: calc(5rem + env(safe-area-inset-top, 0px));
  inset-inline-start: 1rem;
  width: min(24rem, calc(100% - 2rem));
  max-height: calc(100% - 2rem);
  pointer-events: none;
}

/* One 48px map-action rail: sharing is opt-in and sits above the other map
 * controls, with the same 8px gap and RTL/safe-area alignment as SOS. */
.user-map-view__recenter, .user-map-view__share {
  position: fixed;
  z-index: 6;
  inset-inline-start: 1.25rem;
  inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 3.5rem);
  width: 48px;
  height: 48px;
  min-width: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 50%;
  box-shadow: var(--bb-shadow-overlay);
}
.user-map-view__share { inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 7rem); }
.user-map-view__recenter:focus-visible, .user-map-view__share:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px;
}

/* The live card sits at the physical bottom-left in this RTL page. Leave the
 * opposite edge free for the fixed SOS, sharing and recenter actions. */
.user-map-view__live {
  position: absolute;
  z-index: 2;
  inset-block-end: calc(1rem + env(safe-area-inset-bottom, 0px));
  inset-inline-end: calc(1rem + env(safe-area-inset-left, 0px));
  width: min(26rem, calc(100% - 2rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  max-height: calc(100dvh - 7rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.user-map-view__live :deep(.live-companions) { flex-shrink: 0; }

/* At narrow/tablet widths, side panels would overlap each other and cover the map.
 * Stack them in page flow instead; keep a definite canvas height for MapLibre. */
@media (max-width: 1023px) {
  .user-map-view {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    height: auto;
    min-height: 100dvh;
    padding: calc(4.5rem + env(safe-area-inset-top, 0px)) 0.65rem 0.65rem;
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

  /* The map scale returns to its own edge; the compass stays in the action rail. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) { left: 0; }

  .user-map-view__search,
  .user-map-view__playback,
  .user-map-view__live {
    position: static;
    width: 100%;
    max-height: none;
    overflow: visible;
    pointer-events: auto;
  }

  .user-map-view__search { order: 1; }
  .user-map-view__playback { order: 3; }
  .user-map-view__live { order: 4; }
}

/* Phone map: edge-to-edge behind a single top-left menu launcher, not a bar or
 * stacked cards. Fullscreen tools keep their own scrolling content and close actions. */
@media (max-width: 599px) {
  /* Left of the action rail; below the menu launcher and expanded attribution. */
  .user-map-view__search-map-actions {
    position: fixed; z-index: 6;
    top: calc(8rem + env(safe-area-inset-top, 0px)); left: calc(0.75rem + env(safe-area-inset-left, 0px));
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem;
    max-width: min(9.75rem, calc(100vw - 11rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); pointer-events: auto;
  }
  .user-map-view__search-map-actions :deep(.v-btn) {
    min-height: 44px; height: auto; max-width: 100%; padding-inline: 0.55rem;
  }
  .user-map-view__search-map-actions :deep(.v-btn__content) {
    white-space: normal; text-align: center; font-size: 0.82rem; line-height: 1.2;
  }
  .user-map-view__search-map-actions > span {
    padding: 0.2rem 0.4rem; border-radius: 0.5rem;
    color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface));
    font-size: 0.82rem; line-height: 1.35;
  }
  /* These are three independent dialogs but share one phone layout. VCard is
   * required by Vuetify; the reusable map-side widgets are flattened *only*
   * inside the dialogs so there is one padded surface and one scrollbar. */
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content) {
    margin: 0; width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh;
  }
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content > .v-card) {
    display: flex !important; flex-direction: column; height: 100%; min-height: 0;
    overflow: hidden; background: rgb(var(--v-theme-surface)); border-radius: 0 !important;
  }
  /* Vuetify's dialog > overlay > card rules normally apply 24px of padding
   * and make the outer card scroll. Match that structure to override it rather
   * than relying on CSS import order or shrinking any child controls. */
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content > .v-card > .v-card-title) {
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    min-height: 56px;
    padding: calc(0.5rem + env(safe-area-inset-top, 0px))
      calc(1rem + env(safe-area-inset-right, 0px)) 0.5rem
      calc(1rem + env(safe-area-inset-left, 0px));
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  }
  :global(:is(.user-map-view__search-title h2, .user-map-view__history-title h2, .user-map-view__live-title h2)) {
    min-width: 0; margin: 0; font-size: 1rem; font-weight: 800; line-height: 1.4;
  }
  :global(:is(.user-map-view__search-title .v-btn, .user-map-view__history-title .v-btn,
    .user-map-view__live-title .v-btn)) { min-width: 44px; min-height: 44px; }
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content > .v-card > .v-card-text) {
    display: block !important; flex: 1 1 auto; min-height: 0;
    padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    padding-left: calc(1rem + env(safe-area-inset-left, 0px));
    padding-right: calc(1rem + env(safe-area-inset-right, 0px));
    overflow-y: auto; overscroll-behavior: contain;
  }
  :global(.user-map-view__search-dialog .user-map-view__search) {
    position: static; width: 100%; max-height: none; display: flex; flex-direction: column;
  }
  :global(.user-map-view__history-dialog .user-map-view__playback) {
    position: static; width: 100%; max-height: none; overflow: visible; pointer-events: auto;
  }
  :global(.user-map-view__live-dialog .user-map-view__live) {
    position: static; width: 100%; display: flex; flex-direction: column; gap: 0.75rem;
  }
  :global(:is(.user-map-view__search-dialog .place-search.v-card,
    .user-map-view__history-dialog .history-playback.v-card,
    .user-map-view__live-dialog .live-companions.v-card)) {
    width: 100%; padding: 0; border: 0; border-radius: 0 !important;
    overflow: visible; background: transparent; backdrop-filter: none; box-shadow: none !important;
  }
  /* Preserve the stand-alone map cards at >=600px, but not their duplicate
   * headings/shadows/padding inside the phone's already-titled modal surface. */
  :global(:is(.user-map-view__search-dialog .place-search__headline,
    .user-map-view__history-dialog .history-playback__title-block h2,
    .user-map-view__live-dialog .live-companions__title-block h2)) { display: none; }
  :global(.user-map-view__search-dialog .place-search .place-search__results) { max-height: none; overflow: visible; }
  :global(.user-map-view__history-dialog .history-playback) { max-height: none !important; overflow: visible; }
  :global(.user-map-view__history-dialog .history-playback .history-playback__body) {
    margin-top: 0.75rem; padding-top: 0; border-top: 0; gap: 0.75rem;
  }
  :global(.user-map-view__history-dialog .history-playback :is(.history-playback__source,
    .history-playback__grants, .history-playback__range, .history-playback__transport)) {
    padding: 0; border: 0; border-radius: 0; background: transparent;
  }
  :global(.user-map-view__live-dialog .live-companions .live-companions__peers) { max-height: none; overflow: visible; }

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

  /* On phones the compass clears the SOS/share/recenter stack and the dock. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    inset-inline-start: calc(0.75rem + env(safe-area-inset-right, 0px));
    inset-block-end: calc(16rem + env(safe-area-inset-bottom, 0px));
  }
  /* Preserve MapLibre's attribution above the bottom tools and below the menu
   * launcher, never buried beneath an open tool or the SOS pill. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right) {
    top: calc(4.5rem + env(safe-area-inset-top, 0px));
    bottom: auto;
    left: calc(0.25rem + env(safe-area-inset-left, 0px));
    right: auto;
  }
  /* The map's real OSM/OpenMapTiles credit is much wider than a compact phone.
   * Include its built-in padding in the cap, so its expanded text wraps beside
   * (not over) the app rail and remains fully readable. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib) {
    box-sizing: border-box;
    max-width: calc(100vw - 9.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
    margin: 0;
  }

  .user-map-view__recenter, .user-map-view__share {
    inset-inline-start: calc(0.75rem + env(safe-area-inset-right, 0px));
  }
  .user-map-view__recenter { inset-block-end: calc(12.5rem + env(safe-area-inset-bottom, 0px)); }
  .user-map-view__share { inset-block-end: calc(9rem + env(safe-area-inset-bottom, 0px)); }

  /* A nested Vuetify layout keeps bottom-navigation from reserving space in
   * the app shell. The frame positions the dock; Vuetify owns its selection. */
  .user-map-view__dock-frame {
    position: absolute;
    z-index: 5;
    inset-block-end: calc(0.75rem + env(safe-area-inset-bottom, 0px));
    left: calc(0.75rem + env(safe-area-inset-left, 0px));
    right: calc(0.75rem + env(safe-area-inset-right, 0px));
    width: auto;
    max-width: 19rem;
    height: 4rem;
    flex: none;
    margin-inline: auto; /* Center within the safe region, even if only one side has a cutout. */
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
  /* Keep three 44px launchers reachable on a 320px-wide phone. */
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
  .user-map-view__dock-label { font-size: 0.82rem; font-weight: 700; line-height: 1.2; white-space: nowrap; }
  .user-map-view__dock :deep(.v-btn:focus-visible) { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }

  .user-map-view__panel {
    position: static;
    width: 100%;
    max-height: none;
    overflow: visible;
    /* The Vuetify content is the scrollable/card surface, not each aside. */
    pointer-events: auto;
  }
  .user-map-view__panel:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
  .user-map-view__search, .user-map-view__playback, .user-map-view__live {
    pointer-events: auto;
  }
}

/* A short phone cannot fit four stacked 48px targets under the top-right bell.
 * Put recenter beside sharing and bring the compass down one slot. */
@media (max-width: 599px) and (max-height: 360px) {
  .user-map-view__recenter {
    inset-inline-start: calc(0.75rem + 3.5rem + env(safe-area-inset-right, 0px));
    inset-block-end: calc(9rem + env(safe-area-inset-bottom, 0px));
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    inset-block-end: calc(12.5rem + env(safe-area-inset-bottom, 0px));
  }
}

/* In short landscape, recenter sits beside sharing so the compass stays above it. */
@media (min-width: 480px) and (max-width: 599px) and (max-height: 480px) {
  /* Put recenter beside sharing, leaving room for the compass above and SOS below. */
  .user-map-view__recenter {
    inset-inline-start: calc(0.75rem + 3.5rem + env(safe-area-inset-right, 0px));
    inset-block-end: calc(9rem + env(safe-area-inset-bottom, 0px));
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }
}

:global(:root.dark .user-map-view) { background: var(--bb-color-background); }
</style>
