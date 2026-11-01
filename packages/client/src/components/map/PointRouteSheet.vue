<template>
  <!-- Desktop stays a nonmodal map panel; phones use the SOS-style bottom sheet. -->
  <component :is="isPhone ? VBottomSheet : 'section'" v-if="api.point.value && api.sheetOpen.value"
    class="point-route-shell" :class="{ 'point-route-shell--expanded': routesOpen }"
    :model-value="isPhone ? api.sheetOpen.value : undefined" :scrim="isPhone ? false : undefined"
    :persistent="isPhone" :close-on-back="false"
    aria-label="برنامه‌ریزی مسیر" @update:model-value="onVisible" @after-enter="emit('layout-change')"
    @keydown.esc.stop.prevent="onEscape">
    <v-card id="map-point-route-sheet" class="point-route" rounded="xl" dir="rtl">
      <div class="point-route__header">
        <v-icon class="point-route__pin" icon="mdi-map-marker" size="23" aria-hidden="true" />
        <div class="point-route__headings"><small>مقصد انتخاب‌شده</small><strong :title="api.title.value">{{ api.title.value }}</strong></div>
        <v-btn id="point-route-info-button" :icon="infoOpen ? 'mdi-information' : 'mdi-information-outline'" variant="text"
          :aria-label="infoOpen ? 'بستن اطلاعات مکان' : 'نمایش اطلاعات مکان'" :aria-expanded="infoOpen"
          aria-controls="point-route-info" @click="toggleInfo" />
        <v-btn icon="mdi-close" variant="text" aria-label="بستن برنامه‌ریزی مسیر" @click="dismiss" />
      </div>
      <div v-if="infoOpen" id="point-route-info" class="point-route__info">
        <p v-if="!api.address.value && reverse.loading.value" role="status">در حال یافتن نشانی…</p>
        <p v-else-if="!api.address.value && reverse.failed.value">نشانی در دسترس نیست. <button type="button" @click="reverse.load()">تلاش دوباره</button></p>
        <p v-else>{{ api.address.value ?? 'نشانی پیدا نشد؛ مختصات مقصد روی نقشه مشخص است.' }}</p>
        <p v-if="api.knownPlace.value?.type">نوع مکان: {{ api.knownPlace.value.type }}</p>
        <bdi v-if="api.point.value" dir="ltr">{{ api.point.value.lat.toFixed(5) }}, {{ api.point.value.lon.toFixed(5) }}</bdi>
      </div>
      <div class="point-route__endpoints" aria-label="مبدأ و مقصد مسیر">
        <div class="point-route__endpoint">
          <span class="point-route__endpoint-name">{{ api.provisionalRoute.value ? "مبدأ تقریبی" : "مبدأ" }}:</span>
          <bdi class="point-route__endpoint-address" dir="auto" :title="originAddress">{{ originAddress }}</bdi>
        </div>
        <div class="point-route__endpoint">
          <span class="point-route__endpoint-name">مقصد:</span>
          <bdi class="point-route__endpoint-address" dir="auto" :title="destinationAddress">{{ destinationAddress }}</bdi>
        </div>
      </div>
      <p v-if="api.loading.value && !routesOpen" class="point-route__status" role="status">در حال آماده‌سازی مسیر {{ modeLabel }}…</p>
      <p v-else-if="api.error.value && !routesOpen" class="point-route__status point-route__error" role="alert">{{ api.error.value }}</p>
      <p v-if="api.arrived.value && !routesOpen" class="point-route__status" role="status">به نزدیکی مقصد رسیدید. محیط واقعی را بررسی کنید.</p>
      <div v-if="isPhone && !routesOpen" class="point-route__summary" aria-label="خلاصهٔ مسیر">
        <div v-if="api.selectedRoute.value" class="point-route__metrics" aria-label="برآورد مسیر انتخابی">
          <div><span>زمان تقریبی</span><strong>{{ api.durationLabel.value }}</strong></div>
          <div><span>مسافت مسیر</span><strong>{{ api.distanceLabel.value }}</strong></div>
        </div>
        <p v-else-if="!api.loading.value && !api.error.value" role="status">در انتظار مسیر…</p>
      </div>
      <div v-if="routesOpen" id="point-route-routes" class="point-route__body" tabindex="0" aria-label="مسیرها و وسیلهٔ حرکت">
        <div v-if="api.routes.value.length" class="point-route__alternative">
          <span>مسیر {{ (api.index.value + 1).toLocaleString('fa-IR') }} از {{ api.routes.value.length.toLocaleString('fa-IR') }}
            <small>{{ api.index.value === 0 ? 'سریع‌ترین گزینهٔ دریافت‌شده' : 'مسیر جایگزین' }}</small>
          </span>
          <v-btn v-if="api.routes.value.length > 1" variant="tonal" color="primary"
            @click="api.choose((api.index.value + 1) % api.routes.value.length)">مسیر دیگر</v-btn>
        </div>
        <div class="point-route__metrics" aria-label="برآورد مسیر از موقعیت فعلی من">
          <div><span>زمان تقریبی</span><strong>{{ api.durationLabel.value }}</strong></div>
          <div><span>مسافت مسیر</span><strong>{{ api.distanceLabel.value }}</strong></div>
        </div>
        <fieldset class="point-route__modes">
          <legend>وسیلهٔ حرکت</legend>
          <div class="point-route__mode-grid">
            <button v-for="mode in modes" :key="mode.value" type="button" :aria-pressed="api.profile.value === mode.value"
              @click="api.changeProfile(mode.value)"><v-icon :icon="mode.icon" size="21" aria-hidden="true" />{{ mode.label }}</button>
          </div>
        </fieldset>
        <p v-if="api.loading.value" role="status" class="point-route__message">در حال محاسبهٔ مسیرهای {{ modeLabel }}…</p>
        <p v-else-if="api.error.value" role="alert" class="point-route__message point-route__error">{{ api.error.value }}</p>
        <p v-if="api.routes.value.length > 1" class="point-route__legend">خط سبز مسیر انتخابی و خط نارنجی جایگزین است؛ {{ isPhone ? 'با «مسیر دیگر» گزینه‌ها را عوض کنید.' : 'هر خط را روی نقشه هم می‌توانید لمس کنید.' }}</p>
        <p class="point-route__disclaimer">زمان و مسافت، برآورد آخرین موقعیت GPS هستند و ترافیک زنده یا رسیدن قطعی را نشان نمی‌دهند.</p>
      </div>
      <div class="point-route__actions">
        <v-btn v-if="!routesOpen" id="point-route-show-routes" variant="tonal" color="primary" aria-controls="point-route-routes"
          :aria-expanded="routesOpen" @click="showRoutes">{{ api.navigating.value ? 'ویرایش مسیرها' : 'نمایش مسیرها' }}</v-btn>
        <v-btn v-else variant="text" @click="backToSummary">بازگشت</v-btn>
        <v-btn v-if="routesOpen && (api.error.value || (!api.routes.value.length && !api.loading.value))"
          variant="tonal" color="primary" :disabled="api.loading.value" @click="api.findRoutes()">محاسبهٔ دوباره</v-btn>
        <v-btn v-if="!api.navigating.value" color="primary" variant="flat" :disabled="!api.point.value"
          @click="emit('start')">{{ pausedForEdit ? 'شروع دوبارهٔ راهبری' : 'شروع راهبری' }}</v-btn>
        <v-btn v-else variant="tonal" @click="dismiss">بازگشت به نقشه</v-btn>
        <v-btn class="point-route__clear" variant="text" color="error" @click="clearDestination">حذف مقصد</v-btn>
      </div>
    </v-card>
  </component>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { VBottomSheet } from "vuetify/components";
