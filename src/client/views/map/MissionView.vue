<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSosStore } from '@/stores/sos.ts';
import { useAuthStore } from '@/stores/auth.ts';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { MISSION_STATUS, ROLES, SOS_STATUS } from '@shared/protocol.ts';
import { haversineMeters } from '@shared/geo.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import type { SosView } from '@/api/types.ts';

/**
 * Requester and responder mission screen: the SOS rail, the mission action buttons that
 * drive the server state machine, and the one-time rating form.
 */
const sos = useSosStore();
const auth = useAuthStore();
const map = useMapStore();
const format = useFormatters();
const toast = useToast();

const SEVERITY_LABEL = { low: 'کم', medium: 'متوسط', high: 'شدید' } as const;

/**
 * Dispatched requests the signed-in responder may act on. The list endpoint already restricts a
 * responder's view to requests aimed at them or at their group (and the server re-checks on
 * accept), so anything DISPATCHED here is actionable. Plain users and admins never see this
 * section; there is no countdown because the backend has no offer TTL to honour.
 */
const offers = computed(() => {
  if (auth.user?.role !== ROLES.RESPONDER) return [];
  return sos.requests.filter((item) => item.status === SOS_STATUS.DISPATCHED && item.requesterId !== auth.user?.id);
});
const accepting = ref<string | null>(null);

function offerDistance(offer: SosView): number | null {
  const fix = map.ownFix;
  if (!fix) return null;
  return haversineMeters({ latitude: fix.latitude, longitude: fix.longitude }, { latitude: offer.latitude, longitude: offer.longitude });
}

async function accept(offer: SosView): Promise<void> {
  if (accepting.value) return;
  accepting.value = offer.id;
  try {
    await sos.accept(offer.id);
    toast.push('مأموریت پذیرفته شد.', 'success', 2600);
  } catch (caught) {
    // Most commonly a conflict: someone else took it first. Either way, reload to the
    // authoritative state instead of leaving a stale offer on screen.
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    accepting.value = null;
    await sos.load();
  }
}
const railLabels = ['ثبت', 'اعزام', 'پذیرش', 'رسیدگی', 'پایان'];
const actions = [
  { action: 'arrive', label: 'رسیدم', icon: 'map-marker-check-outline' },
  { action: 'start', label: 'شروع رسیدگی', icon: 'play-circle-outline' },
  { action: 'complete', label: 'پایان', icon: 'check-circle-outline' }
] as const;

const request = computed(() => sos.activeRequest);
// Not `activeMission`: that deliberately excludes completed missions, and a completed mission is
// exactly the one this screen has to show a rating form for. Falling back to the last mission keeps
// the rating reachable instead of leaving it inside a block that can never render.
const mission = computed(() => sos.activeMission ?? [...sos.missions].reverse().find((item) => item.status === MISSION_STATUS.COMPLETED) ?? null);
const stageIndex = computed(() => {
  const status = request.value?.status;
  if (!status) return -1;
  const stages: readonly string[] = [SOS_STATUS.PENDING, SOS_STATUS.DISPATCHED, SOS_STATUS.ACCEPTED, SOS_STATUS.IN_PROGRESS, SOS_STATUS.COMPLETED];
  return stages.indexOf(status);
});

// The list endpoint omits `timeline`; the rail below is empty until the detail call lands.
watch(
  () => request.value?.id,
  (sosId) => {
    if (!sosId) return;
    if (!request.value?.timeline) void sos.loadDetail(sosId);
  },
  { immediate: true }
);

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
    <template v-if="offers.length">
      <h3 class="sheet__subtitle">پیشنهاد مأموریت</h3>
      <article v-for="offer in offers" :key="offer.id" class="offer-card" data-testid="mission-offer">
        <div class="offer-card__head">
          <span :class="['mdi', `mdi-${offer.incidentIcon || 'alert-circle-outline'}`]" class="offer-card__icon" :style="{ color: offer.incidentColor ?? 'var(--danger)' }" aria-hidden="true" />
          <div class="offer-card__title">
            <strong>{{ offer.incidentLabel }}</strong>
            <small>{{ offer.description }}</small>
          </div>
          <span class="status-pill status-pill--danger">{{ SEVERITY_LABEL[offer.severity] }}</span>
        </div>
        <ul class="offer-facts">
          <li><span class="mdi mdi-map-marker-radius-outline" aria-hidden="true" /> دقت {{ format.distance(offer.accuracy) }}</li>
          <li v-if="offerDistance(offer) !== null"><span class="mdi mdi-map-marker-distance" aria-hidden="true" /> فاصله {{ format.distance(offerDistance(offer)!) }}</li>
          <li v-if="offer.isManual" class="offer-facts__manual"><span class="mdi mdi-pencil-outline" aria-hidden="true" /> موقعیت توسط درخواست‌کننده دستی ثبت شده است</li>
          <li v-if="offer.requesterUsername"><span class="mdi mdi-account" aria-hidden="true" /> درخواست‌کننده: {{ offer.requesterUsername }}</li>
        </ul>
        <div class="action-row">
          <button type="button" class="primary-button" :disabled="accepting !== null" data-testid="mission-offer-accept" @click="accept(offer)">
            <span class="mdi mdi-check" aria-hidden="true" />
            <span>{{ accepting === offer.id ? 'در حال پذیرش…' : 'پذیرش مأموریت' }}</span>
          </button>
        </div>
      </article>
    </template>

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
