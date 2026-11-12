<template>
  <section class="map-canvas" :class="{ 'map-canvas--action-compass': compassAction }" role="region" :aria-label="ariaLabel">
    <div ref="container" class="map-canvas__viewport" />
    <v-snackbar
      v-model="showMapNotice"
      color="warning"
      location="top"
      :timeout="9000"
      multi-line
    >
      <span role="status" aria-live="polite">{{ mapNoticeMessage }}</span>
      <template #actions>
        <v-btn variant="text" @click="retryMap">تلاش دوباره</v-btn>
        <v-btn variant="text" @click="showMapNotice = false">بستن</v-btn>
      </template>
    </v-snackbar>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapConfig } from "@/api/map-config";
import { createMapStartupAttempt, prepareMapRuntime, registerMapCacheWorker } from "@/services/map-cache";
import {
  DEFAULT_MAP_STYLE,
  DEFAULT_MAP_ZOOM,
  bboxCenter,
  createMapCanvasOptions,
  lngLatInBbox,
  resolveMapStyleUrl,
  switchMapStyle
} from "./map-canvas-options";

const MAP_FAILURE_NOTICE = "نقشه به‌درستی بارگذاری نشد؛ اتصال به سرور را بررسی کنید. بخش‌های بارگذاری‌شده حفظ می‌شوند و در صورت وجود، نسخهٔ ذخیره‌شدهٔ نقشه به کار می‌رود.";
const MAP_CACHE_NOTICE = "ارتباط با سرور نقشه برقرار نیست؛ برای این بخش از نسخهٔ ذخیره‌شده استفاده می‌شود.";
const MAP_CONFIG_NOTICE = "تنظیمات نقشه در دسترس نیست؛ نقشه با محدوده و بزرگ‌نمایی پیش‌فرض ادامه می‌دهد.";
const NOTICE_COOLDOWN_MS = 10_000;

const props = withDefaults(defineProps<{
  styleUrl?: string;
  center?: [number, number];
  zoom?: number;
  ariaLabel?: string;
  constrainBounds?: boolean;
  showZoom?: boolean;
  /** Use the companion map's 48px two-tone compass action, not the stock control styling. */
  compassAction?: boolean;
}>(), {
  styleUrl: DEFAULT_MAP_STYLE,
  zoom: DEFAULT_MAP_ZOOM,
  ariaLabel: "نقشهٔ تعاملی",
  constrainBounds: true,
  showZoom: true
});

const emit = defineEmits<{
  ready: [map: MapLibreMap, marker: typeof import("maplibre-gl").Marker];
  "coverage-changed": [map: MapLibreMap];
  "config-error": [error: Error];
  "map-error": [error: Error];
}>();

const container = ref<HTMLDivElement | null>(null);
const map = shallowRef<MapLibreMap | null>(null);
const showMapNotice = ref(false);
const mapNoticeMessage = ref("");
let configRequest: AbortController | null = null;
let configPending = false;
let configFailed = false;
let startMap: (() => void) | null = null;
let activeStyleUrl: string | null = null;
let pendingStyleUrl: string | null = null;
let lastNoticeAt = Number.NEGATIVE_INFINITY;

function showNotice(message: string): void {
  const now = Date.now();
  if (showMapNotice.value || now - lastNoticeAt < NOTICE_COOLDOWN_MS) return;

  lastNoticeAt = now;
  mapNoticeMessage.value = message;
  showMapNotice.value = true;
}

function toError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? value : new Error(fallbackMessage);
}

function reportMapError(value: unknown): void {
  // The toast stays user-friendly; the console keeps the actionable detail
  // (failed style/tile URLs, WebGL initialization failures, ...).
  console.error("[borobiya:map] map error", value);
  showNotice(MAP_FAILURE_NOTICE);
  emit("map-error", toError(value, "The map could not be loaded."));
}

function reportConfigError(value: unknown): void {
  console.error("[borobiya:map] map config error", value);
  showNotice(MAP_CONFIG_NOTICE);
  emit("config-error", toError(value, "Map configuration could not be loaded."));
}

function updateStyle(styleUrl: string): void {
  const nextStyleUrl = resolveMapStyleUrl(styleUrl);
  const instance = map.value;
  if (!instance) {
    pendingStyleUrl = nextStyleUrl;
    return;
  }
  if (nextStyleUrl === activeStyleUrl) return;

  try {
    // A style diff keeps the same Map instance, camera transform, and DOM-backed markers.
    activeStyleUrl = switchMapStyle(instance, nextStyleUrl);
    pendingStyleUrl = null;
  } catch (error) {
    reportMapError(error);
  }
}

