<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { VAlert, VBtn, VTextField, VSelect } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import { groupStatusLabel } from '@/utils/status.ts';
import type { GroupView } from '@/api/types.ts';

/**
 * Service group management: create, edit, and membership.
 * Dispatch requires named members of an active group, so the roster has to be manageable here —
 * both the edit surface (name/color/capacity/status/coverage) and the member add/remove panel.
 */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const draft = ref({ name: '', color: '#0E6666', capacity: 12 as number | string });
const formError = ref<string | null>(null);
const groups = computed(() => admin.groups);

/** Which panel is open under which group, if any. */
const openPanel = ref<{ id: string; panel: 'edit' | 'members' } | null>(null);
const editDraft = ref({ name: '', color: '#0E6666', capacity: 12 as number | string, status: 'active', incidentIds: [] as string[] });
const editError = ref<string | null>(null);
const editBusy = ref(false);
const memberQuery = ref('');
const memberBusy = ref(false);
const pendingRemove = ref<string | null>(null);

const openGroupId = computed(() => openPanel.value?.id ?? null);
const openEdit = computed(() => openPanel.value?.panel === 'edit');
const members = computed(() => (openGroupId.value ? (admin.groupMembers[openGroupId.value] ?? []) : []));
const memberIdSet = computed(() => new Set(members.value.map((member) => member.userId)));
/** Responder candidates matching the roster search — current roster members are excluded. */
const candidates = computed(() =>
  (admin.users?.items ?? [])
    .filter((user) => user.role !== 'user' && !memberIdSet.value.has(user.id))
    .slice(0, 6)
);

/**
 * Checks the draft against the rules the server applies.
 * @returns The message to show, or null when the draft would be accepted.
 */
function draftIssue(): string | null {
  const name = draft.value.name.trim();
  if (name.length < 2) return 'نام گروه باید دست‌کم ۲ نویسه باشد.';
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.value.color)) return 'رنگ باید در قالب #RRGGBB باشد.';
  const capacity = Number(draft.value.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return 'ظرفیت باید عددی میان ۱ و ۵۰۰ باشد.';
  if (!admin.incidentTypes.length) return 'نوع حادثه‌ای در دسترس نیست؛ بی‌آن‌که گروه پوششی داشته باشد ساخته نمی‌شود.';
  return null;
}

