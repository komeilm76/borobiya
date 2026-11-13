<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { errorMessage, get } from '@/api/client.ts';
import { useMissionTeamStore } from '@/stores/missionTeam.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useToast } from '@/composables/useToast.ts';
import { SUPPORT_REQUEST_STATUS_LABELS } from '@/utils/status.ts';
import { SUPPORT_REQUEST_STATUS } from '@shared/protocol.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { HTTP_EVENTS } from '@shared/protocol.ts';
import type { SupportRequestView } from '@/api/types.ts';

/**
 * Mission support requests (the leader asks for more workers).
 * Members see the request list; the leader additionally gets the composer and can
 * withdraw their own pending request. Internal review notes stay visible only to the
 * requester and administrators (the server enforces that too).
 */
const props = defineProps<{ missionId: string }>();

const team = useMissionTeamStore();
const format = useFormatters();
const toast = useToast();

/* Live refresh: re-pull the projection whenever this mission's team or requests change. */
const realtime = useRealtimeStore();
const unsubscribers: Array<() => void> = [];
const handleTeamEvent = (payload: { missionId?: string }): void => {
  if (!payload?.missionId || payload.missionId === props.missionId) void reload();
};

onMounted(() => {
  unsubscribers.push(
    realtime.on(HTTP_EVENTS.MISSION_TEAM_UPDATED, handleTeamEvent),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_CREATED, handleTeamEvent),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, handleTeamEvent),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_CANCELLED, handleTeamEvent)
  );
});

onUnmounted(() => {
  for (const off of unsubscribers.splice(0)) off();
});

const project = computed(() => team.team);
const viewerRole = computed(() => project.value?.viewerRole ?? null);
const isLeader = computed(() => viewerRole.value === 'leader');
const sortedRequests = computed(() =>
  [...(Array.isArray(team.requests) ? team.requests : [])].sort((a, b) => b.createdAt - a.createdAt)
);

const composerOpen = ref(false);
const lines = ref<Array<{ jobTypeId: string; quantity: number }>>([{ jobTypeId: '', quantity: 1 }]);
const reason = ref('');
const note = ref('');
const jobTypes = ref<Array<{ id: string; label: string }>>([]);
const formError = ref<string | null>(null);
const pendingCancelId = ref<string | null>(null);

