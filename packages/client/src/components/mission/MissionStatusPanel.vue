<template>
  <v-card tag="section" elevation="3" rounded="xl" id="mission-status-panel"
    class="mission-desk__card bb-floating-card bb-map-navigation-card" aria-label="مأموریت فعال" tabindex="-1">
    <div class="mission-desk__card-header">
      <div>
        <span class="mission-desk__kicker"><span class="mission-desk__pulse" /> اکنون در جریان</span>
        <h3>مأموریت امدادی شما</h3>
        <p>شناسهٔ پیگیری: <bdi dir="ltr">{{ desk.activeMission.value?.id }}</bdi></p>
      </div>
      <div class="mission-desk__card-actions">
        <v-chip color="primary" variant="tonal" size="large" prepend-icon="mdi-timeline-clock-outline"
          role="status" aria-live="polite" aria-atomic="true">{{ currentStatusLabel }}</v-chip>
        <v-btn variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-refresh" :loading="desk.loading.value"
          @click="desk.load()">تازه‌سازی</v-btn>
        <v-btn icon="mdi-close" variant="text" aria-label="بستن وضعیت مأموریت" @click="emit('close')" />
      </div>
    </div>
    <details class="mission-desk__timeline">
      <summary>مرحلهٔ {{ (activeStep + 1).toLocaleString('fa-IR') }} از ۵ · {{ currentStatusLabel }} — نمایش همهٔ مراحل</summary>
      <div class="mission-steps" role="list" aria-label="مراحل مأموریت">
        <div v-for="(step, index) in steps" :key="step.status" class="mission-steps__item"
          :class="{ 'mission-steps__item--reached': index <= activeStep }"
          :aria-current="index === activeStep ? 'step' : undefined" role="listitem">
          <span class="mission-steps__number" aria-hidden="true">{{ (index + 1).toLocaleString('fa-IR') }}</span>
          <span>{{ step.label }}</span>
          <v-icon v-if="index < activeStep" icon="mdi-check" size="16" aria-label="انجام شده" />
        </div>
      </div>
    </details>
    <div class="mission-desk__progress" aria-label="به‌روزرسانی وضعیت مأموریت">
      <p>تغییر مرحله دستی است؛ موقعیت‌یابی یا باز کردن مسیر، وضعیت مأموریت را تغییر نمی‌دهد.</p>
      <p role="status">اشتراک موقعیت مأموریت پس از تأیید و اجازهٔ GPS خودکار است؛
        {{ teamSharing ? 'اکنون فعال است.' : 'هنوز برقرار نشده است؛ هشدار اتصال یا اجازهٔ GPS را بررسی کنید.' }}
      </p>
      <p v-if="desk.loading.value" role="status">در حال تأیید وضعیت مأموریت از سرور؛ تغییر مرحله موقتاً متوقف است.</p>
      <v-btn v-if="desk.nextStatus.value" color="primary" variant="flat" rounded="lg"
        :loading="desk.progressing.value" :disabled="!desk.canAdvance.value"
        @click="desk.advanceStatus()">{{ nextStatusLabel }}</v-btn>
      <v-alert v-if="desk.progressError.value" type="error" variant="tonal" rounded="lg" role="alert">
        {{ desk.progressError.value }}
        <v-btn size="small" variant="text" :loading="desk.loading.value" @click="desk.load()">تازه‌سازی وضعیت</v-btn>
      </v-alert>
      <v-alert v-if="desk.cancellationNeedsRefresh.value && !desk.cancellationOpen.value" type="warning"
        variant="tonal" rounded="lg" role="alert">
        وضعیت درخواست لغو هنوز تأیید نشده است؛ پیش از تغییر مرحله، وضعیت مأموریت را از سرور تازه کنید.
        <v-btn size="small" variant="text" :loading="desk.loading.value" @click="desk.load()">تازه‌سازی وضعیت</v-btn>
      </v-alert>
    </div>
    <div class="mission-desk__foot">
      <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-map-marker-path"
        aria-controls="mission-route-panel" :disabled="!!desk.terminalHold.value || !!desk.error.value || desk.loading.value"
        @click="emit('open-route')">باز کردن مسیر</v-btn>
      <p><v-icon icon="mdi-shield-check-outline" size="20" /> لغو، آخرین راه‌حل است؛ برای ناتوانی در ادامه، دلیل واقعی ثبت کنید.</p>
      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" color="error" rounded="lg" prepend-icon="mdi-dots-horizontal"
            aria-label="گزینه‌های بیشتر مأموریت" :disabled="desk.progressing.value || desk.loading.value || !!desk.error.value || !!desk.terminalHold.value">بیشتر</v-btn>
        </template>
        <v-list density="comfortable" rounded="lg">
          <v-list-item prepend-icon="mdi-alert-outline" title="قادر به ادامه نیستم" subtitle="ثبت دلیل و آگاه‌سازی مرکز امداد" :disabled="desk.progressing.value"
            @click="desk.showCancellation()" />
        </v-list>
      </v-menu>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import type { useMissionDesk } from "@/composables/use-mission-desk";

