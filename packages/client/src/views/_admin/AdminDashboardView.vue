<template>
  <AdminShell
    active="dashboard"
    title="نمای کلی عملیات"
    description="وضعیت لحظه‌ای درخواست‌های امداد، بار کاری گروه‌ها و آمادگی امدادگران."
    :crumbs="['عملیات', 'نمای کلی']"
  >
    <template #actions>
      <span class="admin-live" :class="{ 'admin-live--on': liveConnected }" role="status">
        <i aria-hidden="true" />
        <span>{{ liveConnected ? "جریان زنده" : "اتصال زنده برقرار نیست" }}</span>
        <small v-if="lastLiveAt">{{ lastEventLabel }}</small>
      </span>
      <v-btn
        class="admin-refresh"
        variant="tonal"
        color="primary"
        rounded="lg"
        :loading="loading"
        :disabled="loading"
        @click="loadAll()"
      >
        <v-icon class="ms-2" icon="mdi-refresh" size="17" />
        به‌روزرسانی
      </v-btn>
      <v-btn variant="flat" color="primary" rounded="lg" to="/_admin/dispatch">
        <v-icon class="ms-2" icon="mdi-alarm-light-outline" size="17" />
        تابلوی اعزام
      </v-btn>
    </template>

    <div v-if="!isOnline" class="admin-banner admin-banner--offline" role="status">
      <v-icon icon="mdi-cloud-off-outline" size="18" />
      <span>
        اتصال به سرور قطع است؛ اعداد زیر از آخرین دریافت موفق هستند و به‌روزرسانی زنده متوقف شده است.
      </span>
      <button type="button" class="admin-banner__action" @click="loadAll()">تلاش دوباره</button>
    </div>

    <AdminStatePanel
      v-if="state === 'loading'"
      state="loading"
      title="در حال دریافت وضعیت عملیات…"
    />
    <AdminStatePanel
      v-else-if="state === 'forbidden'"
      state="forbidden"
      title="دسترسی به نمای کلی برای نقش شما مجاز نیست"
      description="این صفحه فقط برای مدیران سامانه باز است. از مدیر ارشد بخواهید نقش شما را تغییر دهد."
    />
    <AdminStatePanel
      v-else-if="state === 'error'"
      state="error"
      :title="errorTitle"
      :description="errorDescription"
      :reference="errorReference"
      action-label="تلاش دوباره"
      action-icon="mdi-refresh"
      @retry="loadAll()"
    />

    <template v-else>
      <section class="admin-kpis" aria-label="شاخص‌های کلیدی">
        <article
          v-for="tile in kpis"
          :key="tile.label"
          class="admin-kpi"
          :class="`admin-kpi--${tile.tone}`"
        >
          <span class="admin-kpi__icon"><v-icon :icon="tile.icon" size="19" /></span>
          <p class="admin-kpi__label">{{ tile.label }}</p>
          <p class="admin-kpi__value">{{ tile.value }}</p>
          <p class="admin-kpi__meta">{{ tile.meta }}</p>
        </article>
      </section>

      <div class="admin-grid">
        <section class="admin-card admin-grid__main">
          <header class="admin-card__head">
            <h2>
              <v-icon icon="mdi-clipboard-list-outline" size="19" />
              صف درخواست‌های باز
            </h2>
            <RouterLink class="admin-card__link" to="/_admin/dispatch">
              همهٔ درخواست‌ها
              <v-icon icon="mdi-chevron-left" size="16" />
            </RouterLink>
          </header>

          <AdminStatePanel
            v-if="openRequests.length === 0"
            state="empty"
            title="درخواست بازی در صف نیست"
            description="همهٔ درخواست‌های ثبت‌شده بسته یا تحویل شده‌اند؛ صف با ثبت SOS تازه پر می‌شود."
          />
          <div v-else class="admin-table" role="table">
            <div class="admin-table__head" role="row">
              <span role="columnheader">درخواست</span>
              <span role="columnheader">شدت</span>
              <span role="columnheader">وضعیت</span>
              <span role="columnheader">زمان ثبت</span>
            </div>
            <div v-for="request in openRequests" :key="request.id" class="admin-table__row" role="row">
              <span class="admin-table__primary">
                <strong>{{ describeRequest(request) }}</strong>
                <small>{{ shortId(request.id) }} · {{ formatTime(request.createdAt) }}</small>
              </span>
              <span>
                <span class="admin-pill" :class="`admin-pill--${severityTone(request.severity)}`">
                  {{ severityLabel(request.severity) }}
                </span>
              </span>
              <span>
                <span class="admin-pill" :class="`admin-pill--${statusTone(request.status)}`">
                  {{ statusLabel(request.status) }}
                </span>
              </span>
              <span class="admin-table__time">{{ formatRelative(request.createdAt) }}</span>
            </div>
          </div>
        </section>

        <section class="admin-card admin-grid__rail">
          <header class="admin-card__head">
            <h2>
              <v-icon icon="mdi-lifebuoy" size="19" />
              آمادگی گروه‌ها
            </h2>
            <RouterLink class="admin-card__link" to="/_admin/services">
              مدیریت
              <v-icon icon="mdi-chevron-left" size="16" />
            </RouterLink>
          </header>

          <AdminStatePanel
            v-if="groups.length === 0"
            state="empty"
            title="گروه امدادی ثبت نشده است"
            description="برای تخصیص مأموریت، حداقل یک گروه با عضو و نوع حادثهٔ پوشش‌داده‌شده بسازید."
            action-label="ساخت گروه امداد"
            action-icon="mdi-plus"
            @retry="router.push('/_admin/services')"
          />
          <ul v-else class="admin-groups" role="list" aria-label="آمادگی گروه‌های امداد">
            <li v-for="group in groups" :key="group.id" class="admin-groups__item">
              <span class="admin-groups__dot" :class="`admin-groups__dot--${group.state}`" />
              <span class="admin-groups__meta">
                <strong>{{ group.name }}</strong>
                <small>{{ group.members }} عضو · پوشش {{ group.coverage }} نوع حادثه</small>
              </span>
              <span class="admin-pill" :class="`admin-pill--${group.state}`">
                {{ groupLabel(group.state) }}
              </span>
            </li>
          </ul>

          <footer class="admin-rail__foot">
            <span>اعضای بدون گروه</span>
            <strong>{{ toFa(people.withoutGroup) }}</strong>
          </footer>
        </section>
      </div>

      <section class="admin-card">
        <header class="admin-card__head">
          <h2>
            <v-icon icon="mdi-chart-timeline-variant" size="19" />
            روند ۷ روز گذشته
          </h2>
          <button type="button" class="admin-card__link" @click="router.push('/_admin/reports')">
            گزارش کامل
            <v-icon icon="mdi-chevron-left" size="16" />
          </button>
        </header>
        <ol class="admin-trend" aria-label="تعداد درخواست در هر روز">
          <li v-for="point in trend" :key="point.date" class="admin-trend__item">
            <span class="admin-trend__bar" :style="{ height: barHeight(point.count) }" />
            <span class="admin-trend__value">{{ toFa(point.count) }}</span>
            <span class="admin-trend__label">{{ weekday(point.date) }}</span>
          </li>
        </ol>
        <p v-if="truncated" class="admin-hint">
          فقط {{ toFa(records.length) }} درخواست آخر خوانده شده است؛ برای دقت بیشتر بازهٔ گزارش را کوتاه کنید.
        </p>
      </section>
    </template>
  </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { Category, IncidentType, SosRequestRecord, UserProfile } from "@shared/index";
