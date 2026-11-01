<template>
  <!-- A standard, nonmodal map sheet. The selected route state alone controls
       its visibility; no separate dialog/transition state can close it. -->
  <section v-if="api.point.value && api.sheetOpen.value && !choicesOpen"
    class="point-route-shell" :class="{ 'point-route-shell--expanded': routesOpen }"
    role="region" aria-label="برنامه‌ریزی مسیر" @keydown.esc.stop.prevent="onEscape">
    <v-card id="map-point-route-sheet" class="point-route" rounded="xl" dir="rtl" tabindex="-1">
      <div class="point-route__header">
        <v-icon class="point-route__pin" icon="mdi-map-marker" size="23" aria-hidden="true" />
        <div class="point-route__headings"><small>مقصد انتخاب‌شده</small><strong :title="api.title.value">{{ api.title.value }}</strong></div>
        <v-menu v-model="menuOpen" :close-on-content-click="false" :close-on-back="false"
          location="top" @update:model-value="onMenuVisibilityChange">
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" id="point-route-menu-button" icon="mdi-dots-vertical" variant="text"
              aria-label="گزینه‌های مقصد" :aria-expanded="menuOpen" aria-haspopup="menu" />
          </template>
          <v-card class="point-route__copy-menu" rounded="xl" dir="rtl" role="menu" aria-label="گزینه‌های مقصد">
            <span v-if="api.knownPlace.value?.type" class="point-route__place-type">نوع مکان: {{ api.knownPlace.value.type }}</span>
            <v-btn role="menuitem" variant="text" prepend-icon="mdi-content-copy" :disabled="!api.point.value"
              @click="copyDestination('coordinates')">کپی مختصات مقصد</v-btn>
            <v-btn role="menuitem" variant="text" prepend-icon="mdi-content-copy" :disabled="!api.address.value?.trim()"
              @click="copyDestination('address')">کپی نشانی مقصد</v-btn>
            <v-btn v-if="reverse.failed.value && !api.address.value" role="menuitem" variant="text"
              prepend-icon="mdi-refresh" @click="reverse.load()">تلاش دوباره برای نشانی</v-btn>
            <p v-if="copyFallback" class="point-route__copy-hint" role="status">کپی خودکار ممکن نشد؛ متن زیر را انتخاب و کپی کنید.</p>
            <textarea v-if="copyFallback" id="point-route-copy-fallback" class="point-route__copy-fallback"
              :value="copyFallback" readonly dir="auto" aria-label="متن مقصد برای کپی دستی" @focus="selectFallback" />
          </v-card>
        </v-menu>
        <v-btn id="point-route-remove-button" icon="mdi-close" color="error" variant="text"
          aria-label="حذف مقصد و مسیر" title="حذف مقصد و مسیر" @click="requestDelete" />
      </div>
      <v-snackbar v-model="copyToastOpen" location="top" color="success" :timeout="2200" :z-index="2600">
        {{ copyFeedback }}
      </v-snackbar>
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
        <p v-if="api.routes.value.length > 1" class="point-route__legend">خط سبز مسیر انتخابی و خط نارنجی جایگزین است؛ برای بررسی مسیرها از دکمهٔ انتخاب مسیر کنار SOS استفاده کنید.</p>
        <p class="point-route__disclaimer">زمان و مسافت، برآورد آخرین موقعیت GPS هستند و ترافیک زنده یا رسیدن قطعی را نشان نمی‌دهند.</p>
      </div>
      <div class="point-route__actions">
        <v-btn v-if="!routesOpen" id="point-route-show-routes" variant="tonal" color="primary" aria-controls="point-route-routes"
          :aria-expanded="routesOpen" @click="showRoutes">{{ api.navigating.value ? 'ویرایش جزئیات مسیر' : 'جزئیات و وسیلهٔ حرکت' }}</v-btn>
        <v-btn v-else variant="text" @click="backToSummary">بازگشت</v-btn>
        <v-btn v-if="routesOpen && (api.error.value || (!api.routes.value.length && !api.loading.value))"
          variant="tonal" color="primary" :disabled="api.loading.value" @click="api.findRoutes()">محاسبهٔ دوباره</v-btn>
        <v-btn v-if="!api.navigating.value" color="primary" variant="flat" :disabled="!api.point.value"
          @click="emit('start')">{{ pausedForEdit ? 'شروع دوبارهٔ راهبری' : 'شروع راهبری' }}</v-btn>
        <v-btn v-else variant="tonal" @click="dismiss">بازگشت به نقشه</v-btn>
      </div>
    </v-card>
  </section>
  <!-- The header X only requests deletion. The route remains intact until the
       explicit destructive choice; Escape/Back/outside cancel this dialog. -->
  <v-dialog v-model="confirmDeleteOpen" max-width="24rem" :close-on-back="false"
    aria-labelledby="point-route-delete-title" aria-describedby="point-route-delete-description"
    @after-enter="focusCancelRemoval">
    <v-card class="point-route__delete-confirm" rounded="xl" dir="rtl">
      <v-card-title id="point-route-delete-title">مقصد و مسیر حذف شود؟</v-card-title>
      <v-card-text id="point-route-delete-description">
        مقصد <strong><bdi dir="auto">{{ api.title.value }}</bdi></strong> و مسیرهای محاسبه‌شده حذف می‌شوند؛
        راهبری جاری متوقف می‌شود.
      </v-card-text>
      <v-card-actions>
        <v-btn id="point-route-cancel-remove" variant="tonal" color="primary" @click="cancelDelete">انصراف</v-btn>
        <v-btn color="error" variant="flat" @click="confirmDelete">حذف مقصد و مسیر</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import type { useReversePlace } from "@/composables/use-reverse-place";
