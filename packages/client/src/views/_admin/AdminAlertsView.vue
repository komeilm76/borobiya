<template>
  <AdminShell
    active="alerts"
    title="هشدارهای نیازمند بررسی"
    description="الگوهای مشکوک در لغو مأموریت‌ها را سرویس لغو ثبت می‌کند؛ تصمیم نهایی با مدیر است."
    :crumbs="['سامانه', 'هشدارها']"
  >
    <template #actions>
      <v-btn-toggle v-model="filter" mandatory divided color="primary" variant="outlined" rounded="lg">
        <v-btn v-for="option in filters" :key="option.value" :value="option.value">{{ option.label }}</v-btn>
      </v-btn-toggle>
      <v-btn variant="tonal" color="primary" rounded="lg" :loading="loading" @click="load">
        <v-icon class="ms-2" icon="mdi-refresh" size="17" />
        به‌روزرسانی
      </v-btn>
    </template>

    <AdminStatePanel v-if="state === 'loading'" state="loading" title="در حال خواندن صف هشدارها…" />
    <AdminStatePanel
      v-else-if="state === 'forbidden'"
      state="forbidden"
      title="دسترسی به هشدارها برای نقش شما مجاز نیست"
      description="صف بررسی فقط برای مدیران سامانه باز است."
    />
    <AdminStatePanel
      v-else-if="state === 'error'"
      state="error"
      title="خواندن صف هشدارها ناموفق بود"
      :description="errorMessage"
      :reference="errorReference"
      action-label="تلاش دوباره"
      action-icon="mdi-refresh"
      @retry="load"
    />
    <AdminStatePanel
      v-else-if="alerts.length === 0"
      state="empty"
      :title="filter === 'open' ? 'صف بررسی خالی است' : 'هشداری با این پالایه ثبت نشده است'"
      :description="
        filter === 'open'
          ? 'همهٔ هشدارهای ثبت‌شده بررسی شده‌اند؛ مورد جدیدی در انتظار تصمیم نیست.'
          : 'پالایه را عوض کنید تا هشدارهای بررسی‌شده یا همهٔ موارد دیده شود.'
      "
      :action-label="filter === 'open' ? 'دیدن همهٔ هشدارها' : 'دیدن صف باز'"
      action-icon="mdi-filter-variant"
      @retry="filter = filter === 'open' ? 'all' : 'open'"
    />

    <template v-else>
      <section class="alerts-summary" aria-label="خلاصهٔ صف">
        <article class="alerts-summary__tile">
          <p>در انتظار بررسی</p>
          <strong>{{ toFa(openCount) }}</strong>
        </article>
        <article class="alerts-summary__tile">
          <p>بررسی‌شده</p>
          <strong>{{ toFa(resolvedCount) }}</strong>
        </article>
        <article class="alerts-summary__tile alerts-summary__tile--wide">
          <p>قاعدهٔ ثبت خودکار</p>
          <span>بیش از آستانهٔ لغو روزانه یا انتخاب دلیل «سایر» توسط امدادگر.</span>
        </article>
      </section>

      <ul class="alert-list" role="list" aria-label="هشدارها">
        <li v-for="alert in alerts" :key="alert.id" class="alert-card" :class="{ 'alert-card--resolved': alert.resolvedAt }">
          <div class="alert-card__mark" :class="alert.resolvedAt ? 'is-resolved' : 'is-open'">
            <v-icon :icon="alert.resolvedAt ? 'mdi-check-circle-outline' : 'mdi-alert-decagram-outline'" size="22" />
          </div>

          <div class="alert-card__body">
            <header>
              <h2>{{ typeLabel(alert.type) }}</h2>
              <span class="alert-card__badge" :class="alert.resolvedAt ? 'is-resolved' : 'is-open'">
                {{ alert.resolvedAt ? "بررسی‌شده" : "در انتظار" }}
              </span>
            </header>

            <p class="alert-card__meta">
              <span>امدادگر: <strong>{{ alert.username }}</strong></span>
              <span>ثبت: {{ dateOf(alert.createdAt) }}</span>
              <span v-if="alert.resolvedAt">بررسی: {{ dateOf(alert.resolvedAt) }}</span>
            </p>

            <p v-if="detailLine(alert)" class="alert-card__detail">{{ detailLine(alert) }}</p>
          </div>

          <div class="alert-card__actions">
            <RouterLink
              v-if="alert.sosRequestId"
              class="alert-card__link"
              :to="{ path: '/_admin/dispatch', query: { request: alert.sosRequestId } }"
            >
              <v-icon icon="mdi-map-marker-radius-outline" size="16" />
              دیدن در میز اعزام
            </RouterLink>
            <v-btn
              v-if="!alert.resolvedAt"
              variant="tonal"
              color="primary"
              rounded="lg"
              size="small"
              :loading="resolvingId === alert.id"
              :disabled="resolvingId !== null"
              @click="resolve(alert)"
            >
              ثبت بررسی
            </v-btn>
            <span v-else class="alert-card__done">بدون اقدام باقی‌مانده</span>
          </div>
        </li>
      </ul>

      <footer v-if="totalPages > 1" class="alerts-pagination">
        <span>صفحهٔ {{ toFa(page) }} از {{ toFa(totalPages) }}</span>
        <v-pagination
          :model-value="page"
          :length="totalPages"
          :total-visible="5"
          density="comfortable"
          rounded="circle"
          @update:model-value="goToPage"
        />
      </footer>
    </template>

    <v-snackbar v-model="snackbar" :timeout="3200" location="bottom">
      {{ snackbarText }}
    </v-snackbar>
  </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AdminAlert } from "@shared/index";
