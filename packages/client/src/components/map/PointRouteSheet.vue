<template>
  <!-- A standard, nonmodal map sheet: no scrim/focus trap, so routes and pins remain interactive. -->
  <section v-if="api.point.value && api.sheetOpen.value" id="map-point-route-sheet" class="point-route-shell"
    :class="{ 'point-route-shell--expanded': expanded }" aria-label="برنامه‌ریزی مسیر" @keydown.esc.stop.prevent="onEscape">
    <v-card class="point-route" rounded="xl" dir="rtl">
      <div class="point-route__header">
        <span class="point-route__icon" aria-hidden="true"><v-icon icon="mdi-map-marker" size="26" /></span>
        <div class="point-route__headings"><small>مقصد انتخاب‌شده</small><strong>{{ api.title.value }}</strong></div>
        <v-btn id="point-route-expand-button" :icon="expanded ? 'mdi-chevron-down' : 'mdi-chevron-up'" variant="text"
          :aria-label="expanded ? 'جمع کردن جزئیات مسیر' : 'نمایش جزئیات کامل مسیر'" :aria-expanded="expanded"
          aria-controls="point-route-content" @click="expanded = !expanded" />
        <v-btn icon="mdi-close" variant="text" aria-label="بستن برنامه‌ریزی مسیر" @click="dismiss" />
      </div>
      <div id="point-route-content" class="point-route__body" tabindex="0" aria-label="جزئیات و گزینه‌های مسیر">
        <div v-if="expanded" class="point-route__address">
          <v-icon icon="mdi-map-marker-outline" size="20" aria-hidden="true" />
          <p v-if="!api.address.value && reverse.loading.value" role="status">در حال یافتن نشانی…</p>
          <p v-else-if="!api.address.value && reverse.failed.value" role="status">نشانی در دسترس نیست. <button type="button" @click="reverse.load()">تلاش دوباره</button></p>
          <p v-else>{{ api.address.value ?? 'برای این نقطه نشانی پیدا نشد؛ مختصات مقصد روی نقشه مشخص است.' }}</p>
        </div>
        <p v-if="expanded && api.knownPlace.value?.type" class="point-route__place-type">نوع مکان: {{ api.knownPlace.value.type }}</p>
        <p v-if="expanded && api.point.value" class="point-route__coords"><bdi dir="ltr">{{ api.point.value.lat.toFixed(5) }}, {{ api.point.value.lon.toFixed(5) }}</bdi></p>
        <div class="point-route__metrics" aria-label="برآورد مسیر از موقعیت فعلی من">
          <div><v-icon icon="mdi-clock-outline" size="20" aria-hidden="true" /><span>زمان تقریبی</span><strong>{{ api.durationLabel.value }}</strong></div>
          <div><v-icon icon="mdi-map-marker-distance" size="20" aria-hidden="true" /><span>مسافت مسیر</span><strong>{{ api.distanceLabel.value }}</strong></div>
        </div>
        <p v-if="expanded" class="point-route__disclaimer">زمان و مسافت، برآورد سرور مسیر از آخرین موقعیت GPS شما هستند؛ ترافیک زنده و رسیدن قطعی را نشان نمی‌دهند.</p>
        <fieldset class="point-route__modes" :disabled="api.navigating.value">
          <legend>وسیلهٔ حرکت</legend>
          <div class="point-route__mode-grid">
            <button v-for="mode in modes" :key="mode.value" type="button" :aria-pressed="api.profile.value === mode.value"
              :class="{ 'point-route__mode--selected': api.profile.value === mode.value }" @click="api.changeProfile(mode.value)">
              <v-icon :icon="mode.icon" size="21" aria-hidden="true" />{{ mode.label }}
            </button>
          </div>
        </fieldset>
        <p v-if="api.loading.value" role="status" class="point-route__message">در حال محاسبهٔ مسیرهای {{ modeLabel }}…</p>
        <p v-else-if="api.error.value" role="alert" class="point-route__message point-route__message--error">{{ api.error.value }}</p>
        <p v-if="api.arrived.value" role="status" class="point-route__message">به نزدیکی مقصد رسیدید. موقعیت را با محیط واقعی تطبیق دهید.</p>
        <div v-if="api.routes.value.length" class="point-route__alternative">
          <span>مسیر {{ (api.index.value + 1).toLocaleString('fa-IR') }} از {{ api.routes.value.length.toLocaleString('fa-IR') }}
            <small>{{ api.index.value === 0 ? 'سریع‌ترین گزینهٔ دریافت‌شده' : 'مسیر جایگزین' }}</small>
          </span>
          <v-btn v-if="api.routes.value.length > 1" variant="tonal" color="primary" :disabled="api.navigating.value"
            @click="api.choose((api.index.value + 1) % api.routes.value.length)">مسیر دیگر</v-btn>
        </div>
        <p v-if="api.routes.value.length > 1" class="point-route__legend">خط سبز مسیر انتخابی است؛ برای مقایسه، خط نارنجی را روی نقشه لمس کنید یا «مسیر دیگر» را بزنید.</p>
      </div>
      <div class="point-route__actions">
        <v-btn v-if="api.error.value || (api.point.value && !api.routes.value.length && !api.loading.value)"
          variant="tonal" color="primary" :disabled="!ownFix || api.loading.value" @click="api.findRoutes()">محاسبهٔ دوباره</v-btn>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-navigation-variant" :disabled="!ownFix || !api.selectedRoute.value || api.loading.value || api.navigating.value"
          @click="emit('start')">شروع راهبری</v-btn>
        <v-btn variant="text" @click="clearDestination">حذف مقصد</v-btn>
      </div>
    </v-card>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { OwnMapFix } from "@/composables/use-own-map-position";
