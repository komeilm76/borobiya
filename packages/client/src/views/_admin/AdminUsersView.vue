<template>
  <section class="admin-users-page mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
    <header class="admin-users-header">
      <div>
        <p class="admin-users-eyebrow"><v-icon icon="mdi-shield-account-outline" size="17" /> پنل مدیریت</p>
        <h1>مدیریت کاربران</h1>
        <p class="admin-users-intro">
          حساب‌ها را پیدا کنید و در صورت نیاز دسترسی ورود آن‌ها را فعال یا غیرفعال کنید.
        </p>
      </div>
      <v-btn
        class="admin-refresh-button"
        variant="tonal"
        color="primary"
        rounded="lg"
        :loading="loading"
        :disabled="loading"
        @click="loadUsers"
      >
        <v-icon class="me-2" icon="mdi-refresh" />
        به‌روزرسانی
      </v-btn>
    </header>

    <v-card class="admin-users-card" elevation="0" rounded="xl">
      <div class="admin-users-toolbar">
        <v-text-field
          :model-value="search"
          class="admin-users-search"
          label="جست‌وجو بر اساس نام کاربری"
          placeholder="مثلاً rescue_user1"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          rounded="lg"
          density="comfortable"
          maxlength="30"
          counter="30"
          clearable
          hide-details
          :disabled="loading && !users.length"
          @update:model-value="updateSearch"
        />
        <v-select
          :model-value="statusFilter"
          class="admin-users-filter"
          label="وضعیت حساب"
          :items="statusFilterOptions"
          item-title="title"
          item-value="value"
          variant="outlined"
          rounded="lg"
          density="comfortable"
          hide-details
          :disabled="loading && !users.length"
          @update:model-value="updateStatusFilter"
        />
        <v-select
          :model-value="categoryFilter"
          class="admin-users-filter"
          label="گروه امدادگر"
          :items="categoryFilterOptions"
          item-title="title"
          item-value="value"
          variant="outlined"
          rounded="lg"
          density="comfortable"
          hide-details
          :disabled="loading && !users.length"
          @update:model-value="updateCategoryFilter"
        />
      </div>

      <div class="admin-users-table-area">
        <div class="admin-users-results-meta" aria-live="polite">
          <span>{{ resultsLabel }}</span>
          <span v-if="statusFilter !== 'all'" class="admin-filter-chip">
            {{ statusFilter === "active" ? "حساب‌های فعال" : "حساب‌های غیرفعال" }}
          </span>
          <span v-if="categoryFilter !== 'all'" class="admin-filter-chip">
            {{ categoryFilter === "assigned" ? "دارای گروه امدادگر" : "بدون گروه امدادگر" }}
          </span>
        </div>

        <div v-if="loading" class="admin-users-state" role="status" aria-live="polite">
          <v-progress-circular indeterminate color="primary" size="32" />
          <span>در حال دریافت فهرست کاربران…</span>
        </div>

        <v-alert
          v-else-if="listError"
          class="admin-users-state-alert"
          type="error"
          variant="tonal"
          rounded="lg"
          role="alert"
        >
          {{ listError }}
          <template #append>
            <v-btn variant="text" size="small" @click="loadUsers">تلاش دوباره</v-btn>
          </template>
        </v-alert>

        <div v-else-if="users.length === 0" class="admin-users-state" role="status">
          <span class="admin-users-empty-icon"><v-icon icon="mdi-account-search-outline" size="28" /></span>
          <strong>{{ search.trim() || statusFilter !== "all" || categoryFilter !== "all" ? "کاربری با این مشخصات پیدا نشد" : "هنوز کاربری ثبت نشده است" }}</strong>
          <span>عبارت جست‌وجو یا فیلترها را تغییر دهید.</span>
        </div>

        <div v-else class="admin-users-table-wrap">
          <v-table class="admin-users-table">
            <thead>
              <tr>
                <th scope="col">کاربر</th>
                <th scope="col">نقش</th>
                <th scope="col">گروه‌های امدادگر</th>
                <th scope="col">وضعیت</th>
                <th scope="col">تاریخ عضویت</th>
                <th scope="col" class="admin-actions-heading">فعال‌سازی</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <th scope="row">
                  <div class="admin-user-cell">
                    <span class="admin-user-avatar" aria-hidden="true">{{ userInitial(user.username) }}</span>
                    <span class="admin-user-copy">
                      <span class="admin-users-username" dir="ltr">{{ user.username }}</span>
                      <small>
                        {{ user.mustCompleteSecurityQuestions ? "نیازمند تکمیل راه‌اندازی حساب" : "حساب راه‌اندازی شده" }}
                      </small>
                    </span>
                  </div>
                </th>
                <td>
                  <span :class="['admin-role-pill', user.role === 'admin' ? 'is-admin' : '']">
                    {{ user.role === "admin" ? "مدیر" : "کاربر" }}
                  </span>
                </td>
                <td>
                  <div class="flex flex-wrap gap-1">
                    <v-chip
                      v-for="cat in user.categories"
                      :key="cat.id"
                      size="x-small"
                      variant="tonal"
                      color="primary"
                    >
                      {{ cat.name }}
                    </v-chip>
                    <span v-if="!user.categories || user.categories.length === 0" class="opacity-60">بدون گروه</span>
                  </div>
                </td>
                <td>
                  <span :class="['admin-account-status', user.isActive ? 'is-active' : 'is-inactive']">
                    <span class="admin-status-dot" />
                    {{ user.isActive ? "فعال" : "غیرفعال" }}
                  </span>
                </td>
                <td class="admin-joined-date">{{ formatDate(user.createdAt) }}</td>
                <td class="admin-user-action-cell">
                  <v-switch
                    :model-value="user.isActive"
                    :aria-label="statusSwitchLabel(user)"
                    :disabled="loading || statusSavingUserId !== null || isCurrentAdmin(user)"
                    :loading="statusSavingUserId === user.id"
                    color="primary"
                    density="compact"
                    inset
                    hide-details
                    @update:model-value="requestStatusChange(user, $event)"
                  />
                  <small v-if="isCurrentAdmin(user)" class="admin-self-note">حساب جاری</small>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <footer v-if="!loading && !listError && users.length > 0" class="admin-users-pagination">
          <span>{{ resultsLabel }}</span>
          <v-pagination
            v-if="totalPages > 1"
            :model-value="page"
            :length="totalPages"
            :total-visible="5"
            rounded="circle"
            density="comfortable"
            aria-label="صفحه‌بندی فهرست کاربران"
            @update:model-value="updatePage"
          />
        </footer>
      </div>
    </v-card>

    <v-dialog
      :model-value="statusChange !== null"
      :persistent="statusSavingUserId !== null"
      max-width="480"
      @update:model-value="updateStatusDialog"
    >
      <v-card v-if="statusChange" class="admin-status-dialog" rounded="xl">
        <v-card-title class="admin-status-dialog-title">
          <span class="admin-dialog-icon" :class="statusChange.nextIsActive ? 'is-activate' : 'is-deactivate'">
            <v-icon :icon="statusChange.nextIsActive ? 'mdi-account-check-outline' : 'mdi-account-cancel-outline'" />
          </span>
          {{ statusChange.nextIsActive ? "فعال‌سازی حساب" : "غیرفعال‌سازی حساب" }}
        </v-card-title>
        <v-card-text>
          <p>
            {{ statusChange.nextIsActive ? "آیا می‌خواهید حساب" : "آیا می‌خواهید دسترسی ورود حساب" }}
            <strong dir="ltr">{{ statusChange.user.username }}</strong>
            {{ statusChange.nextIsActive ? "را فعال کنید؟" : "را غیرفعال کنید؟" }}
          </p>
          <p v-if="!statusChange.nextIsActive" class="admin-deactivation-note">
            با غیرفعال‌سازی، نشست‌های فعال این حساب نیز لغو می‌شوند. حساب حذف نخواهد شد.
          </p>
          <v-alert v-if="statusError" class="admin-dialog-error" type="error" variant="tonal" density="comfortable" role="alert">
            {{ statusError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="admin-status-dialog-actions">
          <v-btn variant="text" rounded="lg" :disabled="statusSavingUserId !== null" @click="closeStatusDialog">
            انصراف
          </v-btn>
          <v-spacer />
          <v-btn
            :color="statusChange.nextIsActive ? 'primary' : 'error'"
            variant="flat"
            rounded="lg"
            :loading="statusSavingUserId === statusChange.user.id"
            :disabled="statusSavingUserId !== null"
            @click="confirmStatusChange"
          >
            {{ statusChange.nextIsActive ? "فعال‌سازی حساب" : "غیرفعال‌سازی" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="successVisible" color="success" location="bottom start" timeout="4000" rounded="lg">
      {{ successMessage }}
    </v-snackbar>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { UserProfile } from "@shared/index";
import { ApiError } from "../../api/http";
import { friendlyErrorMessage } from "../../api/error-message";
import { listAdminUsers, updateAdminUserStatus } from "../../api/admin-users";
import { useAuthStore } from "../../stores/auth";

const PAGE_SIZE = 20;
const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" });
type StatusFilter = "all" | "active" | "inactive";
type CategoryFilter = "all" | "assigned" | "unassigned";

const statusFilterOptions: Array<{ title: string; value: StatusFilter }> = [
  { title: "همهٔ حساب‌ها", value: "all" },
  { title: "فعال", value: "active" },
  { title: "غیرفعال", value: "inactive" }
];

const categoryFilterOptions: Array<{ title: string; value: CategoryFilter }> = [
  { title: "همهٔ گروه‌ها", value: "all" },
  { title: "دارای گروه امدادگر", value: "assigned" },
  { title: "بدون گروه امدادگر", value: "unassigned" }
];

const auth = useAuthStore();
const users = ref<UserProfile[]>([]);
const search = ref("");
const statusFilter = ref<StatusFilter>("all");
const categoryFilter = ref<CategoryFilter>("all");
const page = ref(1);
const total = ref(0);
const totalPages = ref(0);
const loading = ref(true);
const listError = ref("");
const statusSavingUserId = ref<string | null>(null);
const statusError = ref("");
const statusChange = ref<{ user: UserProfile; nextIsActive: boolean } | null>(null);
const successVisible = ref(false);
const successMessage = ref("");

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let activeListController: AbortController | null = null;
let listRequestVersion = 0;

const resultsLabel = computed(() => {
  if (total.value === 0) return "۰ حساب";
  const first = (page.value - 1) * PAGE_SIZE + 1;
  const last = Math.min(page.value * PAGE_SIZE, total.value);
  return `نمایش ${numberFormatter.format(first)} تا ${numberFormatter.format(last)} از ${numberFormatter.format(total.value)} حساب`;
});

function userInitial(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function isCurrentAdmin(user: UserProfile): boolean {
  return user.id === auth.user?.id;
}

function statusSwitchLabel(user: UserProfile): string {
  return user.isActive ? `غیرفعال‌سازی حساب ${user.username}` : `فعال‌سازی حساب ${user.username}`;
}

function friendlyAdminError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "نشست مدیر پایان یافته است؛ دوباره وارد حساب شوید.";
    if (error.status === 403) return "دسترسی مدیر برای این عملیات تأیید نشد.";
    if (error.code === "USER_NOT_FOUND") return "این حساب دیگر در دسترس نیست. فهرست را تازه کنید.";
  }
  return friendlyErrorMessage(error, fallback);
}

function clearSearchTimer(): void {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

async function loadUsers(): Promise<void> {
  clearSearchTimer();
  const requestVersion = ++listRequestVersion;
  activeListController?.abort();
  activeListController = null;
  listError.value = "";
  loading.value = true;
  let controller: AbortController | null = null;

  try {
    // A page can remain open beyond the 15-minute access-token lifetime. Refresh before
    // each list request so the explicit Refresh button can recover the HttpOnly session.
    await auth.ensureSession();
    if (requestVersion !== listRequestVersion) return;

    const accessToken = auth.accessToken;
    if (!accessToken) {
      users.value = [];
      total.value = 0;
      totalPages.value = 0;
      listError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }

    controller = new AbortController();
    activeListController = controller;
    const isActive = statusFilter.value === "all" ? undefined : statusFilter.value === "active";
    const hasCategory = categoryFilter.value === "all" ? undefined : categoryFilter.value === "assigned";
    const response = await listAdminUsers({
      q: search.value.trim() || undefined,
      isActive,
      hasCategory,
      page: page.value,
      limit: PAGE_SIZE
    }, accessToken, controller.signal);

    if (requestVersion !== listRequestVersion) return;
    if (response.totalPages === 0 && page.value > 1) {
      page.value = 1;
      return;
    }
    if (response.totalPages > 0 && page.value > response.totalPages) {
      page.value = response.totalPages;
      return;
    }

    users.value = response.items;
    total.value = response.total;
    totalPages.value = response.totalPages;
  } catch (error) {
    if (controller?.signal.aborted || requestVersion !== listRequestVersion) return;
    users.value = [];
    total.value = 0;
    totalPages.value = 0;
    listError.value = friendlyAdminError(error, "بارگذاری فهرست کاربران انجام نشد. دوباره تلاش کنید.");
  } finally {
    if (requestVersion === listRequestVersion) {
      if (activeListController === controller) activeListController = null;
      loading.value = false;
    }
  }
}

function updateSearch(value: unknown): void {
  const next = typeof value === "string" ? value.slice(0, 30) : "";
  if (search.value === next) return;
  search.value = next;
}

function updateStatusFilter(value: unknown): void {
  if (value !== "all" && value !== "active" && value !== "inactive") return;
  if (statusFilter.value === value) return;
  statusFilter.value = value;
  clearSearchTimer();
  if (page.value !== 1) page.value = 1;
  else void loadUsers();
}

function updateCategoryFilter(value: unknown): void {
  if (value !== "all" && value !== "assigned" && value !== "unassigned") return;
  if (categoryFilter.value === value) return;
  categoryFilter.value = value;
  clearSearchTimer();
  if (page.value !== 1) page.value = 1;
  else void loadUsers();
}

function updatePage(value: unknown): void {
  const next = Number(value);
  if (!Number.isInteger(next) || next < 1 || next > totalPages.value || next === page.value) return;
  page.value = next;
}

function requestStatusChange(user: UserProfile, value: unknown): void {
  if (typeof value !== "boolean" || value === user.isActive || statusSavingUserId.value !== null || isCurrentAdmin(user)) return;
  statusError.value = "";
  statusChange.value = { user, nextIsActive: value };
}

function updateStatusDialog(open: boolean): void {
  if (!open) closeStatusDialog();
}

function closeStatusDialog(): void {
  if (statusSavingUserId.value !== null) return;
  statusChange.value = null;
  statusError.value = "";
}

async function confirmStatusChange(): Promise<void> {
  const pendingChange = statusChange.value;
  if (!pendingChange || statusSavingUserId.value !== null) return;

  statusSavingUserId.value = pendingChange.user.id;
  statusError.value = "";
  try {
    // Refresh a near-expiry token before mutating; a mounted admin page may outlive its JWT.
    await auth.ensureSession();
    const accessToken = auth.accessToken;
    if (!accessToken) {
      statusError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }

    await updateAdminUserStatus(pendingChange.user.id, pendingChange.nextIsActive, accessToken);
    statusChange.value = null;
    successMessage.value = pendingChange.nextIsActive
      ? `حساب ${pendingChange.user.username} فعال شد.`
      : `حساب ${pendingChange.user.username} غیرفعال شد و نشست‌های آن لغو شدند.`;
    successVisible.value = true;
    await loadUsers();
  } catch (error) {
    statusError.value = friendlyAdminError(error, "تغییر وضعیت حساب انجام نشد. دوباره تلاش کنید.");
  } finally {
    statusSavingUserId.value = null;
  }
}

watch(search, () => {
  clearSearchTimer();
  if (page.value !== 1) {
    page.value = 1;
    return;
  }
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void loadUsers();
  }, 300);
});

watch(page, () => {
  clearSearchTimer();
  void loadUsers();
});

onMounted(() => {
  void loadUsers();
});

onUnmounted(() => {
  clearSearchTimer();
  listRequestVersion += 1;
  activeListController?.abort();
  activeListController = null;
});
</script>

<style scoped>
.admin-users-page {
  display: grid;
  min-height: calc(100vh - 132px);
  align-content: start;
  gap: 1.35rem;
}

.admin-users-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.admin-users-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.55rem;
  color: #0e7772;
  font-size: 0.78rem;
  font-weight: 800;
}

.admin-users-header h1 {
  margin: 0;
  color: #193d3d;
  font-size: clamp(1.7rem, 3.5vw, 2.45rem);
  font-weight: 850;
  letter-spacing: -0.035em;
  line-height: 1.45;
}

.admin-users-intro {
  max-width: 45rem;
  margin: 0.4rem 0 0;
  color: #718584;
  font-size: 0.9rem;
  line-height: 1.9;
}

.admin-refresh-button {
  flex: 0 0 auto;
  min-height: 44px;
  font-weight: 750;
}

.admin-users-card {
  overflow: hidden;
  border: 1px solid rgba(34, 75, 75, 0.09);
  background: rgba(255, 255, 255, 0.96) !important;
  box-shadow: 0 18px 50px rgba(31, 67, 66, 0.07) !important;
}

.admin-users-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.6fr);
  align-items: start;
  gap: 0.85rem;
  padding: 1.3rem 1.45rem 0.25rem;
}

