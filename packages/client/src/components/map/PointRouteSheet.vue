<template>
  <v-bottom-sheet :model-value="api.sheetOpen.value" :close-on-back="false" @update:model-value="(open: boolean) => { if (!open) api.sheetOpen.value = false; }">
    <v-card class="point-route" rounded="xl" role="dialog" aria-label="مسیر تا نقطهٔ انتخاب‌شده" dir="rtl">
      <v-card-title class="point-route__header">
        <span class="point-route__icon" aria-hidden="true"><v-icon icon="mdi-map-marker" size="26" /></span>
        <span class="point-route__headings"><small>مقصد انتخاب‌شده</small><strong>{{ api.title.value }}</strong></span>
        <v-btn icon="mdi-close" variant="text" aria-label="بستن جزئیات مقصد" @click="api.sheetOpen.value = false" />
      </v-card-title>
      <v-card-text class="point-route__body">
        <div class="point-route__address">
          <v-icon icon="mdi-map-marker-outline" size="20" aria-hidden="true" />
          <p v-if="reverse.loading.value" role="status">در حال یافتن نشانی…</p>
          <p v-else-if="reverse.failed.value" role="status">نشانی در دسترس نیست. <button type="button" @click="reverse.load()">تلاش دوباره</button></p>
          <p v-else>{{ reverse.address.value?.formattedAddress ?? 'برای این نقطه نشانی پیدا نشد؛ مختصات مقصد روی نقشه مشخص است.' }}</p>
        </div>
        <p v-if="api.point.value" class="point-route__coords"><bdi dir="ltr">{{ api.point.value.lat.toFixed(5) }}, {{ api.point.value.lon.toFixed(5) }}</bdi></p>
        <div class="point-route__metrics" aria-label="برآورد مسیر از موقعیت فعلی من">
          <div><v-icon icon="mdi-clock-outline" size="20" aria-hidden="true" /><span>زمان تقریبی</span><strong>{{ api.durationLabel.value }}</strong></div>
          <div><v-icon icon="mdi-map-marker-distance" size="20" aria-hidden="true" /><span>مسافت مسیر</span><strong>{{ api.distanceLabel.value }}</strong></div>
        </div>
        <p class="point-route__disclaimer">زمان و مسافت، برآورد سرور مسیر از آخرین موقعیت GPS شما هستند؛ ترافیک زنده و رسیدن قطعی را نشان نمی‌دهند.</p>
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
        <div class="point-route__actions">
          <v-btn v-if="api.error.value || (api.point.value && !api.routes.value.length && !api.loading.value)"
            variant="tonal" color="primary" :disabled="!ownFix || api.loading.value" @click="api.findRoutes()">محاسبهٔ دوباره</v-btn>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-navigation-variant" :disabled="!ownFix || !api.selectedRoute.value || api.loading.value || api.navigating.value"
            @click="emit('start')">شروع راهبری</v-btn>
          <v-btn variant="text" @click="api.clear()">حذف مقصد</v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { OwnMapFix } from "@/composables/use-own-map-position";
import type { useReversePlace } from "@/composables/use-reverse-place";
import type { usePointRoute } from "@/composables/use-point-route";
import type { TransportProfile } from "@/api/mission-routing";
const props = defineProps<{ api: ReturnType<typeof usePointRoute>; reverse: ReturnType<typeof useReversePlace>; ownFix: OwnMapFix | null }>();
const emit = defineEmits<{ start: [] }>();
const modes: { value: TransportProfile; icon: string; label: string }[] = [
  { value: "car", icon: "mdi-car", label: "خودرو" },
  { value: "bicycle", icon: "mdi-bicycle", label: "دوچرخه" },
  { value: "foot", icon: "mdi-walk", label: "پیاده" }
];
const modeLabel = computed(() => modes.find((mode) => mode.value === props.api.profile.value)?.label ?? "انتخابی");
</script>

<style scoped>
.point-route { width: min(100%, 37rem); max-height: min(85dvh, 48rem); margin-inline: auto; display: flex; flex-direction: column; overflow: hidden; color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); }
.point-route__header { display: flex; align-items: center; gap: 0.75rem; flex: 0 0 auto; white-space: normal; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.point-route__header > .v-btn { margin-inline-start: auto; min-width: 44px; min-height: 44px; }
.point-route__icon { display: grid; width: 44px; height: 44px; flex: 0 0 auto; place-items: center; border-radius: 14px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.point-route__headings { display: grid; min-width: 0; line-height: 1.5; }
.point-route__headings small { color: rgb(var(--v-theme-primary)); font-size: .83rem; }
.point-route__headings strong { overflow-wrap: anywhere; font-size: 1.15rem; }
.point-route__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 1.1rem 1.25rem calc(1.4rem + env(safe-area-inset-bottom, 0px)); }
.point-route__address { display: flex; align-items: flex-start; gap: .65rem; line-height: 1.75; }
.point-route__address .v-icon { flex: 0 0 auto; color: rgb(var(--v-theme-primary)); }
.point-route__address p { margin: 0; overflow-wrap: anywhere; }
.point-route__address button { color: rgb(var(--v-theme-primary)); font: inherit; font-weight: 800; text-decoration: underline; }
.point-route__coords { margin: .4rem 0 1rem; color: rgb(var(--v-theme-on-surface)); opacity: .75; font-size: .83rem; }
.point-route__metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .65rem; }
.point-route__metrics > div { display: grid; gap: .2rem; padding: .8rem; border: 1px solid rgba(var(--v-theme-on-surface), .14); border-radius: 14px; }
.point-route__metrics .v-icon { color: rgb(var(--v-theme-primary)); }
.point-route__metrics span { font-size: .82rem; opacity: .78; }
.point-route__metrics strong { font-size: 1.05rem; }
.point-route__disclaimer { margin: .75rem 0 1rem; font-size: .81rem; line-height: 1.65; opacity: .82; }
.point-route__modes { min-width: 0; border: 0; margin: 0; padding: 0; }
.point-route__modes legend { margin-bottom: .5rem; font-weight: 800; }
.point-route__mode-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .5rem; }
.point-route__mode-grid button { display: flex; min-height: 48px; align-items: center; justify-content: center; gap: .35rem; padding: .4rem; border: 1px solid rgba(var(--v-theme-on-surface), .25); border-radius: 12px; font: inherit; cursor: pointer; }
.point-route__mode-grid button[aria-pressed="true"] { border: 2px solid rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); font-weight: 800; }
.point-route__message { margin: 1rem 0 0; line-height: 1.7; }
.point-route__message--error { color: rgb(var(--v-theme-error)); }
.point-route__alternative { display: flex; justify-content: space-between; align-items: center; gap: .75rem; margin-top: 1rem; }
.point-route__alternative span { font-weight: 800; }
.point-route__alternative small { display: block; font-weight: 500; opacity: .8; }
.point-route__actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1.15rem; }
.point-route__actions .v-btn { min-height: 44px; height: auto; }
.point-route__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
.point-route button:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
@media (max-width: 400px) { .point-route__body { padding-inline: .85rem; } .point-route__mode-grid button { flex-direction: column; font-size: .86rem; } }
@media (forced-colors: active) { .point-route__mode-grid button[aria-pressed="true"] { outline: 2px solid Highlight; } }
</style>
