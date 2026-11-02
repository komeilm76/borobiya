<template>
  <AdminShell
    active="reports"
    title="گزارش‌ها و تحلیل عملکرد"
    description="روند درخواست‌ها، توزیع نوع حادثه و بار کاری گروه‌های امداد در بازهٔ انتخابی."
    :crumbs="['عملیات', 'گزارش‌ها']"
  >
    <template #actions>
      <v-btn-toggle v-model="range" mandatory divided color="primary" variant="outlined" rounded="lg">
        <v-btn v-for="option in ranges" :key="option.days" :value="option.days">
          {{ option.label }}
        </v-btn>
      </v-btn-toggle>
      <v-btn
        variant="tonal"
        color="primary"
        rounded="lg"
        :loading="loading"
        :disabled="state !== 'ready' && state !== 'error'"
        @click="load"
      >
        <v-icon class="ms-2" icon="mdi-refresh" size="17" />
        به‌روزرسانی
      </v-btn>
    </template>

    <AdminStatePanel v-if="state === 'loading'" state="loading" title="در حال محاسبهٔ گزارش…" />
    <AdminStatePanel
      v-else-if="state === 'forbidden'"
      state="forbidden"
      title="دسترسی به گزارش‌ها برای نقش شما مجاز نیست"
      description="گزارش‌های عملیاتی فقط برای مدیران سامانه باز است."
    />
    <AdminStatePanel
      v-else-if="state === 'error'"
      state="error"
      title="محاسبهٔ گزارش ناموفق بود"
      :description="errorMessage"
      action-label="تلاش دوباره"
      action-icon="mdi-refresh"
      @retry="load"
    />

    <template v-else>
      <AdminStatePanel
        v-if="windowRecords.length === 0"
        state="empty"
        title="در این بازه درخواستی ثبت نشده است"
        description="بازهٔ بزرگ‌تری انتخاب کنید یا پس از ثبت اولین SOS این گزارش را باز کنید."
        action-label="بازهٔ ۳۰ روز"
        action-icon="mdi-calendar-range"
        @retry="range = 30"
      />

      <template v-else>
        <section class="report-kpis" aria-label="شاخص‌های بازه">
          <article v-for="item in kpis" :key="item.label" class="report-kpi">
            <p class="report-kpi__label">{{ item.label }}</p>
            <p class="report-kpi__value">{{ item.value }}</p>
            <p class="report-kpi__meta">{{ item.meta }}</p>
          </article>
        </section>

        <div class="report-grid">
          <section class="report-card report-grid__wide">
            <header class="report-card__head">
              <h2>روند روزانهٔ درخواست‌ها</h2>
              <p>{{ rangeLabel }}</p>
            </header>
            <ol class="report-chart" :style="{ gridTemplateColumns: `repeat(${daily.length}, minmax(0, 1fr))` }">
              <li v-for="point in daily" :key="point.date" class="report-chart__item">
                <span class="report-chart__bar" :style="{ height: `${barHeight(point.count)}%` }" />
                <span class="report-chart__count">{{ toFa(point.count) }}</span>
                <span class="report-chart__label">{{ shortDate(point.date) }}</span>
              </li>
            </ol>
          </section>

          <section class="report-card">
            <header class="report-card__head">
              <h2>توزیع وضعیت</h2>
            </header>
            <ul class="report-legend">
              <li v-for="slice in statusSlices" :key="slice.label">
                <span class="report-legend__dot" :class="`report-legend__dot--${slice.tone}`" />
                <span class="report-legend__label">{{ slice.label }}</span>
                <span class="report-legend__value">{{ toFa(slice.count) }}</span>
                <span class="report-legend__share">{{ toFa(slice.share) }}٪</span>
              </li>
            </ul>
          </section>

          <section class="report-card">
            <header class="report-card__head">
              <h2>پرخواست‌ترین انواع حادثه</h2>
            </header>
            <ul class="report-ranking">
              <li v-for="(row, index) in ranking" :key="row.id">
                <span class="report-ranking__index">{{ toFa(index + 1) }}</span>
                <span class="report-ranking__label">{{ row.label }}</span>
                <span class="report-ranking__bar">
                  <span :style="{ width: `${shareOfMax(row.count)}%` }" />
                </span>
                <span class="report-ranking__value">{{ toFa(row.count) }}</span>
              </li>
            </ul>
          </section>

          <section class="report-card report-grid__wide">
            <header class="report-card__head">
              <h2>بار کاری گروه‌های امداد</h2>
              <p>بر پایهٔ اعضا و پوشش انواع حادثه</p>
            </header>
            <div class="report-table" role="table">
              <div class="report-table__head" role="row">
                <span role="columnheader">گروه</span>
                <span role="columnheader">اعضا</span>
                <span role="columnheader">پوشش</span>
                <span role="columnheader">وضعیت</span>
              </div>
              <div v-for="group in groups" :key="group.id" class="report-table__row" role="row">
                <span class="report-table__name">{{ group.name }}</span>
                <span>{{ toFa(group.members) }}</span>
                <span>{{ toFa(group.coverage) }} نوع</span>
                <span class="report-pill" :class="`report-pill--${group.state}`">
                  {{ groupLabel(group.state) }}
                </span>
              </div>
            </div>
          </section>
        </div>

        <p class="report-note">
          این گزارش از فهرست درخواست‌های SOS (حداکثر {{ toFa(records.length) }} رکورد اخیر) ساخته می‌شود.
          برای شاخص‌های زیرساختی مثل زمان پاسخ سرور، سرویس تجمیعی سرور لازم است.
        </p>
      </template>
    </template>
  </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Category, IncidentType, SosRequestRecord } from "@shared/index";
