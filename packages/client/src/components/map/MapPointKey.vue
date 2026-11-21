<template>
  <ul class="bb-point-key" aria-label="معنای نشانگرهای نقشه">
    <li v-if="showGps" key="gps">
      <span class="bb-point-key__gps" aria-hidden="true"><span class="mdi mdi-crosshairs-gps" /></span>
      GPS دستگاه
    </li>
    <li v-for="kind in kinds" :key="kind">
      <span class="bb-point-key__sign" :class="`bb-map-point--${kind}`" aria-hidden="true">
        <span class="bb-point-key__pin">
          <span class="bb-point-key__glyph">
            <span v-if="MAP_POINT_META[kind].icon" class="mdi" :class="MAP_POINT_META[kind].icon" />
            <span v-else>{{ kind === 'stop' ? '۱' : MAP_POINT_META[kind].glyph }}</span>
          </span>
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
.bb-point-key { display: flex; flex-wrap: wrap; gap: .25rem .85rem; margin: 0; padding: 0;
  list-style: none; color: rgb(var(--v-theme-on-surface)); font: 700 .76rem/1.5 var(--bb-font-family); }
.bb-point-key li { display: inline-flex; align-items: center; gap: .35rem; min-width: 0; }
/* Give the key the same 46×48 pin lane as Dispatch. Its head and centered
   pictogram are drawn independently of the 44px geographic marker CSS. */
.bb-point-key__sign { display: inline-grid; place-items: center; flex: 0 0 46px; width: 46px; height: 48px; }
.bb-point-key__pin { position: relative; isolation: isolate; display: block; width: 46px; height: 48px;
  color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .35); }
.bb-point-key__pin::before { content: ""; position: absolute; z-index: -1; top: 8px; left: 7px;
  width: 27px; height: 27px; border: 2px solid #fff; border-radius: 50% 50% 50% 4px;
  background: var(--bb-pin, #1468c9); box-shadow: 0 2px 4px rgba(9, 25, 44, .4);
  transform: scale(1, 1.1) rotate(-45deg); }
.bb-point-key__glyph { position: absolute; top: 6px; left: 5px; display: grid; place-items: center;
  width: 31px; height: 31px; font: 800 14px/1 var(--bb-font-family); }
.bb-point-key__glyph .mdi { display: grid; place-items: center; width: 100%; height: 100%;
  font-size: 14px; font-weight: 400; line-height: 1; }
/* Private GPS is a circle/crosshair, never a destination teardrop. */
.bb-point-key__gps { position: relative; display: inline-grid; place-items: center;
  flex: 0 0 46px; width: 46px; height: 48px; color: rgb(var(--v-theme-on-primary)); }
.bb-point-key__gps::before { content: ""; position: absolute; width: 44px; height: 44px;
  border: 2px dashed rgb(var(--v-theme-primary)); border-radius: 50%;
  background: rgb(var(--v-theme-surface)); }
.bb-point-key__gps .mdi { position: relative; display: grid; place-items: center; width: 36px; height: 36px;
  border: 3px solid rgb(var(--v-theme-on-primary)); border-radius: 50%;
  background: rgb(var(--v-theme-primary)); font-size: 20px; line-height: 1; }
@media (forced-colors: active) {
  .bb-point-key__pin { color: CanvasText; text-shadow: none; }
  .bb-point-key__pin::before, .bb-point-key__gps::before { border-color: CanvasText; background: Canvas; box-shadow: none; }
  .bb-point-key__gps .mdi { border-color: CanvasText; background: Highlight; color: HighlightText; }
}
</style>
