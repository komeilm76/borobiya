<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMissionTeamStore } from '@/stores/missionTeam.ts';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { HTTP_EVENTS, SUPPORT_REQUEST_STATUS } from '@shared/protocol.ts';
import { SEVERITY_LABELS, SUPPORT_REQUEST_STATUS_LABELS, statusLabel } from '@/utils/status.ts';
import MissionTeamPanel from '@/components/mission/MissionTeamPanel.vue';
import type { SupportRequestCandidateView, SupportRequestView } from '@/api/types.ts';

/**
 * Support-request review console. Every row expands into the same review flow:
 * adjust the per-line approved quantities, pick the workers (search + eligibility),
 * then record an explicit decision. The server re-validates everything hand-count-for-hand;
 * the client only refuses to submit a command it can already tell is inconsistent.
 */
const team = useMissionTeamStore();
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const realtime = useRealtimeStore();

const STATUS_FILTERS = [
  { value: 'pending', label: SUPPORT_REQUEST_STATUS_LABELS[SUPPORT_REQUEST_STATUS.PENDING] },
  { value: 'partially_approved', label: SUPPORT_REQUEST_STATUS_LABELS[SUPPORT_REQUEST_STATUS.PARTIALLY_APPROVED] },
  { value: 'approved', label: SUPPORT_REQUEST_STATUS_LABELS[SUPPORT_REQUEST_STATUS.APPROVED] },
  { value: 'rejected', label: SUPPORT_REQUEST_STATUS_LABELS[SUPPORT_REQUEST_STATUS.REJECTED] },
  { value: 'cancelled', label: SUPPORT_REQUEST_STATUS_LABELS[SUPPORT_REQUEST_STATUS.CANCELLED] },
  { value: '', label: 'همه' }
] as const;

const filter = ref<string>('pending');
const openId = ref<string | null>(null);
const adminNote = ref('');
/** Per-line approved quantities (jobTypeId -> quantity); initialised from the request lines. */
const approved = ref<Record<string, number>>({});
const selectedIds = ref<string[]>([]);
const candidateQuery = ref('');
const candidateJobTypeId = ref('');
const includeIneligible = ref(false);
const candidateBusy = ref(false);

const detail = computed(() => team.detail);
const lines = computed(() => detail.value?.items ?? []);
const sumRequested = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0));
const sumApproved = computed(() => lines.value.reduce((sum, line) => sum + (Number(approved.value[line.jobTypeId] ?? line.quantity) || 0), 0));
const anyShort = computed(() => lines.value.some((line) => Number(approved.value[line.jobTypeId] ?? line.quantity) < line.quantity));