import AdminShell from "../../components/admin/AdminShell.vue";
import AdminStatePanel from "../../components/admin/AdminStatePanel.vue";
import { ApiError } from "../../api/http";
import { friendlyErrorMessage } from "../../api/error-message";
import { listAdminSosRequests } from "../../api/admin-sos";
import { listCategories, listIncidentTypes } from "../../api/admin-catalog";
import { useAuthStore } from "../../stores/auth";
import { dailySeries, groupReadiness, isOpenRequest, rankIncidentTypes, share } from "../../utils/admin-metrics";

const PAGE_SIZE = 100;
const MAX_PAGES = 3;

const ranges = [
  { days: 7, label: "۷ روز" },
  { days: 30, label: "۳۰ روز" }
] as const;

const auth = useAuthStore();
const range = ref<number>(7);
const records = ref<SosRequestRecord[]>([]);
const categories = ref<Category[]>([]);
const incidentTypes = ref<IncidentType[]>([]);
const loading = ref(true);
const error = ref<unknown>(null);
const forbidden = ref(false);

const numberFormatter = new Intl.NumberFormat("fa-IR");
const dayMonthFormatter = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "short" });

let controller: AbortController | null = null;

function toFa(value: number): string {
  return numberFormatter.format(value);
}

const state = computed(() => {
  if (loading.value) return "loading" as const;
  if (forbidden.value) return "forbidden" as const;
  if (error.value) return "error" as const;
  return "ready" as const;
});

const errorMessage = computed(() =>
  error.value ? friendlyErrorMessage(error.value, "لطفاً دوباره تلاش کنید.") : ""
);

const rangeLabel = computed(() => (range.value === 7 ? "۷ روز گذشته" : "۳۰ روز گذشته"));

const windowRecords = computed(() => {
  const cutoff = Date.now() - range.value * 24 * 60 * 60 * 1000;
  return records.value.filter((request) => new Date(request.createdAt).getTime() >= cutoff);
});

const daily = computed(() => dailySeries(windowRecords.value, range.value));
const groups = computed(() => groupReadiness(categories.value, incidentTypes.value));
const ranking = computed(() => rankIncidentTypes(windowRecords.value, incidentTypes.value).slice(0, 5));
const maxRanked = computed(() => Math.max(...ranking.value.map((row) => row.count), 1));

const statusSlices = computed(() => {
  const buckets = [
    { label: "در انتظار", tone: "warning", match: (status: string) => status === "pending" },
    { label: "در حال اعزام", tone: "info", match: (status: string) => status === "dispatched" },
    { label: "پذیرفته‌شده", tone: "success", match: (status: string) => status === "accepted" },
    { label: "پایان‌یافته", tone: "success", match: (status: string) => status === "completed" },
    { label: "لغو یا انقضا", tone: "danger", match: (status: string) => status.startsWith("cancelled") || status === "expired" }
  ];
  return buckets
    .map((bucket) => {
      const count = windowRecords.value.filter((request) => bucket.match(request.status)).length;
      return { label: bucket.label, tone: bucket.tone, count, share: share(count, windowRecords.value.length) };
    })
    .filter((slice) => slice.count > 0);
});

