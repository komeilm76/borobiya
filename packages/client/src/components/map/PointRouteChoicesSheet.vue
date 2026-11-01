<template>
  <!-- A separate, scrollable route chooser; the map remains visible behind it. -->
  <component :is="isPhone ? VBottomSheet : 'section'" v-if="open && api.point.value"
    class="point-route-choices-shell" :model-value="isPhone ? true : undefined"
    :scrim="false" :persistent="isPhone" :close-on-back="false" :retain-focus="false"
    :aria-modal="false" aria-label="انتخاب مسیر" @update:model-value="onVisible"
    @after-enter="emit('layout-change')" @keydown.esc.stop.prevent="emit('close')">
    <v-card id="map-point-route-choices-sheet" class="point-route-choices" rounded="xl" dir="rtl" tabindex="-1">
      <header class="point-route-choices__header">
        <h2>انتخاب مسیر</h2>
        <v-btn icon="mdi-arrow-right" variant="text" aria-label="بازگشت به برنامه‌ریزی مسیر"
          @click="emit('close')" />
      </header>
      <p class="point-route-choices__hint">مسیر مورد نظر را انتخاب کنید تا به برنامه‌ریزی مسیر برگردید. زمان‌ها برآوردی و بدون ترافیک زنده‌اند.</p>
      <div class="point-route-choices__list" role="group" aria-label="مسیرهای پیشنهادی">
        <button v-for="(route, index) in api.routes.value" :key="index" type="button"
          class="point-route-choices__card" :aria-pressed="index === api.index.value"
          @click="emit('choose', index)">
          <span class="point-route-choices__name">مسیر {{ (index + 1).toLocaleString('fa-IR') }}
            <small v-if="index === 0">سریع‌ترین گزینهٔ دریافت‌شده</small>
            <small v-else>مسیر جایگزین</small>
          </span>
          <span class="point-route-choices__metrics">{{ formatRouteDuration(route.duration_s) }} · {{ formatRouteDistance(route.distance_m) }}</span>
          <span v-if="index === api.index.value" class="point-route-choices__selected">انتخاب‌شده</span>
        </button>
        <p v-if="api.loading.value" role="status">در حال محاسبهٔ مسیرها…</p>
        <p v-else-if="api.error.value" role="alert">{{ api.error.value }}</p>
        <p v-else-if="!api.routes.value.length" role="status">هنوز مسیری آماده نیست.</p>
      </div>
      <footer class="point-route-choices__footer">
        <v-btn variant="tonal" color="primary" @click="emit('close')">بازگشت به برنامه‌ریزی مسیر</v-btn>
      </footer>
    </v-card>
  </component>
</template>

<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import { VBottomSheet } from "vuetify/components";
import type { usePointRoute } from "@/composables/use-point-route";
import { formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
defineProps<{ api: ReturnType<typeof usePointRoute>; open: boolean }>();
const emit = defineEmits<{ close: []; choose: [index: number]; 'layout-change': [] }>();
const isPhone = useMediaQuery("(max-width: 599px)");
function onVisible(visible: boolean): void { if (!visible) emit('close'); }
</script>

<style scoped>
section.point-route-choices-shell { position: fixed; z-index: 7; pointer-events: none;
  right: calc(5.5rem + env(safe-area-inset-right, 0px)); bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  width: min(36rem, calc(100vw - 34rem)); max-width: 100%; }
.point-route-choices { pointer-events: auto; display: flex; flex-direction: column;
  max-height: min(66dvh, 30rem); overflow: hidden; color: rgb(var(--v-theme-on-surface)); }
.point-route-choices__header { display: flex; align-items: center; justify-content: space-between;
  padding: .25rem .75rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route-choices__header h2 { margin: 0; font-size: 1.05rem; }
.point-route-choices__header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; height: 44px; }
.point-route-choices__hint { margin: 0; padding: .5rem .85rem; font-size: .82rem; line-height: 1.5; }
.point-route-choices__list { display: grid; gap: .5rem; min-height: 0; overflow-y: auto;
  overscroll-behavior: contain; padding: .5rem .85rem .85rem; }
.point-route-choices__list p { margin: .4rem 0; line-height: 1.5; }
.point-route-choices__card { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .65rem;
  width: 100%; min-height: 72px; padding: .65rem .75rem; border: 1px solid rgba(var(--v-theme-on-surface), .25);
  border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); color: inherit; font: inherit;
  text-align: start; cursor: pointer; }
.point-route-choices__card[aria-pressed="true"] { border: 2px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), .12); }
.point-route-choices__name { display: grid; flex: 1 1 10rem; font-weight: 800; }
.point-route-choices__name small { font-size: .8rem; font-weight: 500; }
.point-route-choices__metrics { flex: 1 1 10rem; font-size: .86rem; }
.point-route-choices__selected { color: rgb(var(--v-theme-primary)); font-size: .82rem; font-weight: 800; }
.point-route-choices__card:focus-visible, .point-route-choices__header :deep(.v-btn:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.point-route-choices__footer { padding: .5rem .85rem calc(.5rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route-choices__footer :deep(.v-btn) { min-height: 44px; height: auto; }
.point-route-choices__footer :deep(.v-btn__content) { white-space: normal; text-align: center; }
@media (min-width: 600px) and (max-width: 1023px) {
  section.point-route-choices-shell { position: relative; order: 3; left: auto; right: auto; bottom: auto;
    width: 100%; padding: 0; pointer-events: auto; }
}
@media (max-width: 599px) {
  :global(.point-route-choices-shell.v-bottom-sheet > .v-overlay__content) {
    width: 100vw !important; max-width: 100vw !important; margin: 0 !important;
    flex: 0 1 auto !important; height: auto !important;
  }
  :global(.point-route-choices-shell.v-bottom-sheet > .v-overlay__content > .point-route-choices) {
    border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0 !important;
    flex: 0 1 auto !important; height: auto !important; overflow: hidden !important;
  }
  .point-route-choices { width: 100%; max-height: min(62dvh, 32rem); }
  .point-route-choices__list { padding-inline: calc(.85rem + env(safe-area-inset-right, 0px))
    calc(.85rem + env(safe-area-inset-left, 0px)); }
}
@media (max-height: 430px) and (max-width: 599px) {
  .point-route-choices { max-height: min(72dvh, 17rem); }
}
@media (forced-colors: active) {
  .point-route-choices__card[aria-pressed="true"] { outline: 2px solid Highlight; }
}
</style>
