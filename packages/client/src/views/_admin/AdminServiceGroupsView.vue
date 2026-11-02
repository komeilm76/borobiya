<template>
  <AdminShell
    active="services"
    title="گروه‌های امداد"
    description="هر گروه مجموعه‌ای از انواع حادثه را پوشش می‌دهد و اعضای خودش را دارد."
    :crumbs="['مدیریت', 'گروه‌های امداد']"
  >
    <template #actions>
      <v-btn variant="tonal" color="primary" rounded="lg" :loading="loading" @click="loadGroups">
        <v-icon class="ms-2" icon="mdi-refresh" size="17" />
        به‌روزرسانی
      </v-btn>
      <v-btn variant="flat" color="primary" rounded="lg" @click="openCreate">
        <v-icon class="ms-2" icon="mdi-plus" size="17" />
        گروه امداد جدید
      </v-btn>
    </template>

    <v-snackbar v-model="snackbar" :color="snackbarTone" location="top" timeout="3200">
      {{ snackbarText }}
    </v-snackbar>

    <AdminStatePanel v-if="state === 'loading'" state="loading" title="در حال دریافت گروه‌های امداد…" />
    <AdminStatePanel
      v-else-if="state === 'forbidden'"
      state="forbidden"
      title="دسترسی به گروه‌های امداد مجاز نیست"
      description="این بخش فقط برای مدیران سامانه باز است."
    />
    <AdminStatePanel
      v-else-if="state === 'offline'"
      state="offline"
      title="اتصال به سرور برقرار نیست"
      description="گروه‌ها و اعضا فقط از سرور خوانده می‌شوند؛ به‌محض برگشتن اینترنت خودکار دوباره تلاش می‌شود."
      action-label="تلاش دوباره"
      action-icon="mdi-refresh"
      @retry="loadGroups"
    />
    <AdminStatePanel
      v-else-if="state === 'error'"
      state="error"
      title="دریافت گروه‌ها ناموفق بود"
      :description="errorMessage"
      action-label="تلاش دوباره"
      action-icon="mdi-refresh"
      @retry="loadGroups"
    />
    <AdminStatePanel
      v-else-if="categories.length === 0"
      state="empty"
      title="هنوز گروه امدادی ساخته نشده است"
      description="با ساخت گروه، نوع حادثه‌های پوشش‌داده‌شده و اعضای آن را مشخص کنید تا تخصیص مأموریت ممکن شود."
      action-label="ساخت گروه امداد"
      action-icon="mdi-plus"
      @retry="openCreate"
    />

    <template v-else>
      <section class="groups-summary">
        <span>{{ toFa(categories.length) }} گروه · {{ toFa(totalMembers) }} عضو</span>
        <span v-if="uncoveredTypes.length > 0" class="groups-summary__warn">
          {{ toFa(uncoveredTypes.length) }} نوع حادثه بدون گروه پوشش‌دهنده
        </span>
        <span v-else class="groups-summary__ok">همهٔ انواع حادثهٔ فعال پوشش داده شده‌اند</span>
      </section>

      <section class="groups-card">
        <div class="groups-table" role="table">
          <div class="groups-table__head" role="row">
            <span role="columnheader">گروه</span>
            <span role="columnheader">انواع حادثه</span>
            <span role="columnheader">اعضا</span>
            <span role="columnheader">وضعیت</span>
            <span role="columnheader">اقدام</span>
          </div>
          <div v-for="group in categories" :key="group.id" class="groups-table__row" role="row">
            <span class="groups-table__name">
              <strong>{{ group.name }}</strong>
              <small>{{ group.description || "بدون توضیح" }}</small>
            </span>
            <span class="groups-table__types">
              <span v-for="id in group.incidentTypeIds.slice(0, 3)" :key="id" class="groups-chip">
                {{ typeName(id) }}
              </span>
              <span v-if="group.incidentTypeIds.length > 3" class="groups-chip groups-chip--more">
                +{{ toFa(group.incidentTypeIds.length - 3) }}
              </span>
              <span v-if="group.incidentTypeIds.length === 0" class="groups-chip groups-chip--empty">
                بدون پوشش
              </span>
            </span>
            <span>{{ toFa(group.members.length) }} نفر</span>
            <span class="groups-pill" :class="`groups-pill--${readiness(group)}`">
              {{ readinessLabel(readiness(group)) }}
            </span>
            <span class="groups-table__actions">
              <v-btn size="small" variant="text" color="primary" @click="openMembers(group)">
                اعضا
              </v-btn>
              <v-btn size="small" variant="text" @click="openEdit(group)">ویرایش</v-btn>
            </span>
          </div>
        </div>
      </section>

      <ul class="groups-mobile" aria-label="گروه‌های امداد" role="list">
        <li v-for="group in categories" :key="group.id" class="groups-mobile__card">
          <div class="groups-mobile__head">
            <strong>{{ group.name }}</strong>
            <span class="groups-pill" :class="`groups-pill--${readiness(group)}`">
              {{ readinessLabel(readiness(group)) }}
            </span>
          </div>
          <p class="groups-mobile__desc">{{ group.description || "بدون توضیح" }}</p>
          <div class="groups-mobile__types">
            <span v-for="id in group.incidentTypeIds" :key="id" class="groups-chip">{{ typeName(id) }}</span>
            <span v-if="group.incidentTypeIds.length === 0" class="groups-chip groups-chip--empty">بدون پوشش</span>
          </div>
          <div class="groups-mobile__foot">
            <span>{{ toFa(group.members.length) }} عضو</span>
            <span class="groups-mobile__actions">
              <v-btn size="small" variant="tonal" color="primary" @click="openMembers(group)">اعضا</v-btn>
              <v-btn size="small" variant="text" @click="openEdit(group)">ویرایش</v-btn>
            </span>
          </div>
        </li>
      </ul>
    </template>

    <!-- create / edit drawer -->
    <v-navigation-drawer
      v-model="editorOpen"
      location="right"
      temporary
      width="440"
      class="groups-drawer"
    >
      <div class="groups-drawer__head">
        <h2>{{ editing ? "ویرایش گروه امداد" : "گروه امداد جدید" }}</h2>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="بستن" @click="editorOpen = false" />
      </div>
      <div class="groups-drawer__body">
        <v-text-field
          v-model="form.name"
          label="نام گروه"
          variant="outlined"
          density="comfortable"
          maxlength="60"
          counter="60"
          :error-messages="formError"
        />
        <v-textarea
          v-model="form.description"
          label="توضیح کوتاه"
          variant="outlined"
          density="comfortable"
          rows="2"
          maxlength="200"
          counter="200"
        />
        <p class="groups-drawer__label">انواع حادثهٔ پوشش‌داده‌شده</p>
        <div class="groups-drawer__types">
          <v-checkbox
            v-for="type in incidentTypes"
            :key="type.id"
            v-model="form.incidentTypeIds"
            :value="type.id"
            :label="type.name"
            density="compact"
            hide-details
            color="primary"
          />
          <p v-if="incidentTypes.length === 0" class="groups-drawer__hint">
            هنوز نوع حادثه‌ای ثبت نشده است؛ از بخش «انواع حادثه» اضافه کنید.
          </p>
        </div>
      </div>
      <div class="groups-drawer__foot">
        <v-btn variant="text" @click="editorOpen = false">انصراف</v-btn>
        <v-btn variant="flat" color="primary" :loading="saving" @click="saveGroup">
          {{ editing ? "ذخیرهٔ تغییرات" : "ساخت گروه" }}
        </v-btn>
      </div>
    </v-navigation-drawer>

    <!-- members dialog -->
    <v-dialog v-model="membersOpen" max-width="640" scrollable>
      <v-card class="groups-members" rounded="xl">
        <header class="groups-members__head">
          <div>
            <h2>اعضای {{ activeGroup?.name }}</h2>
            <p>{{ toFa(activeGroup?.members.length ?? 0) }} عضو · افزودن امدادگر با نام کاربری</p>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="بستن" @click="membersOpen = false" />
        </header>

        <div class="groups-members__search">
          <v-text-field
            v-model="memberSearch"
            label="جست‌وجوی نام کاربری"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            @update:model-value="queueSearch"
          />
        </div>

        <div class="groups-members__body">
          <p v-if="searching" class="groups-members__hint">در حال جست‌وجو…</p>
          <p v-else-if="searchError" class="groups-members__hint groups-members__hint--error" role="alert">
            {{ searchError }}
          </p>
          <p v-else-if="!memberSearch.trim()" class="groups-members__hint">
            برای دیدن امدادگران، نام کاربری را بنویسید.
          </p>
          <p v-else-if="candidates.length === 0" class="groups-members__hint">
            کاربری پیدا نشد. نام کاربری را کامل‌تر بنویسید.
          </p>
          <ul v-else class="groups-members__list" role="list" aria-label="نتایج جست‌وجوی امدادگر">
            <li v-for="user in candidates" :key="user.id">
              <span class="groups-members__avatar">{{ user.username.slice(0, 1) }}</span>
              <span class="groups-members__meta">
                <strong>{{ user.username }}</strong>
                <small>{{ user.categories.map((item) => item.name).join(" · ") || "بدون گروه" }}</small>
              </span>
              <span v-if="!user.isActive" class="groups-chip groups-chip--empty">غیرفعال</span>
              <v-btn
                size="small"
                variant="flat"
                color="primary"
                :disabled="isMember(user.id)"
                :loading="pendingUserId === user.id"
                @click="addMember(user)"
              >
                {{ isMember(user.id) ? "عضو است" : "افزودن" }}
              </v-btn>
            </li>
          </ul>

          <template v-if="activeGroup && activeGroup.members.length > 0">
            <p class="groups-members__label">اعضای فعلی</p>
            <ul class="groups-members__current" role="list" aria-label="اعضای فعلی">
              <li v-for="member in activeGroup.members" :key="member.id">
                <span class="groups-members__avatar">{{ member.username.slice(0, 1) }}</span>
                <span class="groups-members__meta"><strong>{{ member.username }}</strong></span>
                <v-btn
                  size="small"
                  variant="text"
                  color="error"
                  :loading="pendingUserId === member.id"
                  @click="removeMember(member)"
                >
                  حذف
                </v-btn>
              </li>
            </ul>
          </template>
        </div>
        <footer class="groups-members__foot">
          <v-btn variant="text" @click="membersOpen = false">بستن</v-btn>
        </footer>
      </v-card>
    </v-dialog>
  </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { Category, CategoryMember, IncidentType, UserProfile } from "@shared/index";