import AdminShell from "../../components/admin/AdminShell.vue";
import AdminStatePanel from "../../components/admin/AdminStatePanel.vue";
import { ApiError } from "../../api/http";
import { friendlyErrorMessage } from "../../api/error-message";
import { useOnlineStatus } from "../../composables/online-status";
import { listAdminSosRequests } from "../../api/admin-sos";
import { listAdminUsers } from "../../api/admin-users";
import { listCategories, listIncidentTypes } from "../../api/admin-catalog";
import {
  MISSION_CANCELLED_BY_RESCUER_EVENT,
  SOS_NEW_REQUEST_EVENT
} from "../../services/socket-events";
import type { RealtimeClient } from "../../services/socket";
import { useAuthStore } from "../../stores/auth";
import {
  dailySeries,
  dashboardTotals,
  groupReadiness,
  isOpenRequest,
  share,
  userTotals
} from "../../utils/admin-metrics";

const PAGES_TO_READ = 3;
const PAGE_SIZE = 100;

const router = useRouter();
const auth = useAuthStore();

const records = ref<SosRequestRecord[]>([]);
const users = ref<UserProfile[]>([]);
const categories = ref<Category[]>([]);
const incidentTypes = ref<IncidentType[]>([]);
const loading = ref(true);
const error = ref<unknown>(null);
const forbidden = ref(false);
const truncated = ref(false);
const { isOnline } = useOnlineStatus();
const liveConnected = ref(false);
const lastLiveAt = ref<Date | null>(null);