.admin-users-search,
.admin-users-filter {
  min-width: 0;
}

.admin-users-table-area {
  padding: 0.75rem 1.45rem 1.2rem;
}

.admin-users-results-meta {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: #718584;
  font-size: 0.78rem;
  font-weight: 650;
}

.admin-filter-chip {
  padding: 0.28rem 0.65rem;
  border: 1px solid rgba(14, 102, 102, 0.12);
  border-radius: 999px;
  color: #0e6666;
  background: #edf7f3;
  font-size: 0.7rem;
}

.admin-users-state {
  display: grid;
  min-height: 270px;
  justify-items: center;
  align-content: center;
  gap: 0.8rem;
  color: #718584;
  font-size: 0.85rem;
  text-align: center;
}

.admin-users-state strong {
  color: #365b5c;
  font-size: 0.95rem;
  font-weight: 800;
}

.admin-users-state-alert {
  margin-block: 0.75rem 1rem;
  font-size: 0.84rem;
}

.admin-users-empty-icon {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border: 1px solid rgba(14, 102, 102, 0.1);
  border-radius: 19px;
  color: #0e7772;
  background: #edf7f3;
}

.admin-users-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(26, 67, 68, 0.08);
  border-radius: 17px;
}

.admin-users-table {
  min-width: 760px;
}