/** Validates the edit draft against the same server rules (the payload requires ≥1 incident). */
function editIssue(): string | null {
  const name = editDraft.value.name.trim();
  if (name.length < 2) return 'نام گروه باید دست‌کم ۲ نویسه باشد.';
  if (!/^#[0-9a-fA-F]{6}$/.test(editDraft.value.color)) return 'رنگ باید در قالب #RRGGBB باشد.';
  const capacity = Number(editDraft.value.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return 'ظرفیت باید عددی میان ۱ و ۵۰۰ باشد.';
  if (!editDraft.value.incidentIds.length) return 'گروه باید دست‌کم یک نوع حادثه را پوشش دهد.';
  return null;
}

async function create(): Promise<void> {
  formError.value = null;
  const issue = draftIssue();
  if (issue) {
    formError.value = issue;
    return;
  }
  try {
    await admin.createGroup({
      name: draft.value.name.trim(),
      color: draft.value.color,
      capacity: Number(draft.value.capacity),
      incidentIds: admin.incidentTypes.slice(0, 1).map((item) => item.id),
      status: 'active'
    });
    draft.value = { name: '', color: '#0E6666', capacity: 12 };
    toast.push('گروه ساخته شد.', 'success', 2400);
  } catch (caught) {
    formError.value = errorMessage(caught);
  }
}

function closePanel(): void {
  openPanel.value = null;
  pendingRemove.value = null;
  memberQuery.value = '';
}

/** Opens/closes the inline edit panel, pre-filling from the row. */
function toggleEdit(group: GroupView): void {
  if (openPanel.value?.id === group.id && openPanel.value.panel === 'edit') {
    closePanel();
    return;
  }
  editDraft.value = {
    name: group.name,
    color: group.color,
    capacity: group.capacity,
    status: group.status,
    incidentIds: [...group.incidentIds]
  };
  editError.value = null;
  openPanel.value = { id: group.id, panel: 'edit' };
}

/** Opens/closes the members panel and (re)loads the roster. */
function toggleMembers(group: GroupView): void {
  if (openPanel.value?.id === group.id && openPanel.value.panel === 'members') {
    closePanel();
    return;
  }
  memberQuery.value = '';
  pendingRemove.value = null;
  openPanel.value = { id: group.id, panel: 'members' };
  void admin.loadGroupMembers(group.id);
}

async function saveEdit(group: GroupView): Promise<void> {
  editError.value = null;
  const issue = editIssue();
  if (issue) {
    editError.value = issue;
    return;
  }
  editBusy.value = true;
  try {
    await admin.updateGroup(group.id, {
      name: editDraft.value.name.trim(),
      color: editDraft.value.color,
      capacity: Number(editDraft.value.capacity),
      status: editDraft.value.status,
      incidentIds: [...editDraft.value.incidentIds]
    });
    toast.push('گروه به‌روزرسانی شد.', 'success', 2400);
    closePanel();
  } catch (caught) {
    editError.value = errorMessage(caught);
  } finally {
    editBusy.value = false;
  }
}

function toggleCoverage(id: string): void {
  editDraft.value.incidentIds = editDraft.value.incidentIds.includes(id)
    ? editDraft.value.incidentIds.filter((item) => item !== id)
    : [...editDraft.value.incidentIds, id];
}

watch(memberQuery, async (value) => {
  const q = value.trim();
  if (q.length < 2) return;
  memberBusy.value = true;
  try {
    await admin.loadUsers({ q, limit: 20 });
  } finally {
    memberBusy.value = false;
  }
});

async function addMember(userId: string): Promise<void> {
  if (!openGroupId.value) return;
  memberBusy.value = true;
  try {
    await admin.addGroupMember(openGroupId.value, userId, 'member');
    memberQuery.value = '';
    toast.push('عضو به گروه افزوده شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3200);
  } finally {
    memberBusy.value = false;
  }
}

async function removeMember(userId: string): Promise<void> {
  if (!openGroupId.value) return;
  if (pendingRemove.value !== userId) {
    pendingRemove.value = userId;
    return;
  }
  memberBusy.value = true;
  try {
    await admin.removeGroupMember(openGroupId.value, userId);
    pendingRemove.value = null;
    toast.push('عضو از گروه حذف شد.', 'info', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3200);
  } finally {
    memberBusy.value = false;
  }
}

onMounted(async () => {
  await Promise.all([admin.loadGroups(), admin.loadIncidentTypes()]);
});
</script>

<template>
  <section class="admin-page" data-testid="admin-groups">
    <article class="panel">
      <header class="panel__head"><h2>گروه‌های امداد</h2></header>
      <ul class="admin-list">
        <li v-for="group in groups" :key="group.id" class="group-item">
          <div class="group-item__row">
            <i class="group-dot" :style="{ background: group.color }" />
            <div>
              <strong>{{ group.name }}</strong>
              <small>ظرفیت {{ format.number(group.capacity) }} · {{ groupStatusLabel(group.status) }} · پوشش {{ format.number(group.coverageCount) }} نوع</small>
            </div>
            <span class="status-pill status-pill--neutral">{{ format.number(group.memberCount) }} عضو</span>
            <button type="button" class="group-toggle" :aria-expanded="openPanel?.id === group.id && openPanel.panel === 'edit'" :data-testid="`group-edit-${group.id}`" :aria-label="`ویرایش ${group.name}`" @click="toggleEdit(group)">
              <span class="mdi mdi-pencil-outline" aria-hidden="true" />
            </button>
            <button type="button" class="group-toggle" :aria-expanded="openPanel?.id === group.id && openPanel.panel === 'members'" :data-testid="`group-members-${group.id}`" :aria-label="`اعضای ${group.name}`" @click="toggleMembers(group)">
              <span class="mdi mdi-account-group-outline" aria-hidden="true" />
            </button>
          </div>

          <form v-if="openPanel?.id === group.id && openEdit" class="group-edit" :data-testid="`group-edit-form-${group.id}`" @submit.prevent="saveEdit(group)">
            <VTextField v-model="editDraft.name" label="نام گروه" density="compact" :disabled="editBusy" />
            <div class="group-edit__line">
              <VTextField v-model="editDraft.color" label="رنگ (#RRGGBB)" density="compact" :disabled="editBusy" />
              <VTextField v-model.number="editDraft.capacity" label="ظرفیت" type="number" density="compact" :disabled="editBusy" />
              <VSelect v-model="editDraft.status" :items="[{ title: 'فعال', value: 'active' }, { title: 'متوقف', value: 'paused' }]" label="وضعیت" density="compact" :disabled="editBusy" />
            </div>
            <fieldset class="group-edit__coverage">
              <legend>پوشش نوع حادثه</legend>
              <label v-for="item in admin.incidentTypes" :key="item.id" class="group-edit__chip">
                <input type="checkbox" :checked="editDraft.incidentIds.includes(item.id)" :disabled="editBusy" @change="toggleCoverage(item.id)" />
                <span>{{ item.label }}</span>
              </label>
            </fieldset>
            <VAlert v-if="editError" type="error" variant="tonal" density="compact">{{ editError }}</VAlert>
            <div class="group-edit__actions">
              <VBtn type="submit" color="primary" :loading="editBusy">ذخیرهٔ تغییرات</VBtn>
              <VBtn type="button" variant="text" :disabled="editBusy" @click="closePanel">انصراف</VBtn>
            </div>
          </form>

          <div v-else-if="openPanel?.id === group.id && !openEdit" class="group-members" :data-testid="`group-members-panel-${group.id}`">
            <p class="group-members__title">اعضای گروه {{ group.name }}</p>
            <ul class="group-members__list">
              <li v-for="member in members" :key="member.userId" class="group-member" :data-testid="`group-member-${member.userId}`">
                <span class="group-member__dot" :class="{ 'is-online': member.online }" aria-hidden="true" />
                <div class="group-member__info">
                  <strong>{{ member.username }}</strong>
                  <small>{{ member.jobTypeLabel ?? 'بدون تخصص' }} · امتیاز {{ format.number(member.averageRating) }}</small>
                </div>
                <span class="status-pill" :class="member.membership === 'leader' ? 'status-pill--success' : 'status-pill--neutral'">{{ member.membership === 'leader' ? 'سرگروه' : 'عضو' }}</span>
                <button type="button" class="group-member__remove" :class="{ 'is-confirm': pendingRemove === member.userId }" :disabled="memberBusy" :data-testid="`group-member-remove-${member.userId}`" :aria-label="`حذف ${member.username}`" @click="removeMember(member.userId)">
                  <span class="mdi" :class="pendingRemove === member.userId ? 'mdi-check' : 'mdi-account-cancel-outline'" aria-hidden="true" />
                  <span>{{ pendingRemove === member.userId ? 'حذف قطعی' : 'حذف' }}</span>
                </button>
              </li>
              <li v-if="!members.length" class="panel__empty">عضوی در این گروه نیست.</li>
            </ul>
            <label class="group-members__search">
              <span class="mdi mdi-magnify" aria-hidden="true" />
              <input v-model="memberQuery" type="text" placeholder="افزودن عضو با جست‌وجوی نام کاربری…" :aria-label="`افزودن عضو به ${group.name}`" data-testid="group-member-search" />
            </label>
            <ul v-if="candidates.length && memberQuery.trim().length >= 2" class="group-members__candidates">
              <li v-for="candidate in candidates" :key="candidate.id">
                <span>{{ candidate.username }}</span>
                <small>{{ candidate.jobTypeLabel ?? '—' }}</small>
                <button type="button" class="group-member__add" :disabled="memberBusy" :data-testid="`group-member-add-${candidate.id}`" @click="addMember(candidate.id)">افزودن</button>
              </li>
            </ul>
          </div>
        </li>
      </ul>
      <p v-if="!groups.length" class="panel__empty">گروهی تعریف نشده است.</p>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>گروه تازه</h2></header>
      <form class="stack-form" @submit.prevent="create">
        <VTextField v-model="draft.name" label="نام گروه" density="compact" />
        <VTextField v-model="draft.color" label="رنگ (#RRGGBB)" density="compact" />
        <VTextField v-model.number="draft.capacity" label="ظرفیت" type="number" density="compact" />
        <VAlert v-if="formError" type="error" variant="tonal" density="compact">{{ formError }}</VAlert>
        <VBtn type="submit" color="primary" block>ساخت گروه</VBtn>
      </form>
    </article>
  </section>
</template>

<style scoped>
.group-item { flex-wrap: wrap; }
.group-item__row { display: flex; align-items: center; gap: 10px; flex: 1 1 100%; min-width: 0; }
.group-toggle { display: inline-flex; align-items: center; justify-content: center; inline-size: 36px; block-size: 36px; border-radius: var(--r11); border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: color .15s, border-color .15s; }
.group-toggle:hover { color: var(--primary); border-color: var(--primary); }
.group-edit { flex: 1 1 100%; display: grid; gap: 10px; padding: 12px; border: 1px dashed var(--border); border-radius: var(--r12); }
.group-edit__line { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.group-edit__coverage { display: flex; flex-wrap: wrap; gap: 8px; border: 0; padding: 0; margin: 0; }
.group-edit__coverage legend { font-size: 11px; color: var(--muted); padding-inline-end: 8px; }
.group-edit__chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; font-size: 11px; cursor: pointer; }
.group-edit__actions { display: flex; gap: 8px; }
.group-members { flex: 1 1 100%; display: grid; gap: 8px; padding: 12px; border: 1px dashed var(--border); border-radius: var(--r12); }
.group-members__title { margin: 0; font-size: 12px; font-weight: 700; color: var(--muted); }
.group-members__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.group-member { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--row-line); border-radius: var(--r11); }
.group-member__dot { inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
.group-member__dot.is-online { background: var(--success); }
.group-member__info { flex: 1; min-width: 0; }
.group-member__info strong { font-size: 12px; }
.group-member__info small { font-size: 10.5px; color: var(--muted); display: block; }
.group-member__remove { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); border: 1px solid transparent; background: transparent; padding: 4px 8px; border-radius: var(--r8); cursor: pointer; }
.group-member__remove:hover { color: var(--danger); border-color: rgba(175,52,56,.35); }
.group-member__remove.is-confirm { color: var(--on-accent); background: var(--danger); border-color: transparent; }
.group-members__search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--r8); padding: 6px 10px; background: var(--surface); }
.group-members__search input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; font: inherit; color: inherit; }
.group-members__search .mdi { color: var(--muted); }
.group-members__candidates { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.group-members__candidates li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--row-line); border-radius: var(--r11); font-size: 12px; }
.group-members__candidates small { color: var(--muted); flex: 1; }
.group-member__add { font-size: 11px; font-weight: 700; color: var(--on-accent); background: var(--primary); border: 0; border-radius: var(--r8); padding: 5px 12px; cursor: pointer; }
.group-members__search:focus-within { border-color: var(--primary); }
@media (max-width: 720px) {
  .group-edit__line { grid-template-columns: 1fr; }
  .group-item__row { flex-wrap: wrap; }
}
</style>