/** Workers picked so far, grouped by their job type. */
const selectedByType = computed(() => {
  const byId = new Map(team.candidates.map((candidate) => [candidate.id, candidate]));
  const counts = new Map<string, number>();
  for (const id of selectedIds.value) {
    const candidate = byId.get(id);
    const key = candidate?.jobTypeId ?? '';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
});

/** Eligible candidates are the only selectable ones; counts must match the approved lines exactly. */
const countsMatch = computed(() => {
  const requestedTypes = new Set(lines.value.map((line) => line.jobTypeId));
  for (const id of selectedIds.value) {
    const candidate = team.candidates.find((item) => item.id === id);
    if (!candidate || !requestedTypes.has(String(candidate.jobTypeId))) return false;
  }
  for (const line of lines.value) {
    const wanted = Number(approved.value[line.jobTypeId] ?? line.quantity);
    if ((selectedByType.value.get(line.jobTypeId) ?? 0) !== wanted) return false;
  }
  return true;
});
const canApprove = computed(() => countsMatch.value && sumApproved.value === sumRequested.value);
const canPartial = computed(() => countsMatch.value && anyShort.value);
const reviewable = computed(() => detail.value?.status === SUPPORT_REQUEST_STATUS.PENDING);

function requestTone(status: string): string {
  if (status === SUPPORT_REQUEST_STATUS.APPROVED || status === SUPPORT_REQUEST_STATUS.PARTIALLY_APPROVED) return 'status-pill status-pill--success';
  if (status === SUPPORT_REQUEST_STATUS.PENDING) return 'status-pill status-pill--warning';
  return 'status-pill status-pill--neutral';
}

function decisionLabel(value: string): string {
  if (value === 'approved') return 'تأیید کامل';
  if (value === 'partially_approved') return 'تأیید جزئی';
  return 'رد';
}

async function reloadList(): Promise<void> {
  await team.loadAdminRequests(filter.value || undefined);
  await admin.loadPendingSupportRequests();
}

async function openRequest(request: SupportRequestView): Promise<void> {
  if (openId.value === request.id) {
    openId.value = null;
    return;
  }
  openId.value = request.id;
  candidateBusy.value = true;
  try {
    const loaded = await team.loadDetail(request.id);
    if (loaded) {
      approved.value = Object.fromEntries(loaded.items.map((line) => [line.jobTypeId, line.quantity]));
      selectedIds.value = [];
      adminNote.value = '';
      candidateQuery.value = '';
      candidateJobTypeId.value = '';
      includeIneligible.value = false;
      await team.loadCandidates(request.id, {});
    }
  } finally {
    candidateBusy.value = false;
  }
}

async function reloadCandidates(): Promise<void> {
  if (!openId.value) return;
  candidateBusy.value = true;
  try {
    // Keep the selection honest: workers filtered out of view stay selected only if they still
    // pass the server-side checks at review time — the review endpoint re-verifies anyway.
    await team.loadCandidates(openId.value, {
      ...(candidateJobTypeId.value ? { jobTypeId: candidateJobTypeId.value } : {}),
      ...(candidateQuery.value.trim() ? { q: candidateQuery.value.trim() } : {}),
      includeIneligible: includeIneligible.value
    });
  } finally {
    candidateBusy.value = false;
  }
}

watch([candidateQuery, candidateJobTypeId, includeIneligible], () => {
  if (!openId.value) return;
  void reloadCandidates();
});

function toggleCandidate(candidate: SupportRequestCandidateView, checked: boolean): void {
  if (checked) {
    if (!candidate.eligible) return;
    selectedIds.value = [...new Set([...selectedIds.value, candidate.id])];
  } else {
    selectedIds.value = selectedIds.value.filter((id) => id !== candidate.id);
  }
}

function approvedFor(jobTypeId: string): number {
  return Number(approved.value[jobTypeId] ?? 0);
}

function setApproved(jobTypeId: string, raw: string | number): void {
  const requested = lines.value.find((line) => line.jobTypeId === jobTypeId)?.quantity ?? 0;
  const value = Math.max(0, Math.min(requested, Math.floor(Number(raw) || 0)));
  approved.value = { ...approved.value, [jobTypeId]: value };
  // Shrinking the approved quantity drops nothing automatically — instead the existing
  // selection becomes visibly inconsistent (countsMatch turns false) until fixed.
}

async function submitReview(decision: 'approved' | 'partially_approved' | 'rejected'): Promise<void> {
  if (!openId.value || !detail.value || !reviewable.value) return;
  const requestId = openId.value;
  try {
    const payload =
      decision === 'rejected'
        ? { decision, ...(adminNote.value.trim() ? { adminNote: adminNote.value.trim() } : {}) }
        : {
            decision,
            ...(adminNote.value.trim() ? { adminNote: adminNote.value.trim() } : {}),
            items: lines.value.map((line) => ({ jobTypeId: line.jobTypeId, approvedQuantity: approvedFor(line.jobTypeId) })),
            userIds: [...new Set(selectedIds.value)]
          };
    await team.review(requestId, payload);
    toast.push(
      decision === 'rejected' ? 'درخواست رد شد.' : decision === 'approved' ? 'درخواست تأیید و نیروها اعزام شدند.' : 'درخواست تأیید جزئی شد و نیروها اعزام شدند.',
      'success',
      2800
    );
    await reloadList();
    openId.value = null;
    team.detail = null;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 4200);
  }
}

watch(filter, () => void reloadList());

const unsubscribers: Array<() => void> = [];

onMounted(async () => {
  await reloadList();
  unsubscribers.push(
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_CREATED, () => void reloadList()),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, () => void reloadList()),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_CANCELLED, () => void reloadList())
  );
});

onUnmounted(() => {
  for (const off of unsubscribers.splice(0)) off();
  team.detail = null;
});
</script>