function retryMap(): void {
  const instance = map.value;
  if (!instance && !startMap) return;
  // An explicit retry is not a repeated background error: let a quick failure show again.
  showMapNotice.value = false;
  lastNoticeAt = Number.NEGATIVE_INFINITY;
  if (!instance) {
    startMap?.(); // The lazy library or Map constructor may have failed before a map existed.
    return;
  }

  if (configFailed && configRequest) fetchRuntimeConfig(configRequest);
  try {
    // A full style reload retries failed style, sprite, glyph, and tile requests without
    // replacing the map instance or its camera.
    const styleUrl = activeStyleUrl ?? resolveMapStyleUrl(props.styleUrl);
    instance.setStyle(styleUrl, { diff: false });
    instance.resize();
  } catch (error) {
    reportMapError(error);
  }
}

function handleServiceWorkerMessage(event: MessageEvent): void {
  const data = event.data as { type?: unknown } | null;
  if (data?.type === "borobiya-map-cache-fallback") {
    showNotice(MAP_CACHE_NOTICE);
  }
}

watch(() => props.styleUrl, updateStyle);

function fetchRuntimeConfig(controller: AbortController): void {
  const instance = map.value;
  if (!instance || controller.signal.aborted || configPending) return;
  configPending = true;
  void getMapConfig(controller.signal).then((config) => {
    if (controller.signal.aborted || map.value !== instance) return;
    configFailed = false;
    instance.setMinZoom(config.minZoom);
    instance.setMaxZoom(config.maxZoom);
    const oldBounds = props.constrainBounds ? instance.getMaxBounds() : null;
    const changed = props.constrainBounds && (!oldBounds ||
      oldBounds.getWest() !== config.bbox[0] || oldBounds.getSouth() !== config.bbox[1] ||
      oldBounds.getEast() !== config.bbox[2] || oldBounds.getNorth() !== config.bbox[3]);
    if (props.constrainBounds) instance.setMaxBounds(config.bbox);
    // The map starts on fallback bounds. Move once if the configured library is elsewhere.
    if (!props.center && props.constrainBounds) {
      const current = instance.getCenter();
      if (!lngLatInBbox([current.lng, current.lat], config.bbox)) {
        instance.jumpTo({ center: bboxCenter(config.bbox) });
      }
    }
    if (changed) emit("coverage-changed", instance);
  }).catch((error: unknown) => {
    if (controller.signal.aborted || map.value !== instance) return;
    configFailed = true;
    reportConfigError(error);
  }).finally(() => { configPending = false; });
}

function initializeMap(controller: AbortController, maplibre: typeof import("maplibre-gl")): void {
  if (controller.signal.aborted || !container.value) return;
  const { Map: MapLibre, Marker, NavigationControl, ScaleControl, setWorkerUrl } = maplibre;
  // MapLibre v6 otherwise locates its worker relative to the (pre)bundled
  // chunk URL, where the sibling worker file does not exist ("Worker failed
  // to load"); the Vite config serves the packaged worker at this path instead.
  setWorkerUrl("/maplibre-gl-worker.mjs");
  const initialStyleUrl = pendingStyleUrl ?? props.styleUrl;

  const instance = new MapLibre({
    container: container.value,
    ...createMapCanvasOptions(null, {
      styleUrl: initialStyleUrl,
      center: props.center,
      zoom: props.zoom,
      constrainBounds: props.constrainBounds
    })
  });
  try {
    instance.addControl(new NavigationControl({
      showCompass: true,
      showZoom: props.showZoom,
      visualizePitch: true
    }), "top-right");
    instance.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    instance.getCanvas().setAttribute("aria-label", props.ariaLabel);
    instance.getCanvas().setAttribute("role", "application");

    instance.on("load", () => emit("ready", instance, Marker));
    instance.on("error", (event) => reportMapError(event.error));
    map.value = instance;
    activeStyleUrl = resolveMapStyleUrl(initialStyleUrl);
    pendingStyleUrl = null;
    fetchRuntimeConfig(controller);
  } catch (error) {
    // A failed constructor/control setup must not leave a half-created map that Retry can only restyle.
    map.value = null;
    activeStyleUrl = null;
    try { instance.remove(); } catch { /* Preserve the original startup error. */ }
    throw error;
  }
}

onMounted(() => {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
  }

  const controller = new AbortController();
  configRequest = controller;
  // Start lazy MapLibre and cache-worker registration together, once per attempt. A failed import or
  // constructor can be retried without duplicating an in-flight startup or reviving an unmounted map.
  startMap = createMapStartupAttempt(
    () => prepareMapRuntime(registerMapCacheWorker, () => import("maplibre-gl")),
    (maplibre) => initializeMap(controller, maplibre),
    reportMapError,
    () => !controller.signal.aborted && !!container.value && !map.value
  );
  startMap();
});