import type { useReversePlace } from "@/composables/use-reverse-place";
import type { usePointRoute } from "@/composables/use-point-route";
import type { TransportProfile } from "@/api/mission-routing";
const props = defineProps<{
  api: ReturnType<typeof usePointRoute>;
  reverse: ReturnType<typeof useReversePlace>;
  originReverse: ReturnType<typeof useReversePlace>;
}>();
const emit = defineEmits<{ start: []; dismiss: []; 'layout-change': [] }>();
const isPhone = useMediaQuery("(max-width: 599px)");
const infoOpen = ref(false), routesOpen = ref(false), pausedForEdit = ref(false);
watch(() => props.api.point.value, () => { infoOpen.value = false; routesOpen.value = false; pausedForEdit.value = false; });
watch(() => props.api.sheetOpen.value, (open) => { if (open) { infoOpen.value = false; routesOpen.value = false; } });
watch([infoOpen, routesOpen], async () => { await nextTick(); emit('layout-change'); });
function toggleInfo(): void { infoOpen.value = !infoOpen.value; }
function showRoutes(): void {
  if (props.api.navigating.value) { props.api.editNavigation(); pausedForEdit.value = true; }
  routesOpen.value = true; props.api.routesVisible.value = true;
}
function backToSummary(): void {
  routesOpen.value = false;
  void nextTick(() => document.getElementById('point-route-show-routes')?.focus());
}
function dismiss(): void { props.api.sheetOpen.value = false; emit('dismiss'); }
function onVisible(visible: boolean): void { if (!visible) dismiss(); }
function clearDestination(): void { props.api.clear(); emit('dismiss'); }
function onEscape(): void {
  if (infoOpen.value) { infoOpen.value = false; void nextTick(() => document.getElementById('point-route-info-button')?.focus()); }
  else if (routesOpen.value) backToSummary();
  else dismiss();
}
const modes: { value: TransportProfile; icon: string; label: string }[] = [
  { value: "car", icon: "mdi-car", label: "خودرو" },
  { value: "bicycle", icon: "mdi-bicycle", label: "دوچرخه" },
  { value: "foot", icon: "mdi-walk", label: "پیاده" }
];
const modeLabel = computed(() => modes.find((mode) => mode.value === props.api.profile.value)?.label ?? "انتخابی");
// Never substitute the road-snapped polyline vertex for the GPS request origin.
// An unavailable geocoder is not an address: show the exact coordinates instead.
const originAddress = computed(() => {
  const from = props.api.plannedFrom.value;
  if (!from) return "در انتظار موقعیت مبدأ";
  if (props.originReverse.address.value?.formattedAddress) return props.originReverse.address.value.formattedAddress;
  if (props.originReverse.loading.value) return "در حال یافتن نشانی مبدأ…";
  return `${from.lat.toFixed(5)}, ${from.lon.toFixed(5)} (نشانی در دسترس نیست)`;
});
const destinationAddress = computed(() => {
  if (props.api.address.value) return props.api.address.value;
  if (props.reverse.loading.value) return "در حال یافتن نشانی مقصد…";
  const to = props.api.point.value;
  return to ? `${to.lat.toFixed(5)}, ${to.lon.toFixed(5)} (نشانی در دسترس نیست)` : "مقصد انتخاب نشده است";
});
</script>

