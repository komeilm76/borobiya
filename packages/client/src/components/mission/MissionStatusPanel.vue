<template>
  <v-card tag="section" elevation="3" rounded="xl" id="mission-status-panel"
    class="mission-desk__card bb-floating-card bb-map-navigation-card" aria-label="مأموریت فعال" tabindex="-1">
    <div class="mission-desk__card-header">
      <div>
        <span class="mission-desk__kicker"><span class="mission-desk__pulse" /> اکنون در جریان</span>
        <h3>مأموریت امدادی شما</h3>
      </div>
      <v-btn icon="mdi-close" variant="text" aria-label="بستن وضعیت مأموریت" @click="emit('close')" />
    </div>
    <div class="mission-desk__card-actions">
      <v-chip color="primary" variant="tonal" size="large" prepend-icon="mdi-timeline-clock-outline"
        role="status" aria-live="polite" aria-atomic="true">{{ currentStatusLabel }}</v-chip>
      <v-btn icon="mdi-refresh" variant="tonal" color="primary" :loading="desk.loading.value"
        aria-label="تازه‌سازی وضعیت مأموریت" @click="desk.load()" />
    </div>
    <div class="mission-desk__progress" aria-label="به‌روزرسانی وضعیت مأموریت">
      <div v-if="desk.nextStatus.value && !desk.terminalHold.value" class="mission-desk__next-step">
        <span>اقدام بعدی · با تأیید شما</span>
        <v-btn color="primary" variant="flat" rounded="lg"
          :loading="desk.progressing.value" :disabled="!desk.canAdvance.value"
          @click="desk.advanceStatus()">{{ nextStatusLabel }}</v-btn>
      </div>
      <div v-if="!teamSharing" class="mission-desk__sharing" role="status">
        <v-icon icon="mdi-map-marker-alert-outline" size="20" aria-hidden="true" />
        <div>
          <strong>اشتراک موقعیت مأموریت برقرار نشده</strong>
          <small>هشدار اتصال یا اجازهٔ GPS را بررسی کنید.</small>
        </div>
      </div>
      <p v-if="desk.loading.value" role="status">در حال تأیید وضعیت مأموریت از سرور؛ تغییر مرحله موقتاً متوقف است.</p>
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
    <div class="mission-desk__phase-summary">
      <div class="mission-desk__phase-heading">
        <strong>مراحل مأموریت</strong>
        <span>{{ activeStep >= 0 ? `مرحلهٔ ${(activeStep + 1).toLocaleString('fa-IR')} از ${steps.length.toLocaleString('fa-IR')}` : 'در حال بررسی' }}</span>
      </div>
      <ol class="mission-desk__phase-steps" aria-label="پیشرفت مأموریت">
        <li v-for="(step, index) in steps" :key="step.status" class="mission-desk__phase-step"
          :class="{ 'mission-desk__phase-step--passed': index < activeStep, 'mission-desk__phase-step--current': index === activeStep }"
          :aria-current="index === activeStep ? 'step' : undefined">
          <span class="mission-desk__phase-marker" aria-hidden="true">
            <v-icon v-if="index < activeStep" icon="mdi-check" size="16" />
            <template v-else>{{ (index + 1).toLocaleString('fa-IR') }}</template>
          </span>
          <span class="mission-desk__phase-label">{{ step.label }}</span>
          <span v-if="index === activeStep" class="mission-desk__phase-now">اکنون</span>
        </li>
      </ol>
    </div>
    <details class="mission-desk__timeline">
      <summary>نمایش شناسهٔ پیگیری</summary>
      <p class="mission-desk__tracking-id">شناسهٔ پیگیری: <bdi dir="ltr">{{ desk.activeMission.value?.id }}</bdi></p>
    </details>
    <div class="mission-desk__foot">
      <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-map-marker-path"
        aria-controls="mission-route-panel" :disabled="!!desk.terminalHold.value || !!desk.error.value || desk.loading.value"
        @click="emit('open-route')">باز کردن مسیر</v-btn>
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
.mission-desk__card-header { position: sticky; top: -1rem; z-index: 1;
  display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 18px;
  margin: -1rem -1rem .75rem; padding: .75rem 1rem;
  border-bottom: 1px solid var(--bb-color-outline); background: rgb(var(--v-theme-surface)); }
