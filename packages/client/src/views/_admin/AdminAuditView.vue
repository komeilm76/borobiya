<template>
  <AdminShell
    active="audit"
    title="گزارش رویدادها"
    description="هر اقدام مدیریتی که دادهٔ سامانه را تغییر داده، با مدیر، زمان و جزئیات در این دفتر ثبت می‌شود."
    :crumbs="['سامانه', 'گزارش رویدادها']"
  >
    <template #actions>
      <v-btn
        variant="tonal"
        color="primary"
        rounded="lg"
        :disabled="entries.length === 0"
        @click="exportCsv"
      >
        <v-icon class="ms-2" icon="mdi-download-outline" size="17" />
        خروجی CSV
      </v-btn>
      <v-btn variant="text" rounded="lg" :loading="loading" @click="load">
        <v-icon class="ms-2" icon="mdi-refresh" size="17" />
        بازخوانی
      </v-btn>
    </template>

    <section class="audit-filters" aria-label="پالایهٔ رویدادها">
      <v-text-field
        v-model="draftAction"
        class="audit-filters__search"
        label="جست‌وجوی نوع اقدام"
        placeholder="مثلاً category_created"
        variant="outlined"
        density="comfortable"
        hide-details
        clearable
        dir="ltr"
        @keyup.enter="applyFilters"
      >
        <template #prepend-inner>
          <v-icon icon="mdi-magnify" size="18" />
        </template>
      </v-text-field>

      <v-select
        v-model="targetType"
        class="audit-filters__select"
        :items="targetOptions"
        item-title="label"
        item-value="value"
        label="نوع موجودیت"
        variant="outlined"
        density="comfortable"
        hide-details
        @update:model-value="applyFilters"
      />

      <v-btn class="audit-filters__apply" variant="tonal" color="primary" rounded="lg" @click="applyFilters">
        اعمال پالایه
      </v-btn>
      <v-btn v-if="hasFilters" variant="text" rounded="lg" @click="clearFilters">پاک‌کردن</v-btn>
    </section>

    <AdminStatePanel v-if="state === 'loading'" state="loading" title="در حال خواندن دفتر رویدادها…" />
    <AdminStatePanel
      v-else-if="state === 'forbidden'"
      state="forbidden"
      title="دسترسی به دفتر رویدادها برای نقش شما مجاز نیست"
      description="این دفتر فقط برای مدیران سامانه باز است."
    />
    <AdminStatePanel
      v-else-if="state === 'error'"
      state="error"
      title="خواندن دفتر رویدادها ناموفق بود"
      :description="errorMessage"
      :reference="errorReference"
      action-label="تلاش دوباره"
      action-icon="mdi-refresh"
      @retry="load"
    />
    <AdminStatePanel
      v-else-if="entries.length === 0"
      state="empty"
      title="رویدادی با این پالایه پیدا نشد"
      description="پالایه را پاک کنید یا بازهٔ زمانی دیگری را بررسی کنید."
      action-label="پاک‌کردن پالایه"
      action-icon="mdi-filter-off-outline"
      @retry="clearFilters"
    />

    <template v-else>
      <v-card class="audit-card" elevation="0" rounded="xl">
        <div class="audit-card__scroll">
          <v-table class="audit-table">
            <thead>
              <tr>
                <th scope="col">زمان</th>
                <th scope="col">مدیر</th>
                <th scope="col">اقدام</th>
                <th scope="col">موجودیت</th>
                <th scope="col">جزئیات</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in entries" :key="entry.id">
                <td class="audit-time">
                  <strong>{{ timeOf(entry.createdAt) }}</strong>
                  <small>{{ dateOf(entry.createdAt) }}</small>
                </td>
                <td class="audit-admin">{{ entry.adminUsername ?? "حساب حذف‌شده" }}</td>
                <td>
                  <span class="audit-action">{{ actionLabel(entry.action) }}</span>
                  <small class="audit-action__raw" dir="ltr">{{ entry.action }}</small>
                </td>
                <td class="audit-target">{{ targetLabel(entry.targetType, entry.targetId) }}</td>
                <td class="audit-meta">{{ describe(entry.meta) }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <ul class="audit-mobile" aria-label="رویدادها" role="list">
          <li v-for="entry in entries" :key="`m-${entry.id}`" class="audit-mobile__item">
            <header>
              <span class="audit-action">{{ actionLabel(entry.action) }}</span>
              <time :datetime="entry.createdAt">{{ timeOf(entry.createdAt) }} · {{ dateOf(entry.createdAt) }}</time>
            </header>
            <p>{{ entry.adminUsername ?? "حساب حذف‌شده" }} — {{ targetLabel(entry.targetType, entry.targetId) }}</p>
            <p v-if="describe(entry.meta)" class="audit-mobile__meta">{{ describe(entry.meta) }}</p>
          </li>
        </ul>

        <footer class="audit-card__footer">
          <span>{{ pageSummary }}</span>
          <v-pagination
            v-if="totalPages > 1"
            :model-value="page"
            :length="totalPages"
            :total-visible="5"
            density="comfortable"
            rounded="circle"
            @update:model-value="goToPage"
          />
        </footer>
      </v-card>
    </template>

    <v-snackbar v-model="snackbar" :timeout="3200" location="bottom">
      {{ snackbarText }}
    </v-snackbar>
  </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ApiError } from "../../api/http";