const kpis = computed(() => {
  const total = windowRecords.value.length;
  const open = windowRecords.value.filter(isOpenRequest).length;
  const high = windowRecords.value.filter((request) => request.severity === "high").length;
  const completed = windowRecords.value.filter((request) => request.status === "completed").length;
  const cancelRate = share(
    windowRecords.value.filter(
      (request) => request.status.startsWith("cancelled") || request.status === "expired"
    ).length,
    total
  );
  return [
    { label: "کل درخواست‌ها", value: toFa(total), meta: `در ${rangeLabel.value}` },
    { label: "باز یا در جریان", value: toFa(open), meta: `${toFa(share(open, total))}٪ از کل` },
    { label: "بحرانی", value: toFa(high), meta: `${toFa(share(high, total))}٪ از کل` },
    { label: "پایان‌یافته", value: toFa(completed), meta: `${toFa(share(completed, total))}٪ از کل` },
    { label: "نرخ لغو/انقضا", value: `${toFa(cancelRate)}٪`, meta: "پایین‌تر بهتر است" }
  ];
});

function barHeight(count: number): number {
  const max = Math.max(...daily.value.map((point) => point.count), 1);
  return Math.max(4, Math.round((count / max) * 100));
}

function shareOfMax(count: number): number {
  return Math.max(6, Math.round((count / maxRanked.value) * 100));
}

function shortDate(iso: string): string {
  return dayMonthFormatter.format(new Date(`${iso}T00:00:00`));
}

function groupLabel(state: "ready" | "thin" | "empty"): string {
  return { ready: "آماده", thin: "کمبود نیرو", empty: "بدون عضو" }[state];
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
    const [firstPage, categoryList, typeList] = await Promise.all([
      listAdminSosRequests(accessToken, { page: 1, limit: PAGE_SIZE, signal: controller.signal }),
      listCategories(accessToken, controller.signal),
      listIncidentTypes(accessToken, controller.signal)
    ]);
    const pages = [firstPage];
    const lastPage = Math.min(firstPage.totalPages, MAX_PAGES);
    for (let page = 2; page <= lastPage; page += 1) {
      pages.push(await listAdminSosRequests(accessToken, { page, limit: PAGE_SIZE, signal: controller.signal }));
    }
    records.value = pages.flatMap((page) => page.items);
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

watch(range, () => {
  /* the range only re-slices the records already in memory */
});

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  controller?.abort();
});
</script>

<style scoped>
.report-kpis {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.report-kpi {
  display: grid;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
}

.report-kpi__label {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 0.82rem;
}

.report-kpi__value {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.report-kpi__meta {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.8rem;
}

.report-grid {
  display: grid;
  gap: 0.9rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.report-grid__wide {
  grid-column: span 2;
}

.report-card {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem 1.15rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
}

.report-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
}

.report-card__head h2 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
}

.report-card__head p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.82rem;
}

.report-chart {
  display: grid;
  align-items: end;
  gap: 0.4rem;
  height: 190px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.report-chart__item {
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 0.25rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.8rem;
}

.report-chart__bar {
  width: min(30px, 70%);
  border-radius: 6px 6px 3px 3px;
  background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.9), rgba(var(--v-theme-primary), 0.35));
}

.report-chart__count {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.report-legend,
.report-ranking {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.report-legend li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.report-legend__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.report-legend__dot--warning {
  background: rgb(var(--v-theme-warning));
}

.report-legend__dot--danger {
  background: rgb(var(--v-theme-error));
}

.report-legend__dot--success {
  background: rgb(var(--v-theme-success));
}

.report-legend__dot--info {
  background: rgb(var(--v-theme-info));
}

.report-legend__label {
  color: rgba(var(--v-theme-on-surface), 0.74);
}

.report-legend__value {
  font-weight: 600;
}

.report-legend__share {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.82rem;
  min-width: 3ch;
  text-align: end;
}

.report-ranking li {
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr) 40% auto;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.report-ranking__index {
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-size: 0.8rem;
  font-weight: 700;
}

.report-ranking__bar {
  height: 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}

.report-ranking__bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
}

.report-ranking__value {
  font-weight: 600;
}

.report-table {
  display: grid;
  gap: 0.15rem;
}

.report-table__head,
.report-table__row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 80px 100px 120px;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.35rem;
  font-size: 0.8rem;
}

.report-table__head {
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.report-table__row + .report-table__row {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}

.report-table__name {
  font-weight: 600;
}

.report-pill {
  justify-self: start;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.report-pill--ready {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.report-pill--thin {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}

.report-pill--empty {
  background: rgba(var(--v-theme-error), 0.14);
  color: rgb(var(--v-theme-error));
}

.report-note {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.82rem;
  line-height: 1.8;
}

@media (max-width: 900px) {
  .report-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .report-grid__wide {
    grid-column: span 1;
  }
}
</style>
