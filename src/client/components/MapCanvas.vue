<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useMapStore } from '@/stores/map.ts';
import { useSosStore } from '@/stores/sos.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { coordinateFromWorld, visibleTileRange, worldCoordinate } from '@shared/geo.ts';

/**
 * Deterministic vector map surface. Tiles come from the same in-process SVG renderer the
 * service worker caches, so the offline map, the online map and the tests share one source.
 * The marker layer subscribes to realtime fixes from the map store.
 *
 * The projection is not written here. It used to be, twice, and the two copies had drifted: the
 * one in `@shared/geo.ts` clamps latitude to the Mercator limit while this one did not, so a centre
 * at exactly ±90 degrees produced an infinite y term, both tile loop bounds became infinite and the
 * renderer never finished. Using the shared helper keeps the clamp — and keeps the map and the
 * distance calculations agreeing about where a place is.
 */
const map = useMapStore();
const sos = useSosStore();
const format = useFormatters();

const zoom = computed(() => map.zoom);
const center = computed(() => map.center);

const TILE_SIZE = 256;
/** Fallback viewport until the frame is measured; the frame is min(393px,100vw) by min(852px,100vh). */
const view = ref({ width: 393, height: 852 });
const root = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

function measure(): void {
  const el = root.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) view.value = { width: rect.width, height: rect.height };
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver === 'function' && root.value) {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(root.value);
  }
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const width = computed(() => view.value.width);
const height = computed(() => view.value.height);

const tiles = computed(() => {
  const { xMin, xMax, yMin, yMax, centerX, centerY } = visibleTileRange(center.value, zoom.value, width.value, height.value, TILE_SIZE);
  const output: Array<{ key: string; url: string; left: number; top: number }> = [];
  const max = 2 ** zoom.value;
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      if (x < 0 || y < 0 || x >= max || y >= max) continue;
      output.push({
        key: `${zoom.value}/${x}/${y}`,
        url: `/_public/map/tiles/${zoom.value}/${x}/${y}.svg`,
        left: x * TILE_SIZE - centerX + width.value / 2,
        top: y * TILE_SIZE - centerY + height.value / 2
      });
    }
  }
  return output;
});

const markers = computed(() => {
  const origin = worldCoordinate(center.value.latitude, center.value.longitude, zoom.value);
  const place = (latitude: number, longitude: number) => {
    const world = worldCoordinate(latitude, longitude, zoom.value);
    return { x: world.x - origin.x + width.value / 2, y: world.y - origin.y + height.value / 2 };
  };
  const manualPin = sos.draft.isManual || sos.placementArmed ? { ...place(sos.draft.latitude, sos.draft.longitude) } : null;
  const destination = map.destinationPin ? place(map.destinationPin.latitude, map.destinationPin.longitude) : null;

  return {
    self: map.ownFix ? place(map.ownFix.latitude, map.ownFix.longitude) : null,
    search: map.searchPin ? { label: map.searchPin.label, ...place(map.searchPin.latitude, map.searchPin.longitude) } : null,
    destination,
    places: map.places.map((item) => ({ id: item.id, label: item.label, icon: item.icon, ...place(item.latitude, item.longitude) })),
    peers: map.peers.map((item) => ({ id: item.userId, label: item.username ?? item.userId, ...place(item.latitude, item.longitude) })),
    incident: manualPin,
    requests: sos.requests
      .filter((item) => item.status === 'pending' || item.status === 'dispatched')
      .map((item) => ({ id: item.id, label: item.incidentLabel, ...place(item.latitude, item.longitude) }))
  };
});

const placing = computed(() => sos.placementArmed);

/** Converts a click on the canvas into a geographic point. */
function tapPoint(event: MouseEvent): { latitude: number; longitude: number } | null {
  const el = root.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const origin = worldCoordinate(center.value.latitude, center.value.longitude, zoom.value);
  const world = { x: origin.x - width.value / 2 + px, y: origin.y - height.value / 2 + py };
  return coordinateFromWorld(world.x, world.y, zoom.value);
}

/** While the SOS composer is placing a manual pin it wins; otherwise every tap selects a destination. */
function onTap(event: MouseEvent): void {
  const point = tapPoint(event);
  if (!point) return;
  if (sos.placementArmed) {
    sos.placeManualLocation(point);
    return;
  }
  map.selectDestination(point);
}

/** Scales the 42px scale bar honestly: Web Mercator ground meters per screen pixel at the centre latitude. */
const SCALE_BAR_PIXELS = 42;
const scaleLabel = computed(() => {
  const metersPerPixel = (156543.03392 * Math.cos((center.value.latitude * Math.PI) / 180)) / (2 ** zoom.value);
  return format.distance(metersPerPixel * SCALE_BAR_PIXELS);
});
</script>