import { listAdminAudit } from "../../api/admin-governance";
import { friendlyErrorMessage } from "../../api/error-message";
import AdminShell from "../../components/admin/AdminShell.vue";
import AdminStatePanel from "../../components/admin/AdminStatePanel.vue";
import { useAuthStore } from "../../stores/auth";
import type { AdminAuditEntry } from "@shared/index";

/**
 * The audit trail is append-only on the server: this view can filter and export it, and has no control that
 * edits or removes a row. The CSV export is produced from the rows on screen, so an admin who filters to one
 * day exports that day rather than whatever happened to be on the server.
 */
const PAGE_SIZE = 25;

const auth = useAuthStore();
const entries = ref<AdminAuditEntry[]>([]);
const total = ref(0);
const totalPages = ref(0);
const page = ref(1);
const draftAction = ref("");
const action = ref("");
const targetType = ref<string>("");
const loading = ref(true);
const error = ref<unknown>(null);
const forbidden = ref(false);
const snackbar = ref(false);
const snackbarText = ref("");

const numberFormatter = new Intl.NumberFormat("fa-IR");
const timeFormatter = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "short", year: "numeric" });
const csvDateFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

let controller: AbortController | null = null;

const targetOptions = [
  { value: "", label: "همه" },
  { value: "user", label: "کاربر" },
  { value: "category", label: "گروه امداد" },
  { value: "incident_type", label: "نوع حادثه" },
  { value: "alert", label: "هشدار" },
  { value: "setting", label: "تنظیمات" },
  { value: "sos_request", label: "درخواست امداد" },
  { value: "mission", label: "مأموریت" }
];

const ACTIONS: Record<string, string> = {
  user_created: "ایجاد کاربر",
  user_activated: "فعال‌سازی کاربر",
  user_deactivated: "غیرفعال‌سازی کاربر",
  user_unsuspended: "رفع تعلیق کاربر",
  category_created: "ایجاد گروه امداد",
  category_updated: "ویرایش گروه امداد",
  category_users_assigned: "افزودن عضو به گروه",
  category_user_removed: "حذف عضو از گروه",
  incident_type_created: "ایجاد نوع حادثه",
  incident_type_updated: "ویرایش نوع حادثه",
  alert_resolved: "بررسی هشدار",
  setting_updated: "تغییر تنظیمات",
  sos_dispatched: "اعزام امدادگر",
  mission_reassigned: "جابه‌جایی مأموریت"
};

const TARGETS: Record<string, string> = {
  user: "کاربر",
  category: "گروه امداد",
  incident_type: "نوع حادثه",
  alert: "هشدار",
  setting: "تنظیمات",
  sos_request: "درخواست امداد",
  mission: "مأموریت"
};

const state = computed(() => {
  if (loading.value) return "loading" as const;
  if (forbidden.value) return "forbidden" as const;
  if (error.value) return "error" as const;
  return "ready" as const;
});

const errorMessage = computed(() => (error.value ? friendlyErrorMessage(error.value, "لطفاً دوباره تلاش کنید.") : ""));
const errorReference = computed(() => (error.value instanceof ApiError ? error.value.code : ""));
const hasFilters = computed(() => action.value !== "" || targetType.value !== "");
const pageSummary = computed(
  () => `صفحهٔ ${numberFormatter.format(page.value)} از ${numberFormatter.format(Math.max(totalPages.value, 1))} · ${numberFormatter.format(total.value)} رویداد`
);

