<template>
  <!-- The same nonmodal point -> travel flow on phones, tablets and desktops. -->
  <section v-if="api.point.value && api.sheetOpen.value && !choicesOpen"
    class="point-route-shell" :class="{ 'point-route-shell--expanded': step === 'plan', 'point-route-shell--search-place': !!searchPlace && step === 'point' }"
    role="region" aria-label="مقصد و برنامه‌ریزی سفر" @keydown.esc.stop.prevent="onEscape">
    <v-card id="map-point-route-sheet" class="point-route bb-floating-card bb-map-navigation-card" elevation="3" rounded="xl" dir="rtl" tabindex="-1">
      <header class="point-route__header">
        <span class="point-route__place-icon" :style="searchPlace && step === 'point' ? { '--result-color': resultAppearance(searchPlace).color } : undefined">
          <v-icon :icon="searchPlace && step === 'point' ? resultAppearance(searchPlace).icon : 'mdi-map-marker'" size="23" aria-hidden="true" />
        </span>
        <div class="point-route__headings"><small>{{ step === 'plan' ? 'برنامه‌ریزی سفر' : searchPlace ? resultAppearance(searchPlace).label : 'مقصد انتخاب‌شده' }}</small>
          <strong :title="api.title.value">{{ api.title.value }}</strong></div>
        <v-btn v-if="showSearch" icon="mdi-magnify" variant="text" aria-label="جست‌وجوی مکان" title="جست‌وجوی مکان"
          @click="emit('search')" />
        <v-btn id="point-route-remove-button" icon="mdi-close" color="error" variant="text"
          aria-label="حذف مقصد و مسیر" title="حذف مقصد و مسیر" @click="requestDelete" />
      </header>

      <div class="point-route__content">
        <div class="point-route__endpoints" aria-label="مبدأ و مقصد مسیر">
          <div class="point-route__endpoint">
            <span class="point-route__endpoint-name">{{ api.provisionalRoute.value ? 'مبدأ تقریبی' : 'مبدأ' }}</span>
            <bdi class="point-route__endpoint-address" dir="auto" :title="originAddress">{{ originAddress }}</bdi>
          </div>
          <div class="point-route__endpoint">
            <span class="point-route__endpoint-name">مقصد</span>
            <bdi class="point-route__endpoint-address" dir="auto" :title="destinationAddress">{{ destinationAddress }}</bdi>
          </div>
        </div>

        <template v-if="step === 'point'">
          <p v-if="shareFeedback" role="status" class="point-route__message">{{ shareFeedback }}</p>
          <label v-if="shareFallback" class="point-route__fallback">پیوند را برای ارسال انتخاب و کپی کنید.
            <textarea :value="shareFallback" readonly dir="ltr" @focus="selectShareFallback" />
          </label>
          <div class="point-route__actions point-route__actions--initial">
            <v-btn variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-share-variant" :disabled="sharePending" @click="sendPoint">ارسال</v-btn>
            <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-navigation-variant" @click="showPlan">سفر</v-btn>
          </div>
        </template>

        <template v-else>
          <div class="point-route__choices" role="group" aria-label="تنظیمات سفر">
            <button type="button" class="point-route__choice" aria-controls="map-point-transport-choices-sheet"
              @click="emit('choose-transport')">
              <v-icon icon="mdi-car-multiple" aria-hidden="true" />
              <span><strong>انتخاب وسیلهٔ دیگر</strong><small>وسیلهٔ فعلی: {{ modeLabel }}</small></span>
              <v-icon icon="mdi-chevron-left" aria-hidden="true" />
            </button>
            <button type="button" class="point-route__choice" :disabled="!api.routes.value.length"
              @click="emit('choose-route')">
              <v-icon icon="mdi-routes" aria-hidden="true" />
              <span><strong>انتخاب مسیر دیگر</strong><small>مسیر {{ (api.index.value + 1).toLocaleString('fa-IR') }} از {{ api.routes.value.length.toLocaleString('fa-IR') }}</small></span>
              <v-icon icon="mdi-chevron-left" aria-hidden="true" />
            </button>
          </div>
          <p v-if="api.loading.value" class="point-route__message" role="status">در حال محاسبهٔ مسیرهای {{ modeLabel }}…</p>
          <p v-else-if="api.error.value" class="point-route__message point-route__error" role="alert">{{ api.error.value }}</p>
          <div class="point-route__metrics" aria-label="برآورد سفر">
            <div><span>مسافت</span><strong>{{ api.distanceLabel.value }}</strong></div>
            <div><span>زمان تقریبی سفر</span><strong>{{ api.durationLabel.value }}</strong></div>
          </div>
          <div class="point-route__actions point-route__actions--plan">
            <v-btn class="point-route__start" color="primary" variant="flat" rounded="lg" prepend-icon="mdi-navigation-variant"
              :disabled="!api.point.value" @click="emit('start')">شروع سفر</v-btn>
            <v-btn v-if="api.error.value || (!api.routes.value.length && !api.loading.value)"
              variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-refresh" :disabled="api.loading.value"
              @click="api.findRoutes()">محاسبهٔ دوباره</v-btn>
            <v-btn variant="text" color="primary" rounded="lg" @click="backToPoint">انصراف</v-btn>
          </div>
        </template>
      </div>
    </v-card>
  </section>
  <!-- Destructive removal still needs explicit confirmation. -->
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
        <v-btn id="point-route-cancel-remove" variant="tonal" color="primary" rounded="lg" @click="confirmDeleteOpen = false">انصراف</v-btn>
        <v-btn color="error" variant="flat" rounded="lg" @click="confirmDelete">حذف مقصد و مسیر</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useShare } from "@vueuse/core";