const numberFormatter = new Intl.NumberFormat("fa-IR");
const timeFormatter = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const weekdayFormatter = new Intl.DateTimeFormat("fa-IR", { weekday: "short" });

let controller: AbortController | null = null;
let live: RealtimeClient | null = null;
let liveTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesces a burst of events into one refresh: ten arrivals are one read, not ten. */
const LIVE_REFRESH_DELAY_MS = 1500;

function toFa(value: number): string {
  return numberFormatter.format(value);
}

const totals = computed(() => dashboardTotals(records.value));
const people = computed(() => userTotals(users.value));
const groups = computed(() => groupReadiness(categories.value, incidentTypes.value));
const trend = computed(() => dailySeries(records.value, 7));
const openRequests = computed(() =>
  records.value
    .filter(isOpenRequest)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 6)
);

const state = computed(() => {
  if (loading.value) return "loading" as const;
  if (forbidden.value) return "forbidden" as const;
  if (error.value) return "error" as const;
  return "ready" as const;
});

const errorReference = computed(() => {
  if (error.value instanceof ApiError && error.value.code) return error.value.code;
  return undefined;
});

const errorTitle = computed(() =>
  isOnline.value ? "دریافت داده‌های پنل ناموفق بود" : "ارتباط با سرور برقرار نشد"
);

const errorDescription = computed(() =>
  error.value
    ? friendlyErrorMessage(error.value, "لطفاً چند لحظه بعد دوباره تلاش کنید.")
    : "لطفاً چند لحظه بعد دوباره تلاش کنید."
);

const kpis = computed(() => [
  {
    label: "درخواست‌های باز",
    value: toFa(totals.value.open),
    meta: `${toFa(totals.value.today)} درخواست امروز`,
    tone: totals.value.open > 0 ? "danger" : "success",
    icon: "mdi-alarm-light-outline"
  },
  {
    label: "امدادگران فعال",
    value: toFa(people.value.active),
    meta: `${toFa(people.value.total)} حساب در سامانه`,
    tone: "success",
    icon: "mdi-account-heart-outline"
  },
  {
    label: "بدون گروه امداد",
    value: toFa(people.value.withoutGroup),
    meta: `${toFa(share(people.value.withoutGroup, people.value.total))}٪ از حساب‌ها`,
    tone: people.value.withoutGroup > 0 ? "warning" : "success",
    icon: "mdi-account-alert-outline"
  },
  {
    label: "گروه‌های آماده",
    value: `${toFa(groups.value.filter((group) => group.state === "ready").length)} از ${toFa(groups.value.length)}`,
    meta: `${toFa(groups.value.filter((group) => group.state !== "ready").length)} گروه نیازمند توجه`,
    tone: groups.value.every((group) => group.state === "ready") ? "success" : "warning",
    icon: "mdi-lifebuoy"
  }
]);

function barHeight(count: number): string {
  const max = Math.max(...trend.value.map((point) => point.count), 1);
  return `${Math.max(6, Math.round((count / max) * 96))}px`;
}

function weekday(iso: string): string {
  return weekdayFormatter.format(new Date(`${iso}T00:00:00`));
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : timeFormatter.format(date);
}

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${toFa(minutes)} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${toFa(hours)} ساعت پیش`;
  return `${toFa(Math.round(hours / 24))} روز پیش`;
}

function shortId(id: string): string {
  return `#${id.slice(0, 6)}`;
}

function describeRequest(request: SosRequestRecord): string {
  const type = incidentTypes.value.find((item) => item.id === request.incidentTypeId);
  return type?.name ?? "درخواست امداد";
}

