<template>
  <ul class="bb-point-key" aria-label="معنای نشانگرهای نقشه">
    <li v-for="kind in kinds" :key="kind">
      <span class="bb-point-key__sign" :class="`bb-map-point--${kind}`" aria-hidden="true">
        <span class="bb-map-point__sign">{{ MAP_POINT_META[kind].glyph }}</span>
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
.bb-point-key__sign .bb-map-point__sign { width: 22px; height: 22px; font-size: .8rem; box-shadow: none; }
</style>