import type { useReversePlace } from "@/composables/use-reverse-place";
import type { usePointRoute } from "@/composables/use-point-route";
import type { OwnMapFix } from "@/composables/use-own-map-position";
import { createShareAttemptFence, selectedPointShare } from "@/map/selected-point-share";
import { transportLabel } from "@/map/transport-options";
import { resultAppearance } from "@/map/search-result-presentation";
import type { GeocodeResult } from "@shared/index";
const props = defineProps<{
  api: ReturnType<typeof usePointRoute>;
  reverse: ReturnType<typeof useReversePlace>;
  originReverse: ReturnType<typeof useReversePlace>;
  ownPosition: OwnMapFix | null;
  choicesOpen: boolean;
  showSearch: boolean;
  searchPlace?: GeocodeResult | null;
}>();
const emit = defineEmits<{ start: []; dismiss: []; search: []; 'choose-route': []; 'choose-transport': []; 'layout-change': [] }>();
const confirmDeleteOpen = defineModel<boolean>("confirmDeleteOpen", { default: false });
const step = ref<"point" | "plan">("point");
const shareFeedback = ref("");
const shareFallback = ref("");
const sharePending = ref(false);
const shareFence = createShareAttemptFence();
const { isSupported, share } = useShare();
function resetShare(): void {
  shareFence.reset();
  sharePending.value = false;
  shareFeedback.value = "";
  shareFallback.value = "";
}
watch(() => props.api.point.value, () => {
  resetShare(); step.value = "point";
  confirmDeleteOpen.value = false;
}, { flush: "sync" });
watch(() => props.api.sheetOpen.value, (open) => {
  if (!open) { resetShare(); confirmDeleteOpen.value = false; }
}, { flush: "sync" });
watch(() => props.choicesOpen, (open) => { if (open) resetShare(); }, { flush: "sync" });
watch(confirmDeleteOpen, (open, previous) => {
  if (!open && previous && props.api.point.value && props.api.sheetOpen.value)
    void nextTick(() => document.getElementById("point-route-remove-button")?.focus());
});
watch(step, async () => { await nextTick(); emit("layout-change"); });
function showPlan(): void {
  resetShare();
  step.value = "plan";
  props.api.routesVisible.value = true;
}
function backToPoint(): void {
  step.value = "point";
  props.api.routesVisible.value = false;
  void nextTick(() => document.getElementById("map-point-route-sheet")?.focus());
}
function returnToPoint(): boolean {
  if (step.value !== "plan") return false;
  backToPoint(); return true;
}
defineExpose({ returnToPoint });
function selectShareFallback(event: FocusEvent): void {
  if (event.target instanceof HTMLTextAreaElement) event.target.select();
}
async function sendPoint(): Promise<void> {
  const point = props.api.point.value;
  const payload = selectedPointShare(point);
  if (!point || !payload) return;
  const attempt = shareFence.begin();
  if (attempt === null) return;
  sharePending.value = true;
  shareFeedback.value = ""; shareFallback.value = "";
  try {
    if (isSupported.value) {
      try { await share(payload); return; } // Called directly from the click gesture, before any await.
      catch (error) { if ((error as { name?: string })?.name === "AbortError") return; }
    }
    if (!shareFence.isCurrent(attempt) || props.api.point.value !== point) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("NO_CLIPBOARD");
      await navigator.clipboard.writeText(payload.url);
      if (shareFence.isCurrent(attempt) && props.api.point.value === point)
        shareFeedback.value = "پیوند موقعیت انتخاب‌شده کپی شد؛ آن را برای مخاطب بفرستید.";
    } catch {
      if (!shareFence.isCurrent(attempt) || props.api.point.value !== point) return;
      shareFallback.value = payload.url;
      shareFeedback.value = "اشتراک‌گذاری خودکار در این مرورگر ممکن نیست.";
      await nextTick();
      if (shareFence.isCurrent(attempt) && props.api.point.value === point)
        document.querySelector<HTMLTextAreaElement>(".point-route__fallback textarea")?.focus();
    }
  } finally {
    shareFence.finish(attempt);
    sharePending.value = shareFence.busy;
  }
}
function requestDelete(): void { confirmDeleteOpen.value = true; }
function focusCancelRemoval(): void { document.getElementById("point-route-cancel-remove")?.focus(); }
function confirmDelete(): void {
  if (!confirmDeleteOpen.value || !props.api.point.value) return;
  confirmDeleteOpen.value = false; props.api.clear(); emit("dismiss");
}
function onEscape(): void {
  if (confirmDeleteOpen.value) confirmDeleteOpen.value = false;
  else if (step.value === "plan") backToPoint();
  else { props.api.sheetOpen.value = false; emit("dismiss"); }
}
const modeLabel = computed(() => transportLabel(props.api.profile.value));
// Never substitute a snapped route vertex for the origin. Before routing,
// the live fix is approximate and we show coordinates rather than invent an address.
const originAddress = computed(() => {
  const from = props.api.plannedFrom.value ?? props.ownPosition;
  if (!from) return "در انتظار موقعیت مبدأ";
  if (props.api.plannedFrom.value && props.originReverse.address.value?.formattedAddress)
    return props.originReverse.address.value.formattedAddress;
  if (props.api.plannedFrom.value && props.originReverse.loading.value) return "در حال یافتن نشانی مبدأ…";
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
section.point-route-shell { position: fixed; z-index: 7; pointer-events: none;
  right: calc(5.5rem + env(safe-area-inset-right, 0px)); bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  width: min(36rem, calc(100vw - 34rem)); max-width: 100%; }
.point-route { pointer-events: auto; display: flex; flex-direction: column; max-height: min(70dvh, 36rem); overflow: hidden; }
.point-route__header { display: flex; flex: 0 0 auto; align-items: center; gap: .35rem;
  min-height: 54px; padding: .25rem .6rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__place-icon { display: grid; place-items: center; flex: 0 0 42px; height: 42px;
  border-radius: 14px; color: var(--result-color, rgb(var(--v-theme-primary)));
  background: color-mix(in srgb, var(--result-color, rgb(var(--v-theme-primary))) 13%, transparent); }
.point-route-shell--search-place .point-route__header { min-height: 70px; padding-inline: .85rem; }
.point-route-shell--search-place .point-route__headings strong { font-size: 1.12rem; }
.point-route__headings { display: grid; flex: 1; min-width: 0; line-height: 1.3; }
.point-route__headings small { font-size: .8rem; color: rgb(var(--v-theme-primary)); }
.point-route__headings strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1rem; }
.point-route__header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; height: 44px; }
.point-route__content { overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
.point-route__endpoints { display: grid; gap: .3rem; padding: .7rem .85rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1); }
/* A connected A-to-B rail reads as a trip, not two unrelated address form fields. */
.point-route__endpoint { position: relative; display: grid; grid-template-columns: 12px 4.25rem minmax(0, 1fr);
  gap: .55rem; min-width: 0; min-height: 34px; align-items: center; }
.point-route__endpoint::before { content: ''; width: 11px; height: 11px; border: 2px solid rgb(var(--v-theme-primary));
  border-radius: 50%; background: rgb(var(--v-theme-surface)); }
.point-route__endpoint:last-child::before { border-color: rgb(var(--v-theme-error)); background: rgb(var(--v-theme-error)); }
.point-route__endpoint:first-child::after { content: ''; position: absolute; right: 4px;
  top: calc(50% + 8px); height: calc(100% + .3rem - 16px);
  border-inline-start: 2px dashed rgba(var(--v-theme-on-surface), .3); }
.point-route__endpoint-name { font-weight: 800; font-size: .82rem; }
.point-route__endpoint-address { display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: start; font-size: .87rem; }
.point-route__choices { display: grid; gap: .45rem; padding: .65rem .85rem; }
.point-route__choice { display: flex; align-items: center; gap: .55rem; width: 100%; min-height: 56px; padding: .5rem .7rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .12); border-radius: var(--bb-radius-nested, 16px);
  background: rgba(var(--v-theme-primary), .035);
  text-align: start; color: inherit; cursor: pointer; font: inherit; transition: background-color .15s, border-color .15s; }