function severityLabel(severity: SosRequestRecord["severity"]): string {
  return { low: "کم", medium: "متوسط", high: "بحرانی" }[severity];
}

function severityTone(severity: SosRequestRecord["severity"]): string {
  return { low: "success", medium: "warning", high: "danger" }[severity];
}

function statusLabel(status: SosRequestRecord["status"]): string {
  return (
    {
      pending: "در انتظار",
      dispatched: "در حال اعزام",
      accepted: "پذیرفته شد",
      completed: "پایان‌یافته",
      expired: "منقضی",
      cancelled_by_requester: "لغو توسط درخواست‌دهنده",
      cancelled_by_rescuer: "لغو توسط امدادگر"
    } as Record<string, string>
  )[status] ?? status;
}

function statusTone(status: SosRequestRecord["status"]): string {
  if (status === "pending") return "warning";
  if (status === "dispatched") return "warning";
  if (status === "accepted") return "success";
  if (status.startsWith("cancelled") || status === "expired") return "danger";
  return "neutral";
}

function groupLabel(state: "ready" | "thin" | "empty"): string {
  return { ready: "آماده", thin: "کمبود نیرو", empty: "بدون عضو" }[state];
}

async function loadAll(options: { silent?: boolean } = {}): Promise<void> {
  try {
    await auth.ensureSession();
  } catch {
    /* handled by the empty token branch below */
  }
  const accessToken = auth.accessToken;
  if (!accessToken) {
    loading.value = false;
    forbidden.value = true;
    return;
  }

  controller?.abort();
  controller = new AbortController();
  // A live refresh must not replace the screen with a skeleton; the previous numbers stay visible until
  // the new ones land.
  if (!options.silent) loading.value = true;
  error.value = null;
  forbidden.value = false;

  try {
    const [firstPage, userPage, categoryList, typeList] = await Promise.all([
      listAdminSosRequests(accessToken, { page: 1, limit: PAGE_SIZE, signal: controller.signal }),
      listAdminUsers({ page: 1, limit: PAGE_SIZE }, accessToken, controller.signal),
      listCategories(accessToken, controller.signal),
      listIncidentTypes(accessToken, controller.signal)
    ]);

    const pages = [firstPage];
    const lastPage = Math.min(firstPage.totalPages, PAGES_TO_READ);
    for (let page = 2; page <= lastPage; page += 1) {
      pages.push(await listAdminSosRequests(accessToken, { page, limit: PAGE_SIZE, signal: controller.signal }));
    }

    records.value = pages.flatMap((page) => page.items);
    truncated.value = firstPage.totalPages > PAGES_TO_READ;
    users.value = userPage.items;
    categories.value = categoryList;
    incidentTypes.value = typeList;
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return;
    if (caught instanceof ApiError && caught.status === 403) forbidden.value = true;
    else error.value = caught;
  } finally {
    loading.value = false;
  }
}

/**
 * The dashboard is the screen an on-call admin leaves open, so it follows the same admin room the dispatch
 * board uses: a new SOS or a rescuer cancellation refreshes it without a manual press. The socket library is
 * imported lazily for the same reason the dispatch store does it — it must not join the first bundle for
 * users who never open an admin page.
 */
async function startLive(): Promise<void> {
  if (live || !auth.accessToken) return;
  try {
    const { createRealtimeClient } = await import("../../services/socket");
    const client = createRealtimeClient(auth.accessToken);
    client.socket.on("connect", () => {
      liveConnected.value = true;
    });
    client.socket.on("disconnect", () => {
      liveConnected.value = false;
    });
    client.socket.on(SOS_NEW_REQUEST_EVENT, scheduleLiveRefresh);
    client.socket.on(MISSION_CANCELLED_BY_RESCUER_EVENT, scheduleLiveRefresh);
    client.connect();
    live = client;
    liveConnected.value = client.socket.connected;
  } catch {
    // A missing socket is a degraded dashboard, not a broken one: the manual refresh still works.
    liveConnected.value = false;
  }
}

function scheduleLiveRefresh(): void {
  lastLiveAt.value = new Date();
  if (liveTimer !== null) clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    liveTimer = null;
    void loadAll({ silent: true });
  }, LIVE_REFRESH_DELAY_MS);
}

