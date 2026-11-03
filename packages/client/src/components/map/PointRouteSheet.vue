<template>
  <!-- The same nonmodal point -> travel flow on phones, tablets and desktops. -->
  <section v-if="api.point.value && api.sheetOpen.value && !choicesOpen"
    class="point-route-shell" :class="{ 'point-route-shell--expanded': step === 'plan' }"
    role="region" aria-label="مقصد و برنامه‌ریزی سفر" @keydown.esc.stop.prevent="onEscape">
    <v-card id="map-point-route-sheet" class="point-route" rounded="xl" dir="rtl" tabindex="-1">
      <header class="point-route__header">
        <v-icon icon="mdi-map-marker" size="23" aria-hidden="true" />
        <div class="point-route__headings"><small>{{ step === 'plan' ? 'برنامه‌ریزی سفر' : 'مقصد انتخاب‌شده' }}</small>
          <strong :title="api.title.value">{{ api.title.value }}</strong></div>
        <v-btn icon="mdi-magnify" variant="text" aria-label="جست‌وجوی مکان" title="جست‌وجوی مکان"
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
            <v-btn variant="tonal" color="primary" prepend-icon="mdi-share-variant" @click="sendPoint">ارسال</v-btn>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-navigation-variant" @click="showPlan">سفر</v-btn>
          </div>
        </template>

        <template v-else>
          <div class="point-route__choices" role="group" aria-label="تنظیمات سفر">
            <button type="button" class="point-route__choice" :aria-expanded="modeOpen" aria-controls="point-route-modes"
              @click="modeOpen = !modeOpen">
              <v-icon icon="mdi-car-multiple" aria-hidden="true" />
              <span><strong>انتخاب وسیلهٔ دیگر</strong><small>وسیلهٔ فعلی: {{ modeLabel }}</small></span>
              <v-icon icon="mdi-chevron-down" aria-hidden="true" />
            </button>
            <div v-if="modeOpen" id="point-route-modes" class="point-route__modes" role="group" aria-label="وسیلهٔ حرکت">
              <button v-for="mode in modes" :key="mode.value" type="button" :aria-pressed="api.profile.value === mode.value"
                @click="api.changeProfile(mode.value); modeOpen = false">
                <v-icon :icon="mode.icon" size="21" aria-hidden="true" />{{ mode.label }}
              </button>
            </div>
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
            <v-btn variant="text" @click="backToPoint">انصراف</v-btn>
            <v-btn v-if="api.error.value || (!api.routes.value.length && !api.loading.value)"
              variant="tonal" :disabled="api.loading.value" @click="api.findRoutes()">محاسبهٔ دوباره</v-btn>
            <v-btn color="primary" variant="flat" :disabled="!api.point.value" @click="emit('start')">شروع سفر</v-btn>
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
        <v-btn id="point-route-cancel-remove" variant="tonal" color="primary" @click="confirmDeleteOpen = false">انصراف</v-btn>
        <v-btn color="error" variant="flat" @click="confirmDelete">حذف مقصد و مسیر</v-btn>
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
import type { TransportProfile } from "@/api/mission-routing";
import { selectedPointShare } from "@/map/selected-point-share";
const props = defineProps<{
  api: ReturnType<typeof usePointRoute>;
  reverse: ReturnType<typeof useReversePlace>;
  originReverse: ReturnType<typeof useReversePlace>;
  ownPosition: OwnMapFix | null;
  choicesOpen: boolean;
}>();
const emit = defineEmits<{ start: []; dismiss: []; search: []; 'choose-route': []; 'layout-change': [] }>();
const confirmDeleteOpen = defineModel<boolean>("confirmDeleteOpen", { default: false });
const step = ref<"point" | "plan">("point");
const modeOpen = ref(false);
const shareFeedback = ref("");
const shareFallback = ref("");
const { isSupported, share } = useShare();
watch(() => props.api.point.value, () => {
  step.value = "point"; modeOpen.value = false; shareFeedback.value = ""; shareFallback.value = "";
  confirmDeleteOpen.value = false;
});
watch(() => props.api.sheetOpen.value, (open) => { if (!open) { confirmDeleteOpen.value = false; modeOpen.value = false; } });
watch(confirmDeleteOpen, (open, previous) => {
  if (!open && previous && props.api.point.value && props.api.sheetOpen.value)
    void nextTick(() => document.getElementById("point-route-remove-button")?.focus());
});
watch([step, modeOpen], async () => { await nextTick(); emit("layout-change"); });
function showPlan(): void {
  step.value = "plan";
  props.api.routesVisible.value = true;
}
function backToPoint(): void {
  step.value = "point"; modeOpen.value = false;
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
  shareFeedback.value = ""; shareFallback.value = "";
  if (isSupported.value) {
    try { await share(payload); return; } // Called from the click gesture, not after an async lookup.
    catch (error) { if ((error as { name?: string })?.name === "AbortError") return; }
  }
  if (props.api.point.value !== point) return; // Never show feedback for a different destination.
  try {
    if (!navigator.clipboard?.writeText) throw new Error("NO_CLIPBOARD");
    await navigator.clipboard.writeText(payload.url);
    if (props.api.point.value === point) shareFeedback.value = "پیوند موقعیت انتخاب‌شده کپی شد؛ آن را برای مخاطب بفرستید.";
  } catch {
    if (props.api.point.value !== point) return;
    shareFallback.value = payload.url;
    shareFeedback.value = "اشتراک‌گذاری خودکار در این مرورگر ممکن نیست.";
    await nextTick();
    if (props.api.point.value === point) document.querySelector<HTMLTextAreaElement>(".point-route__fallback textarea")?.focus();
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
  else if (modeOpen.value) modeOpen.value = false;
  else if (step.value === "plan") backToPoint();
  else { props.api.sheetOpen.value = false; emit("dismiss"); }
}
const modes: { value: TransportProfile; icon: string; label: string }[] = [
  { value: "car", icon: "mdi-car", label: "خودرو" },
  { value: "bicycle", icon: "mdi-bicycle", label: "دوچرخه" },
  { value: "foot", icon: "mdi-walk", label: "پیاده" }
];
const modeLabel = computed(() => modes.find((mode) => mode.value === props.api.profile.value)?.label ?? "خودرو");
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
.point-route { pointer-events: auto; display: flex; flex-direction: column; max-height: min(70dvh, 36rem); overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), .14); color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay); }
.point-route__header { display: flex; flex: 0 0 auto; align-items: center; gap: .35rem;
  min-height: 54px; padding: .25rem .6rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__headings { display: grid; flex: 1; min-width: 0; line-height: 1.3; }
.point-route__headings small { font-size: .8rem; color: rgb(var(--v-theme-primary)); }
.point-route__headings strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1rem; }
.point-route__header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; height: 44px; }
.point-route__content { overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
.point-route__endpoints { display: grid; gap: .4rem; padding: .7rem .85rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1); }
.point-route__endpoint { display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: .4rem; min-width: 0; align-items: center; }
.point-route__endpoint-name { font-weight: 800; font-size: .82rem; }
.point-route__endpoint-address { display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: start; font-size: .87rem; }
.point-route__choices { display: grid; gap: .5rem; padding: .7rem .85rem; }
.point-route__choice { display: flex; align-items: center; gap: .6rem; width: 100%; min-height: 56px; padding: .5rem .7rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .18); border-radius: 14px; background: rgba(var(--v-theme-primary), .06);
  text-align: start; color: inherit; cursor: pointer; font: inherit; }
