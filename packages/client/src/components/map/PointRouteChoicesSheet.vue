<template>
  <!-- A separate, scrollable route chooser; the map remains visible behind it. -->
  <section v-if="open && api.point.value" class="point-route-choices-shell"
    role="region" aria-label="انتخاب مسیر" @keydown.esc.stop.prevent="emit('close')">
    <v-card id="map-point-route-choices-sheet" class="point-route-choices bb-floating-card bb-map-navigation-card" elevation="3" rounded="xl" dir="rtl" tabindex="-1">
      <header class="point-route-choices__header">
        <h2>انتخاب مسیر</h2>
        <v-btn v-if="showSearch" icon="mdi-magnify" variant="text" aria-label="جست‌وجوی مکان" title="جست‌وجوی مکان"
          @click="emit('search')" />
        <v-btn icon="mdi-arrow-right" variant="text" aria-label="بازگشت به برنامه‌ریزی مسیر"
          @click="emit('close')" />
      </header>
      <p class="point-route-choices__hint">برای پیش‌نمایش، مسیر را انتخاب کنید؛ سپس دکمهٔ تأیید را بزنید. زمان‌ها برآوردی و بدون ترافیک زنده‌اند.</p>
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
        <v-btn variant="tonal" color="primary" rounded="lg" @click="emit('close')">بازگشت بدون تغییر</v-btn>
        <v-btn color="primary" variant="flat" rounded="lg" :disabled="!api.selectedRoute.value || api.loading.value"
          @click="emit('confirm')">تأیید مسیر انتخابی</v-btn>
      </footer>
    </v-card>
  </section>
</template>

<script setup lang="ts">
import type { usePointRoute } from "@/composables/use-point-route";
import { formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
defineProps<{ api: ReturnType<typeof usePointRoute>; open: boolean; showSearch: boolean }>();
const emit = defineEmits<{ close: []; choose: [index: number]; confirm: []; search: [] }>();
</script>

<style scoped>
section.point-route-choices-shell { position: fixed; z-index: 7; pointer-events: none;
  right: calc(5.5rem + env(safe-area-inset-right, 0px)); bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  width: min(36rem, calc(100vw - 34rem)); max-width: 100%; }
.point-route-choices { pointer-events: auto; display: flex; flex-direction: column;
  max-height: min(66dvh, 30rem); overflow: hidden; color: rgb(var(--v-theme-on-surface)); }
.point-route-choices__header { display: flex; align-items: center; justify-content: space-between;
  padding: .25rem .75rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route-choices__header h2 { flex: 1; min-width: 0; margin: 0; font-size: 1.05rem; }
.point-route-choices__header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; height: 44px; }
.point-route-choices__hint { margin: 0; padding: .5rem .85rem; font-size: .82rem; line-height: 1.5; }
.point-route-choices__list { display: grid; gap: .5rem; min-height: 0; overflow-y: auto;
  overscroll-behavior: contain; padding: .5rem .85rem .85rem; }
.point-route-choices__list p { margin: .4rem 0; line-height: 1.5; }
.point-route-choices__card { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .65rem;
  width: 100%; min-height: 72px; padding: .65rem .75rem; border: 1px solid rgba(var(--v-theme-on-surface), .1);
  border-radius: var(--bb-radius-nested, 16px); background: rgba(var(--v-theme-on-surface), .035);
  color: inherit; font: inherit; text-align: start; cursor: pointer; }
.point-route-choices__card[aria-pressed="true"] { border-color: rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.point-route-choices__name { display: grid; flex: 1 1 10rem; font-weight: 800; }
.point-route-choices__name small { font-size: .8rem; font-weight: 500; }
.point-route-choices__metrics { flex: 1 1 10rem; font-size: .86rem; }
.point-route-choices__selected { color: rgb(var(--v-theme-primary)); font-size: .82rem; font-weight: 800; }
.point-route-choices__card:focus-visible, .point-route-choices__header :deep(.v-btn:focus-visible),
.point-route-choices__footer :deep(.v-btn:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.point-route-choices__footer { display: flex; flex-wrap: wrap; gap: .5rem;
  padding: .5rem .85rem calc(.5rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route-choices__footer :deep(.v-btn) { flex: 1 1 10rem; min-height: 44px; height: auto;
  border-radius: .75rem !important; }
.point-route-choices__footer :deep(.v-btn__content) { white-space: normal; text-align: center; }
@media (min-width: 600px) and (max-width: 1023px) {
  section.point-route-choices-shell { left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    width: min(30rem, calc(100vw - 7.5rem)); }
}
@media (max-width: 599px) {
  section.point-route-choices-shell { left: calc(.75rem + env(safe-area-inset-left, 0px));
    right: calc(.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: auto; }
  .point-route-choices.bb-map-navigation-card { border-radius: var(--bb-radius-card, 24px) !important; }
  .point-route-choices { width: 100%; max-height: min(62dvh, 32rem); }
  .point-route-choices__list { padding-inline: .85rem; }
}
@media (max-height: 430px) and (max-width: 599px) {
  .point-route-choices { max-height: max(7rem, calc(100dvh - 13rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
    overflow-y: auto; } /* Allow the complete footer to scroll into view on short landscape phones. */
  .point-route-choices__header, .point-route-choices__hint, .point-route-choices__footer { flex-shrink: 0; }
  .point-route-choices__list { flex: none; overflow-y: visible; }
}
@media (forced-colors: active) {
  .point-route-choices__card[aria-pressed="true"] { outline: 2px solid Highlight; }
}
</style>