defineProps<{
  desk: ReturnType<typeof useMissionDesk>;
  currentStatusLabel: string;
  nextStatusLabel: string;
  activeStep: number;
  steps: { status: string; label: string }[];
  teamSharing: boolean;
}>();
const emit = defineEmits<{ close: []; 'open-route': [] }>();
</script>

<style scoped>
.mission-desk__card-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 18px; }
.mission-desk__card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mission-desk__timeline { margin: 14px 0; border-top: 1px solid rgba(98,146,137,.25); padding-top: 10px; }
.mission-desk__timeline summary { cursor: pointer; width: fit-content; font-size: .85rem; font-weight: 700; color: rgb(var(--v-theme-primary)); }
.mission-desk__timeline summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
.mission-desk__kicker { display: inline-flex; align-items: center; gap: 8px; color: rgb(var(--v-theme-primary)); font-weight: 800; font-size: .84rem; }
.mission-desk__pulse { width: 9px; height: 9px; border-radius: 50%; background: #16b58f; box-shadow: 0 0 0 5px rgba(22,181,143,.16); }
.mission-desk__card h3 { font-size: clamp(1.2rem, 2vw, 1.45rem); margin: 9px 0 5px; }
.mission-desk__card-header p { opacity: .65; font-size: 0.82rem; overflow-wrap: anywhere; }
.mission-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 14px 0; }
.mission-steps__item { display: flex; align-items: center; gap: 9px; min-height: 60px; padding: 11px; border-radius: var(--bb-radius-nested, 16px); background: rgba(111,138,130,.09); color: rgb(var(--v-theme-on-surface)); font-size: .81rem; font-weight: 700; }
.mission-steps__item--reached { background: rgba(34,145,116,.13); color: rgb(var(--v-theme-primary)); opacity: 1; }
.mission-steps__number { display: inline-grid; flex-shrink: 0; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid currentColor; font-size: .8rem; }
.mission-desk__progress { display: grid; justify-items: start; gap: 12px; margin-bottom: 20px; }
.mission-desk__progress p { margin: 0; font-size: .88rem; color: rgb(var(--v-theme-on-surface)); }
.mission-desk__progress :deep(.v-btn) { min-height: 44px; height: auto; max-width: 100%; min-width: 0; white-space: normal; text-align: center; }
.mission-desk__progress :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-desk__foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid rgba(98,146,137,.2); padding-top: 18px; }
.mission-desk__foot p { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 0.9rem; opacity: .76; }
@media(max-width: 780px) { .mission-steps { grid-template-columns: repeat(2, 1fr); } }
@media(max-width: 480px) { .mission-steps { grid-template-columns: 1fr; margin: 22px 0; }.mission-steps__item { min-height: 44px; }.mission-desk__foot { align-items: flex-start; flex-direction: column; } }
:global(:root.dark .mission-steps__item:not(.mission-steps__item--reached)) {
  background: var(--bb-color-inset);
  border: 1px solid var(--bb-color-outline);
}
</style>
