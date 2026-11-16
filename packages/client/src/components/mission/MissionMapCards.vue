<template>
  <div class="mission-map-cards" dir="rtl">
    <section v-if="desk.nextStatus.value && !desk.terminalHold.value" class="mission-desk__next-step" aria-label="اقدام بعدی مأموریت">
      <span>اقدام بعدی · با تأیید شما</span>
      <v-btn color="primary" variant="flat" rounded="lg" :loading="desk.progressing.value"
        :disabled="!desk.canAdvance.value" @click="desk.advanceStatus()">{{ nextStatusLabel }}</v-btn>
    </section>
    <v-alert v-if="desk.progressError.value || desk.error.value || desk.cancellationNeedsRefresh.value"
      type="warning" variant="tonal" rounded="lg" role="alert">
      {{ desk.progressError.value || desk.error.value || 'وضعیت مأموریت هنوز تأیید نشده است؛ پیش از ادامه دوباره بررسی کنید.' }}
      <v-btn variant="text" size="small" :loading="desk.loading.value" @click="desk.load()">تازه‌سازی وضعیت</v-btn>
    </v-alert>
    <details class="mission-desk__phase-summary">
      <summary class="mission-desk__phase-heading">
        <strong>مراحل مأموریت</strong>
        <span>{{ activeStep >= 0 ? `مرحلهٔ ${(activeStep + 1).toLocaleString('fa-IR')} از ${steps.length.toLocaleString('fa-IR')}` : 'در حال بررسی' }} · {{ currentStatusLabel }}</span>
      </summary>
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
    </details>
  </div>
</template>

<script setup lang="ts">
import type { useMissionDesk } from "@/composables/use-mission-desk";

defineProps<{
  desk: ReturnType<typeof useMissionDesk>;
  nextStatusLabel: string;
  currentStatusLabel: string;
  activeStep: number;
  steps: { status: string; label: string }[];
}>();
</script>

<style scoped>
.mission-map-cards { display: grid; gap: 8px; }
.mission-desk__next-step, .mission-desk__phase-summary {
  min-width: 0; margin: 0; padding: 10px 12px;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay);
}
.mission-desk__next-step { display: grid; gap: 6px; }
.mission-desk__next-step > span { color: rgb(var(--v-theme-primary)); font-size: .8rem; font-weight: 800; }
.mission-desk__next-step :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; white-space: normal; }
.mission-desk__next-step :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-desk__phase-heading { display: grid; gap: 2px; min-height: 44px; align-content: center; cursor: pointer; }
.mission-desk__phase-heading:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; border-radius: 8px; }
.mission-desk__phase-heading strong { font-size: .9rem; }
.mission-desk__phase-heading span { color: var(--bb-color-muted); font-size: .8rem; font-weight: 700; overflow-wrap: anywhere; }
.mission-desk__phase-steps { display: grid; gap: 4px; min-width: 0; margin: 10px 0 0; padding: 0; list-style: none; }
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
  background: var(--bb-color-inset); font-weight: 800; }
.mission-desk__phase-step--current .mission-desk__phase-marker { border: 2px solid rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary)); }
.mission-desk__phase-label { min-width: 0; overflow-wrap: anywhere; }
.mission-desk__phase-now { color: rgb(var(--v-theme-primary)); font-size: .8rem; font-weight: 800; }
</style>