import { listAdminAlerts, resolveAdminAlert } from "../../api/admin-governance";
import { friendlyErrorMessage } from "../../api/error-message";
import { ApiError } from "../../api/http";
import AdminShell from "../../components/admin/AdminShell.vue";
import AdminStatePanel from "../../components/admin/AdminStatePanel.vue";
import { useAuthStore } from "../../stores/auth";
import { adminSessionToken } from "../../admin/admin-token";

/**
 * The queue is a decision surface, not a log: every open row has exactly one action (mark reviewed) and one
 * escape hatch (open the SOS in the dispatch board). Resolution is idempotent server-side, so a double click
 * from two admins cannot fail here.
 */
const PAGE_SIZE = 20;

type Filter = "open" | "resolved" | "all";

const filters = [
  { value: "open", label: "در انتظار" },
  { value: "resolved", label: "بررسی‌شده" },
  { value: "all", label: "همه" }
] as const;

const TYPES: Record<string, { label: string; detail?: string }> = {
  rescuer_cancel_review: {
    label: "لغو مکرر مأموریت",
    detail: "تعداد لغوهای امروز از آستانهٔ تعیین‌شده در تنظیمات گذشته است."
  },
  rescuer_other_reason_approval: {
    label: "لغو با دلیل «سایر»",
    detail: "دلیل انتخابی امدادگر نیازمند تأیید مستقل مدیر است."
  }
};

const auth = useAuthStore();
const filter = ref<Filter>("open");
const alerts = ref<AdminAlert[]>([]);
const total = ref(0);
const totalPages = ref(0);
const page = ref(1);
const loading = ref(true);
const error = ref<unknown>(null);
const forbidden = ref(false);
const resolvingId = ref<string | null>(null);
const snackbar = ref(false);
const snackbarText = ref("");

const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

let controller: AbortController | null = null;

const state = computed(() => {
  if (loading.value) return "loading" as const;
  if (forbidden.value) return "forbidden" as const;
  if (error.value) return "error" as const;
  return "ready" as const;
});

const errorMessage = computed(() => (error.value ? friendlyErrorMessage(error.value, "لطفاً دوباره تلاش کنید.") : ""));
const errorReference = computed(() => (error.value instanceof ApiError ? error.value.code : ""));
const openCount = computed(() => alerts.value.filter((alert) => alert.resolvedAt === null).length);
const resolvedCount = computed(() => alerts.value.length - openCount.value);

function toFa(value: number): string {
  return numberFormatter.format(value);
}

function typeLabel(type: string): string {
  return TYPES[type]?.label ?? type;
}

