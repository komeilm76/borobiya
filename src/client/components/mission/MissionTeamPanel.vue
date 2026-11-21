<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMissionTeamStore } from '@/stores/missionTeam.ts';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage, get } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import { MISSION_MEMBER_ROLE_LABELS } from '@/utils/status.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { HTTP_EVENTS } from '@shared/protocol.ts';
import type { AdminJobTypeView, AdminUserView, MissionMemberView, MissionRequirementView, MissionTeamView } from '@/api/types.ts';

/**
 * Mission team panel. Renders the shared roster (leader, members, required composition)
 * for the mission on screen. Administrators additionally get roster management:
 * add/remove members, leader designation and the requirements editor.
 */
const props = withDefaults(defineProps<{ missionId: string; admin?: boolean }>(), { admin: false });

const team = useMissionTeamStore();
const adminStore = useAdminStore();
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

/** The store holds whatever the server returned; treat a shapeless 200 as "not ready" instead of crashing. */
const project = computed(() => {
  const value = team.team as (MissionTeamView & { members?: MissionMemberView[]; requirements?: MissionRequirementView[] }) | null;
  if (!value || !Array.isArray(value.members) || !Array.isArray(value.requirements)) return null;
  return value;
});
const activeMembers = computed(() => (project.value?.members ?? []).filter((member) => member.assignmentStatus === 'active'));
const removedMembers = computed(() => (project.value?.members ?? []).filter((member) => member.assignmentStatus === 'removed'));

const SOURCE_LABELS: Record<string, string> = {
  legacy_backfill: 'عضویت گذشته',
  offer_accept: 'پذیرش پیشنهاد',
  immediate_dispatch: 'اعزام فوری',
  admin_assignment: 'تعیین مدیر',
  support_request: 'درخواست نیرو',
  team_dispatch: 'اعزام تیمی'
};
const sourceLabel = (value: string): string => SOURCE_LABELS[value] ?? value;

async function reload(): Promise<void> {
  await team.loadTeam(props.missionId, props.admin);
}

/* ---------- administrator: add members ---------- */
const pickQuery = ref('');
const pickResults = ref<AdminUserView[]>([]);
const pickBusy = ref(false);
let pickSequence = 0;

async function searchPick(): Promise<void> {
  const query = pickQuery.value.trim();
  if (query.length < 2) {
    pickResults.value = [];
    return;
  }
  const sequence = ++pickSequence;
  pickBusy.value = true;
  try {
    const result = await get<{ items: AdminUserView[] }>('/_admin/users', { q: query, role: 'responder', active: true, limit: 6 });
    if (sequence === pickSequence) pickResults.value = result.items ?? [];
  } catch {
    if (sequence === pickSequence) pickResults.value = [];
  } finally {
    if (sequence === pickSequence) pickBusy.value = false;
  }
}

async function addPicked(user: AdminUserView): Promise<void> {
  try {
    await team.addMembers(props.missionId, [user.id]);
    pickResults.value = pickResults.value.filter((item) => item.id !== user.id);
    toast.push(`${user.username} به مأموریت اضافه شد.`, 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 4000);
    await reload();
  }
}

/* ---------- administrator: remove member / designate leader (two-step confirm) ---------- */
const pendingRemoveId = ref<string | null>(null);
const pendingLeaderId = ref<string | null>(null);

async function confirmRemove(member: MissionMemberView): Promise<void> {
  if (pendingRemoveId.value !== member.userId) {
    pendingRemoveId.value = member.userId;
    pendingLeaderId.value = null;
    return;
  }
  pendingRemoveId.value = null;
  try {
    await team.removeMember(props.missionId, member.userId, 'removal_by_admin');
    toast.push(`${member.username} از مأموریت حذف شد.`, 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 4000);
    await reload();
  }
}

async function confirmDesignate(member: MissionMemberView): Promise<void> {
  if (pendingLeaderId.value !== member.userId) {
    pendingLeaderId.value = member.userId;
    pendingRemoveId.value = null;
    return;
  }
  pendingLeaderId.value = null;
  try {
    await team.designateLeader(props.missionId, member.userId);
    toast.push(`${member.username} سرپرست مأموریت شد.`, 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 4000);
    await reload();
  }
}

/* ---------- administrator: requirements editor ---------- */
const editorOpen = ref(false);
const draftLines = ref<Array<{ jobTypeId: string; quantity: number }>>([]);
const jobTypes = ref<AdminJobTypeView[]>([]);
const savingRequirements = ref(false);