import AdminShell from "../../components/admin/AdminShell.vue";
import AdminStatePanel from "../../components/admin/AdminStatePanel.vue";
import { useOnlineStatus } from "../../composables/online-status";
import { friendlyErrorMessage } from "../../api/error-message";
import { ApiError } from "../../api/http";
import { withoutConfirmedMember } from "../../admin/category-members";
import { unknownTargetLabels } from "../../admin/catalog-form";
import { useCategoryMemberSearch } from "../../admin/use-category-member-search";
import {
  assignCategoryUsers,
  createCategory,
  listCategories,
  listIncidentTypes,
  removeCategoryUser,
  updateCategory
} from "../../api/admin-catalog";
import { listAdminUsers } from "../../api/admin-users";
import { useAuthStore } from "../../stores/auth";
import { groupReadiness } from "../../utils/admin-metrics";

const auth = useAuthStore();
const numberFormatter = new Intl.NumberFormat("fa-IR");

const categories = ref<Category[]>([]);
const incidentTypes = ref<IncidentType[]>([]);
const loading = ref(true);
const error = ref<unknown>(null);
const forbidden = ref(false);
const offline = ref(false);
const { isOnline } = useOnlineStatus();

const editorOpen = ref(false);
const editing = ref<Category | null>(null);
const form = reactive<{ name: string; description: string; incidentTypeIds: string[] }>({
  name: "",
  description: "",
  incidentTypeIds: []
});
const formError = ref("");
const saving = ref(false);

