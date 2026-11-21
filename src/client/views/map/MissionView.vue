<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSosStore } from '@/stores/sos.ts';
import { useAuthStore } from '@/stores/auth.ts';
import { useMapStore } from '@/stores/map.ts';
import { useOfflineStore } from '@/stores/offline.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { MISSION_STATUS, ROLES, SOS_STATUS } from '@shared/protocol.ts';
import { haversineMeters } from '@shared/geo.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import type { SosView } from '@/api/types.ts';
import { SEVERITY_LABELS, severityTone, statusLabel, timelineActionLabel } from '@/utils/status.ts';
import MissionTeamPanel from '@/components/mission/MissionTeamPanel.vue';
import SupportRequestPanel from '@/components/mission/SupportRequestPanel.vue';

/**
 * Requester and responder mission screen: the SOS rail, the mission action buttons that
 * drive the server state machine, and the one-time rating form.
 */
const sos = useSosStore();
const auth = useAuthStore();
const offline = useOfflineStore();
const map = useMapStore();
const format = useFormatters();
const toast = useToast();

/** Offline: retry means re-pulling catalogs and lists; the store records the wall-clock on success. */
async function retrySync(): Promise<void> {
  await sos.load();
}

/**
 * Dispatched requests the signed-in responder may act on. The list endpoint already restricts a
 * responder's view to requests aimed at them or at their group (and the server re-checks on
 * accept), so anything DISPATCHED here is actionable. Plain users and admins never see this
 * section; there is no countdown because the backend has no offer TTL to honour.
 */
// The offers endpoint is authoritative: only offers addressed to this responder arrive here,
// already filtered server-side by the job-type readiness policy.
const offers = computed(() => (auth.user?.role === ROLES.RESPONDER ? sos.offers : []));
const accepting = ref<string | null>(null);
const declining = ref<string | null>(null);
// Accepting is irreversible mid-mission: the design (05-mission-accepted) puts a confirmation
// in between the offer card and the POST. The candidate is held until the user commits.
const acceptCandidate = ref<SosView | null>(null);

function offerDistance(offer: SosView): number | null {
  const fix = map.ownFix;
  if (!fix) return null;
  return haversineMeters({ latitude: fix.latitude, longitude: fix.longitude }, { latitude: offer.latitude, longitude: offer.longitude });
}

function openAcceptConfirm(offer: SosView): void {
  if (accepting.value || declining.value) return;
  acceptCandidate.value = offer;
}

function cancelAcceptConfirm(): void {
  acceptCandidate.value = null;
}