function stopLive(): void {
  if (liveTimer !== null) {
    clearTimeout(liveTimer);
    liveTimer = null;
  }
  live?.close();
  live = null;
  liveConnected.value = false;
}

const lastEventLabel = computed(() =>
  lastLiveAt.value === null ? "" : timeFormatter.format(lastLiveAt.value)
);

onMounted(() => {
  void loadAll().then(() => startLive());
});

onBeforeUnmount(() => {
  controller?.abort();
  stopLive();
});
</script>

<style scoped>
.admin-live {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 999px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
  white-space: nowrap;
}

.admin-live i {
  inline-size: 8px;
  block-size: 8px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.35);
}

.admin-live--on {
  border-color: rgba(var(--v-theme-success), 0.45);
  color: rgb(var(--v-theme-success));
}

.admin-live--on i {
  background: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.6);
  animation: admin-live-pulse 2.4s ease-out infinite;
}

.admin-live small {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

@keyframes admin-live-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.55);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(var(--v-theme-success), 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-live--on i {
    animation: none;
  }
}
.admin-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 1rem;
  border-radius: 14px;
  font-size: 0.8rem;
  line-height: 1.7;
}

.admin-banner--offline {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgb(var(--v-theme-on-surface));
}

.admin-banner__action {
  margin-inline-start: auto;
  padding: 0.25rem 0.7rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.admin-kpis {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.admin-kpi {
  position: relative;
  display: grid;
  gap: 0.2rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
}

.admin-kpi__icon {
  position: absolute;
  inset-inline-start: 1rem;
  top: 1rem;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.admin-kpi--success .admin-kpi__icon {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.admin-kpi--warning .admin-kpi__icon {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}

.admin-kpi--danger .admin-kpi__icon {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}

.admin-kpi__label {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.82rem;
  text-align: start;
}

.admin-kpi__value {
  margin: 0;
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1.4;
}

.admin-kpi__meta {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.82rem;
}

.admin-grid {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: minmax(0, 1.8fr) minmax(260px, 0.9fr);
}

.admin-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
}

.admin-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.admin-card__head h2 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}

.admin-card__link {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  border: 0;
  background: none;
  color: rgb(var(--v-theme-primary));
  font: inherit;
  font-size: 0.82rem;
  text-decoration: none;
  cursor: pointer;
}

.admin-table {
  display: grid;
  gap: 0.15rem;
}

.admin-table__head,
.admin-table__row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 90px 120px 90px;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.4rem;
}

.admin-table__head {
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.admin-table__row + .admin-table__row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}

.admin-table__primary {
  display: grid;
  line-height: 1.4;
}

.admin-table__primary strong {
  font-size: 0.85rem;
}

.admin-table__primary small,
.admin-table__time {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.admin-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.admin-pill--success {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.admin-pill--warning,
.admin-pill--thin {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}

.admin-pill--danger,
.admin-pill--empty {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}

.admin-pill--ready {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.admin-pill--neutral {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.admin-groups {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin-groups__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.admin-groups__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.admin-groups__dot--ready {
  background: rgb(var(--v-theme-success));
}

.admin-groups__dot--thin {
  background: rgb(var(--v-theme-warning));
}

.admin-groups__dot--empty {
  background: rgb(var(--v-theme-error));
}

.admin-groups__meta {
  display: grid;
  flex: 1;
  line-height: 1.4;
}

.admin-groups__meta strong {
  font-size: 0.84rem;
}

.admin-groups__meta small {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.8rem;
}

.admin-rail__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 0.7rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.82rem;
}

.admin-trend {
  display: flex;
  align-items: flex-end;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin-trend__item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.8rem;
}

.admin-trend__bar {
  width: 100%;
  max-width: 44px;
  border-radius: 8px 8px 4px 4px;
  background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.85), rgba(var(--v-theme-primary), 0.45));
}

.admin-trend__value {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.82rem;
  font-weight: 600;
}

.admin-hint {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.82rem;
}

.admin-refresh {
  text-transform: none;
}

@media (max-width: 1100px) {
  .admin-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-table__head,
  .admin-table__row {
    grid-template-columns: minmax(0, 1fr) 80px 104px;
  }

  .admin-table__time {
    display: none;
  }
}
</style>