import type { useReversePlace } from "@/composables/use-reverse-place";
import type { usePointRoute } from "@/composables/use-point-route";
import type { TransportProfile } from "@/api/mission-routing";
const props = defineProps<{ api: ReturnType<typeof usePointRoute>; reverse: ReturnType<typeof useReversePlace>;
  ownFix: OwnMapFix | null }>();
const emit = defineEmits<{ start: []; dismiss: []; 'layout-change': [] }>();
const expanded = ref(false);
watch(() => props.api.point.value, () => { expanded.value = false; });
watch(() => props.api.sheetOpen.value, (open) => { if (open) expanded.value = false; });
watch(expanded, async () => { await nextTick(); emit('layout-change'); });
function dismiss(): void { props.api.sheetOpen.value = false; emit('dismiss'); }
function clearDestination(): void { props.api.clear(); emit('dismiss'); }
function onEscape(): void {
  if (expanded.value) {
    expanded.value = false;
    void nextTick(() => document.getElementById('point-route-expand-button')?.focus());
  } else dismiss();
}
const modes: { value: TransportProfile; icon: string; label: string }[] = [
  { value: "car", icon: "mdi-car", label: "خودرو" },
  { value: "bicycle", icon: "mdi-bicycle", label: "دوچرخه" },
  { value: "foot", icon: "mdi-walk", label: "پیاده" }
];
const modeLabel = computed(() => modes.find((mode) => mode.value === props.api.profile.value)?.label ?? "انتخابی");
</script>