async function accept(): Promise<void> {
  const offer = acceptCandidate.value;
  if (!offer || accepting.value) return;
  acceptCandidate.value = null;
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
/** Absolute times of the mission itself for the completed summary; null when the timeline has not landed. */
const completionRange = computed<{ start: number; end: number } | null>(() => {
  const timeline = request.value?.timeline;
  if (!timeline) return null;
  const at = (actions: string[]): number | null =>
    timeline.find((entry) => actions.includes(entry.action))?.createdAt ?? null;
  const start = at(['start', 'arrive', 'accept']);
  const end = at(['complete']);
  return start !== null && end !== null ? { start, end } : null;
});
const railLabels = ['ثبت', 'اعزام', 'پذیرش', 'رسیدگی', 'پایان'];
/** Per-step timestamps from the timeline the detail call returns; a step with nothing recorded stays undated. */
const stepTimes = computed<Array<number | null>>(() => {
  const timeline = request.value?.timeline ?? [];
  const at = (actions: string[]): number | null =>
    timeline.find((entry) => actions.includes(entry.action))?.createdAt ?? null;
  return [
    request.value?.createdAt ?? null,
    at(['assign', 'dispatch']),
    at(['accept']),
    at(['start', 'arrive']),
    at(['complete'])
  ];
});
const stageLabel = computed(() =>
  stageIndex.value < 0 ? '' : `مرحله ${format.number(stageIndex.value + 1)} از ${format.number(railLabels.length)}`
);
/** First character of the username, for the requester avatar circle. */
const initial = (name?: string | null): string => (name?.trim()?.[0] ?? '؟').toUpperCase();
/** Tinted incident chip: the incident color at low opacity over the surface, full color for the glyph/text. */
const chipStyle = (color?: string | null): Record<string, string> => {
  const base = color ?? '#AF3438';
  return { background: `color-mix(in srgb, ${base} 14%, transparent)`, color: base };
};
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
  if (status === MISSION_STATUS.ASSIGNED) return [{ action: 'start' as const, label: 'شروع مأموریت', icon: 'play-circle-outline' }];
  if (status === MISSION_STATUS.ON_THE_WAY || status === MISSION_STATUS.PENDING) return actions.slice(0, 1);
  if (status === MISSION_STATUS.ARRIVED) return actions.slice(1, 2);
  if (status === MISSION_STATUS.IN_PROGRESS) return actions.slice(2, 3);
  return [];
});
/** Optional report note attached to the one-time rating; the server caps it at 200 characters. */
const ratingNote = ref('');

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
    await sos.rate(mission.value.id, value, ratingNote.value.trim() || undefined);
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
async function decline(offer: SosView): Promise<void> {
  if (declining.value || accepting.value) return;
  declining.value = offer.id;
  try {
    await sos.decline(offer.id);
    toast.push('پیشنهاد مأموریت رد شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    declining.value = null;
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
    <span v-if="request" class="status-pill status-pill--warning">{{ statusLabel(request.status) }}</span>
  </div>
  <div class="sheet__body">
    <div v-if="offline.offline" class="mission-offline" role="status" data-testid="mission-offline">
      <span class="mission-offline__icon mdi mdi-wifi-off" aria-hidden="true" />
      <strong class="mission-offline__title">ارتباط با سرور امداد قطع است</strong>
      <p class="mission-offline__body">پیشنهاد مأموریت دریافت نمی‌شود و موقعیت شما ارسال نمی‌شود. اطلاعات مأموریت فعلی از آخرین داده همگام‌شده نمایش داده می‌شود.</p>
      <p v-if="sos.lastSyncedAt" class="mission-offline__sync"><span class="mdi mdi-database" aria-hidden="true" /> آخرین همگام‌سازی: {{ format.dateTime(sos.lastSyncedAt) }}</p>
      <button type="button" class="ghost-button" :disabled="sos.loading" data-testid="mission-offline-retry" @click="retrySync">
        <span :class="['mdi', sos.loading ? 'mdi-loading is-spinning' : 'mdi-refresh']" aria-hidden="true" />
        <span>{{ sos.loading ? 'در حال تلاش…' : 'تلاش دوباره' }}</span>
      </button>
    </div>
    <template v-if="offers.length">
      <h3 class="sheet__subtitle">پیشنهاد مأموریت</h3>
      <article v-for="(offer, offerIndex) in offers" :key="offer.id" class="offer-card" data-testid="mission-offer">
        <div class="offer-chips">
          <span class="offer-chip" :style="chipStyle(offer.incidentColor)">
            <span :class="['mdi', `mdi-${offer.incidentIcon || 'alert-circle-outline'}`]" aria-hidden="true" />
            {{ offer.incidentLabel }}
          </span>
          <span :class="['offer-chip', severityTone(offer.severity)]">{{ SEVERITY_LABELS[offer.severity] }}</span>
          <span v-if="offers.length > 1" class="offer-card__position">پیشنهاد {{ format.number(offerIndex + 1) }} از {{ format.number(offers.length) }}</span>
        </div>
        <div class="offer-card__lead">
          <strong class="offer-card__headline">{{ offer.incidentLabel }}</strong>
          <small class="offer-card__desc">{{ offer.description }}</small>
        </div>
        <div v-if="offer.requesterUsername" class="offer-requester">
          <span class="offer-requester__avatar" aria-hidden="true">{{ initial(offer.requesterUsername) }}</span>
          <div class="offer-requester__meta">
            <strong>{{ offer.requesterUsername }}</strong>
            <small>درخواست‌کننده</small>
          </div>
        </div>
        <div class="offer-tiles">
          <div class="offer-tile">
            <small>فاصله</small>
            <strong>{{ offerDistance(offer) !== null ? format.distance(offerDistance(offer)!) : '—' }}</strong>
          </div>
          <div class="offer-tile">
            <small>دقت مکان</small>
            <strong>{{ offer.isManual ? 'موقعیت دستی' : format.distance(offer.accuracy) }}</strong>
          </div>
          <div class="offer-tile">
            <small>ارسال شده</small>
            <strong>{{ format.clock(offer.createdAt) }}</strong>
          </div>
        </div>
        <p v-if="offer.isManual" class="offer-facts__manual offer-manual-note"><span class="mdi mdi-pencil-outline" aria-hidden="true" /> موقعیت توسط درخواست‌کننده دستی ثبت شده است</p>
        <div class="action-row">
          <button type="button" class="primary-button" :disabled="accepting !== null || declining !== null" data-testid="mission-offer-accept" @click="openAcceptConfirm(offer)">
            <span class="mdi mdi-check" aria-hidden="true" />
            <span>{{ accepting === offer.id ? 'در حال پذیرش…' : 'پذیرش مأموریت' }}</span>
          </button>
          <button type="button" class="ghost-button" :disabled="accepting !== null || declining !== null" data-testid="mission-offer-decline" @click="decline(offer)">
            <span class="mdi mdi-close" aria-hidden="true" />
            <span>{{ declining === offer.id ? 'در حال رد…' : 'رد مأموریت' }}</span>
          </button>
        </div>
      </article>
    </template>
    <div v-else-if="auth.user?.role === ROLES.RESPONDER && !mission && !request" class="no-offer" data-testid="mission-no-offer">
      <span class="no-offer__ring" aria-hidden="true"><span class="mdi mdi-radar" /></span>
      <strong class="no-offer__title">پیشنهاد فعالی نیست</strong>
      <p class="no-offer__body">درخواست‌های اعزام‌شده در نزدیکی شما بر اساس گروه و نوع حادثه به شما می‌رسند.</p>
      <div class="no-offer__actions">
        <RouterLink class="ghost-button" :to="{ name: ROUTE_NAMES.profile }" data-testid="mission-no-offer-profile">مدیریت آمادگی</RouterLink>
        <button type="button" class="primary-button primary-button--soft" data-testid="mission-no-offer-refresh" @click="sos.load()">
          <span class="mdi mdi-refresh" aria-hidden="true" />
          <span>تازه‌سازی</span>
        </button>
      </div>
    </div>

    <template v-if="request">
      <div class="rail-block">
        <div class="rail-block__head">
          <span class="rail-block__caption">وضعیت مأموریت</span>
          <span v-if="stageIndex >= 0" class="rail-block__stage">{{ stageLabel }}</span>
        </div>
        <div class="rail" role="list" aria-label="مراحل مأموریت">
          <div v-for="(label, index) in railLabels" :key="label" class="rail__step" :class="{ 'is-done': index <= stageIndex, 'is-current': index === stageIndex }" role="listitem">
            <i>{{ index < stageIndex || stageIndex === railLabels.length - 1 ? '✓' : format.number(index + 1) }}</i>
            <span>{{ label }}</span>
            <small v-if="stepTimes[index] !== null" class="rail__time">{{ format.clock(stepTimes[index]!) }}</small>
          </div>
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
          <span>{{ timelineActionLabel(entry.action) }}</span>
          <small>{{ format.dateTime(entry.createdAt) }}</small>
        </li>
      </ul>
      <div v-if="canCancelRequest" class="cancel-block">
        <button v-if="cancelTarget !== 'request'" type="button" class="danger-button" data-testid="cancel-request" @click="openCancel('request')">
          <span class="mdi mdi-close-circle" aria-hidden="true" />
          <span>لغو درخواست امداد</span>
        </button>
        <div v-else class="cancel-panel" data-testid="cancel-request-panel" role="group" aria-label="لغو درخواست امداد">
          <div class="cancel-panel__head">
            <span class="cancel-panel__icon mdi mdi-alert-circle-outline" aria-hidden="true" />
            <div>
              <strong>لغو درخواست امداد</strong>
              <small v-if="stageLabel">{{ statusLabel(request.status) }} · {{ stageLabel }}</small>
            </div>
          </div>
          <fieldset class="reason-list" data-testid="cancel-reason-list">
            <legend class="sr-only">دلیل لغو</legend>
            <label v-for="reason in sos.cancellationReasons" :key="reason.id" class="reason-option" :class="{ 'is-active': requestReasonId === reason.id }">
              <input type="radio" name="cancel-reason" :value="reason.id" v-model="requestReasonId" data-testid="cancel-reason" />
              <span class="mdi" :class="requestReasonId === reason.id ? 'mdi-radiobox-marked' : 'mdi-circle-outline'" aria-hidden="true" />
              <span>{{ reason.label }}</span>
            </label>
          </fieldset>
          <label class="cancel-panel__field" :class="{ 'is-required': requestDetailRequired }">
            <span>توضیح تکمیلی{{ requestDetailRequired ? ' (الزامی، حداقل ۱۰ نویسه)' : ' (اختیاری)' }}</span>
            <textarea v-model="requestDetail" rows="2" data-testid="cancel-detail" placeholder="کوتاه و روشن بنویسید…" />
          </label>
          <p class="cancel-panel__warning">
            <span class="mdi mdi-information-outline" aria-hidden="true" />
            پس از لغو، این درخواست بسته می‌شود و دیگر قابل پیگیری نیست.
          </p>
          <div class="action-row">
            <button type="button" class="danger-button" :disabled="!canConfirmRequestCancel" data-testid="confirm-cancel-request" @click="confirmRequestCancel">
              <span class="mdi mdi-close-circle" aria-hidden="true" />
              <span>{{ cancelling ? 'در حال لغو…' : 'لغو درخواست' }}</span>
            </button>
            <button type="button" class="ghost-button" data-testid="abort-cancel-request" @click="cancelTarget = null">
              <span>انصراف</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="mission">
      <div v-if="mission.status === MISSION_STATUS.COMPLETED" class="mission-done" data-testid="mission-completed">
        <span class="mission-done__icon mdi mdi-check" aria-hidden="true" />
        <strong class="mission-done__title">مأموریت با موفقیت بسته شد</strong>
        <p v-if="completionRange" class="mission-done__when">از {{ format.clock(completionRange.start) }} تا {{ format.clock(completionRange.end) }}</p>
        <div class="mission-done__actions">
          <RouterLink class="ghost-button" :to="{ name: ROUTE_NAMES.history }" data-testid="mission-done-history">سوابق مأموریت</RouterLink>
          <RouterLink class="primary-button primary-button--soft" :to="{ name: ROUTE_NAMES.map }" data-testid="mission-done-map">بازگشت به نقشه</RouterLink>
        </div>
      </div>
      <MissionTeamPanel :mission-id="mission.id" data-testid="mission-team-section" />
      <SupportRequestPanel :mission-id="mission.id" />
      <div class="mission-card">
        <strong>مأموریت {{ statusLabel(mission.status) }}</strong>
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
      <div v-if="canRateMission" class="rating-block">
        <label class="rating-note">
          <span>یادداشت برای تیم امداد (اختیاری، حداکثر ۲۰۰ نویسه)</span>
          <textarea v-model="ratingNote" rows="2" maxlength="200" data-testid="rating-note" placeholder="مثلاً رفتار تیم، زمان رسیدن…" aria-label="یادداشت ارزیابی" />
        </label>
        <div class="rating-row" aria-label="ارزیابی مأموریت">
          <button v-for="value in [1, 2, 3, 4, 5]" :key="value" type="button" class="rating-star" :aria-label="`امتیاز ${value}`" @click="rate(value)">
            <span class="mdi mdi-star" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p v-if="mission.rating" class="sheet__status">امتیاز ثبت‌شده: {{ format.number(mission.rating) }} از ۵</p>
      <p v-if="mission.ratingNote" class="sheet__status rating-note-view">یادداشت ارزیابی: {{ mission.ratingNote }}</p>
      <div v-if="canCancelMission" class="cancel-block">
        <button v-if="cancelTarget !== 'mission'" type="button" class="danger-button" data-testid="cancel-mission" @click="openCancel('mission')">
          <span class="mdi mdi-close-circle" aria-hidden="true" />
          <span>لغو مأموریت</span>
        </button>
        <div v-else class="cancel-panel" data-testid="cancel-mission-panel" role="group" aria-label="لغو مأموریت">
          <div class="cancel-panel__head">
            <span class="cancel-panel__icon mdi mdi-alert-circle-outline" aria-hidden="true" />
            <div>
              <strong>لغو مأموریت</strong>
              <small v-if="stageLabel">{{ statusLabel(mission.status) }} · {{ stageLabel }}</small>
            </div>
          </div>
          <label class="cancel-panel__field">
            <span>توضیح تکمیلی (اختیاری)</span>
            <textarea v-model="missionNote" rows="2" data-testid="mission-cancel-note" placeholder="مثلاً چرا امکان رسیدگی ندارید…" />
          </label>
          <p class="cancel-panel__warning">
            <span class="mdi mdi-information-outline" aria-hidden="true" />
            پس از لغو، مأموریت از شما سلب می‌شود و دیگر نمی‌توانید آن را ادامه دهید.
          </p>
          <div class="action-row">
            <button type="button" class="danger-button" :disabled="cancelling" data-testid="confirm-cancel-mission" @click="confirmMissionCancel">
              <span class="mdi mdi-close-circle" aria-hidden="true" />
              <span>{{ cancelling ? 'در حال لغو…' : 'لغو مأموریت' }}</span>
            </button>
            <button type="button" class="ghost-button" data-testid="abort-cancel-mission" @click="cancelTarget = null">
              <span>ادامه مأموریت</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <p v-if="!request && !mission" class="sheet__status">هنوز درخواستی ندارید. با دکمه SOS درخواست تازه بسازید.</p>
  </div>
  <div v-if="acceptCandidate" class="accept-confirm" role="presentation">
    <div class="accept-confirm__scrim" aria-hidden="true" @click="cancelAcceptConfirm" />
    <section class="accept-confirm__panel" role="dialog" aria-modal="true" aria-labelledby="accept-confirm-title" aria-describedby="accept-confirm-body" data-testid="accept-confirm">
      <span class="accept-confirm__icon mdi mdi-shield-check" aria-hidden="true" />
      <strong id="accept-confirm-title" class="accept-confirm__title">پذیرش این مأموریت؟</strong>
      <p id="accept-confirm-body" class="accept-confirm__body">با پذیرش، این مأموریت به شما اختصاص می‌یابد و پیشنهادهای دیگر متوقف می‌شوند.</p>
      <div class="accept-confirm__summary">
        <strong>{{ acceptCandidate.incidentLabel }}</strong>
        <span>{{ acceptCandidate.description }}</span>
      </div>
      <p class="accept-confirm__warning">
        <span class="mdi mdi-information-outline" aria-hidden="true" />
        پس از پذیرش، تا پایان رسیدگی مسئول این درخواست هستید.
      </p>
      <div class="accept-confirm__actions">
        <button type="button" class="primary-button" :disabled="accepting !== null" data-testid="accept-confirm-accept" @click="accept">
          <span class="mdi mdi-check" aria-hidden="true" />
          <span>بله، مأموریت را می‌پذیرم</span>
        </button>
        <button type="button" class="ghost-button" data-testid="accept-confirm-cancel" @click="cancelAcceptConfirm">انصراف و بازگشت</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.accept-confirm { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 24px; }
.accept-confirm__scrim { position: absolute; inset: 0; background: rgba(6, 14, 15, .55); }
.accept-confirm__panel {
  position: relative;
  display: grid;
  gap: 10px;
  justify-items: center;
  inline-size: min(360px, 100%);
  padding: 22px 20px 18px;
  border-radius: var(--r20);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.accept-confirm__icon { inline-size: 56px; block-size: 56px; display: grid; place-items: center; border-radius: 50%; background: rgba(46, 160, 67, .14); color: var(--success, var(--primary)); font-size: 26px; }
.accept-confirm__title { font-size: 18px; font-weight: 800; color: var(--text); }
.accept-confirm__body { margin: 0; font-size: 12.5px; color: var(--muted); }
.accept-confirm__summary { display: grid; gap: 2px; text-align: right; padding: 10px 14px; border-radius: var(--r12); background: var(--surface-2); font-size: 12.5px; }
.accept-confirm__summary span { color: var(--muted); font-size: 11.5px; }
.accept-confirm__warning { display: flex; gap: 6px; align-items: center; margin: 0; padding: 8px 14px; border-radius: var(--r12); background: rgba(187, 128, 9, .12); color: var(--warning); font-size: 11.5px; }
.accept-confirm__actions { display: grid; gap: 10px; inline-size: 100%; }
@media (prefers-reduced-motion: reduce) { .accept-confirm { transition: none; } }
</style>
