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
  // Never offer a request the user already holds a live mission for, even if the list
  // flickered out of sync — accepting it is impossible server-side anyway.
  const held = new Set(
    sos.missions.filter((item) => item.status !== MISSION_STATUS.CANCELLED).map((item) => item.sosId)
  );
  return sos.requests.filter((item) => item.status === SOS_STATUS.DISPATCHED && item.requesterId !== auth.user?.id && !held.has(item.id));
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
    // Most commonly a conflict: someone else took it first. The store reloads on success, so
    // only the failure path pays for a reload here.
    toast.push(errorMessage(caught), 'error', 3800);
    await sos.load();
  } finally {
    accepting.value = null;
  }
}
const railLabels = ['ثبت', 'اعزام', 'پذیرش', 'رسیدگی', 'پایان'];
const actions = [
  { action: 'arrive', label: 'رسیدم', icon: 'map-marker-check-outline' },
  { action: 'start', label: 'شروع رسیدگی', icon: 'play-circle-outline' },
  { action: 'complete', label: 'پایان', icon: 'check-circle-outline' }
] as const;

// Not `activeMission`: that deliberately excludes completed missions, and a completed mission is
// exactly the one this screen has to show a rating form for. Falling back to the last mission keeps
// the rating reachable instead of leaving it inside a block that can never render.
const mission = computed(() => sos.activeMission ?? [...sos.missions].reverse().find((item) => item.status === MISSION_STATUS.COMPLETED) ?? null);
// The rail belongs to the request behind the mission being shown; falling back to the first
// non-terminal request is only right when no mission exists. Otherwise a responder carrying their
// own in-flight SOS would see their request's rail next to a different incident's mission card.
const request = computed(() => {
  const current = mission.value;
  if (current) return sos.requests.find((item) => item.id === current.sosId) ?? null;
  return sos.activeRequest;
});
const ownsRequest = computed(() => Boolean(request.value && auth.user && request.value.requesterId === auth.user.id));
const railHeading = computed(() => (ownsRequest.value ? 'درخواست امداد شما' : 'مأموریت اعزام‌شده'));
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