<template>
  <div ref="root" class="map-canvas" :class="{ 'is-placing': placing }" role="img" aria-label="نقشه شهر" data-testid="map-canvas" @click="onTap">
    <div class="map-tiles">
      <img
        v-for="tile in tiles"
        :key="tile.key"
        class="map-tile"
        :src="tile.url"
        :style="{ insetInlineStart: `${tile.left}px`, insetBlockStart: `${tile.top}px` }"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        width="256"
        height="256"
      >
    </div>
    <div class="map-markers">
      <span
        v-for="place in markers.places"
        :key="place.id"
        class="map-marker map-marker--place"
        :style="{ insetInlineStart: `${place.x}px`, insetBlockStart: `${place.y}px` }"
        :title="place.label"
      >
        <span :class="['mdi', `mdi-${place.icon || 'map-marker-outline'}`]" aria-hidden="true" />
      </span>
      <span
        v-for="peer in markers.peers"
        :key="peer.id"
        class="map-marker map-marker--peer"
        :style="{ insetInlineStart: `${peer.x}px`, insetBlockStart: `${peer.y}px` }"
        :title="peer.label"
      >
        <span class="mdi mdi-account" aria-hidden="true" />
      </span>
      <span
        v-if="markers.incident"
        class="map-marker map-marker--incident-pin"
        :style="{ insetInlineStart: `${markers.incident.x}px`, insetBlockStart: `${markers.incident.y}px` }"
        :title="'موقعیت ثبت‌شده حادثه'"
        data-testid="incident-pin"
      >
        <span class="mdi mdi-alarm-light" aria-hidden="true" />
      </span>
      <span
        v-if="markers.destination"
        class="map-marker map-marker--destination"
        :style="{ insetInlineStart: `${markers.destination.x}px`, insetBlockStart: `${markers.destination.y}px` }"
        :title="'مقصد انتخاب‌شده'"
        data-testid="destination-pin"
      >
        <span class="mdi mdi-map-marker-path" aria-hidden="true" />
      </span>
      <span
        v-if="markers.search"
        class="map-marker map-marker--search"
        :style="{ insetInlineStart: `${markers.search.x}px`, insetBlockStart: `${markers.search.y}px` }"
        :title="markers.search.label ?? 'نتیجه جست‌وجو'"
        data-testid="search-pin"
      >
        <span class="mdi mdi-map-marker" aria-hidden="true" />
      </span>
      <span
        v-for="request in markers.requests"
        :key="request.id"
        class="map-marker map-marker--incident"
        :style="{ insetInlineStart: `${request.x}px`, insetBlockStart: `${request.y}px` }"
        :title="request.label"
      >
        <span class="mdi mdi-alarm-light" aria-hidden="true" />
      </span>
      <span
        v-if="markers.self"
        class="user-marker"
        :style="{ insetInlineStart: `${markers.self.x}px`, insetBlockStart: `${markers.self.y}px` }"
        aria-label="موقعیت شما"
      >
        <span class="user-marker__accuracy" />
        <span class="user-marker__dot"><span class="mdi mdi-navigation" aria-hidden="true" /></span>
      </span>
    </div>
    <div class="map-scale"><span />{{ scaleLabel }}</div>
  </div>
</template>

<style scoped>
.map-canvas { position: absolute; inset: 0; overflow: hidden; background: var(--map-land); }
.map-canvas.is-placing { cursor: crosshair; }
.map-tiles img { position: absolute; inline-size: 256px; block-size: 256px; will-change: transform; }
.map-markers { position: absolute; inset: 0; pointer-events: none; }
.map-marker {
  position: absolute;
  display: grid;
  place-items: center;
  inline-size: 30px;
  block-size: 30px;
  border-radius: 50%;
  translate: -50% -50%;
  color: #fff;
  font-size: 16px;
  box-shadow: var(--shadow-sm);
}
.map-marker--place { background: var(--info); }
.map-marker--peer { background: var(--primary); }
.map-marker--incident { background: var(--danger); }
.map-marker--incident-pin { background: var(--danger); outline: 3px dashed rgba(255,255,255,.85); outline-offset: 2px; }
.map-marker--search { background: var(--info); }
.map-marker--destination { background: var(--info); box-shadow: 0 0 0 4px rgba(40,110,160,.25); }
.user-marker { position: absolute; translate: -50% -50%; display: grid; place-items: center; }
.user-marker__accuracy {
  position: absolute;
  inline-size: 54px;
  block-size: 54px;
  border-radius: 50%;
  background: rgba(14, 102, 102, 0.16);
}
.user-marker__dot {
  display: grid;
  place-items: center;
  inline-size: 22px;
  block-size: 22px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.85);
}
.map-scale {
  position: absolute;
  inset-block-end: 96px;
  inset-inline-start: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}
.map-scale span { display: block; inline-size: 42px; block-size: 2px; background: var(--muted); }
</style>