onBeforeUnmount(() => {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
  }
  configRequest?.abort();
  configRequest = null;
  startMap = null;
  map.value?.remove();
  map.value = null;
  activeStyleUrl = null;
  pendingStyleUrl = null;
});

defineExpose({ map, setStyle: updateStyle });
</script>

<style scoped>
.map-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 20rem;
  overflow: hidden;
  border-radius: inherit;
  background: #e8efec;
}

.map-canvas__viewport {
  position: absolute;
  inset: 0;
  min-height: inherit;
}

:deep(.maplibregl-ctrl-group:not(:empty)) {
  border: 1px solid rgba(25, 53, 54, 0.12);
  border-radius: 0.8rem;
  box-shadow: var(--bb-shadow-item-hover);
}

/* MapLibre's own NavigationControl remains the only compass: click/keyboard
 * resets bearing and dragging its rotating icon changes bearing/pitch. Only its
 * paint and hit target are shared here; host views position the control slot. */
.map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl) { margin: 0; }
.map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group:not(:empty)) {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  box-shadow: var(--bb-shadow-overlay);
}
.map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass) {
  width: 48px;
  height: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 50%;
}
/* MapLibre's stock #333/#ccc arrows disappear on the themed primary surface.
 * Keep its real rotating icon element and pointer/keyboard behavior, but paint
 * two distinct high-contrast halves (>=4:1 against each theme's primary). */
.map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass .maplibregl-ctrl-icon) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'%3E%3Cpath fill='%23ffffff' d='m10.5 14 4-8 4 8z'/%3E%3Cpath fill='%23f4c06a' d='m10.5 16 4 8 4-8z'/%3E%3C/svg%3E");
}
:global(:root.dark .map-canvas--action-compass .maplibregl-ctrl-top-right .maplibregl-ctrl-compass .maplibregl-ctrl-icon) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'%3E%3Cpath fill='%23111c1d' d='m10.5 14 4-8 4 8z'/%3E%3Cpath fill='%23315555' d='m10.5 16 4 8 4-8z'/%3E%3C/svg%3E");
}
@media (forced-colors: active) {
  .map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass .maplibregl-ctrl-icon) {
    background-image: none;
    background-color: ButtonText;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'%3E%3Cpath d='m10.5 14 4-8 4 8z m0 2 4 8 4-8z'/%3E%3C/svg%3E") center / contain no-repeat;
  }
}
.map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass:hover) {
  background: rgba(var(--v-theme-on-primary), 0.12);
}
.map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
}


:global(:root.dark .map-canvas) { background: var(--bb-color-background); }

/* MapLibre ships light controls and black SVG icons. Theme stock controls,
 * but leave the shared two-tone compass action and primary button alone. */
@media (forced-colors: none) {
  :global(:root.dark .map-canvas:not(.map-canvas--action-compass) .maplibregl-ctrl-group) {
    border-color: var(--bb-color-outline);
    background: var(--bb-color-surface);
  }
  :global(:root.dark .map-canvas:not(.map-canvas--action-compass) .maplibregl-ctrl-icon) {
    filter: invert(1);
  }
  :global(:root.dark .map-canvas:not(.map-canvas--action-compass) .maplibregl-ctrl-group button + button) {
    border-top-color: var(--bb-color-outline);
  }
  :global(:root.dark .map-canvas .maplibregl-ctrl-attrib) {
    color: var(--bb-color-text);
    background: rgba(var(--v-theme-surface), 0.96);
  }
  :global(:root.dark .map-canvas .maplibregl-ctrl-attrib a) {
    color: var(--bb-color-primary);
    text-decoration: underline;
  }
  :global(:root.dark .map-canvas .maplibregl-ctrl-attrib-button) { filter: invert(1); }
  :global(:root.dark .map-canvas .maplibregl-ctrl-scale) {
    color: var(--bb-color-text);
    background: rgba(var(--v-theme-surface), 0.96);
    border-color: var(--bb-color-outline);
  }
}

@media (forced-colors: active) {
  :deep(.maplibregl-ctrl-group:not(:empty)) {
    box-shadow: 0 0 0 2px ButtonText;
  }
}

:deep(.maplibregl-ctrl-attrib) {
  direction: ltr;
  font-family: "Segoe UI", Tahoma, sans-serif;
}
</style>