.admin-users-table :deep(th) {
  height: 52px !important;
  color: #688180 !important;
  background: #f8fbfa;
  font-size: 0.74rem !important;
  font-weight: 800 !important;
  white-space: nowrap;
}

.admin-users-table :deep(td),
.admin-users-table :deep(tbody th) {
  height: 74px !important;
  border-top: 1px solid rgba(26, 67, 68, 0.06) !important;
  color: #3b5e5f;
  font-size: 0.82rem;
}

.admin-users-table :deep(tbody tr:hover) {
  background: #fbfdfc;
}

.admin-user-cell {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  text-align: start;
}

.admin-user-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(14, 102, 102, 0.1);
  border-radius: 14px;
  color: #0e6666;
  background: #eaf5f1;
  font-size: 0.9rem;
  font-weight: 850;
  text-transform: uppercase;
}

.admin-user-copy {
  display: grid;
  gap: 0.15rem;
}

.admin-users-username {
  color: #254849;
  font-size: 0.85rem;
  font-weight: 800;
  text-align: start;
}

.admin-user-copy small,
.admin-self-note {
  color: #8b9b99;
  font-size: 0.68rem;
  font-weight: 500;
}

.admin-role-pill,
.admin-account-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.32rem 0.62rem;
  border: 1px solid rgba(91, 117, 116, 0.12);
  border-radius: 999px;
  color: #607777;
  background: #f4f7f6;
  font-size: 0.72rem;
  font-weight: 750;
  white-space: nowrap;
}

