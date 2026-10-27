<template>
  <section class="map-canvas" role="region" :aria-label="ariaLabel">
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
import { prepareMapRuntime, registerMapCacheWorker } from "@/services/map-cache";
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
}>(), {
  styleUrl: DEFAULT_MAP_STYLE,
  zoom: DEFAULT_MAP_ZOOM,
  ariaLabel: "نقشهٔ تعاملی",
  constrainBounds: true
});

const emit = defineEmits<{
  ready: [map: MapLibreMap, marker: typeof import("maplibre-gl").Marker];
  "config-error": [error: Error];
  "map-error": [error: Error];
}>();

const container = ref<HTMLDivElement | null>(null);
const map = shallowRef<MapLibreMap | null>(null);
const showMapNotice = ref(false);
const mapNoticeMessage = ref("");
let configRequest: AbortController | null = null;
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
  if (!instance) return;

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
  map.value = instance;
  activeStyleUrl = resolveMapStyleUrl(initialStyleUrl);
  pendingStyleUrl = null;

  instance.addControl(new NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: true
  }), "top-right");
  instance.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
  instance.getCanvas().setAttribute("aria-label", props.ariaLabel);
  instance.getCanvas().setAttribute("role", "application");

  instance.on("load", () => emit("ready", instance, Marker));
  instance.on("error", (event) => reportMapError(event.error));

  void getMapConfig(controller.signal).then((config) => {
    if (controller.signal.aborted || !map.value) return;
    map.value.setMinZoom(config.minZoom);
    map.value.setMaxZoom(config.maxZoom);
    if (props.constrainBounds) {
      map.value.setMaxBounds(config.bbox);
    }
    // The map starts on the built-in fallback bounds until this config
    // arrives. When the deployment serves different areas (see
    // MAP_REGION_IDS) and the caller did not request an explicit center,
    // move once to the configured bounds instead of stranding the camera
    // outside them.
    if (!props.center && props.constrainBounds) {
      const current = map.value.getCenter();
      if (!lngLatInBbox([current.lng, current.lat], config.bbox)) {
        map.value.jumpTo({ center: bboxCenter(config.bbox) });
      }
    }
  }).catch((error: unknown) => {
    if (controller.signal.aborted) return;
    reportConfigError(error);
  });
}

onMounted(() => {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
  }

  const controller = new AbortController();
  configRequest = controller;
  // Start the lazy MapLibre download at mount time in parallel with the cache worker's 200ms head
  // start. Neither must make the other wait to *start*, but both settle before map construction.
  void prepareMapRuntime(registerMapCacheWorker, () => import("maplibre-gl")).then((maplibre) => {
    if (controller.signal.aborted) return;
    return initializeMap(controller, maplibre);
  }).catch((error: unknown) => {
    if (controller.signal.aborted) return;
    reportMapError(error);
  });
});

onBeforeUnmount(() => {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
  }
  configRequest?.abort();
  configRequest = null;
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

:deep(.maplibregl-ctrl-group) {
  border: 1px solid rgba(25, 53, 54, 0.12);
  border-radius: 0.8rem;
  box-shadow: 0 0.35rem 1rem rgba(25, 53, 54, 0.12);
}

:deep(.maplibregl-ctrl-attrib) {
  direction: ltr;
  font-family: "Segoe UI", Tahoma, sans-serif;
}
</style>