const membersOpen = ref(false);
const activeGroup = ref<Category | null>(null);
const pendingUserId = ref<string | null>(null);

// The picker's debounce, stale-response guard and close/unmount invalidation live in the composable
// so the dialog cannot offer an account for a query the admin has already replaced.
const { memberSearch, candidates, searching, searchError, queueSearch, reset: resetMemberSearch } =
  useCategoryMemberSearch(
    async (term) => {
      const token = await withToken();
      if (!token) return [];
      const response = await listAdminUsers({ q: term, page: 1, limit: 8 }, token);
      return response.items;
    },
    () => new Set(activeGroup.value?.members.map((member) => member.id) ?? [])
  );

const snackbar = ref(false);
const snackbarText = ref("");
const snackbarTone = ref<"success" | "error">("success");

function toFa(value: number): string {
  return numberFormatter.format(value);
}

function notify(text: string, tone: "success" | "error" = "success"): void {
  snackbarText.value = text;
  snackbarTone.value = tone;
  snackbar.value = true;
}

/**
 * `offline` sits after `forbidden` — a 403 is the server telling us something, and that is true whether or not the
 * browser also lost a probe — and before `error`, which is where a dead connection would otherwise land.
 */
const state = computed(() => {
  if (loading.value) return "loading" as const;
  if (forbidden.value) return "forbidden" as const;
  if (error.value && offline.value) return "offline" as const;
  if (error.value) return "error" as const;
  return "ready" as const;
});