.admin-role-pill.is-admin {
  border-color: rgba(162, 113, 37, 0.15);
  color: #8b641f;
  background: #fff7e6;
}

.admin-account-status.is-active {
  border-color: rgba(53, 161, 118, 0.15);
  color: #39765f;
  background: #eff8f3;
}

.admin-account-status.is-inactive {
  border-color: rgba(184, 63, 66, 0.13);
  color: #a4484b;
  background: #fff2f1;
}

.admin-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.admin-joined-date {
  white-space: nowrap;
}

.admin-actions-heading,
.admin-user-action-cell {
  text-align: center !important;
}

.admin-user-action-cell :deep(.v-input) {
  display: flex;
  justify-content: center;
}

.admin-user-action-cell :deep(.v-selection-control) {
  min-height: 40px;
}

.admin-self-note {
  display: block;
  margin-top: -0.15rem;
  text-align: center;
  white-space: nowrap;
}

.admin-users-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.9rem;
  color: #718584;
  font-size: 0.75rem;
}

.admin-users-pagination :deep(.v-pagination__list) {
  justify-content: flex-start;
}

.admin-status-dialog-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.35rem 1.5rem 0.5rem;
  color: #254849;
  font-size: 1.1rem;
  font-weight: 850;
}

.admin-dialog-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px;
}