<style scoped>
.point-route-shell {
  position: fixed; z-index: 7; pointer-events: none;
  right: calc(5.5rem + env(safe-area-inset-right, 0px));
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  width: min(28rem, calc(100vw - 34rem));
  max-width: 100%;
}
.point-route {
  pointer-events: auto; max-height: min(43dvh, 22rem); display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), .14); color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface)); box-shadow: 0 16px 45px rgba(5, 24, 27, .28);
}
.point-route-shell--expanded .point-route { max-height: min(72dvh, 42rem); }
.point-route__header { display: flex; align-items: center; gap: .45rem; flex: 0 0 auto; min-height: 58px; padding: .35rem .6rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__header :deep(.v-btn) { flex: 0 0 auto; width: 44px; height: 44px; }
.point-route__header :deep(.v-btn:focus-visible), .point-route button:focus-visible, .point-route__body:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -3px; }
.point-route__icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 12px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.point-route__headings { display: grid; min-width: 0; flex: 1; line-height: 1.4; }
.point-route__headings small { color: rgb(var(--v-theme-primary)); font-size: .8rem; }
.point-route__headings strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1rem; }
.point-route__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: .65rem .8rem; }
.point-route__address { display: flex; align-items: flex-start; gap: .65rem; line-height: 1.75; }
.point-route__address .v-icon { flex: 0 0 auto; color: rgb(var(--v-theme-primary)); }
.point-route__address p { margin: 0; overflow-wrap: anywhere; }
.point-route__address button { color: rgb(var(--v-theme-primary)); font: inherit; font-weight: 800; text-decoration: underline; }
.point-route__place-type { margin: .4rem 0 0; font-size: .83rem; line-height: 1.6; overflow-wrap: anywhere; color: rgb(var(--v-theme-on-surface)); opacity: .82; }
.point-route__coords { margin: .4rem 0 .7rem; color: rgb(var(--v-theme-on-surface)); opacity: .8; font-size: .83rem; }
.point-route__metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .45rem; }
.point-route__metrics > div { display: grid; gap: .12rem; padding: .55rem; border: 1px solid rgba(var(--v-theme-on-surface), .14); border-radius: 12px; }
.point-route__metrics .v-icon { color: rgb(var(--v-theme-primary)); }
.point-route__metrics span { font-size: .82rem; opacity: .8; }
.point-route__metrics strong { font-size: 1rem; }
.point-route__disclaimer { margin: .75rem 0 1rem; font-size: .81rem; line-height: 1.65; opacity: .82; }
.point-route__modes { min-width: 0; border: 0; margin: .65rem 0 0; padding: 0; }
.point-route__modes legend { margin-bottom: .35rem; font-weight: 800; }
.point-route__mode-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .35rem; }
.point-route__mode-grid button { display: flex; min-height: 44px; align-items: center; justify-content: center; gap: .2rem; padding: .3rem; border: 1px solid rgba(var(--v-theme-on-surface), .25); border-radius: 12px; font: inherit; cursor: pointer; }
.point-route__mode-grid button[aria-pressed="true"] { border: 2px solid rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); font-weight: 800; }
.point-route__message { margin: .7rem 0 0; line-height: 1.6; }
.point-route__message--error { color: rgb(var(--v-theme-error)); }
.point-route__alternative { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-top: .7rem; }
.point-route__alternative span { font-weight: 800; }
.point-route__alternative small { display: block; font-weight: 500; opacity: .8; }
.point-route__legend { margin: .5rem 0 0; font-size: .8rem; line-height: 1.5; color: rgb(var(--v-theme-on-surface)); opacity: .84; }
.point-route__actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .3rem; padding: .45rem .7rem calc(.45rem + env(safe-area-inset-bottom, 0px)); border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__actions :deep(.v-btn) { min-height: 44px; height: auto; }
.point-route__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
@media (max-width: 1023px) {
  .point-route-shell {
    left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    width: min(30rem, calc(100vw - 7.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  }
}
@media (min-width: 600px) and (max-width: 1023px) {
  /* Tablet maps are already cards in page flow. Put details just below the map,
     instead of overlaying both the map and the following companion widgets. */
  .point-route-shell {
    position: relative; order: 3; left: auto; right: auto; bottom: auto;
    width: 100%; padding: 0; pointer-events: auto;
  }
  .point-route { max-height: min(42dvh, 21rem); }
  .point-route-shell--expanded .point-route { max-height: min(65dvh, 36rem); }
}
@media (max-width: 599px) {
  .point-route-shell { bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); }
  .point-route { max-height: min(48dvh, 21rem); }
  .point-route-shell--expanded .point-route { max-height: min(70dvh, 36rem); }
}
@media (max-width: 400px) {
  .point-route-shell { width: calc(100vw - 6rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); }
  .point-route__header { gap: .15rem; padding-inline: .35rem; }
  .point-route__icon { display: none; }
  .point-route__mode-grid button { flex-direction: column; font-size: .86rem; }
}
@media (max-height: 430px) and (max-width: 599px) {
  .point-route { max-height: min(48dvh, 16rem); }
  .point-route-shell--expanded .point-route { max-height: min(69dvh, 22rem); }
}
@media (forced-colors: active) { .point-route__mode-grid button[aria-pressed="true"] { outline: 2px solid Highlight; } }
</style>