const errorMessage = computed(() =>
  error.value ? friendlyErrorMessage(error.value, "لطفاً دوباره تلاش کنید.") : ""
);

const totalMembers = computed(() =>
  categories.value.reduce((sum, category) => sum + category.members.length, 0)
);

const uncoveredTypes = computed(() => {
  const covered = new Set(categories.value.flatMap((category) => category.incidentTypeIds));
  return incidentTypes.value.filter((type) => !covered.has(type.id));
});

function typeName(id: string): string {
  return incidentTypes.value.find((type) => type.id === id)?.name ?? "نوع حذف‌شده";
}

function readiness(group: Category): "ready" | "thin" | "empty" {
  const summary = groupReadiness([group], incidentTypes.value)[0];
  return summary?.state ?? "empty";
}

function readinessLabel(state: "ready" | "thin" | "empty"): string {
  return { ready: "آماده", thin: "کمبود نیرو", empty: "بدون عضو" }[state];
}

async function withToken(): Promise<string | null> {
  try {
    await auth.ensureSession();
  } catch {
    /* reported by the caller */
  }
  if (!auth.accessToken) {
    forbidden.value = true;
    loading.value = false;
    return null;
  }
  return auth.accessToken;
}

async function loadGroups(): Promise<void> {
  loading.value = true;
  error.value = null;
  forbidden.value = false;
  offline.value = false;
  const token = await withToken();
  if (!token) return;
  try {
    const [categoryList, typeList] = await Promise.all([listCategories(token), listIncidentTypes(token)]);
    categories.value = categoryList;
    incidentTypes.value = typeList;
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 403) forbidden.value = true;
    else {
      error.value = caught;
      offline.value = navigator.onLine === false;
    }
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editing.value = null;
  form.name = "";
  form.description = "";
  form.incidentTypeIds = [];
  formError.value = "";
  editorOpen.value = true;
}

function openEdit(group: Category): void {
  editing.value = group;
  form.name = group.name;
  form.description = group.description ?? "";
  form.incidentTypeIds = [...group.incidentTypeIds];
  formError.value = "";
  editorOpen.value = true;
}

async function saveGroup(): Promise<void> {
  const name = form.name.trim();
  if (name.length === 0) {
    formError.value = "نام گروه الزامی است.";
    return;
  }
  const token = await withToken();
  if (!token) return;
  saving.value = true;
  formError.value = "";
  try {
    const payload = {
      name,
      description: form.description.trim() || undefined,
      incidentTypeIds: form.incidentTypeIds
    };
    if (editing.value) {
      await updateCategory(editing.value.id, payload, token);
      notify("گروه امداد به‌روزرسانی شد.");
    } else {
      await createCategory(payload, token);
      notify("گروه امداد ساخته شد.");
    }
    editorOpen.value = false;
    await loadGroups();
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 400) formError.value = "نام گروه تکراری یا نامعتبر است.";
    else notify(friendlyErrorMessage(caught, "ذخیرهٔ گروه ناموفق بود."), "error");
  } finally {
    saving.value = false;
  }
}

function openMembers(group: Category): void {
  activeGroup.value = group;
  resetMemberSearch();
  membersOpen.value = true;
}

function isMember(userId: string): boolean {
  return activeGroup.value?.members.some((member) => member.id === userId) ?? false;
}

async function addMember(user: UserProfile): Promise<void> {
  if (!activeGroup.value) return;
  const token = await withToken();
  if (!token) return;
  pendingUserId.value = user.id;
  try {
    await assignCategoryUsers(activeGroup.value.id, [user.id], token);
    await refreshActiveGroup(token);
    notify(`${user.username} به گروه اضافه شد.`);
  } catch (caught) {
    // A refused assignment names the account the admin picked, not the index the server pointed at.
    const refused = unknownTargetLabels(caught, [user.id], (id) => (id === user.id ? user.username : null));
    notify(
      refused.length > 0
        ? `افزودن ${refused.join("، ")} انجام نشد؛ حساب در دسترس نیست.`
        : friendlyErrorMessage(caught, "افزودن عضو ناموفق بود."),
      "error"
    );
  } finally {
    pendingUserId.value = null;
  }
}

