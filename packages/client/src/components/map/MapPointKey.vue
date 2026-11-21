<template>
  <ul class="bb-point-key" aria-label="معنای نشانگرهای نقشه">
    <li v-if="showGps" key="gps">
      <span class="bb-point-key__gps" aria-hidden="true"><span class="mdi mdi-crosshairs-gps" /></span>
      GPS دستگاه
    </li>
    <li v-for="kind in kinds" :key="kind">
      <span class="bb-point-key__sign" :class="`bb-map-point--${kind}`" aria-hidden="true">
        <span class="bb-map-point__sign" :class="{ 'bb-map-point__sign--icon': !!MAP_POINT_META[kind].icon }">
          {{ kind === 'stop' ? '۱' : MAP_POINT_META[kind].glyph }}<span v-if="MAP_POINT_META[kind].icon"
            class="mdi bb-map-point__icon" :class="MAP_POINT_META[kind].icon" />
        </span>
      </span>
      {{ MAP_POINT_META[kind].label }}
    </li>
  </ul>
</template>

<script setup lang="ts">
import { MAP_POINT_META, type MapPointKind } from "./map-point";
defineProps<{ kinds: MapPointKind[]; showGps?: boolean }>();
</script>

<style scoped>
.bb-point-key { display: flex; flex-wrap: wrap; gap: .35rem .85rem; margin: 0; padding: 0;
  list-style: none; font: 700 .8rem/1.5 var(--bb-font-family); }
.bb-point-key li { display: inline-flex; align-items: center; gap: .3rem; }
/* GPS is a circle/crosshair on the map, not another destination teardrop. */
.bb-point-key__gps { display: inline-grid; place-items: center; flex: 0 0 36px;
  width: 36px; height: 36px; border: 1px solid rgb(var(--v-theme-primary)); border-radius: 50%;
  background: rgba(var(--v-theme-primary), .22); color: rgb(var(--v-theme-on-primary)); }
.bb-point-key__gps .mdi { display: grid; place-items: center; width: 27px; height: 27px;
  border: 2px solid rgb(var(--v-theme-on-primary)); border-radius: 50%;
  background: rgb(var(--v-theme-primary)); font-size: 17px; line-height: 1; }
.bb-point-key__sign { display: inline-grid; place-items: center; width: 36px; height: 36px; }
.bb-point-key__sign .bb-map-point__sign { position: relative; top: auto; left: auto;
  width: 26px; height: 26px; font-size: .8rem; }
/* Retain the map pin's white rim against a light legend surface. */
.bb-point-key__sign .bb-map-point__sign::before { box-shadow: 0 0 0 1px rgba(var(--v-theme-on-surface), .28); }
.bb-point-key__sign .bb-map-point__sign--icon { font-size: 0; }
.bb-point-key__sign .bb-map-point__icon { font-size: 14px; }
@media (forced-colors: active) {
  .bb-point-key__gps, .bb-point-key__gps .mdi { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
</style>
