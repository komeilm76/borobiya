<script setup lang="ts">
import { computed } from 'vue';
import { useSosStore } from '@/stores/sos.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { MISSION_STATUS, SOS_STATUS } from '@shared/protocol.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';

/**
 * Requester and responder mission screen: the SOS rail, the mission action buttons that
 * drive the server state machine, and the one-time rating form.
 */
const sos = useSosStore();
const format = useFormatters();
const toast = useToast();
const railLabels = ['ثبت', 'اعزام', 'پذیرش', 'رسیدگی', 'پایان'];
const actions = [
  { action: 'arrive', label: 'رسیدم', icon: 'map-marker-check-outline' },
  { action: 'start', label: 'شروع رسیدگی', icon: 'play-circle-outline' },
  { action: 'complete', label: 'پایان', icon: 'check-circle-outline' }
] as const;

const request = computed(() => sos.activeRequest);
const mission = computed(() => sos.activeMission);
const stageIndex = computed(() => {
  const status = request.value?.status;
  if (!status) return -1;
  const stages: readonly string[] = [SOS_STATUS.PENDING, SOS_STATUS.DISPATCHED, SOS_STATUS.ACCEPTED, SOS_STATUS.IN_PROGRESS, SOS_STATUS.COMPLETED];
  return stages.indexOf(status);
});

const nextActions = computed(() => {
  const status = mission.value?.status;
  if (!status) return [];
  if (status === MISSION_STATUS.ON_THE_WAY || status === MISSION_STATUS.PENDING) return actions.slice(0, 1);
  if (status === MISSION_STATUS.ARRIVED) return actions.slice(1, 2);
  if (status === MISSION_STATUS.IN_PROGRESS) return actions.slice(2, 3);
  return [];
});

async function progress(action: 'arrive' | 'start' | 'complete'): Promise<void> {
  if (!mission.value) return;
  try {
    await sos.progress(mission.value.id, action, `گام ${action}`);
    toast.push('وضعیت مأموریت به‌روز شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

async function rate(value: number): Promise<void> {
  if (!mission.value) return;
  try {
    await sos.rate(mission.value.id, value, 'ارزیابی از برنامه');
    toast.push('ارزیابی ثبت شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>درخواست امداد شما</strong>
      <span v-if="request">کد پیگیری {{ format.number(request.trackingCode) }}</span>
      <span v-else>درخواست فعالی ثبت نشده است</span>
    </div>
    <span v-if="request" class="status-pill status-pill--warning">{{ request.status }}</span>
  </div>
  <div class="sheet__body">
    <template v-if="request">
      <div class="rail">
        <div v-for="(label, index) in railLabels" :key="label" class="rail__step" :class="{ 'is-done': index <= stageIndex }">
          <i>{{ index < stageIndex ? '✓' : format.number(index + 1) }}</i>
          <span>{{ label }}</span>
        </div>
      </div>
      <div class="info-card">
        <span class="mdi mdi-alert-circle-outline" aria-hidden="true" />
        <div>
          <strong>{{ request.incidentLabel }}</strong>
          <span>{{ request.description }}</span>
        </div>
      </div>
      <ul class="timeline">
        <li v-for="(entry, index) in request.timeline" :key="index">
          <span>{{ entry.action }}</span>
          <small>{{ format.dateTime(entry.createdAt) }}</small>
        </li>
      </ul>
    </template>

    <template v-if="mission">
      <div class="mission-card">
        <strong>مأموریت {{ mission.status }}</strong>
        <span>{{ format.dateTime(mission.updatedAt) }}</span>
      </div>
      <div class="action-row">
        <button
          v-for="item in nextActions"
          :key="item.action"
          type="button"
          class="primary-button"
          @click="progress(item.action)"
        >
          <span :class="['mdi', `mdi-${item.icon}`]" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </div>
      <div v-if="mission.status === MISSION_STATUS.COMPLETED && !mission.rating" class="rating-row" aria-label="ارزیابی مأموریت">
        <button v-for="value in [1, 2, 3, 4, 5]" :key="value" type="button" class="rating-star" :aria-label="`امتیاز ${value}`" @click="rate(value)">
          <span class="mdi mdi-star" aria-hidden="true" />
        </button>
      </div>
      <p v-if="mission.rating" class="sheet__status">امتیاز ثبت‌شده: {{ format.number(mission.rating) }} از ۵</p>
    </template>

    <p v-if="!request && !mission" class="sheet__status">هنوز درخواستی ندارید. با دکمه SOS درخواست تازه بسازید.</p>
  </div>
</template>
