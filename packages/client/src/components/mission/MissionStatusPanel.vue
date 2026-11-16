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
    <MissionBriefDetails :mission-id="desk.activeMission.value?.id ?? ''" />
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
import MissionBriefDetails from "./MissionBriefDetails.vue";

defineProps<{
  desk: ReturnType<typeof useMissionDesk>;
  currentStatusLabel: string;
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
.mission-desk__sharing { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 10px 12px; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.mission-desk__sharing > :deep(.v-icon) { flex: none; color: rgb(var(--v-theme-warning)); }
.mission-desk__sharing > div { display: grid; gap: 2px; min-width: 0; }
.mission-desk__sharing strong { font-size: .86rem; }
.mission-desk__sharing small { font-size: .8rem; line-height: 1.55; }
.mission-desk__kicker { display: inline-flex; align-items: center; gap: 8px; color: rgb(var(--v-theme-primary)); font-weight: 800; font-size: .84rem; }
.mission-desk__pulse { width: 9px; height: 9px; border-radius: 50%; background: #16b58f; box-shadow: 0 0 0 5px rgba(22,181,143,.16); }
.mission-desk__card h3 { font-size: 1.05rem; line-height: 1.5; margin: 4px 0 2px; }
.mission-desk__progress { display: grid; justify-items: start; gap: 12px; margin-top: 12px; }
.mission-desk__progress p { margin: 0; font-size: .88rem; color: rgb(var(--v-theme-on-surface)); }
.mission-desk__progress :deep(.v-btn) { min-height: 44px; height: auto; max-width: 100%; min-width: 0; white-space: normal; text-align: center; }
.mission-desk__progress :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-desk__foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid rgba(98,146,137,.2); padding-top: 18px; }
@media(max-width: 480px) { .mission-desk__foot { align-items: flex-start; flex-direction: column; } }
</style>
