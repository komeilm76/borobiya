<template>
  <!-- Match the route chooser: a nonmodal, bounded sheet over the visible map. -->
  <section v-if="open && api.point.value" class="point-transport-choices-shell"
    role="region" aria-label="انتخاب وسیلهٔ حرکت" @keydown.esc.stop.prevent="emit('close')">
    <v-card id="map-point-transport-choices-sheet" class="point-transport-choices" rounded="xl" dir="rtl" tabindex="-1">
      <header class="point-transport-choices__header">
        <h2>انتخاب وسیلهٔ حرکت</h2>
        <v-btn v-if="showSearch" icon="mdi-magnify" variant="text" aria-label="جست‌وجوی مکان" title="جست‌وجوی مکان"
          @click="emit('search')" />
        <v-btn icon="mdi-arrow-right" variant="text" aria-label="بازگشت به برنامه‌ریزی سفر"
          @click="emit('close')" />
      </header>
      <p class="point-transport-choices__hint">وسیلهٔ دلخواه را انتخاب کنید و سپس تأیید کنید. تا آن زمان مسیر فعلی تغییر نمی‌کند.</p>
      <div class="point-transport-choices__list" role="group" aria-label="وسیله‌های سفر">
        <button v-for="mode in transportOptions" :key="mode.value" type="button" class="point-transport-choices__card"
          :aria-pressed="selected === mode.value" @click="selected = mode.value">
          <v-icon :icon="mode.icon" size="26" aria-hidden="true" />
          <span class="point-transport-choices__name">{{ mode.label }}</span>
          <span v-if="selected === mode.value" class="point-transport-choices__selected">انتخاب‌شده</span>
        </button>
      </div>
      <footer class="point-transport-choices__footer">
        <v-btn variant="text" @click="emit('close')">بازگشت بدون تغییر</v-btn>
        <v-btn color="primary" variant="flat" @click="emit('confirm', selected)">تأیید وسیلهٔ انتخابی</v-btn>
      </footer>
    </v-card>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { TransportProfile } from "@/api/mission-routing";
import type { usePointRoute } from "@/composables/use-point-route";
import { transportOptions } from "@/map/transport-options";
const props = defineProps<{ api: ReturnType<typeof usePointRoute>; open: boolean; showSearch: boolean }>();
const emit = defineEmits<{ close: []; confirm: [mode: TransportProfile]; search: [] }>();
const selected = ref<TransportProfile>(props.api.profile.value);
// Never carry an unconfirmed choice into a new destination or a reopened sheet.
watch([() => props.open, () => props.api.point.value], () => { selected.value = props.api.profile.value; });
</script>

<style scoped>
section.point-transport-choices-shell { position: fixed; z-index: 7; pointer-events: none;
  right: calc(5.5rem + env(safe-area-inset-right, 0px)); bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  width: min(36rem, calc(100vw - 34rem)); max-width: 100%; }
.point-transport-choices { pointer-events: auto; display: flex; flex-direction: column;
  max-height: min(66dvh, 30rem); overflow: hidden; color: rgb(var(--v-theme-on-surface)); }
.point-transport-choices__header { display: flex; align-items: center; justify-content: space-between;
  padding: .25rem .75rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-transport-choices__header h2 { flex: 1; min-width: 0; margin: 0; font-size: 1.05rem; }
.point-transport-choices__header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; height: 44px; }
.point-transport-choices__hint { margin: 0; padding: .5rem .85rem; font-size: .82rem; line-height: 1.5; }
.point-transport-choices__list { display: grid; gap: .5rem; min-height: 0; overflow-y: auto;
  overscroll-behavior: contain; padding: .5rem .85rem .85rem; }
.point-transport-choices__card { display: flex; align-items: center; gap: .65rem;
  width: 100%; min-height: 72px; padding: .65rem .75rem; border: 1px solid rgba(var(--v-theme-on-surface), .25);
  border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); color: inherit; font: inherit;
  text-align: start; cursor: pointer; }
.point-transport-choices__card[aria-pressed="true"] { border: 2px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), .12); }
.point-transport-choices__name { flex: 1; font-weight: 800; }
.point-transport-choices__selected { color: rgb(var(--v-theme-primary)); font-size: .82rem; font-weight: 800; }
.point-transport-choices__card:focus-visible, .point-transport-choices__header :deep(.v-btn:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.point-transport-choices__footer { display: flex; flex-wrap: wrap; gap: .5rem;
  padding: .5rem .85rem calc(.5rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-transport-choices__footer :deep(.v-btn) { flex: 1 1 10rem; min-height: 44px; height: auto; }
.point-transport-choices__footer :deep(.v-btn__content) { white-space: normal; text-align: center; }
@media (min-width: 600px) and (max-width: 1023px) {
  section.point-transport-choices-shell { left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    width: min(30rem, calc(100vw - 7.5rem)); }
}
@media (max-width: 599px) {
  section.point-transport-choices-shell { left: 0; right: 0;
    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: 100%; }
  .point-transport-choices { border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0;
    width: 100%; max-height: min(62dvh, 32rem); }
  .point-transport-choices__list { padding-inline: calc(.85rem + env(safe-area-inset-right, 0px))
    calc(.85rem + env(safe-area-inset-left, 0px)); }
}
@media (max-height: 430px) and (max-width: 599px) {
  .point-transport-choices { max-height: max(7rem, calc(100dvh - 13rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
    overflow-y: auto; }
  .point-transport-choices__header, .point-transport-choices__hint, .point-transport-choices__footer { flex-shrink: 0; }
  .point-transport-choices__list { flex: none; overflow-y: visible; }
}
@media (forced-colors: active) {
  .point-transport-choices__card[aria-pressed="true"] { outline: 2px solid Highlight; }
}
</style>