.point-route__choice:disabled { opacity: .55; cursor: not-allowed; }
.point-route__choice > span { flex: 1; min-width: 0; display: grid; }
.point-route__choice strong { font-size: .9rem; }
.point-route__choice small { font-size: .8rem; opacity: .8; }
.point-route__modes { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .4rem; }
.point-route__modes button { min-height: 44px; display: flex; align-items: center; justify-content: center; gap: .2rem;
  padding: .4rem; border: 1px solid rgba(var(--v-theme-on-surface), .2); border-radius: 12px; font: inherit; cursor: pointer; }
.point-route__modes button[aria-pressed="true"] { border: 2px solid rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.point-route__metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .4rem; padding: .25rem .85rem .7rem; }
.point-route__metrics > div { display: grid; gap: .1rem; min-width: 0; padding: .45rem; border: 1px solid rgba(var(--v-theme-on-surface), .14); border-radius: 12px; }
.point-route__metrics span { font-size: .81rem; opacity: .8; }
.point-route__metrics strong { font-size: .95rem; }
.point-route__message { margin: .4rem .85rem; font-size: .84rem; line-height: 1.5; }
.point-route__error { color: rgb(var(--v-theme-error)); }
.point-route__fallback { display: grid; gap: .3rem; margin: .4rem .85rem; font-size: .85rem; }
.point-route__fallback textarea { width: 100%; min-height: 3rem; padding: .35rem; border: 1px solid currentColor; border-radius: .5rem; resize: none; }
.point-route__actions { display: flex; flex-wrap: wrap; gap: .5rem; padding: .65rem .85rem calc(.65rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__actions :deep(.v-btn) { flex: 1 1 8rem; min-height: 44px; height: auto; }
.point-route__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
.point-route__header :deep(.v-btn:focus-visible), .point-route button:focus-visible, .point-route textarea:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.point-route__delete-confirm { max-height: min(85dvh, 24rem); overflow: hidden; }
.point-route__delete-confirm :deep(.v-card-title) { white-space: normal; overflow-wrap: anywhere; }
.point-route__delete-confirm :deep(.v-card-text) { overflow-y: auto; overflow-wrap: anywhere; line-height: 1.65; }
.point-route__delete-confirm :deep(.v-card-actions) { flex-wrap: wrap; gap: .4rem; padding: .5rem .75rem calc(.75rem + env(safe-area-inset-bottom, 0px)); }
.point-route__delete-confirm :deep(.v-card-actions .v-btn) { min-height: 44px; }
@media (max-width: 1023px) {
  section.point-route-shell { left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    width: min(30rem, calc(100vw - 7.5rem)); }
}
@media (max-width: 599px) {
  section.point-route-shell { left: 0; right: 0; bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: 100%; }
  .point-route { border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0;
    max-height: min(52dvh, 27rem); }
  .point-route__header, .point-route__endpoints, .point-route__choices, .point-route__metrics, .point-route__actions {
    padding-inline: calc(.85rem + env(safe-area-inset-right, 0px)) calc(.85rem + env(safe-area-inset-left, 0px)); }
}
@media (max-height: 430px) and (max-width: 599px) {
  .point-route { max-height: max(7rem, calc(100dvh - 13rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
}
@media (forced-colors: active) { .point-route__modes button[aria-pressed="true"] { outline: 2px solid Highlight; } }
</style>