.point-route__choice:hover:not(:disabled) { border-color: rgba(var(--v-theme-primary), .48);
  background: rgba(var(--v-theme-primary), .09); }
.point-route__choice:disabled { opacity: .55; cursor: not-allowed; }
.point-route__choice > .v-icon:first-child { flex: 0 0 38px; width: 38px; height: 38px;
  border-radius: 12px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.point-route__choice > .v-icon:last-child { color: rgb(var(--v-theme-primary)); }
.point-route__choice > span { flex: 1; min-width: 0; display: grid; }
.point-route__choice strong { font-size: .9rem; }
.point-route__choice small { font-size: .8rem; opacity: .8; }
.point-route__metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .4rem; padding: .25rem .85rem .7rem; }
.point-route__metrics > div { display: grid; gap: .1rem; min-width: 0; padding: .55rem .7rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-nested, 16px);
  background: rgba(var(--v-theme-on-surface), .04); }
.point-route__metrics span { font-size: .81rem; opacity: .8; }
.point-route__metrics strong { font-size: 1.08rem; font-weight: 850; font-variant-numeric: tabular-nums; }
.point-route__message { margin: .4rem .85rem; font-size: .84rem; line-height: 1.5; }
.point-route__error { color: rgb(var(--v-theme-error)); }
.point-route__fallback { display: grid; gap: .3rem; margin: .4rem .85rem; font-size: .85rem; }
.point-route__fallback textarea { width: 100%; min-height: 3rem; padding: .35rem; border: 1px solid currentColor; border-radius: .5rem; resize: none; }
.point-route__actions { position: sticky; bottom: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: .5rem;
  padding: .65rem .85rem calc(.65rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(var(--v-theme-on-surface), .12); background: rgb(var(--v-theme-surface)); }
.point-route__actions :deep(.v-btn) { flex: 1 1 8rem; min-height: 46px; height: auto;
  border-radius: 14px !important; font-weight: 800; }
.point-route__actions--plan :deep(.point-route__start) { flex: 2 1 11rem; }
.point-route__actions--plan :deep(.v-btn:last-child) { flex: 1 1 6rem; }
.point-route__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
.point-route__header :deep(.v-btn:focus-visible), .point-route button:focus-visible, .point-route textarea:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.point-route__delete-confirm { max-height: min(85dvh, 24rem); overflow: hidden; }
.point-route__delete-confirm :deep(.v-card-title) { white-space: normal; overflow-wrap: anywhere; }
.point-route__delete-confirm :deep(.v-card-text) { overflow-y: auto; overflow-wrap: anywhere; line-height: 1.65; }
.point-route__delete-confirm :deep(.v-card-actions) { flex-wrap: wrap; gap: .4rem; padding: .5rem .75rem calc(.75rem + env(safe-area-inset-bottom, 0px)); }
.point-route__delete-confirm :deep(.v-card-actions .v-btn) { min-height: 44px;
  border-radius: .75rem !important; }
@media (max-width: 1023px) {
  section.point-route-shell { left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    width: min(30rem, calc(100vw - 7.5rem)); }
}
@media (max-width: 599px) {
  section.point-route-shell { left: calc(.75rem + env(safe-area-inset-left, 0px));
    right: calc(.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: auto; }
  .point-route.bb-map-navigation-card { border-radius: var(--bb-radius-card, 24px) !important;
    max-height: min(52dvh, 27rem); }
  .point-route__header, .point-route__endpoints, .point-route__choices, .point-route__metrics, .point-route__actions {
    padding-inline: .85rem; }
}
@media (max-height: 430px) and (max-width: 599px) {
  .point-route.bb-map-navigation-card { max-height: max(7rem, calc(100dvh - 13rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
}
</style>
