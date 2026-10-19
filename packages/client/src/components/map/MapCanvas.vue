<template>
  <section class="map-canvas" role="region" :aria-label="ariaLabel">
    <div ref="container" class="map-canvas__viewport" />
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapConfig } from "@/api/map-config";
import {
  DEFAULT_MAP_STYLE,
  DEFAULT_MAP_ZOOM,
  DEFAULT_TEHRAN_CENTER,
  createMapCanvasOptions
} from "./map-canvas-options";

const props = withDefaults(defineProps<{
  styleUrl?: string;
  center?: [number, number];
  zoom?: number;
  ariaLabel?: string;
}>(), {
  styleUrl: DEFAULT_MAP_STYLE,
  center: () => [...DEFAULT_TEHRAN_CENTER] as [number, number],
  zoom: DEFAULT_MAP_ZOOM,
  ariaLabel: "نقشهٔ تعاملی تهران"
});

const emit = defineEmits<{
  ready: [map: MapLibreMap];
  "config-error": [error: Error];
  "map-error": [error: Error];
}>();

const container = ref<HTMLDivElement | null>(null);
const map = shallowRef<MapLibreMap | null>(null);
let configRequest: AbortController | null = null;

async function initializeMap(controller: AbortController): Promise<void> {
  const { Map: MapLibre, NavigationControl, ScaleControl } = await import("maplibre-gl");
  if (controller.signal.aborted || !container.value) return;

  const instance = new MapLibre({
    container: container.value,
    ...createMapCanvasOptions(null, {
      styleUrl: props.styleUrl,
      center: props.center,
      zoom: props.zoom
    })
  });
  map.value = instance;

  instance.addControl(new NavigationControl({
    showCompass: true,
    showZoom: true,
    visualizePitch: true
  }), "top-right");
  instance.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
  instance.getCanvas().setAttribute("aria-label", props.ariaLabel);
  instance.getCanvas().setAttribute("role", "application");

  instance.on("load", () => emit("ready", instance));
  instance.on("error", (event) => {
    emit("map-error", event.error instanceof Error ? event.error : new Error("MapLibre reported a rendering error."));
  });

  void getMapConfig(controller.signal).then((config) => {
    if (controller.signal.aborted || !map.value) return;
    map.value.setMinZoom(config.minZoom);
    map.value.setMaxZoom(config.maxZoom);
    map.value.setMaxBounds(config.bbox);
  }).catch((error: unknown) => {
    if (controller.signal.aborted) return;
    emit("config-error", error instanceof Error ? error : new Error("Map configuration could not be loaded."));
  });
}

onMounted(() => {
  const controller = new AbortController();
  configRequest = controller;
  void initializeMap(controller).catch((error: unknown) => {
    if (controller.signal.aborted) return;
    emit("map-error", error instanceof Error ? error : new Error("MapLibre could not be initialized."));
  });
});

onBeforeUnmount(() => {
  configRequest?.abort();
  configRequest = null;
  map.value?.remove();
  map.value = null;
});

defineExpose({ map });
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
