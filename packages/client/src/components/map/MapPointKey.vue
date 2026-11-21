<template>
  <ul class="bb-point-key" aria-label="معنای نشانگرهای نقشه">
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
defineProps<{ kinds: MapPointKind[] }>();
</script>

<style scoped>
.bb-point-key { display: flex; flex-wrap: wrap; gap: .35rem .85rem; margin: 0; padding: 0;
  list-style: none; font: 700 .8rem/1.5 var(--bb-font-family); }
.bb-point-key li { display: inline-flex; align-items: center; gap: .3rem; }
.bb-point-key__sign { display: inline-grid; place-items: center; width: 28px; height: 28px; }
.bb-point-key__sign .bb-map-point__sign { width: 24px; height: 24px; font-size: .8rem; box-shadow: none; }
.bb-point-key__sign .bb-map-point__sign--icon { font-size: 0; }
.bb-point-key__sign .bb-map-point__icon { font-size: 14px; }
</style>