<template>
  <section class="admin-page" data-testid="admin-support-requests">
    <article class="panel">
      <header class="panel__head">
        <h2>درخواست‌های نیروی کمکی</h2>
        <span class="panel__hint">{{ format.number(team.adminTotal) }} درخواست</span>
      </header>

      <!-- Status filter -->
      <div class="panel__filters" role="group" aria-label="فیلتر وضعیت">
        <button
          v-for="option in STATUS_FILTERS"
          :key="option.value || 'all'"
          type="button"
          :class="['admin-filter', { 'is-active': filter === option.value }]"
          :data-testid="`support-filter-${option.value || 'all'}`"
          @click="filter = option.value"
        >{{ option.label }}</button>
      </div>

      <p v-if="team.error" class="team-panel__error" role="alert">{{ team.error }}</p>
      <p v-else-if="team.loading && !team.adminRequests.length" class="team-panel__hint">
        <span class="mdi mdi-loading is-spinning" aria-hidden="true" /> بارگذاری درخواست‌ها…
      </p>

      <ul class="admin-list">
        <template v-for="request in team.adminRequests" :key="request.id">
          <li>
            <span class="mdi mdi-hand-heart-outline" aria-hidden="true" />
            <div>
              <strong>{{ request.incidentLabel }} · {{ SEVERITY_LABELS[request.severity ?? 'medium'] }} · {{ request.requestedByUsername }}</strong>
              <small>مأموریت: {{ statusLabel(request.missionStatus ?? '') }} · {{ request.reason }}</small>
              <ul class="support-item__lines">
                <li v-for="line in request.items" :key="line.jobTypeId">{{ line.jobTypeLabel }} × {{ format.number(line.quantity) }}</li>
              </ul>
            </div>
            <span :class="requestTone(request.status)">{{ SUPPORT_REQUEST_STATUS_LABELS[request.status] }}</span>
            <button type="button" class="admin-action" :data-testid="`open-support-${request.id}`" @click="openRequest(request)">
              {{ openId === request.id ? 'بستن' : 'بررسی' }}
            </button>
          </li>

          <!-- Review drawer -->
          <li v-if="openId === request.id" class="dispatch-panel support-review" data-testid="support-review-panel">
            <p v-if="!detail" class="team-panel__hint"><span class="mdi mdi-loading is-spinning" aria-hidden="true" /> بارگذاری…</p>
            <template v-else>
              <div class="support-review__meta">
                <strong>مأموریت {{ statusLabel(detail.mission?.status ?? detail.missionStatus ?? '') }}</strong>
                <small>{{ detail.mission?.incidentLabel }} · درخواست‌دهنده: {{ detail.requestedByUsername }}<template v-if="detail.leader"> · سرپرست: {{ detail.leader.username }}</template></small>
                <small>علت: {{ detail.reason }}</small>
                <small v-if="detail.note">یادداشت: {{ detail.note }}</small>
              </div>

              <!-- Composition lines with approved quantities -->
              <div class="support-review__lines" data-testid="review-lines">
                <label v-for="line in lines" :key="line.jobTypeId" class="support-review__line">
                  <span>
                    <strong>{{ line.jobTypeLabel }}</strong>
                    <small>درخواستی: {{ format.number(line.quantity) }}</small>
                  </span>
                  <span class="support-review__selected" :class="{ 'is-ok': selectedByType.get(line.jobTypeId) === approvedFor(line.jobTypeId) }">
                    انتخاب‌شده: {{ format.number(selectedByType.get(line.jobTypeId) ?? 0) }}
                  </span>
                  <label class="support-review__approve">
                    <span>تأیید</span>
                    <input
                      type="number"
                      min="0"
                      :max="line.quantity"
                      inputmode="numeric"
                      :value="approvedFor(line.jobTypeId)"
                      :disabled="!reviewable"
                      :data-testid="`approve-qty-${line.jobTypeId}`"
                      @input="setApproved(line.jobTypeId, ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                </label>
              </div>

              <!-- Candidate picker -->
              <div v-if="reviewable" class="support-review__candidates" data-testid="candidate-picker">
                <span class="dispatch-panel__label">انتخاب نیروها (مدیر تصمیم نهایی را می‌گیرد)</span>
                <div class="admin-filters">
                  <input v-model="candidateQuery" type="text" class="support-review__search" placeholder="جست‌وجوی نام کاربری…" data-testid="candidate-search" autocomplete="off" />
                  <select v-model="candidateJobTypeId" class="support-review__select" data-testid="candidate-jobtype">
                    <option value="">همه نوع‌های شغلی این درخواست</option>
                    <option v-for="line in lines" :key="line.jobTypeId" :value="line.jobTypeId">{{ line.jobTypeLabel }}</option>
                  </select>
                  <label class="support-review__ineligible">
                    <input v-model="includeIneligible" type="checkbox" />
                    <span>نمایش غیرفعال‌ها با علت</span>
                  </label>
                </div>
                <p v-if="candidateBusy" class="team-panel__hint"><span class="mdi mdi-loading is-spinning" aria-hidden="true" /> در حال جست‌وجو…</p>
                <ul v-else-if="team.candidates.length" class="dispatch-rows">
                  <li v-for="candidate in team.candidates" :key="candidate.id" class="candidate-row" :class="{ 'is-ineligible': !candidate.eligible }" :data-testid="`candidate-row-${candidate.id}`">
                    <input
                      type="checkbox"
                      :checked="selectedIds.includes(candidate.id)"
                      :disabled="!candidate.eligible"
                      :aria-label="`انتخاب ${candidate.username}`"
                      :data-testid="`candidate-pick-${candidate.id}`"
                      @change="toggleCandidate(candidate, ($event.target as HTMLInputElement).checked)"
                    />
                    <span :class="['mdi', candidate.readyForMission ? 'mdi-account-check-outline' : 'mdi-account-clock-outline']" aria-hidden="true" />
                    <div class="candidate-row__body">
                      <strong>{{ candidate.username }}</strong>
                      <small>{{ candidate.jobTypeLabel ?? 'بدون نوع شغل' }} · امتیاز {{ format.number(candidate.averageRating) }}<template v-if="candidate.onActiveMission"> · مشغول در مأموریت دیگر</template></small>
                    </div>
                    <span v-if="!candidate.eligible" class="status-pill status-pill--neutral">{{ candidate.ineligibleReason }}</span>
                  </li>
                </ul>
                <p v-else class="team-panel__hint">کاندیدایی یافت نشد.</p>
                <p class="team-panel__hint">مناسب‌ها واجد شرایط: {{ format.number(team.eligibleTotal) }}</p>
              </div>

              <!-- Decision -->
              <label class="team-add__field">
                <span>یادداشت برای تصمیم (اختیاری، حداکثر ۵۰۰ نویسه)</span>
                <textarea v-model="adminNote" rows="2" maxlength="500" data-testid="review-note" :disabled="!reviewable" placeholder="چرا این تصمیم؟" />
              </label>
              <div class="review-actions">
                <button type="button" class="primary-button" :disabled="!reviewable || !canApprove || team.busy" data-testid="review-approve" @click="submitReview('approved')">
                  <span :class="['mdi', team.busy ? 'mdi-loading is-spinning' : 'mdi-check']" aria-hidden="true" />
                  <span>تأیید کامل</span>
                </button>
                <button type="button" class="ghost-button" :disabled="!reviewable || !canPartial || team.busy" data-testid="review-partial" @click="submitReview('partially_approved')">
                  <span class="mdi mdi-check-circle-outline" aria-hidden="true" />
                  <span>تأیید جزئی</span>
                </button>
                <button type="button" class="danger-button" :disabled="!reviewable || team.busy" data-testid="review-reject" @click="submitReview('rejected')">
                  <span class="mdi mdi-close-circle-outline" aria-hidden="true" />
                  <span>رد درخواست</span>
                </button>
              </div>
              <p v-if="reviewable && !countsMatch" class="team-panel__hint">تعداد نیروی انتخاب‌شده برای هر نوع شغل باید دقیقاً برابر تعداد تأییدشده باشد.</p>
              <p v-else-if="reviewable && anyShort && reviewable" class="team-panel__hint">برای «تأیید کامل» همه خطوط باید با تعداد کامل تأیید شوند؛ در غیر این صورت «تأیید جزئی» بزنید.</p>

              <!-- Decision history -->
              <ul v-if="detail.decisions?.length" class="timeline" data-testid="review-decisions">
                <li v-for="(decision, index) in detail.decisions" :key="index">
                  <span>{{ decisionLabel(decision.decision) }}<template v-if="decision.adminUsername"> — {{ decision.adminUsername }}</template></span>
                  <small>{{ format.dateTime(decision.createdAt) }}<template v-if="decision.note"> · {{ decision.note }}</template></small>
                </li>
              </ul>

              <!-- Full team context while reviewing -->
              <MissionTeamPanel :mission-id="detail.missionId" :admin="true" />
            </template>
          </li>
        </template>
      </ul>
      <p v-if="!team.loading && !team.adminRequests.length" class="panel__empty">درخواستی در این فیلتر نیست.</p>
    </article>
  </section>
</template>