async function removeMember(member: CategoryMember): Promise<void> {
  if (!activeGroup.value) return;
  const token = await withToken();
  if (!token) return;
  pendingUserId.value = member.id;
  try {
    const groupId = activeGroup.value.id;
    await removeCategoryUser(groupId, member.id, token);
    // The DELETE is acknowledged, so drop the row now; the refresh below reconciles the roster.
    activeGroup.value = withoutConfirmedMember(activeGroup.value, groupId, member.id);
    await refreshActiveGroup(token);
    notify(`${member.username} از گروه حذف شد.`);
  } catch (caught) {
    notify(friendlyErrorMessage(caught, "حذف عضو ناموفق بود."), "error");
  } finally {
    pendingUserId.value = null;
  }
}

async function refreshActiveGroup(token: string): Promise<void> {
  const list = await listCategories(token);
  categories.value = list;
  activeGroup.value = list.find((category) => category.id === activeGroup.value?.id) ?? null;
}

watch(isOnline, (online) => {
  // Same rule as the request board: a reconnect only re-reads what is actually missing.
  if (!online || !offline.value) return;
  void loadGroups();
});

onMounted(() => {
  void loadGroups();
});

onBeforeUnmount(() => {
  resetMemberSearch();
});
</script>

<style scoped>
.groups-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.8rem;
}

.groups-summary__warn {
  color: rgb(var(--v-theme-warning));
}

.groups-summary__ok {
  color: rgb(var(--v-theme-success));
}

.groups-card {
  padding: 0.35rem 1rem 0.6rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  overflow-x: auto;
}

.groups-mobile {
  display: none;
  margin: 0;
  padding: 0;
  gap: 0.7rem;
  list-style: none;
}

.groups-mobile__card {
  display: grid;
  gap: 0.55rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--bb-shadow-surface);
}

.groups-mobile__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.groups-mobile__desc {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.82rem;
  line-height: 1.8;
}

.groups-mobile__types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.groups-mobile__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.8rem;
}

.groups-mobile__actions {
  display: inline-flex;
  gap: 0.35rem;
}

.groups-table {
  display: grid;
  min-width: 720px;
  gap: 0.1rem;
}

.groups-table__head,
.groups-table__row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.5fr) 80px 110px 150px;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.3rem;
  font-size: 0.82rem;
}

.groups-table__head {
  margin-top: 0.35rem;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.groups-table__row + .groups-table__row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}

.groups-table__name {
  display: grid;
  line-height: 1.45;
}

.groups-table__name small {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.82rem;
}

.groups-table__types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.groups-chip {
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-size: 0.8rem;
}

.groups-chip--more,
.groups-chip--empty {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.groups-table__actions {
  display: flex;
  gap: 0.25rem;
  justify-content: flex-start;
}

.groups-pill {
  justify-self: start;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.groups-pill--ready {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.groups-pill--thin {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}

.groups-pill--empty {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}

.groups-drawer__head,
.groups-members__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.1rem 1.2rem 0.6rem;
}

.groups-drawer__head h2,
.groups-members__head h2 {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
}

.groups-members__head p {
  margin: 0.2rem 0 0;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.groups-drawer__body {
  display: grid;
  gap: 0.8rem;
  padding: 0 1.2rem 1rem;
}

.groups-drawer__label {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.groups-drawer__types {
  display: grid;
  gap: 0.15rem;
  max-height: 260px;
  overflow-y: auto;
}

.groups-drawer__hint,
.groups-members__hint {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.groups-drawer__foot,
.groups-members__foot {
  position: sticky;
  inset-block-end: 0;
  display: flex;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0.9rem 1.2rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  background: rgb(var(--v-theme-surface));
}

.groups-members__search {
  padding: 0 1.2rem 0.6rem;
}

.groups-members__body {
  display: grid;
  gap: 0.9rem;
  padding: 0 1.2rem 1rem;
  overflow-y: auto;
}

.groups-members__list,
.groups-members__current {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.groups-members__list li,
.groups-members__current li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.5rem;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.groups-members__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.groups-members__meta {
  display: grid;
  flex: 1;
  line-height: 1.4;
}

.groups-members__meta small {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.8rem;
}

.groups-members__label {
  margin: 0 0 0.2rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}
@media (max-width: 850px) {
  .groups-table {
    display: none;
  }

  .groups-card {
    display: none;
  }

  .groups-mobile {
    display: grid;
  }
}

.groups-members__hint--error {
  color: rgb(var(--v-theme-error));
}

</style>