.admin-dialog-icon.is-activate {
  color: #347c61;
  background: #eff8f3;
}

.admin-dialog-icon.is-deactivate {
  color: #b83f42;
  background: #fff2f1;
}

.admin-status-dialog :deep(.v-card-text) {
  padding: 0.6rem 1.5rem 0.9rem;
  color: #647b7a;
  font-size: 0.86rem;
  line-height: 1.9;
}

.admin-status-dialog :deep(.v-card-text p) {
  margin-block: 0.35rem;
}

.admin-status-dialog :deep(.v-card-text strong) {
  margin-inline: 0.2rem;
  color: #254849;
}

.admin-deactivation-note {
  padding: 0.65rem 0.8rem;
  border-inline-start: 3px solid #e9b35a;
  border-radius: 8px;
  color: #816a42;
  background: #fff9ed;
  font-size: 0.78rem;
}

.admin-dialog-error {
  margin-top: 0.8rem;
  font-size: 0.78rem;
}

.admin-status-dialog-actions {
  padding: 0.7rem 1.5rem 1.3rem;
}

@media (max-width: 720px) {
  .admin-users-page {
    padding-block: 1.3rem;
  }

  .admin-users-header {
    align-items: flex-start;
  }

  .admin-users-toolbar {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    padding: 1.1rem 1rem 0.2rem;
  }

  .admin-users-table-area {
    padding-inline: 1rem;
  }
}

@media (max-width: 520px) {
  .admin-users-header {
    flex-direction: column;
    align-items: stretch;
  }

  .admin-refresh-button {
    align-self: flex-start;
  }

  .admin-users-intro {
    font-size: 0.82rem;
  }

  .admin-users-results-meta,
  .admin-users-pagination {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-users-pagination :deep(.v-pagination__list) {
    justify-content: center;
  }
}
</style>