.mission-desk__card-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 5px; }
.mission-desk__card-actions :deep(.v-btn), .mission-desk__card-header :deep(.v-btn) { flex: none; width: 44px; min-width: 44px; height: 44px; }
.mission-desk__card-actions :deep(.v-chip) { max-width: calc(100% - 52px); }
.mission-desk__phase-summary { margin: 14px 0 12px; padding: 12px; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.mission-desk__phase-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; font-size: .82rem; }
.mission-desk__phase-heading strong { font-size: .9rem; }
.mission-desk__phase-heading span { color: var(--bb-color-muted); font-weight: 700; }
.mission-desk__phase-steps { display: grid; gap: 4px; min-width: 0; margin: 12px 0 0; padding: 0; list-style: none; }
.mission-desk__phase-step { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center; gap: 9px; min-width: 0; min-height: 40px; padding: 6px 8px; border: 1px solid transparent;
  border-radius: 12px; color: var(--bb-color-muted); font-size: .85rem; line-height: 1.5; }
.mission-desk__phase-step:not(:last-child)::after { position: absolute; inset-inline-start: 21px;
  top: 35px; bottom: -9px; width: 2px; background: var(--bb-color-outline); content: ""; }
.mission-desk__phase-step--passed:not(:last-child)::after { background: rgb(var(--v-theme-primary)); }
.mission-desk__phase-marker { position: relative; z-index: 1; display: grid; width: 28px; height: 28px;
  place-items: center; border: 1px solid var(--bb-color-outline); border-radius: 50%;
  color: var(--bb-color-muted); background: rgb(var(--v-theme-surface)); font-size: .8rem; font-weight: 800; }
.mission-desk__phase-step--passed { color: rgb(var(--v-theme-primary)); font-weight: 700; }
.mission-desk__phase-step--passed .mission-desk__phase-marker { border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }
.mission-desk__phase-step--current { border-color: var(--bb-color-outline); color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface)); font-weight: 800; }
.mission-desk__phase-step--current .mission-desk__phase-marker { border: 2px solid rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary)); }
.mission-desk__phase-label { min-width: 0; overflow-wrap: anywhere; }
.mission-desk__phase-now { color: rgb(var(--v-theme-primary)); font-size: .8rem; font-weight: 800; }
.mission-desk__next-step { display: grid; justify-items: start; width: 100%; gap: 7px; padding: 12px; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.mission-desk__next-step > span { color: rgb(var(--v-theme-primary)); font-size: .8rem; font-weight: 800; }
.mission-desk__sharing { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 10px 12px; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.mission-desk__sharing > :deep(.v-icon) { flex: none; color: rgb(var(--v-theme-warning)); }
.mission-desk__sharing > div { display: grid; gap: 2px; min-width: 0; }
.mission-desk__sharing strong { font-size: .86rem; }
.mission-desk__sharing small { font-size: .8rem; line-height: 1.55; }
.mission-desk__timeline { margin: 14px 0; border-top: 1px solid rgba(98,146,137,.25); padding-top: 10px; }
.mission-desk__timeline summary { cursor: pointer; width: fit-content; font-size: .85rem; font-weight: 700; color: rgb(var(--v-theme-primary)); }
.mission-desk__timeline summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
.mission-desk__kicker { display: inline-flex; align-items: center; gap: 8px; color: rgb(var(--v-theme-primary)); font-weight: 800; font-size: .84rem; }
.mission-desk__pulse { width: 9px; height: 9px; border-radius: 50%; background: #16b58f; box-shadow: 0 0 0 5px rgba(22,181,143,.16); }
.mission-desk__card h3 { font-size: clamp(1.2rem, 2vw, 1.45rem); margin: 9px 0 5px; }
.mission-desk__tracking-id { margin: 10px 0 0; font-size: .82rem; overflow-wrap: anywhere; }
.mission-desk__progress { display: grid; justify-items: start; gap: 12px; margin-top: 12px; }
.mission-desk__progress p { margin: 0; font-size: .88rem; color: rgb(var(--v-theme-on-surface)); }
.mission-desk__progress :deep(.v-btn) { min-height: 44px; height: auto; max-width: 100%; min-width: 0; white-space: normal; text-align: center; }
.mission-desk__progress :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-desk__next-step :deep(.v-btn) { width: 100%; }
.mission-desk__foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid rgba(98,146,137,.2); padding-top: 18px; }
@media(max-width: 480px) { .mission-desk__foot { align-items: flex-start; flex-direction: column; } }
</style>