const canActOnMission = computed(() => {
  const current = mission.value;
  const user = auth.user;
  if (!current || !user) return false;
  return current.responderId === user.id || user.role === ROLES.ADMIN;
});
const nextActions = computed(() => {
  if (!canActOnMission.value) return [];
  const status = mission.value?.status;
  if (!status) return [];
  if (status === MISSION_STATUS.ON_THE_WAY || status === MISSION_STATUS.PENDING) return actions.slice(0, 1);
  if (status === MISSION_STATUS.ARRIVED) return actions.slice(1, 2);
  if (status === MISSION_STATUS.IN_PROGRESS) return actions.slice(2, 3);
  return [];
});
const canRateMission = computed(() => {
  const current = mission.value;
  const user = auth.user;
  if (!current || !user) return false;
  return current.status === MISSION_STATUS.COMPLETED && !current.rating && current.requesterId === user.id;
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

/**
 * Cancellation: two distinct server paths, kept distinct in the UI.
 *
 * The requester cancels their own SOS through the catalog endpoint (`/_user/sos/:id/cancel`),
 * which requires a catalog reason and — when the reason says so — a written detail of at least
 * 10 characters. The mission cancellation rides the mission state machine
 * (`/_user/missions/:id/progress`), takes only an optional free-text note, and exists for the
 * responder who cannot or will not take the mission any further. Both reload from the server
 * afterwards, so the screen never shows a locally-invented state.
 */
const CANCELLABLE_REQUEST_STATUSES = new Set<string>([SOS_STATUS.PENDING, SOS_STATUS.DISPATCHED, SOS_STATUS.ACCEPTED, SOS_STATUS.IN_PROGRESS]);
const CANCELLABLE_MISSION_STATUSES = new Set<string>([MISSION_STATUS.ON_THE_WAY, MISSION_STATUS.ARRIVED, MISSION_STATUS.IN_PROGRESS]);

const cancelTarget = ref<'request' | 'mission' | null>(null);
const requestReasonId = ref('');
const requestDetail = ref('');
const missionNote = ref('');
const cancelling = ref(false);

const selectedReason = computed(() => sos.cancellationReasons.find((reason) => reason.id === requestReasonId.value) ?? null);
const requestDetailRequired = computed(() => Boolean(selectedReason.value?.requiresText));

const canCancelRequest = computed(() => {
  const current = request.value;
  const user = auth.user;
  if (!current || !user) return false;
  if (!CANCELLABLE_REQUEST_STATUSES.has(current.status)) return false;
  return current.requesterId === user.id || user.role === ROLES.ADMIN;
});

const canCancelMission = computed(() => {
  const current = mission.value;
  const user = auth.user;
  if (!current || !user) return false;
  if (!CANCELLABLE_MISSION_STATUSES.has(current.status)) return false;
  return current.responderId === user.id || user.role === ROLES.ADMIN;
});

/** Mirror of the server rule: 10+ trimmed characters when the reason demands a detail. */
const requestDetailValid = computed(() => {
  if (!requestDetailRequired.value) return true;
  return requestDetail.value.trim().length >= 10;
});

const canConfirmRequestCancel = computed(() => Boolean(requestReasonId.value) && requestDetailValid.value && !cancelling.value);

function openCancel(target: 'request' | 'mission'): void {
  cancelTarget.value = target;
  requestReasonId.value = '';
  requestDetail.value = '';
  missionNote.value = '';
}

async function confirmRequestCancel(): Promise<void> {
  const current = request.value;
  if (!current || !canConfirmRequestCancel.value) return;
  cancelling.value = true;
  const detail = requestDetail.value.trim();
  try {
    await sos.cancel(current.id, requestReasonId.value, detail || undefined);
    toast.push('درخواست امداد لغو شد.', 'success', 2600);
  } catch (caught) {
    // A conflict means the server already moved on (e.g. completed meanwhile); the reload
    // inside the store repaints the truth either way.
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    cancelling.value = false;
    cancelTarget.value = null;
  }
}

async function confirmMissionCancel(): Promise<void> {
  const current = mission.value;
  if (!current || cancelling.value) return;
  cancelling.value = true;
  const note = missionNote.value.trim();
  try {
    await sos.progress(current.id, 'cancel', note || undefined);
    toast.push('مأموریت لغو شد.', 'success', 2600);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    cancelling.value = false;
    cancelTarget.value = null;
  }
}
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>{{ railHeading }}</strong>
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
          <li v-if="!offer.isManual"><span class="mdi mdi-map-marker-radius-outline" aria-hidden="true" /> دقت {{ format.distance(offer.accuracy) }}</li>
          <li v-else><span class="mdi mdi-pencil-outline" aria-hidden="true" /> موقعیت دستی (بدون دقت GPS)</li>
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
      <div v-if="canCancelRequest" class="cancel-block">
        <button v-if="cancelTarget !== 'request'" type="button" class="danger-button" data-testid="cancel-request" @click="openCancel('request')">
          <span class="mdi mdi-close-circle" aria-hidden="true" />
          <span>لغو درخواست امداد</span>
        </button>
        <div v-else class="cancel-panel" data-testid="cancel-request-panel" role="group" aria-label="لغو درخواست امداد">
          <strong>لغو درخواست امداد</strong>
          <label class="cancel-panel__field">
            <span>دلیل لغو</span>
            <select v-model="requestReasonId" data-testid="cancel-reason">
              <option value="">انتخاب کنید…</option>
              <option v-for="reason in sos.cancellationReasons" :key="reason.id" :value="reason.id">{{ reason.label }}</option>
            </select>
          </label>
          <label class="cancel-panel__field" :class="{ 'is-required': requestDetailRequired }">
            <span>توضیحات{{ requestDetailRequired ? ' (الزامی، حداقل ۱۰ نویسه)' : ' (اختیاری)' }}</span>
            <textarea v-model="requestDetail" rows="2" data-testid="cancel-detail" placeholder="کوتاه و روشن بنویسید…" />
          </label>
          <div class="action-row">
            <button type="button" class="danger-button" :disabled="!canConfirmRequestCancel" data-testid="confirm-cancel-request" @click="confirmRequestCancel">
              <span class="mdi mdi-check" aria-hidden="true" />
              <span>{{ cancelling ? 'در حال لغو…' : 'تأیید لغو' }}</span>
            </button>
            <button type="button" class="ghost-button" data-testid="abort-cancel-request" @click="cancelTarget = null">
              <span>بازگشت</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="mission">
      <div class="mission-card">
        <strong>مأموریت {{ mission.status }}</strong>
        <span>{{ format.dateTime(mission.updatedAt) }}</span>
      </div>
      <div class="action-row" data-testid="mission-next-actions">
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
      <div v-if="canRateMission" class="rating-row" aria-label="ارزیابی مأموریت">
        <button v-for="value in [1, 2, 3, 4, 5]" :key="value" type="button" class="rating-star" :aria-label="`امتیاز ${value}`" @click="rate(value)">
          <span class="mdi mdi-star" aria-hidden="true" />
        </button>
      </div>
      <p v-if="mission.rating" class="sheet__status">امتیاز ثبت‌شده: {{ format.number(mission.rating) }} از ۵</p>
      <div v-if="canCancelMission" class="cancel-block">
        <button v-if="cancelTarget !== 'mission'" type="button" class="danger-button" data-testid="cancel-mission" @click="openCancel('mission')">
          <span class="mdi mdi-close-circle" aria-hidden="true" />
          <span>لغو مأموریت</span>
        </button>
        <div v-else class="cancel-panel" data-testid="cancel-mission-panel" role="group" aria-label="لغو مأموریت">
          <strong>لغو مأموریت</strong>
          <label class="cancel-panel__field">
            <span>یادداشت برای درخواست‌کننده (اختیاری)</span>
            <textarea v-model="missionNote" rows="2" data-testid="mission-cancel-note" placeholder="مثلاً چرا امکان رسیدگی ندارید…" />
          </label>
          <div class="action-row">
            <button type="button" class="danger-button" :disabled="cancelling" data-testid="confirm-cancel-mission" @click="confirmMissionCancel">
              <span class="mdi mdi-check" aria-hidden="true" />
              <span>{{ cancelling ? 'در حال لغو…' : 'تأیید لغو مأموریت' }}</span>
            </button>
            <button type="button" class="ghost-button" data-testid="abort-cancel-mission" @click="cancelTarget = null">
              <span>بازگشت</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <p v-if="!request && !mission" class="sheet__status">هنوز درخواستی ندارید. با دکمه SOS درخواست تازه بسازید.</p>
  </div>
</template>