function detailLine(alert: AdminAlert): string {
  const details = alert.details ?? {};
  const parts: string[] = [];
  if (typeof details.countToday === "number") parts.push(`${toFa(details.countToday)} لغو در همین روز`);
  if (typeof details.threshold === "number") parts.push(`آستانهٔ فعلی ${toFa(details.threshold)}`);
  if (typeof details.date === "string") parts.push(details.date);
  if (parts.length === 0) {
    const known = TYPES[alert.type]?.detail;
    if (known) parts.push(known);
  }
  return parts.join(" · ");
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
    const result = await listAdminAlerts(accessToken, {
      resolved: filter.value === "all" ? undefined : filter.value === "resolved",
      page: page.value,
      limit: PAGE_SIZE,
      signal: controller.signal
    });
    alerts.value = result.items;
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

async function resolve(alert: AdminAlert): Promise<void> {
  if (resolvingId.value !== null) return;
  const accessToken = await adminSessionToken(auth);
  if (!accessToken) {
    snackbarText.value = "نشست مدیر منقضی شده است؛ دوباره وارد شوید.";
    snackbar.value = true;
    return;
  }
  resolvingId.value = alert.id;
  try {
    const updated = await resolveAdminAlert(accessToken, alert.id);
    // Patch the row in place: re-reading the page would drop the admin back to page 1 of a queue they were
    // halfway through.
    alerts.value = alerts.value.map((item) => (item.id === updated.id ? updated : item));
    snackbarText.value = "بررسی هشدار ثبت شد و در دفتر رویدادها ماندگار شد.";
    snackbar.value = true;
    if (filter.value === "open") {
      // The row leaves the "open" queue, so the counters and the page have to follow it: a pager that still
      // claims three open alerts for two rows, or a last page emptied by the resolve, is a lie.
      alerts.value = alerts.value.filter((item) => item.resolvedAt === null);
      total.value = Math.max(0, total.value - 1);
      totalPages.value = Math.max(1, Math.ceil(total.value / PAGE_SIZE));
      if (alerts.value.length === 0 && page.value > 1) {
        page.value -= 1;
        void load();
      }
    }
  } catch (caught) {
    snackbarText.value = friendlyErrorMessage(caught, "ثبت بررسی ناموفق بود.");
    snackbar.value = true;
  } finally {
    resolvingId.value = null;
  }
}

function goToPage(next: number): void {
  page.value = next;
  void load();
}

watch(filter, () => {
  page.value = 1;
  void load();
});

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  controller?.abort();
});
</script>

<style scoped>
.alerts-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 150px)) minmax(0, 1fr);
  gap: 12px;
  margin-block-end: 16px;
}

.alerts-summary__tile {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 14px 16px;
  background: rgb(var(--v-theme-surface));
}

.alerts-summary__tile p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.82rem;
}

.alerts-summary__tile strong {
  display: block;
  margin-block-start: 4px;
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.alerts-summary__tile--wide span {
  display: block;
  margin-block-start: 6px;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.alert-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.alert-card {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
}

.alert-card--resolved {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.alert-card__mark {
  display: grid;
  place-items: center;
  inline-size: 40px;
  block-size: 40px;
  border-radius: 12px;
}

.alert-card__mark.is-open {
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-warning));
}

.alert-card__mark.is-resolved {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.alert-card__body header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.alert-card__body h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.alert-card__badge {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.alert-card__badge.is-open {
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-warning));
}

.alert-card__badge.is-resolved {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.alert-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 8px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 0.84rem;
}

.alert-card__detail {
  margin: 8px 0 0;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.alert-card__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.alert-card__link {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: rgb(var(--v-theme-primary));
  font-size: 0.84rem;
  text-decoration: none;
}

.alert-card__link:hover {
  text-decoration: underline;
}

.alert-card__done {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.82rem;
}

.alerts-pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-block-start: 16px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.84rem;
}

@media (max-width: 900px) {
  .alerts-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .alerts-summary__tile--wide {
    grid-column: 1 / -1;
  }

  .alert-card {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .alert-card__actions {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    inline-size: 100%;
  }
}
</style>
