<template>
  <section class="mission-map-cards" dir="rtl" aria-label="پیشرفت مأموریت">
    <div v-if="desk.nextStatus.value && !desk.terminalHold.value" class="mission-desk__next-step" aria-label="اقدام بعدی مأموریت">
      <span>اقدام بعدی · با تأیید شما</span>
      <v-btn color="primary" variant="flat" rounded="lg" :loading="desk.progressing.value"
        :disabled="!desk.canAdvance.value" @click="desk.advanceStatus()">{{ nextStatusLabel }}</v-btn>
    </div>
    <p v-if="desk.loading.value" role="status" class="mission-map-cards__notice">در حال تأیید وضعیت از سرور؛ تغییر مرحله متوقف است.</p>
    <v-alert v-if="desk.progressError.value || desk.error.value || desk.cancellationNeedsRefresh.value"
      type="warning" variant="tonal" rounded="lg" role="alert">
      {{ desk.progressError.value || desk.error.value || 'وضعیت درخواست لغو هنوز تأیید نشده است؛ پیش از ادامه دوباره بررسی کنید.' }}
      <v-btn variant="text" size="small" :loading="desk.loading.value" @click="desk.load()">تازه‌سازی وضعیت</v-btn>
    </v-alert>
    <p v-if="!teamSharing" class="mission-map-cards__notice" role="status">
      اشتراک موقعیت مأموریت برقرار نیست؛ اتصال یا اجازهٔ GPS را بررسی کنید.
    </p>
    <div class="mission-desk__phase-summary">
      <div class="mission-desk__phase-heading">
        <div class="mission-desk__phase-copy">
          <strong>مراحل مأموریت</strong>
          <span>{{ activeStep >= 0 ? `مرحلهٔ ${(activeStep + 1).toLocaleString('fa-IR')} از ${steps.length.toLocaleString('fa-IR')}` : 'در حال بررسی' }} · {{ currentStatusLabel }}</span>
        </div>
        <v-menu location="top end">
          <template #activator="{ props }">
            <v-btn v-bind="props" class="mission-map-cards__more" variant="text" color="error" size="small" icon="mdi-dots-horizontal"
              aria-label="گزینه‌های بیشتر مأموریت" title="گزینه‌های بیشتر مأموریت"
              :disabled="desk.progressing.value || desk.loading.value || !!desk.error.value || !!desk.terminalHold.value" />
          </template>
          <v-list density="comfortable" rounded="lg">
            <v-list-item prepend-icon="mdi-alert-outline" title="قادر به ادامه نیستم"
              subtitle="ثبت دلیل و آگاه‌سازی مرکز امداد" :disabled="desk.progressing.value"
              @click="desk.showCancellation()" />
          </v-list>
        </v-menu>
      </div>
      <ol class="mission-desk__phase-steps" aria-label="پیشرفت مأموریت">
        <li v-for="(step, index) in steps" :key="step.status" class="mission-desk__phase-step"
          :class="{ 'mission-desk__phase-step--passed': index < activeStep, 'mission-desk__phase-step--current': index === activeStep }"
          :aria-current="index === activeStep ? 'step' : undefined">
          <span class="mission-desk__phase-marker" aria-hidden="true">
            <v-icon v-if="index < activeStep" icon="mdi-check" size="15" />
            <template v-else>{{ (index + 1).toLocaleString('fa-IR') }}</template>
          </span>
          <span class="mission-desk__phase-label">{{ step.label }}</span>
          <span v-if="index === activeStep" class="mission-desk__phase-now">اکنون</span>
        </li>
      </ol>
    </div>

  </section>
</template>

<script setup lang="ts">
import type { useMissionDesk } from "@/composables/use-mission-desk";

defineProps<{
  desk: ReturnType<typeof useMissionDesk>;
  teamSharing: boolean;
  nextStatusLabel: string;
  currentStatusLabel: string;
  activeStep: number;
  steps: { status: string; label: string }[];
}>();
</script>

<style scoped>
/* Search, Sharing and mission progress all use one translucent floating surface.
   Only the current step uses an inset; no stack of separately bordered cards. */
.mission-map-cards { display: grid; gap: .4rem; min-width: 0; padding: .6rem .7rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-card, 24px);
  background: rgba(var(--v-theme-surface), .95); color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay); backdrop-filter: blur(12px); }
.mission-desk__next-step { display: grid; gap: .3rem; min-width: 0; }
.mission-desk__next-step > span { color: rgb(var(--v-theme-primary)); font-size: .8rem; font-weight: 800; }
.mission-desk__next-step :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; white-space: normal; }
.mission-desk__next-step :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-map-cards__notice { margin: 0; font-size: .8rem; line-height: 1.5; color: rgb(var(--v-theme-warning)); }
.mission-desk__phase-summary { min-width: 0; border-top: 1px solid rgba(var(--v-theme-on-surface), .12); padding-top: .35rem; }
.mission-desk__phase-heading { display: flex; align-items: center; justify-content: space-between; gap: .3rem; }
.mission-desk__phase-copy { display: grid; min-width: 0; gap: 1px; }
.mission-desk__phase-heading strong { font-size: .9rem; }
.mission-desk__phase-heading span { color: var(--bb-color-muted); font-size: .8rem; font-weight: 700; overflow-wrap: anywhere; }
.mission-desk__phase-steps { display: grid; gap: 1px; min-width: 0; margin: .35rem 0 0; padding: 0; list-style: none; }
.mission-desk__phase-step { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center; gap: .35rem; min-width: 0; min-height: 29px; padding: 2px 4px;
  border-radius: 9px; color: var(--bb-color-muted); font-size: .82rem; line-height: 1.4; }
.mission-desk__phase-marker { display: grid; width: 21px; height: 21px; place-items: center;
  border-radius: 50%; color: var(--bb-color-muted); background: var(--bb-color-inset); font-size: .8rem; font-weight: 800; }
.mission-desk__phase-step--passed { color: rgb(var(--v-theme-primary)); font-weight: 700; }
.mission-desk__phase-step--passed .mission-desk__phase-marker { color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }
.mission-desk__phase-step--current { color: rgb(var(--v-theme-on-surface)); background: var(--bb-color-inset); font-weight: 800; }
.mission-desk__phase-step--current .mission-desk__phase-marker { color: rgb(var(--v-theme-primary)); box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary)); }
.mission-desk__phase-label { min-width: 0; overflow-wrap: anywhere; }
.mission-desk__phase-now { color: rgb(var(--v-theme-primary)); font-size: .8rem; font-weight: 800; }
.mission-map-cards__more { flex: none; min-width: 44px; min-height: 44px; }
</style>
