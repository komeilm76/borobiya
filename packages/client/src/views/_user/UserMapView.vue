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

    <aside class="user-map-view__playback">
      <HistoryPlaybackPanel :api="playback" />
    </aside>

    <v-card class="user-map-view__notice" elevation="2" rounded="lg" role="status">
      <v-icon icon="mdi-information-outline" size="19" />
      <span>
        نقشهٔ پایه و پخش تاریخچهٔ مسیر کار می‌کند؛ موقعیت زندهٔ همراهان هنوز روی این نقشه نمی‌آید و
        فقط مسیر ثبت‌شدهٔ آن‌ها قابل مشاهده است.
      </span>
    </v-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import type { Map as MapLibreMap } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import HistoryPlaybackPanel from "@/components/map/HistoryPlaybackPanel.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { useHistoryPlayback } from "@/composables/use-history-playback";
import { historyPlaybackStyle } from "@/history/playback";
import { planPlaybackRemoval, planPlaybackSync, type PlaybackOp } from "@/history/playback-map-sync";
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
const playback = useHistoryPlayback({ accessToken: computed(() => auth.accessToken) });
const map = shallowRef<MapLibreMap | null>(null);
let fittedFor: string | null = null;

const playbackStyle = computed(() => historyPlaybackStyle(theme.isDark));

/**
 * The maplibre calls the plan asked for, and nothing else. `data` and the layer spec cross a boundary
 * whose types come from a package (`@types/geojson`) this workspace does not resolve, so the values are
 * cast here once; the shapes themselves are pinned in `history/playback.test.ts`.
 */
type GeoJsonTarget = { setData(data: unknown): unknown };

function applyOp(instance: MapLibreMap, op: PlaybackOp): void {
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

function paintPlayback(): void {
  const instance = map.value;
  if (!instance) return;
  // `firstLiveLayerId` stays undefined until T2.3.7 puts companion markers on this map; the planner
  // then inserts playback below them without any change here.
  for (const op of planPlaybackSync(mapState(instance), playbackStyle.value, playback.frame.value)) applyOp(instance, op);
}

function frameCamera(): void {
  const instance = map.value;
  const track = playback.frames.value;
  if (!instance || track.length === 0) return;
  const key = `${track[0]!.ms}:${track[track.length - 1]!.ms}:${track.length}`;
  if (fittedFor === key) return;
  fittedFor = key;
  const bounds = playback.boundsForMap.value;
  if (bounds) {
    // Padding leaves the toolbar and the panel off the track itself, which matters more on a phone
    // where the panel covers half the viewport.
    instance.fitBounds(bounds, { padding: { top: 96, bottom: 168, left: 72, right: 72 }, maxZoom: 15, duration: 700 });
    return;
  }
  const only = track[0]!;
  instance.easeTo({ center: [only.lon, only.lat], duration: 500 });
}

function onMapReady(instance: MapLibreMap): void {
  map.value = instance;
  // A theme change calls `setStyle`, whose diff drops layers the new style does not declare — so every
  // `ready` (and every paint) re-ensures the overlay instead of assuming it is still there.
  paintPlayback();
  frameCamera();
}

watch(() => playback.frame.value, paintPlayback);
watch(() => playbackStyle.value, paintPlayback);
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
  if (instance) {
    for (const op of planPlaybackRemoval(mapState(instance), playbackStyle.value)) applyOp(instance, op);
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

.user-map-view__playback {
  position: absolute;
  z-index: 2;
  inset-block-start: 1rem;
  inset-inline-start: 1rem;
  width: min(24rem, calc(100% - 2rem));
  max-height: calc(100% - 2rem);
  pointer-events: none;
}

.user-map-view__notice {
  position: absolute;
  z-index: 2;
  inset-block-end: 1rem;
  inset-inline-start: 1rem;
  display: flex;
  max-width: min(30rem, calc(100% - 2rem));
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.75rem 0.9rem;
  color: #536d6c;
  background: rgba(var(--v-theme-surface), 0.94);
  font-size: 0.76rem;
  line-height: 1.65;
  backdrop-filter: blur(10px);
}

.user-map-view__notice :deep(.v-icon) {
  flex: 0 0 auto;
  margin-top: 0.08rem;
  color: #0e6666;
}

:global(:root.dark) .user-map-view__toolbar-card,
:global(:root.dark) .user-map-view__notice {
  background: rgba(27, 41, 42, 0.94);
}

:global(:root.dark) .user-map-view__title-block p,
:global(:root.dark) .user-map-view__notice {
  color: #a0b6b2;
}

:global(:root.dark) .user-map-view__title-block h1 {
  color: #edf5f2;
}

:global(:root.dark) .user-map-view__notice :deep(.v-icon) {
  color: #71c7be;
}

@media (max-width: 600px) {
  .user-map-view {
    height: calc(100dvh - 132px);
    min-height: 24rem;
  }

  .user-map-view__toolbar {
    inset-block-start: 0.65rem;
    inset-inline-end: 0.65rem;
    width: min(24rem, calc(100% - 1.3rem));
  }

  .user-map-view__playback {
    inset-block-start: 5.9rem;
    inset-inline-start: 0.65rem;
    width: min(20rem, calc(100% - 1.3rem));
    max-height: calc(100% - 7rem);
  }

  .user-map-view__toolbar-card {
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
  }

  .user-map-view__title-block h1 {
    font-size: 0.92rem;
  }

  .user-map-view__notice {
    inset-block-end: 0.65rem;
    inset-inline-start: 0.65rem;
    max-width: calc(100% - 1.3rem);
  }
}
</style>