import type { usePointRoute } from "@/composables/use-point-route";
import type { TransportProfile } from "@/api/mission-routing";
import { destinationCopyText, tryCopyDestination } from "@/map/point-route-copy";
const props = defineProps<{
  api: ReturnType<typeof usePointRoute>;
  reverse: ReturnType<typeof useReversePlace>;
  originReverse: ReturnType<typeof useReversePlace>;
  choicesOpen: boolean;
}>();
const emit = defineEmits<{ start: []; dismiss: []; 'layout-change': [] }>();
const isPhone = useMediaQuery("(max-width: 599px)");
const confirmDeleteOpen = defineModel<boolean>("confirmDeleteOpen", { default: false });
const menuOpen = ref(false), routesOpen = ref(false), pausedForEdit = ref(false);
const copyFeedback = ref("");
const copyToastOpen = ref(false);
const copyFallback = ref<string | null>(null);
let copyGeneration = 0;
function resetMenu(): void {
  ++copyGeneration; menuOpen.value = false; copyToastOpen.value = false;
  copyFeedback.value = ""; copyFallback.value = null;
}
watch(() => props.api.point.value, () => {
  confirmDeleteOpen.value = false;
  resetMenu(); routesOpen.value = false; pausedForEdit.value = false;
});
watch(() => props.api.sheetOpen.value, (open) => {
  if (!open) confirmDeleteOpen.value = false;
  else { resetMenu(); routesOpen.value = false; }
});
watch(confirmDeleteOpen, (open, previous) => {
  if (!open && previous && props.api.point.value && props.api.sheetOpen.value)
    void nextTick(() => document.getElementById("point-route-remove-button")?.focus());
});
watch(routesOpen, async () => { await nextTick(); emit('layout-change'); });
function onMenuVisibilityChange(open: boolean): void {
  ++copyGeneration; // A pending clipboard response cannot populate a reopened menu.
  if (open) { copyToastOpen.value = false; copyFeedback.value = ""; copyFallback.value = null; }
}
async function copyDestination(kind: "coordinates" | "address"): Promise<void> {
  const point = props.api.point.value;
  const text = destinationCopyText(kind, point, props.api.address.value);
  if (!text || !point) return;
  const current = ++copyGeneration;
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  const copied = await tryCopyDestination(text, clipboard?.writeText?.bind(clipboard));
  // An async clipboard result must never show a previous destination's private address.
  if (props.api.point.value !== point || !menuOpen.value || current !== copyGeneration ||
    destinationCopyText(kind, point, props.api.address.value) !== text) return;
  if (copied) {
    copyFeedback.value = kind === "coordinates" ? "مختصات مقصد کپی شد." : "نشانی مقصد کپی شد.";
    menuOpen.value = false;
    copyToastOpen.value = true;
  } else {
    copyFallback.value = text;
    copyFeedback.value = "کپی خودکار ممکن نشد؛ متن را انتخاب و کپی کنید.";
    await nextTick();
    if (current === copyGeneration && menuOpen.value) document.getElementById("point-route-copy-fallback")?.focus();
  }
}
function selectFallback(event: FocusEvent): void {
  if (event.target instanceof HTMLTextAreaElement) event.target.select();
}
function showRoutes(): void {
  if (props.api.navigating.value) { props.api.editNavigation(); pausedForEdit.value = true; }
  routesOpen.value = true; props.api.routesVisible.value = true;
}
function backToSummary(): void {
  routesOpen.value = false;
  void nextTick(() => document.getElementById('point-route-show-routes')?.focus());
}
function dismiss(): void { confirmDeleteOpen.value = false; resetMenu(); props.api.sheetOpen.value = false; emit('dismiss'); }
function requestDelete(): void { menuOpen.value = false; confirmDeleteOpen.value = true; }
function cancelDelete(): void { confirmDeleteOpen.value = false; }
function focusCancelRemoval(): void { document.getElementById("point-route-cancel-remove")?.focus(); }
function confirmDelete(): void {
  if (!confirmDeleteOpen.value || !props.api.point.value) return;
  confirmDeleteOpen.value = false;
  props.api.clear(); emit('dismiss');
}
function onEscape(): void {
  if (confirmDeleteOpen.value) cancelDelete();
  else if (menuOpen.value) { menuOpen.value = false; void nextTick(() => document.getElementById('point-route-menu-button')?.focus()); }
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
/* The confirmation is a separate modal, not more content in the short sheet. */
.point-route__delete-confirm { max-height: min(85dvh, 24rem); overflow: hidden; }
.point-route__delete-confirm :deep(.v-card-title) { white-space: normal; overflow-wrap: anywhere; }
.point-route__delete-confirm :deep(.v-card-text) { overflow-y: auto; overflow-wrap: anywhere; line-height: 1.65; }
.point-route__delete-confirm :deep(.v-card-actions) { flex-wrap: wrap; gap: .4rem;
  padding: .5rem .75rem calc(.75rem + env(safe-area-inset-bottom, 0px)); }
.point-route__delete-confirm :deep(.v-card-actions .v-btn) { min-height: 44px; }
/* Keep the copy menu outside the compact sheet's document flow. HTTP LAN clients
 * can select the fallback text without a clipboard API or losing the route. */
:global(.point-route__copy-menu) { display: grid; gap: .15rem; width: min(18rem, calc(100vw - 1.5rem));
  max-height: min(60dvh, 17rem); overflow-y: auto;
  padding: .45rem; color: rgb(var(--v-theme-on-surface)); }
:global(.point-route__copy-menu .v-btn) { min-height: 44px; justify-content: flex-start; }
:global(.point-route__place-type) { padding: .35rem .5rem; font-size: .8rem; }
:global(.point-route__copy-hint) { margin: .25rem .5rem; font-size: .8rem; line-height: 1.5; }
:global(.point-route__copy-fallback) { box-sizing: border-box; width: 100%; min-height: 3.5rem;
  padding: .4rem; border: 1px solid currentColor; border-radius: .5rem; font: inherit; resize: vertical; }
:global(.point-route__copy-fallback:focus-visible) { outline: 2px solid rgb(var(--v-theme-primary)); }
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
  section.point-route-shell { left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    width: min(30rem, calc(100vw - 7.5rem)); }
  .point-route { max-height: min(42dvh, 19rem); }
  .point-route-shell--expanded .point-route { max-height: min(65dvh, 36rem); }
}
@media (max-width: 599px) {
  /* Keep the standard sheet inside the map viewport, above the dock. The map
     remains usable outside its content and the footer clears the home indicator. */
  section.point-route-shell { left: 0; right: 0; bottom: 0; width: 100%; }
  .point-route { border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0; }
  /* No viewport-height floor: the summary hugs its real content so the map
     remains in view. Expanded review is capped and scrolls without shrinking
     the header, endpoints, touch targets or safe-area footer. */
  .point-route { width: 100%; min-height: 0; max-height: min(48dvh, 24rem); }
  .point-route-shell--expanded .point-route { max-height: min(52dvh, 27rem); }
  .point-route__header { padding-inline: calc(.6rem + env(safe-area-inset-right, 0px)) calc(.6rem + env(safe-area-inset-left, 0px)); }
  .point-route__summary, .point-route__body, .point-route__endpoints {
    padding-inline: calc(.85rem + env(safe-area-inset-right, 0px)) calc(.85rem + env(safe-area-inset-left, 0px));
  }
  /* The body scrolls; the two primary actions stay above the home indicator. */
  .point-route__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: .4rem calc(.65rem + env(safe-area-inset-right, 0px))
      calc(.4rem + env(safe-area-inset-bottom, 0px)) calc(.65rem + env(safe-area-inset-left, 0px)); }
  .point-route__actions :deep(.v-btn) { width: 100%; min-width: 0; padding-inline: .25rem; }
}
@media (max-width: 400px) {
  .point-route__header { gap: .1rem; }
  .point-route__pin { display: none; }
  .point-route__mode-grid button { flex-direction: column; font-size: .85rem; }
}
@media (max-height: 430px) and (max-width: 599px) {
  /* The fixed header/address/footer need ~14rem even on short phones. Keep
     everything else scrollable; landscape retains two primary actions. */
  .point-route, .point-route-shell--expanded .point-route {
    max-height: clamp(14rem, 60dvh, 17rem);
  }
}
@media (forced-colors: active) { .point-route__mode-grid button[aria-pressed="true"] { outline: 2px solid Highlight; } }
</style>