<style scoped>
section.point-route-shell { position: fixed; z-index: 7; pointer-events: none; right: calc(5.5rem + env(safe-area-inset-right, 0px));
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); width: min(36rem, calc(100vw - 34rem)); max-width: 100%; }
.point-route { pointer-events: auto; display: flex; flex-direction: column; max-height: min(38dvh, 19rem); overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), .14); color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface)); box-shadow: 0 16px 45px rgba(5, 24, 27, .28); }
.point-route-shell--expanded .point-route { max-height: min(72dvh, 42rem); }
.point-route__header { display: flex; flex: 0 0 auto; align-items: center; gap: .35rem; min-height: 54px; padding: .25rem .6rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__pin { flex: 0 0 auto; color: rgb(var(--v-theme-primary)); }
.point-route__headings { display: grid; flex: 1; min-width: 0; line-height: 1.3; }
.point-route__headings small { font-size: .8rem; color: rgb(var(--v-theme-primary)); }
.point-route__headings strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1rem; }
.point-route__header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; height: 44px; }
.point-route__header :deep(.v-btn:focus-visible), .point-route button:focus-visible, .point-route__body:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -3px; }
.point-route__info { flex: 0 1 auto; overflow-y: auto; padding: .55rem .85rem; line-height: 1.55;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1); font-size: .85rem; }
.point-route__info p { margin: 0 0 .25rem; overflow-wrap: anywhere; }
.point-route__info bdi { color: rgb(var(--v-theme-on-surface)); opacity: .8; }
.point-route__info button { color: rgb(var(--v-theme-primary)); font: inherit; font-weight: 800; text-decoration: underline; }
/* Two compact, independent lines: long addresses never stretch the sheet or wrap. */
.point-route__endpoints { display: grid; gap: .22rem; flex: 0 0 auto; min-width: 0;
  padding: .4rem .85rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1);
  font-size: .8rem; line-height: 1.4; }