const jobTypeOptions = computed(() => jobTypes.value.filter((jobType) => jobType.active).map((jobType) => ({ title: jobType.label, value: jobType.id })));
const requirementsValid = computed(() => {
  const lines = draftLines.value;
  if (lines.length > 10) return false;
  const ids = new Set<string>();
  for (const line of lines) {
    if (!line.jobTypeId || ids.has(line.jobTypeId)) return false;
    ids.add(line.jobTypeId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return false;
  }
  return true;
});

async function openEditor(): Promise<void> {
  if (!jobTypes.value.length) {
    try {
      jobTypes.value = await adminStore.loadJobTypes();
    } catch (caught) {
      toast.push(errorMessage(caught), 'error', 4000);
      return;
    }
  }
  draftLines.value = (project.value?.requirements ?? []).map((line) => ({ jobTypeId: line.jobTypeId, quantity: line.quantity }));
  if (!draftLines.value.length) draftLines.value = [{ jobTypeId: jobTypeOptions.value[0]?.value ?? '', quantity: 1 }];
  editorOpen.value = true;
  pendingRemoveId.value = null;
  pendingLeaderId.value = null;
}

function addLine(): void {
  const used = new Set(draftLines.value.map((line) => line.jobTypeId));
  const next = jobTypeOptions.value.find((option) => !used.has(String(option.value)));
  draftLines.value = [...draftLines.value, { jobTypeId: next ? String(next.value) : '', quantity: 1 }];
}

function removeLine(index: number): void {
  draftLines.value = draftLines.value.filter((_, itemIndex) => itemIndex !== index);
}

async function saveRequirements(): Promise<void> {
  if (!requirementsValid.value || savingRequirements.value) return;
  savingRequirements.value = true;
  try {
    await team.setRequirements(props.missionId, draftLines.value);
    editorOpen.value = false;
    toast.push('ترکیب مورد نیاز ذخیره شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 4000);
    await reload();
  } finally {
    savingRequirements.value = false;
  }
}

watch(() => props.missionId, () => {
  pendingRemoveId.value = null;
  pendingLeaderId.value = null;
  editorOpen.value = false;
  void reload();
});

onMounted(() => void reload());
</script>

<template>
  <div class="team-panel" data-testid="mission-team-panel">
    <div class="team-panel__head">
      <strong>تیم مأموریت</strong>
      <div class="team-panel__meta">
        <span v-if="project" class="status-pill status-pill--neutral">{{ format.number(project.memberCount) }} عضو</span>
        <span v-if="project && project.pendingSupportRequestCount" class="status-pill status-pill--warning" data-testid="team-panel-pending">
          {{ format.number(project.pendingSupportRequestCount) }} درخواست نیرو در انتظار
        </span>
        <button v-if="admin && project && !editorOpen" type="button" class="ghost-button team-panel__edit" data-testid="open-requirements-editor" @click="openEditor">
          <span class="mdi mdi-pencil-outline" aria-hidden="true" />
          <span>ترکیب مورد نیاز</span>
        </button>
      </div>
    </div>

    <p v-if="team.error" class="team-panel__error" role="alert">{{ team.error }}</p>
    <p v-else-if="!project && team.loading" class="team-panel__hint"><span class="mdi mdi-loading is-spinning" aria-hidden="true" /> بارگذاری تیم…</p>

    <template v-else-if="project">
      <!-- Required composition -->
      <ul v-if="project.requirements.length" class="team-requirements" data-testid="team-requirements">
        <li v-for="line in project.requirements" :key="line.jobTypeId" class="team-requirement" :class="{ 'is-filled': line.filled >= line.quantity }">
          <span :class="['mdi', line.filled >= line.quantity ? 'mdi-check-circle-outline' : 'mdi-circle-outline']" aria-hidden="true" />
          <span>{{ line.jobTypeLabel }}</span>
          <b>{{ format.number(line.filled) }} از {{ format.number(line.quantity) }}</b>
        </li>
      </ul>
      <p v-else-if="admin" class="team-panel__hint">ترکیب مورد نیازی ثبت نشده است. برای مأموریت تیمی، حداقل یک نوع شغل تعیین کنید.</p>

      <!-- Requirements editor (admin) -->
      <div v-if="editorOpen && admin" class="team-editor" data-testid="requirements-editor">
        <strong>ترکیب مورد نیاز</strong>
        <div v-for="(line, index) in draftLines" :key="index" class="team-editor__line">
          <select v-model="line.jobTypeId" :aria-label="`نوع شغل خط ${index + 1}`">
            <option value="">انتخاب…</option>
            <option v-for="option in jobTypeOptions" :key="option.value" :value="option.value">{{ option.title }}</option>
          </select>
          <input v-model.number="line.quantity" type="number" min="1" max="20" inputmode="numeric" :aria-label="`تعداد خط ${index + 1}`" />
          <button type="button" class="admin-action" :aria-label="`حذف خط ${index + 1}`" @click="removeLine(index)">
            <span class="mdi mdi-close-circle-outline" aria-hidden="true" />
          </button>
        </div>
        <p v-if="!requirementsValid" class="team-panel__error" role="alert">هر خط باید یک نوع شغل یکتا و تعداد حداقل ۱ داشته باشد.</p>
        <div class="action-row">
          <button type="button" class="primary-button" :disabled="!requirementsValid || savingRequirements" data-testid="save-requirements" @click="saveRequirements">
            <span :class="['mdi', savingRequirements ? 'mdi-loading is-spinning' : 'mdi-check']" aria-hidden="true" />
            <span>{{ savingRequirements ? 'در حال ذخیره…' : 'ذخیره ترکیب' }}</span>
          </button>
          <button type="button" class="ghost-button" @click="editorOpen = false">انصراف</button>
          <button type="button" class="ghost-button" :disabled="draftLines.length >= 10" @click="addLine">
            <span class="mdi mdi-plus" aria-hidden="true" />
            <span>خط تازه</span>
          </button>
        </div>
      </div>

      <!-- Roster -->
      <ul class="team-members" data-testid="team-members">
        <li v-for="member in activeMembers" :key="member.userId" class="team-member" :class="{ 'is-leader': member.role === 'leader' }">
          <span :class="['mdi', member.role === 'leader' ? 'mdi-account-tie' : 'mdi-account']" class="team-member__icon" aria-hidden="true" />
          <div class="team-member__body">
            <strong>
              {{ member.username }}
              <span v-if="member.role === 'leader'" class="team-member__leader">{{ MISSION_MEMBER_ROLE_LABELS.leader }}</span>
            </strong>
            <small>{{ member.jobTypeLabel ?? 'بدون نوع شغل' }} · {{ sourceLabel(member.assignmentSource) }}</small>
          </div>
          <span :class="['status-pill', member.readyForMission ? 'status-pill--success' : 'status-pill--neutral']">
            {{ member.readyForMission ? 'آماده' : 'مشغول' }}
          </span>
          <template v-if="admin">
            <button
              v-if="member.role !== 'leader'"
              type="button"
              class="admin-action"
              :data-testid="`designate-leader-${member.userId}`"
              @click="confirmDesignate(member)"
            >{{ pendingLeaderId === member.userId ? 'تأیید سرپرستی' : 'سرپرست کن' }}</button>
            <button
              v-if="member.role !== 'leader'"
              type="button"
              class="admin-action admin-action--danger"
              :data-testid="`remove-member-${member.userId}`"
              @click="confirmRemove(member)"
            >{{ pendingRemoveId === member.userId ? 'تأیید حذف' : 'حذف' }}</button>
          </template>
        </li>
      </ul>
      <p v-if="!activeMembers.length" class="panel__empty">هنوز عضویت فعالی ثبت نشده است.</p>

      <!-- Removed members, kept visible for transparency (admins also see the reason) -->
      <details v-if="removedMembers.length" class="team-removed" data-testid="team-removed">
        <summary>{{ format.number(removedMembers.length) }} عضو حذف‌شده</summary>
        <ul>
          <li v-for="member in removedMembers" :key="member.userId">
            <span>{{ member.username }}</span>
            <small>{{ member.jobTypeLabel ?? 'بدون نوع شغل' }}<template v-if="admin && member.removalReason"> · {{ member.removalReason }}</template></small>
          </li>
        </ul>
      </details>

      <!-- Admin: add members by username search -->
      <div v-if="admin" class="team-add" data-testid="team-add-members">
        <label class="team-add__field">
          <span>افزودن امدادگر (جست‌وجوی نام کاربری)</span>
          <span class="team-add__row">
            <span class="mdi mdi-magnify" aria-hidden="true" />
            <input v-model="pickQuery" type="text" placeholder="مثلاً saeed…" autocomplete="off" data-testid="team-add-search" @input="searchPick" />
          </span>
        </label>
        <p v-if="pickBusy" class="team-panel__hint"><span class="mdi mdi-loading is-spinning" aria-hidden="true" /> در حال جست‌وجو…</p>
        <ul v-else-if="pickResults.length" class="team-add__results">
          <li v-for="user in pickResults" :key="user.id">
            <span>
              <strong>{{ user.username }}</strong>
              <small>{{ user.jobTypeLabel ?? 'بدون نوع شغل' }} · {{ user.readyForMission ? 'آماده' : 'مشغول' }}</small>
            </span>
            <button type="button" class="admin-action" :data-testid="`add-member-${user.id}`" @click="addPicked(user)">افزودن</button>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