function actionLabel(code: string): string {
  return ACTIONS[code] ?? code;
}

function targetLabel(type: string | null, id: string | null): string {
  if (type === null) return "—";
  const label = TARGETS[type] ?? type;
  return id === null ? label : `${label} · ${id.slice(0, 8)}`;
}

function describe(meta: Record<string, unknown> | null): string {
  if (meta === null) return "";
  return Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

function timeOf(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

function dateOf(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

async function load(): Promise<void> {
  try {
    await auth.ensureSession();
  } catch {
    /* the token branch below reports it */
  }
  const accessToken = auth.accessToken;
  if (!accessToken) {
    loading.value = false;
    forbidden.value = true;
    return;
  }

  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = null;
  forbidden.value = false;

  try {
    const result = await listAdminAudit(accessToken, {
      action: action.value === "" ? undefined : action.value,
      targetType: targetType.value === "" ? undefined : targetType.value,
      page: page.value,
      limit: PAGE_SIZE,
      signal: controller.signal
    });
    entries.value = result.items;
    total.value = result.total;
    totalPages.value = result.totalPages;
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return;
    if (caught instanceof ApiError && caught.status === 403) forbidden.value = true;
    else error.value = caught;
  } finally {
    loading.value = false;
  }
}

function applyFilters(): void {
  action.value = draftAction.value?.trim() ?? "";
  page.value = 1;
  void load();
}

function clearFilters(): void {
  draftAction.value = "";
  action.value = "";
  targetType.value = "";
  page.value = 1;
  void load();
}

function goToPage(next: number): void {
  page.value = next;
  void load();
}

/** RFC 4180 quoting: a comma, quote, or newline in a detail value must not split the cell. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCsv(): void {
  const header = ["createdAt", "admin", "action", "targetType", "targetId", "meta"];
  const rows = entries.value.map((entry) => [
    entry.createdAt,
    entry.adminUsername ?? "",
    entry.action,
    entry.targetType ?? "",
    entry.targetId ?? "",
    describe(entry.meta)
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  // A BOM keeps Excel from decoding the Persian column values as Latin-1.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `admin-audit-${csvDateFormatter.format(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  snackbarText.value = `${numberFormatter.format(entries.value.length)} رویداد در فایل ذخیره شد.`;
  snackbar.value = true;
}

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  controller?.abort();
});
</script>

<style scoped>
.audit-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-block-end: 16px;
}

.audit-filters__search {
  flex: 1 1 260px;
  max-inline-size: 340px;
}

.audit-filters__select {
  flex: 0 1 200px;
}

.audit-card {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}

.audit-card__scroll {
  overflow-x: auto;
}

.audit-table {
  inline-size: 100%;
  font-size: 0.86rem;
}

.audit-table th {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-weight: 600;
  white-space: nowrap;
}

.audit-table td {
  vertical-align: top;
  padding-block: 12px;
}

.audit-time strong,
.audit-time small {
  display: block;
}

.audit-time strong {
  font-variant-numeric: tabular-nums;
}

.audit-time small {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.8rem;
}

.audit-admin {
  white-space: nowrap;
}

.audit-action {
  font-weight: 600;
}

.audit-action__raw {
  display: block;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8rem;
}

.audit-target {
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.audit-meta {
  color: rgba(var(--v-theme-on-surface), 0.62);
  max-inline-size: 380px;
  overflow-wrap: anywhere;
}

.audit-mobile {
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;
}

.audit-mobile__item {
  padding: 14px 16px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.audit-mobile__item header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.audit-mobile__item time {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.8rem;
  white-space: nowrap;
}

.audit-mobile__item p {
  margin: 6px 0 0;
  font-size: 0.84rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
  overflow-wrap: anywhere;
}

.audit-mobile__meta {
  color: rgba(var(--v-theme-on-surface), 0.55) !important;
}

.audit-card__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.84rem;
}

@media (max-width: 850px) {
  .audit-card__scroll {
    display: none;
  }

  .audit-mobile {
    display: block;
  }

  .audit-filters__search,
  .audit-filters__select {
    max-inline-size: none;
    flex: 1 1 100%;
  }

  .audit-filters__apply {
    min-block-size: 44px;
    inline-size: 100%;
  }
}
</style>