.point-route__endpoint { display: flex; gap: .35rem; min-width: 0; overflow: hidden; white-space: nowrap; }
.point-route__endpoint-name { flex: 0 0 auto; font-weight: 800; }
.point-route__endpoint-address { display: block; flex: 1 1 auto; min-width: 0; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis; text-align: start; }
.point-route__status { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0; padding: .4rem .85rem; font-size: .81rem; line-height: 1.45; }
.point-route__error { color: rgb(var(--v-theme-error)); }
.point-route__body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: .65rem .85rem; }
.point-route__summary { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: .65rem .85rem; }
.point-route__summary p { margin: .65rem 0 0; font-size: .86rem; line-height: 1.55; }
.point-route__metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .4rem; }
.point-route__metrics > div { display: grid; gap: .1rem; padding: .45rem; border: 1px solid rgba(var(--v-theme-on-surface), .14); border-radius: 12px; }
.point-route__metrics span { font-size: .81rem; opacity: .8; }
.point-route__metrics strong { font-size: .95rem; }
.point-route__modes { min-width: 0; border: 0; margin: .55rem 0 0; padding: 0; }
.point-route__modes legend { margin-bottom: .3rem; font-weight: 800; }
.point-route__mode-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .35rem; }
.point-route__mode-grid button { display: flex; min-height: 44px; align-items: center; justify-content: center; gap: .2rem; padding: .3rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .25); border-radius: 12px; font: inherit; cursor: pointer; }
.point-route__mode-grid button[aria-pressed="true"] { border: 2px solid rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); font-weight: 800; }
.point-route__message { margin: .6rem 0 0; line-height: 1.55; }
.point-route__alternative { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-bottom: .6rem; }
.point-route__alternative :deep(.v-btn) { flex: 0 0 auto; min-height: 44px; }
.point-route__alternative span { font-weight: 800; }
.point-route__alternative small { display: block; font-weight: 500; opacity: .8; }
.point-route__legend, .point-route__disclaimer { margin: .5rem 0 0; font-size: .8rem; line-height: 1.5; opacity: .84; }
.point-route__actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .3rem;
  padding: .4rem .65rem calc(.4rem + env(safe-area-inset-bottom, 0px)); border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__actions :deep(.v-btn) { min-height: 44px; height: auto; font-size: .84rem; }
.point-route__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
@media (max-width: 1023px) {
  .point-route-shell { left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    width: min(30rem, calc(100vw - 7.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); }
}
@media (min-width: 600px) and (max-width: 1023px) {
  .point-route-shell { position: relative; order: 3; left: auto; right: auto; bottom: auto; width: 100%; padding: 0; pointer-events: auto; }
  .point-route { max-height: min(42dvh, 19rem); }
  .point-route-shell--expanded .point-route { max-height: min(65dvh, 36rem); }
}
@media (max-width: 599px) {
  /* Vuetify teleports the sheet outside the map. Its scrollable dialog flexes
     the overlay/card to 100% height, even if the card has a smaller max-height.
     Size both to their contents instead; only the details area scrolls. */
  :global(.point-route-shell.v-bottom-sheet > .v-overlay__content) {
    width: 100vw !important; max-width: 100vw !important; margin: 0 !important;
    flex: 0 1 auto !important; height: auto !important;
  }
  :global(.point-route-shell.v-bottom-sheet > .v-overlay__content > .point-route) {
    border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0 !important;
    flex: 0 1 auto !important; height: auto !important; overflow: hidden !important;
  }
  /* No viewport-height floor: the summary hugs its real content so the map
     remains in view. Expanded review is capped and scrolls without shrinking
     the header, endpoints, touch targets or safe-area footer. */
  .point-route { width: 100%; min-height: 0; max-height: min(48dvh, 24rem); }
  .point-route-shell--expanded .point-route { max-height: min(52dvh, 27rem); }
  .point-route__header { padding-inline: calc(.6rem + env(safe-area-inset-right, 0px)) calc(.6rem + env(safe-area-inset-left, 0px)); }
  .point-route__summary, .point-route__body, .point-route__endpoints {
    padding-inline: calc(.85rem + env(safe-area-inset-right, 0px)) calc(.85rem + env(safe-area-inset-left, 0px));
  }
  /* The body scrolls; Start and Remove stay available above the home indicator. */
  .point-route__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: .4rem calc(.65rem + env(safe-area-inset-right, 0px))
      calc(.4rem + env(safe-area-inset-bottom, 0px)) calc(.65rem + env(safe-area-inset-left, 0px)); }
  .point-route__actions :deep(.v-btn) { width: 100%; min-width: 0; padding-inline: .25rem; }
  .point-route__clear { grid-column: 1 / -1; }
}
@media (max-width: 400px) {
  .point-route__header { gap: .1rem; }
  .point-route__pin { display: none; }
  .point-route__mode-grid button { flex-direction: column; font-size: .85rem; }
}
@media (max-height: 430px) and (max-width: 599px) {
  /* The fixed header/address/footer need ~14rem even on short phones. Keep
     everything else scrollable; landscape fits three primary actions in a row. */
  .point-route, .point-route-shell--expanded .point-route {
    max-height: clamp(14rem, 60dvh, 17rem);
  }
  .point-route__actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .point-route__clear { grid-column: auto; }
}
@media (forced-colors: active) { .point-route__mode-grid button[aria-pressed="true"] { outline: 2px solid Highlight; } }
</style>
