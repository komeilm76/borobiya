<template>
  <v-bottom-sheet :model-value="!!place" :close-on-back="false" persistent @update:model-value="onVisible" @keydown.esc.stop="$emit('close')" @after-leave="$emit('after-leave')">
    <v-card v-if="place" id="map-place-detail-sheet" class="place-detail" rounded="xl" role="dialog"
      :aria-label="`اطلاعات مکان ${place.name}`" @keydown.esc.stop="$emit('close')">
      <v-card-title class="place-detail__header">
        <v-avatar color="deep-purple" size="48" aria-hidden="true">
          <v-icon icon="mdi-map-marker" size="25" />
        </v-avatar>
        <div class="place-detail__identity">
          <strong>{{ place.name }}</strong>
          <span>مکان انتخاب‌شده روی نقشه</span>
        </div>
        <v-btn class="place-detail__close" icon="mdi-close" variant="text" size="small"
          aria-label="بستن اطلاعات مکان" @click="$emit('close')" />
      </v-card-title>
      <v-card-text class="place-detail__body">
        <section class="place-detail__section" aria-label="نشانی و جزئیات مکان">
          <h2>نشانی</h2>
          <p class="place-detail__address">{{ place.address }}</p>
          <dl class="place-detail__facts">
            <div><dt>نوع مکان</dt><dd>{{ place.type }}</dd></div>
            <div><dt>مختصات</dt><dd dir="ltr">{{ place.lat.toFixed(6) }}, {{ place.lon.toFixed(6) }}</dd></div>
          </dl>
        </section>
      </v-card-text>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup lang="ts">
import type { GeocodeResult } from "@shared/index";
defineProps<{ place: GeocodeResult | null }>();
const emit = defineEmits<{ close: []; 'after-leave': [] }>();
function onVisible(visible: boolean): void {
  if (!visible) emit("close");
}
</script>

<style scoped>
.place-detail {
  width: 100%; max-width: 38rem; margin-inline: auto;
  max-height: calc(100dvh - 1rem - env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
}
.place-detail__header { display: flex; align-items: center; gap: 0.8rem; flex: 0 0 auto; padding: 0.9rem 1rem; white-space: normal; }
.place-detail__identity { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.5; }
.place-detail__identity strong { font-size: 1rem; overflow-wrap: anywhere; }
.place-detail__identity span { font-size: 0.76rem; opacity: 0.72; }
.place-detail__close { flex: 0 0 auto; min-width: 44px; min-height: 44px; }
.place-detail__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-block: 0 1.4rem; }
.place-detail__section { padding-block: 0.7rem; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); }
.place-detail__section h2 { font-size: 0.88rem; font-weight: 800; margin: 0 0 0.55rem; }
.place-detail__address { font-size: 0.88rem; line-height: 1.7; margin: 0 0 0.75rem; font-weight: 700; overflow-wrap: anywhere; }
.place-detail__facts { display: grid; gap: 0.35rem; margin: 0; font-size: 0.85rem; }
.place-detail__facts > div { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
.place-detail__facts dt { opacity: 0.72; flex: 0 0 auto; }
.place-detail__facts dd { margin: 0; text-align: end; overflow-wrap: anywhere; }
@media (max-width: 599px) {
  /* Leave the selected pin visible above the sheet, even on a short phone. */
  .place-detail { max-height: min(60dvh, calc(100dvh - 7rem - env(safe-area-inset-bottom, 0px))); }
}
</style>