const reasonValid = computed(() => reason.value.trim().length >= 10);
const linesValid = computed(() => {
  if (!lines.value.length || lines.value.length > 10) return false;
  const ids = new Set<string>();
  for (const line of lines.value) {
    if (!line.jobTypeId || ids.has(line.jobTypeId)) return false;
    ids.add(line.jobTypeId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return false;
  }
  return true;
});
const canSubmit = computed(() => isLeader.value && reasonValid.value && linesValid.value && !team.busy);

function addLine(): void {
  const used = new Set(lines.value.map((line) => line.jobTypeId));
  const next = jobTypes.value.find((jobType) => !used.has(jobType.id));
  lines.value = [...lines.value, { jobTypeId: next?.id ?? '', quantity: 1 }];
}

function removeLine(index: number): void {
  lines.value = lines.value.filter((_, itemIndex) => itemIndex !== index);
}

async function loadCatalog(): Promise<void> {
  if (jobTypes.value.length) return;
  try {
    const result = await get<{ items: Array<{ id: string; label: string }> }>('/_user/job-types');
    jobTypes.value = result.items ?? [];
    if (!lines.value[0].jobTypeId && jobTypes.value.length) lines.value[0].jobTypeId = jobTypes.value[0].id;
  } catch (caught) {
    formError.value = errorMessage(caught);
  }
}

async function openComposer(): Promise<void> {
  await loadCatalog();
  composerOpen.value = true;
  formError.value = null;
}

function resetComposer(): void {
  lines.value = [{ jobTypeId: jobTypes.value[0]?.id ?? '', quantity: 1 }];
  reason.value = '';
  note.value = '';
  formError.value = null;
  composerOpen.value = false;
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  formError.value = null;
  try {
    await team.createSupportRequest(props.missionId, {
      items: lines.value.map((line) => ({ jobTypeId: line.jobTypeId, quantity: line.quantity })),
      reason: reason.value.trim(),
      ...(note.value.trim() ? { note: note.value.trim() } : {})
    });
    resetComposer();
    toast.push('درخواست نیرو ثبت شد؛ مدیر بررسی می‌کند.', 'success', 2800);
  } catch (caught) {
    formError.value = errorMessage(caught);
  }
}

async function cancelRequest(request: SupportRequestView): Promise<void> {
  if (pendingCancelId.value !== request.id) {
    pendingCancelId.value = request.id;
    return;
  }
  pendingCancelId.value = null;
  try {
    await team.cancelSupportRequest(props.missionId, request.id);
    toast.push('درخواست لغو شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 4000);
  }
}

function requestTone(status: string): string {
  if (status === SUPPORT_REQUEST_STATUS.APPROVED || status === SUPPORT_REQUEST_STATUS.PARTIALLY_APPROVED) return 'status-pill status-pill--success';
  if (status === SUPPORT_REQUEST_STATUS.PENDING) return 'status-pill status-pill--warning';
  return 'status-pill status-pill--neutral';
}

async function reload(): Promise<void> {
  await Promise.all([team.loadTeam(props.missionId), team.loadRequests(props.missionId)]);
}

watch(() => props.missionId, () => void reload());
onMounted(() => void reload());
</script>

<template>
  <div class="support-requests" data-testid="support-request-panel">
    <div class="support-requests__head">
      <strong>درخواست نیروی کمکی</strong>
      <button v-if="isLeader && !composerOpen" type="button" class="ghost-button" data-testid="open-support-composer" @click="openComposer">
        <span class="mdi mdi-account-multiple-check-outline" aria-hidden="true" />
        <span>درخواست نیرو</span>
      </button>
    </div>

    <!-- Composer (leader only) -->
    <form v-if="isLeader && composerOpen" class="support-composer" data-testid="support-composer" @submit.prevent="submit">
      <div v-for="(line, index) in lines" :key="index" class="team-editor__line">
        <select v-model="line.jobTypeId" :aria-label="`نوع شغل خط ${index + 1}`" data-testid="support-line-jobtype">
          <option value="">انتخاب…</option>
          <option v-for="jobType in jobTypes" :key="jobType.id" :value="jobType.id">{{ jobType.label }}</option>
        </select>
        <input v-model.number="line.quantity" type="number" min="1" max="20" inputmode="numeric" :aria-label="`تعداد خط ${index + 1}`" data-testid="support-line-quantity" />
        <button type="button" class="admin-action" :aria-label="`حذف خط ${index + 1}`" :disabled="lines.length === 1" @click="removeLine(index)">
          <span class="mdi mdi-close-circle-outline" aria-hidden="true" />
        </button>
      </div>
      <button v-if="lines.length < 10" type="button" class="ghost-button support-composer__add" @click="addLine">
        <span class="mdi mdi-plus" aria-hidden="true" />
        <span>خط تازه</span>
      </button>
      <label class="team-add__field">
        <span>دلیل درخواست (حداقل ۱۰ نویسه)</span>
        <textarea v-model="reason" rows="2" required minlength="10" maxlength="300" data-testid="support-reason" placeholder="چرا به نیرو نیاز دارید…" />
      </label>
      <label class="team-add__field">
        <span>یادداشت برای مدیر (اختیاری)</span>
        <textarea v-model="note" rows="1" maxlength="200" data-testid="support-note" placeholder="توضیح کوتاه…" />
      </label>
      <p v-if="formError" class="team-panel__error" role="alert">{{ formError }}</p>
      <div class="action-row">
        <button type="submit" class="primary-button" :disabled="!canSubmit" data-testid="submit-support-request">
          <span :class="['mdi', team.busy ? 'mdi-loading is-spinning' : 'mdi-send']" aria-hidden="true" />
          <span>{{ team.busy ? 'در حال ثبت…' : 'ثبت درخواست' }}</span>
        </button>
        <button type="button" class="ghost-button" @click="resetComposer">انصراف</button>
      </div>
    </form>

    <!-- Request list -->
    <ul v-if="sortedRequests.length" class="support-list" data-testid="support-request-list">
      <li v-for="request in sortedRequests" :key="request.id" class="support-item" :data-testid="`support-request-${request.id}`">
        <div class="support-item__head">
          <span :class="requestTone(request.status)">{{ SUPPORT_REQUEST_STATUS_LABELS[request.status] ?? request.status }}</span>
          <small>{{ format.dateTime(request.createdAt) }}</small>
        </div>
        <p class="support-item__reason">{{ request.reason }}</p>
        <ul class="support-item__lines">
          <li v-for="line in request.items" :key="line.jobTypeId">
            {{ line.jobTypeLabel }} × {{ format.number(line.quantity) }}
            <span v-if="line.approvedQuantity" class="support-item__approved">(تأیید {{ format.number(line.approvedQuantity) }})</span>
          </li>
        </ul>
        <p v-if="request.adminNote" class="support-item__note"><span class="mdi mdi-shield-account-outline" aria-hidden="true" /> پاسخ مدیر: {{ request.adminNote }}</p>
        <div v-if="isLeader && request.status === SUPPORT_REQUEST_STATUS.PENDING" class="action-row">
          <button type="button" class="danger-button" :data-testid="`cancel-support-${request.id}`" @click="cancelRequest(request)">
            <span class="mdi mdi-close-circle" aria-hidden="true" />
            <span>{{ pendingCancelId === request.id ? 'تأیید لغو درخواست' : 'لغو درخواست' }}</span>
          </button>
        </div>
      </li>
    </ul>
    <p v-else-if="!isLeader" class="team-panel__hint">درخواست نیروی ثبت‌شده‌ای برای این مأموریت نیست.</p>
  </div>
</template>
