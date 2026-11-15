<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { VAlert, VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import AdminInlineError from '@/components/AdminInlineError.vue';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import { passwordIssue, passwordIssueMessage } from '@/composables/usePasswordPolicy.ts';

/**
 * User administration: search, role filter, activation toggle, account creation and a per-account
 * detail panel — profile, membership (the groups whose `memberIds` contain the account), live
 * sessions, login history and the danger zone (deactivation revokes every session immediately,
 * which is what the footer note promises).
 */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const query = ref('');
const role = ref<string>('');
/** The account id whose detail panel is open, if any. */
const panelUserId = ref<string | null>(null);
const panelBusy = ref(false);
const editMode = ref(false);
const editDraft = ref({ role: 'user', jobTypeId: '' });
const editError = ref<string | null>(null);
/** Deactivation is the only destructive path here; it takes a deliberate second press. */
const deactivateArmed = ref(false);
const closeButton = ref<HTMLButtonElement | null>(null);
const draft = ref({ username: '', password: '', role: 'user', jobTypeId: '' });
const jobTypes = ref<{ id: string; label: string; offerPolicy: string }[]>([]);
const DEFAULT_JOB_TYPES = [
  // Shown until the job-types catalog loads; ids match the seed so the default is valid.
  { id: 'job_fire', label: 'آتش‌نشانی', offerPolicy: 'all' },
  { id: 'job_medical', label: 'امداد پزشکی', offerPolicy: 'all' },
  { id: 'job_maintenance', label: 'خدمات فنی و تأسیسات', offerPolicy: 'ready_only' }
];
const policyLabel = (value: string): string => (value === 'all' ? 'بدون شرط آمادگی' : 'فقط آماده‌ها');
const formError = ref<string | null>(null);
const users = computed(() => admin.users?.items ?? []);
const ROLE_LABEL: Record<string, string> = { user: 'کاربر', responder: 'امدادگر', admin: 'مدیر' };
const roleLabel = (value: string): string => ROLE_LABEL[value] ?? value;
const initials = (username: string): string => (username || '؟').replace(/^([A-Za-z0-9_])([A-Za-z0-9_])?.*$/, '$1$2').toUpperCase();
const roles = [
  { title: 'همه نقش‌ها', value: '' },
  { title: 'کاربر', value: 'user' },
  { title: 'امدادگر', value: 'responder' },
  { title: 'مدیر', value: 'admin' }
];

/** True when a search or role filter is narrowing the roster — the empty state then talks about the filter, not the (possibly large) user base. */
const filtersActive = computed(() => query.value.trim().length > 0 || role.value !== '');

async function clearFilters(): Promise<void> {
  query.value = '';
  role.value = '';
  await search();
}

async function search(): Promise<void> {
  await admin.loadUsers({ q: query.value || undefined, role: role.value || undefined, page: 1, limit: 50 });
}

const jobTypeOptions = computed(() => (jobTypes.value.length ? jobTypes.value : DEFAULT_JOB_TYPES));

async function loadJobTypes(): Promise<void> {
  // The store falls back to an empty list on failure; jobTypeOptions falls back to the seeded catalog.
  jobTypes.value = await admin.loadJobTypes();
}

async function changeJobType(userId: string, jobTypeId: string): Promise<void> {
  try {
    await admin.updateUser(userId, { jobTypeId: jobTypeId || null });
    toast.push('نوع شغل امدادگر به‌روزرسانی شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

async function toggle(userId: string, active: boolean): Promise<void> {
  try {
    await admin.updateUser(userId, { active });
    toast.push(active ? 'حساب فعال شد.' : 'حساب غیرفعال شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

async function create(): Promise<void> {
  formError.value = null;
  // The administrator sets the account's first password, and the server applies the same 12-128
  // rule to it; rejecting here names the rule instead of returning "Invalid request.".
  const weak = passwordIssueMessage(passwordIssue(draft.value.password));
  if (weak) {
    formError.value = weak;
    return;
  }
  try {
    const { jobTypeId, ...rest } = draft.value;
    await admin.createUser({ ...rest, ...(jobTypeId ? { jobTypeId } : {}), username: draft.value.username.trim().toLowerCase() });
    draft.value = { username: '', password: '', role: 'user', jobTypeId: '' };
    toast.push('حساب ساخته شد؛ کاربر باید پرسش‌های امنیتی را کامل کند.', 'success', 3200);
  } catch (caught) {
    formError.value = errorMessage(caught);
  }
}

/** Opens the detail panel for one account and fetches its payload. */
async function openPanel(user: { id: string; role: string; jobTypeId?: string | null }): Promise<void> {
  panelUserId.value = user.id;
  editMode.value = false;
  editError.value = null;
  deactivateArmed.value = false;
  editDraft.value = { role: user.role, jobTypeId: user.jobTypeId ?? '' };
  // Membership comes from the groups' memberIds; the shell usually loaded them already, so refresh only when missing.
  if (!admin.groups.length) void admin.loadGroups();
  await admin.loadUserDetail(user.id);
  await nextTick();
  closeButton.value?.focus();
}

function closePanel(): void {
  panelUserId.value = null;
  editMode.value = false;
  deactivateArmed.value = false;
  editError.value = null;
  admin.clearUserDetail();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && panelUserId.value) closePanel();
}

/** Groups whose memberIds contain the open account — the user's roster memberships, computed client-side. */
/** Job-type label for the responder in the panel: from the loaded list when present, else a dash. */
const detailJobTypeLabel = computed(() => {
  const target = users.value.find((user) => user.id === panelUserId.value);
  const jobTypeId = target?.jobTypeId;
  if (!jobTypeId) return null;
  return jobTypeOptions.value.find((jobType) => jobType.id === jobTypeId)?.label ?? null;
});

const detailGroups = computed(() =>
  admin.groups.filter((group) => panelUserId.value !== null && (group.memberIds ?? []).includes(panelUserId.value))
);

const detail = computed(() => admin.userDetail);
const lastLoginAt = computed(() => {
  const logins = detail.value?.logins ?? [];
  const successful = logins.find((login) => login.success);
  return successful?.loginAt ?? logins[0]?.loginAt ?? null;
});

/** Persists role/job-type edits, refreshes list and panel payload. */
async function saveEdit(): Promise<void> {
  if (!panelUserId.value) return;
  editError.value = null;
  panelBusy.value = true;
  try {
    await admin.updateUser(panelUserId.value, {
      role: editDraft.value.role,
      ...(editDraft.value.role === 'responder' ? { jobTypeId: editDraft.value.jobTypeId || null } : {})
    });
    toast.push('نقش حساب به‌روزرسانی شد.', 'success', 2400);
    await Promise.all([admin.loadUsers(), admin.loadUserDetail(panelUserId.value)]);
    editMode.value = false;
  } catch (caught) {
    editError.value = errorMessage(caught);
  } finally {
    panelBusy.value = false;
  }
}

/** Two-step danger path: first press arms, second deactivates (or reactivates in one press). */
async function toggleActive(): Promise<void> {
  const target = detail.value;
  if (!panelUserId.value || !target) return;
  const nextActive = !target.user.isActive;
  if (nextActive === false && !deactivateArmed.value) {
    deactivateArmed.value = true;
    return;
  }
  panelBusy.value = true;
  try {
    await admin.updateUser(panelUserId.value, { active: nextActive });
    toast.push(nextActive ? 'حساب فعال شد.' : 'حساب غیرفعال و همهٔ نشست‌ها باطل شد.', 'success', 2600);
    deactivateArmed.value = false;
    await Promise.all([admin.loadUsers(), admin.loadUserDetail(panelUserId.value)]);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    panelBusy.value = false;
  }
}

onMounted(() => {
  void admin.loadUsers();
  void loadJobTypes();
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section class="admin-page" data-testid="admin-users">
    <article class="panel">
      <header class="panel__head">
        <h2>کاربران</h2>
        <div class="panel__filters">
          <VTextField v-model="query" density="compact" placeholder="جست‌وجو" hide-details clearable @keyup.enter="search" />
          <select v-model="role" class="admin-select" aria-label="نقش" @change="search">
            <option v-for="item in roles" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <VBtn size="small" color="primary" @click="search">جست‌وجو</VBtn>
        </div>
      </header>
      <div v-if="admin.loading && !users.length" class="users-loading" role="status" data-testid="users-skeleton">
        <span class="mdi mdi-information-outline" aria-hidden="true" />
        <span>در حال دریافت فهرست کاربران از سرور…</span>
      </div>
      <table class="admin-table">
        <thead>
          <tr><th>کاربر</th><th>نقش</th><th>نوع شغل</th><th>وضعیت</th><th>امتیاز</th><th>عملیات</th></tr>
        </thead>
        <tbody v-if="admin.loading && !users.length" data-testid="users-skeleton-rows">
          <tr v-for="row in 6" :key="`skeleton-${row}`" class="skeleton-row" aria-hidden="true">
            <td>
              <span class="admin-cell-user">
                <span class="skeleton skeleton--avatar" />
                <span class="skeleton skeleton--bar" />
              </span>
            </td>
            <td><span class="skeleton skeleton--pill" /></td>
            <td><span class="skeleton skeleton--bar skeleton--bar-sm" /></td>
            <td><span class="skeleton skeleton--pill" /></td>
            <td><span class="skeleton skeleton--pill skeleton--pill-sm" /></td>
            <td><span class="skeleton skeleton--bar skeleton--bar-sm" /></td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="item in users" :key="item.id">
            <td>
              <span class="admin-cell-user">
                <span class="admin-cell-user__avatar" aria-hidden="true">{{ initials(item.username) }}</span>
                <span class="admin-cell-user__name">{{ item.username }}</span>
              </span>
            </td>
            <td>{{ roleLabel(item.role) }}</td>
            <td>
              <select v-if="item.role === 'responder'" class="admin-select admin-select--compact" :value="item.jobTypeId ?? ''"
                      :aria-label="`نوع شغل ${item.username}`" data-testid="user-job-type" @change="changeJobType(item.id, ($event.target as HTMLSelectElement).value)">
                <option value="">بدون نوع شغل</option>
                <option v-for="jobType in jobTypeOptions" :key="jobType.id" :value="jobType.id">{{ jobType.label }} ({{ policyLabel(jobType.offerPolicy) }})</option>
              </select>
              <span v-else>—</span>
            </td>
            <td>
              <span class="status-pill" :class="item.active ? 'status-pill--success' : 'status-pill--neutral'">
                {{ item.active ? 'فعال' : 'غیرفعال' }}
              </span>
            </td>
            <td>{{ format.number(item.averageRating.toFixed(1)) }}</td>
            <td>
              <button type="button" class="admin-action" @click="openPanel(item)" :data-testid="`user-detail-${item.id}`">جزئیات</button>
              <button type="button" class="admin-action" :data-testid="`user-toggle-${item.id}`" @click="toggle(item.id, !item.active)">
                {{ item.active ? 'غیرفعال کردن' : 'فعال کردن' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!admin.loading && !users.length" class="empty-state" role="status" data-testid="users-empty">
        <span class="empty-state__icon mdi mdi-account-search-outline" aria-hidden="true" />
        <strong class="empty-state__title">{{ filtersActive ? 'کاربری با این فیلترها پیدا نشد' : 'کاربری ثبت نشده است' }}</strong>
        <p class="empty-state__hint">{{ filtersActive ? 'عبارت جست‌وجو را کوتاه‌تر کنید یا فیلتر نقش را بردارید.' : 'با دکمه «حساب تازه» نخستین حساب را بسازید.' }}</p>
        <button v-if="filtersActive" type="button" class="primary-button empty-state__action" data-testid="users-clear-filters" @click="clearFilters">
          <span class="mdi mdi-filter-remove-outline" aria-hidden="true" />
          <span>پاک‌کردن فیلترها</span>
        </button>
      </div>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>حساب تازه</h2></header>
      <form class="stack-form" @submit.prevent="create">
        <VTextField v-model="draft.username" label="نام کاربری" density="compact" />
        <VTextField v-model="draft.password" label="گذرواژه موقت" type="password" density="compact" />
        <select v-model="draft.role" class="admin-select" aria-label="نقش حساب تازه">
          <option value="user">کاربر</option>
          <option value="responder">امدادگر</option>
          <option value="admin">مدیر</option>
        </select>
        <select v-if="draft.role === 'responder'" v-model="draft.jobTypeId" class="admin-select" aria-label="نوع شغل امدادگر تازه" data-testid="new-user-job-type">
          <option value="">بدون نوع شغل (سیاست: فقط آماده‌ها)</option>
          <option v-for="jobType in jobTypeOptions" :key="jobType.id" :value="jobType.id">{{ jobType.label }} ({{ policyLabel(jobType.offerPolicy) }})</option>
        </select>
        <VAlert v-if="formError" type="error" variant="tonal" density="compact">{{ formError }}</VAlert>
        <VBtn type="submit" color="primary" block>ساخت حساب</VBtn>
      </form>
    </article>

    <div class="account-panel-root">
      <div v-if="panelUserId" class="account-panel-backdrop" aria-hidden="true" @click="closePanel" />
      <aside v-if="panelUserId" class="account-panel" role="dialog" aria-modal="true" aria-label="جزئیات حساب" data-testid="user-account-panel">
        <header class="account-panel__head">
          <button ref="closeButton" type="button" class="account-panel__close" aria-label="بستن پنل" data-testid="user-detail-close" @click="closePanel">
            <span class="mdi mdi-close" aria-hidden="true" />
          </button>
          <div class="account-panel__identity">
            <span class="account-panel__avatar" aria-hidden="true">{{ initials(detail?.user.username ?? '؟') }}</span>
            <div>
              <strong>{{ detail?.user.username ?? '…' }}</strong>
              <small>{{ detail ? roleLabel(detail.user.role) : '…' }}<template v-if="detail?.user.readyForMission"> · آمادهٔ مأموریت</template></small>
              <div class="account-panel__pills">
                <span class="status-pill" :class="detail?.user.isActive ? 'status-pill--success' : 'status-pill--neutral'">{{ detail?.user.isActive ? 'حساب فعال' : 'حساب غیرفعال' }}</span>
                <span v-if="detail?.user.mustCompleteSecurityQuestions && detail?.user.isActive" class="status-pill status-pill--warning">پرسش‌های امنیتی در انتظار</span>
              </div>
            </div>
          </div>
        </header>

        <div v-if="!detail" class="account-panel__skeleton" aria-hidden="true">
          <i v-for="row in 5" :key="row" />
        </div>

        <template v-else>
          <div class="account-panel__body">
            <dl class="account-facts">
              <div><dt>نام کاربری</dt><dd>{{ detail.user.username }}</dd></div>
              <div><dt>گروه امداد</dt><dd>{{ detailGroups.length ? detailGroups.map((group) => group.name).join('، ') : '—' }}</dd></div>
              <div><dt>نوع شغل</dt><dd>{{ detail.user.role === 'responder' ? (detailJobTypeLabel ?? '—') : '—' }}</dd></div>
              <div><dt>تاریخ عضویت</dt><dd>{{ format.date(detail.user.createdAt) }}</dd></div>
              <div><dt>آخرین ورود</dt><dd>{{ lastLoginAt ? format.relative(lastLoginAt) : '—' }}</dd></div>
              <div><dt>درخواست‌های SOS</dt><dd>{{ format.number(detail.sosCount) }}</dd></div>
            </dl>

            <section class="account-panel__section">
              <h3>دستگاه‌های فعال <span class="account-panel__count">{{ format.number(detail.sessions.length) }}</span></h3>
              <ul v-if="detail.sessions.length" class="account-panel__sessions">
                <li v-for="session in detail.sessions" :key="session.sessionId">
                  <span class="mdi mdi-cellphone-link" aria-hidden="true" />
                  <div>
                    <strong>{{ session.deviceName || 'دستگاه نامشخص' }}</strong>
                    <small>{{ session.ip }} · آخرین فعالیت {{ format.relative(session.lastActiveAt) }}</small>
                  </div>
                </li>
              </ul>
              <p v-else class="panel__empty">نشست فعالی نیست.</p>
            </section>

            <section class="account-panel__section">
              <h3>آخرین رویدادها</h3>
              <ul v-if="detail.logins.length" class="account-panel__logins">
                <li v-for="(login, index) in detail.logins.slice(0, 6)" :key="index">
                  <span class="status-pill" :class="login.success ? 'status-pill--success' : 'status-pill--danger'">{{ login.success ? 'موفق' : 'ناموفق' }}</span>
                  <span class="account-panel__login-device">{{ login.deviceName || 'دستگاه نامشخص' }}</span>
                  <span class="account-panel__login-meta">{{ login.ip }} · {{ format.relative(login.loginAt) }}</span>
                </li>
              </ul>
              <p v-else class="panel__empty">ورودی ثبت نشده است.</p>
            </section>

            <div v-if="editMode" class="account-panel__edit">
              <label>نقش
                <select v-model="editDraft.role" class="admin-select" aria-label="نقش حساب">
                  <option value="user">کاربر</option>
                  <option value="responder">امدادگر</option>
                  <option value="admin">مدیر</option>
                </select>
              </label>
              <label v-if="editDraft.role === 'responder'">نوع شغل
                <select v-model="editDraft.jobTypeId" class="admin-select" aria-label="نوع شغل">
                  <option value="">بدون نوع شغل</option>
                  <option v-for="jobType in jobTypeOptions" :key="jobType.id" :value="jobType.id">{{ jobType.label }}</option>
                </select>
              </label>
              <VAlert v-if="editError" type="error" variant="tonal" density="compact">{{ editError }}</VAlert>
              <div class="account-panel__edit-actions">
                <VBtn size="small" color="primary" :loading="panelBusy" @click="saveEdit">ذخیرهٔ تغییرات</VBtn>
                <VBtn size="small" variant="text" :disabled="panelBusy" @click="editMode = false">انصراف</VBtn>
              </div>
            </div>
          </div>

          <footer class="account-panel__foot">
            <p>غیرفعال‌کردن، نشست‌های فعال را فوراً باطل می‌کند.</p>
            <div class="account-panel__foot-actions">
              <VBtn size="small" color="primary" @click="editMode = !editMode">{{ editMode ? 'بستن ویرایش' : 'ویرایش کاربر' }}</VBtn>
              <button type="button" class="account-panel__danger" :class="{ 'is-confirm': deactivateArmed }" :disabled="panelBusy" data-testid="user-panel-toggle-active" @click="toggleActive">
                <span class="mdi" :class="deactivateArmed || !detail.user.isActive ? 'mdi-check' : 'mdi-account-cancel-outline'" aria-hidden="true" />
                {{ !detail.user.isActive ? 'فعال کردن حساب' : deactivateArmed ? 'غیرفعال قطعی' : 'غیرفعال کردن حساب' }}
              </button>
            </div>
          </footer>
        </template>
      </aside>
    </div>
    <AdminInlineError testid="users" :retry="() => admin.loadUsers({ q: query || undefined, role: role || undefined, page: 1, limit: 50 })" />
  </section>

</template>

<style scoped>
.admin-cell-user { display: inline-flex; align-items: center; gap: 10px; }
.admin-cell-user__avatar { inline-size: 34px; block-size: 34px; display: grid; place-items: center; border-radius: 50%; background: var(--primary-soft); color: var(--primary); font-size: 11px; font-weight: 800; }
.admin-cell-user__name { font-weight: 600; }

.account-panel-backdrop { position: fixed; inset: 0; z-index: 70; background: rgba(9, 30, 30, .45); }
.account-panel { position: fixed; inset-block: 0; inset-inline-end: 0; z-index: 71; inline-size: min(440px, 100vw); background: var(--surface); border-inline-start: 1px solid var(--border); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; }
.account-panel__head { position: relative; padding: 18px 18px 14px; border-block-end: 1px solid var(--row-line); }
.account-panel__close { position: absolute; inset-block-start: 14px; inset-inline-end: 14px; inline-size: 36px; block-size: 36px; border-radius: var(--r11); border: 1px solid var(--border); background: var(--surface-2); color: var(--muted); cursor: pointer; display: grid; place-items: center; }
.account-panel__close:hover { color: var(--text); }
.account-panel__identity { display: flex; align-items: center; gap: 12px; padding-inline-end: 44px; }
.account-panel__avatar { inline-size: 56px; block-size: 56px; border-radius: 18px; background: var(--primary-soft); color: var(--primary); font-weight: 800; font-size: 15px; display: grid; place-items: center; flex-shrink: 0; }
.account-panel__identity strong { font-size: 15px; display: block; }
.account-panel__identity small { color: var(--muted); font-size: 11.5px; }
.account-panel__pills { display: flex; gap: 6px; margin-block-start: 6px; }
.account-panel__body { flex: 1; overflow-y: auto; padding: 16px 18px; display: grid; gap: 16px; align-content: start; }
.account-facts { display: grid; gap: 8px; margin: 0; }
.account-facts > div { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: baseline; padding-block: 6px; border-block-end: 1px solid var(--row-line); }
.account-facts > div:last-child { border-block-end: 0; }
.account-facts dt { color: var(--muted); font-size: 11px; }
.account-facts dd { margin: 0; font-size: 12px; font-weight: 600; }
.account-panel__section h3 { margin: 0 0 8px; font-size: 12px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
.account-panel__count { background: var(--surface-3); border-radius: 999px; padding: 1px 8px; font-size: 10.5px; color: var(--muted); }
.account-panel__sessions { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.account-panel__sessions li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--row-line); border-radius: var(--r12); background: var(--surface-2); }
.account-panel__sessions .mdi { color: var(--muted); }
.account-panel__sessions strong { font-size: 12px; display: block; }
.account-panel__sessions small { color: var(--muted); font-size: 10.5px; }
.account-panel__logins { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.account-panel__logins li { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.account-panel__login-device { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-panel__login-meta { color: var(--muted); font-size: 10px; direction: ltr; unicode-bidi: embed; }
.account-panel__edit { display: grid; gap: 10px; padding: 12px; border: 1px dashed var(--border); border-radius: var(--r12); }
.account-panel__edit label { display: grid; gap: 6px; font-size: 11px; color: var(--muted); }
.account-panel__edit-actions { display: flex; gap: 8px; }
.account-panel__foot { border-block-start: 1px solid var(--row-line); padding: 12px 18px; display: grid; gap: 8px; }
.account-panel__foot p { margin: 0; font-size: 10.5px; color: var(--muted); }
.account-panel__foot-actions { display: flex; gap: 8px; }
.account-panel__danger { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(175,52,56,.4); color: var(--danger); background: transparent; border-radius: var(--r11); padding: 8px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.account-panel__danger:hover { border-color: var(--danger); }
.account-panel__danger.is-confirm { background: var(--danger); border-color: var(--danger); color: var(--on-accent); }
.account-panel__skeleton { display: grid; gap: 12px; padding: 20px 18px; }
.account-panel__skeleton i { block-size: 44px; border-radius: var(--r12); background: var(--surface-3); animation: bb-skeleton 1.4s ease-in-out infinite; }
@keyframes bb-skeleton { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .account-panel__skeleton i { animation: none; } }
@media (max-width: 560px) {
  .account-panel { inline-size: 100vw; }
  .account-facts > div { grid-template-columns: 96px 1fr; }
}
</style>
