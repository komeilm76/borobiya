<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useToast } from '@/composables/useToast.ts';
import { tryDownloadPreviewCsv } from '@/preview/demo-downloads.ts';

/**
 * Reports screen: honest per-period analysis. Every number comes from `/_admin/reports`,
 * computed for the selected window (deltas vs the equal previous window); deltas are null
 * when the previous window is empty, and every section states its own empty case.
 */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const days = ref(30);
const PERIODS = [
  { value: 7, label: '۷ روز' },
  { value: 30, label: '۳۰ روز' },
  { value: 90, label: '۹۰ روز' }
] as const;

const reports = computed(() => admin.reports);
const kpis = computed(() => reports.value?.kpis ?? null);
const trend = computed(() => reports.value?.trend ?? []);
const incidentTypes = computed(() => reports.value?.incidentTypes ?? []);
const groupRows = computed(() => (reports.value?.groups ?? []).filter((group) => group.requests > 0));
const groupRequestTotal = computed(() => reports.value?.groupRequestTotal ?? 0);
const trendMax = computed(() => Math.max(1, ...trend.value.map((point) => Math.max(point.requests, point.missions))));
const incidentMax = computed(() => Math.max(1, ...incidentTypes.value.map((item) => item.count)));

/** Polyline points for the SVG trend chart (both series share one scale). */
function seriesPoints(key: 'requests' | 'missions'): string {
  const width = 560;
  const height = 120;
  const step = trend.value.length > 1 ? width / (trend.value.length - 1) : 0;
  return trend.value
    .map((point, index) => {
      const x = Math.round(index * step * 100) / 100;
      const y = height - Math.round((point[key] / trendMax.value) * (height - 16) * 100) / 100 - 8;
      return `${x},${y}`;
    })
    .join(' ');
}

/** Conic-gradient stops for the group-share donut — slices reuse each group's own color so the legend matches byte-for-byte. */
const donutStops = computed(() => {
  if (!groupRequestTotal.value) return 'var(--surface-3) 0 100%';
  let acc = 0;
  return groupRows.value
    .map((group) => {
      const from = (acc / groupRequestTotal.value) * 360;
      acc += group.requests;
      const to = (acc / groupRequestTotal.value) * 360;
      return `${group.color} ${from}deg ${to}deg`;
    })
    .join(', ');
});

/**
 * Derived roster grade for the performance table. Thresholds follow the reference board:
 * عالی ≥4.7/95, خوب ≥4.4/90, متوسط ≥4.0/80 — anything below reads ضعیف. Only shown when both inputs exist.
 */
function groupGrade(row: { acceptanceRate: number | null; ratingAvg: number | null }): { label: string; tone: string } | null {
  if (row.acceptanceRate === null || row.ratingAvg === null) return null;
  const rate = row.acceptanceRate;
  const rating = row.ratingAvg;
  if (rating >= 4.7 && rate >= 95) return { label: 'عالی', tone: 'status-pill--success' };
  if (rating >= 4.4 && rate >= 90) return { label: 'خوب', tone: 'status-pill--success' };
  if (rating >= 4.0 && rate >= 80) return { label: 'متوسط', tone: 'status-pill--warning' };
  return { label: 'ضعیف', tone: 'status-pill--danger' };
}

function formatDelta(value: number | null, unit: string, positiveIsGood = true): { text: string; good: boolean } | null {
  if (value === null) return null;
  const abs = Math.abs(value);
  const good = positiveIsGood ? value >= 0 : value <= 0;
  const text = value === 0 ? `بدون تغییر` : `${value > 0 ? '+' : '−'}${format.number(abs)}${unit}`;
  return { text, good };
}

const exports = [
  { label: 'کاربران (CSV)', href: '/_admin/users.csv' },
  { label: 'رویدادها (CSV)', href: '/_admin/audit.csv' }
];

function download(href: string): void {
  if (tryDownloadPreviewCsv(href)) {
    toast.push('CSV ساختگی پیش‌نمایش دانلود شد.', 'info', 2200);
    return;
  }
  window.location.assign(href);
  toast.push('صدور فایل آغاز شد.', 'info', 2200);
}

async function selectPeriod(value: number): Promise<void> {
  days.value = value;
  await admin.loadReports(value);
}

onMounted(() => void admin.loadReports(days.value));
</script>

<template>
  <section class="admin-page reports-page" data-testid="admin-reports">
    <header class="reports-hero">
      <div>
        <h2>گزارش‌ها و تحلیل عملکرد</h2>
        <p>روند درخواست‌ها، زمان پاسخ گروه‌ها و کیفیت رسیدگی در بازهٔ انتخابی.</p>
      </div>
      <div class="reports-period" role="group" aria-label="بازهٔ زمانی">
        <span class="reports-period__label"><span class="mdi mdi-calendar-month-outline" aria-hidden="true" /> بازه:</span>
        <button
          v-for="period in PERIODS"
          :key="period.value"
          type="button"
          class="reports-period__chip"
          :class="{ 'is-active': days === period.value }"
          :data-testid="`reports-period-${period.value}`"
          @click="selectPeriod(period.value)"
        >{{ period.label }} {{ period.value === days ? 'روز آخر' : '' }}</button>
      </div>
    </header>

    <div class="reports-kpis" data-testid="reports-kpis">
      <article class="panel report-kpi">
        <div class="report-kpi__head"><span class="report-kpi__icon mdi mdi-chart-bar" aria-hidden="true" /><span>کل درخواست‌ها</span></div>
        <strong>{{ format.number(kpis?.totalRequests ?? 0) }}</strong>
        <small v-if="formatDelta(kpis?.requestsDeltaPct ?? null, '٪')" :class="formatDelta(kpis?.requestsDeltaPct ?? null, '٪')!.good ? 'is-good' : 'is-bad'">
          {{ formatDelta(kpis?.requestsDeltaPct ?? null, '٪')!.text }} در مقایسه با بازهٔ قبل
        </small>
        <small v-else class="is-muted">بازهٔ قبل داده‌ای ندارد</small>
      </article>
      <article class="panel report-kpi">
        <div class="report-kpi__head"><span class="report-kpi__icon mdi mdi-clock-outline" aria-hidden="true" /><span>میانگین زمان پاسخ</span></div>
        <strong>{{ kpis?.avgResponseSeconds !== null && kpis?.avgResponseSeconds !== undefined ? format.duration(kpis.avgResponseSeconds) : '—' }}</strong>
        <small v-if="formatDelta(kpis?.avgResponseDeltaSeconds ?? null, ' ثانیه')" :class="formatDelta(kpis?.avgResponseDeltaSeconds ?? null, ' ثانیه')!.good ? 'is-good' : 'is-bad'">
          {{ formatDelta(kpis?.avgResponseDeltaSeconds ?? null, ' ثانیه')!.text }} نسبت به بازهٔ قبل
        </small>
        <small v-else class="is-muted">دادهٔ پذیرش در این بازه‌ها یکسان نیست</small>
      </article>
      <article class="panel report-kpi">
        <div class="report-kpi__head"><span class="report-kpi__icon mdi mdi-check-decagram-outline" aria-hidden="true" /><span>نرخ پذیرش</span></div>
        <strong>{{ kpis?.acceptanceRate !== null && kpis?.acceptanceRate !== undefined ? format.number(kpis.acceptanceRate) + '٪' : '—' }}</strong>
        <small v-if="formatDelta(kpis?.acceptanceRateDeltaPct ?? null, '٪')" :class="formatDelta(kpis?.acceptanceRateDeltaPct ?? null, '٪')!.good ? 'is-good' : 'is-bad'">
          {{ formatDelta(kpis?.acceptanceRateDeltaPct ?? null, '٪')!.text }} نسبت به بازهٔ قبل
        </small>
        <small v-else class="is-muted">در این بازه پیشنهادی جمع‌بندی نشده است</small>
      </article>
      <article class="panel report-kpi">
        <div class="report-kpi__head"><span class="report-kpi__icon mdi mdi-close-octagon-outline" aria-hidden="true" /><span>مأموریت‌های لغوشده</span></div>
        <strong>{{ format.number(kpis?.cancelledMissions ?? 0) }}</strong>
        <small v-if="formatDelta(kpis?.cancelledDeltaPct ?? null, '٪', false)" :class="formatDelta(kpis?.cancelledDeltaPct ?? null, '٪', false)!.good ? 'is-good' : 'is-bad'">
          {{ formatDelta(kpis?.cancelledDeltaPct ?? null, '٪', false)!.text }} در مقایسه با بازهٔ قبل
        </small>
        <small v-else class="is-muted">بازهٔ قبل داده‌ای ندارد</small>
      </article>
    </div>

    <div class="reports-grid">
      <article class="panel reports-trend" data-testid="reports-trend">
        <header class="panel__head"><h2>روند درخواست و مأموریت <small class="is-muted">{{ format.number(days) }} روز آخر</small></h2></header>
        <svg v-if="trend.length" viewBox="0 0 560 140" role="img" aria-label="نمودار روند درخواست‌ها و مأموریت‌ها" preserveAspectRatio="none">
          <line v-for="gy in [20, 52, 84, 116]" :key="gy" :x1="0" :x2="560" :y1="gy" :y2="gy" class="reports-trend__grid" />
          <polyline :points="seriesPoints('requests')" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
          <polyline :points="seriesPoints('missions')" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="0" />
        </svg>
        <div class="reports-trend__legend">
          <span><i class="is-requests" /> درخواست‌ها</span>
          <span><i class="is-missions" /> مأموریت‌ها</span>
          <span class="reports-trend__range">{{ trend[0]?.day }} تا {{ trend[trend.length - 1]?.day }}</span>
        </div>
      </article>

      <article class="panel reports-donut" data-testid="reports-donut">
        <header class="panel__head"><h2>سهم گروه‌ها</h2></header>
        <div v-if="groupRequestTotal" class="reports-donut__body">
          <div class="reports-donut__chart" :style="{ background: `conic-gradient(${donutStops})` }" role="img" :aria-label="`سهم گروه‌ها از ${format.number(groupRequestTotal)} درخواست اعزام‌شده`">
            <div><strong>{{ format.number(groupRequestTotal) }}</strong><span>درخواست</span></div>
          </div>
          <ul class="reports-donut__legend">
            <li v-for="group in groupRows" :key="group.id">
              <i :style="{ background: group.color }" />
              <span>{{ group.name }}</span>
              <b>{{ format.number(Math.round((group.requests * 100) / groupRequestTotal)) }}٪</b>
            </li>
          </ul>
        </div>
        <p v-else class="panel__empty">در این بازه درخواستی به گروهی اعزام نشده است.</p>
      </article>

      <article class="panel reports-incidents" data-testid="reports-incidents">
        <header class="panel__head"><h2>بر اساس نوع حادثه</h2></header>
        <div v-if="incidentTypes.length" class="reports-bars">
          <div v-for="item in incidentTypes" :key="item.label" class="reports-bar">
            <span class="reports-bar__count">{{ format.number(item.count) }}</span>
            <div class="reports-bar__track"><i :style="{ height: `${(item.count / incidentMax) * 100}%`, background: item.color }" /></div>
            <span class="reports-bar__label" :title="item.label">{{ item.label }}</span>
          </div>
        </div>
        <p v-else class="panel__empty">در این بازه حادثه‌ای ثبت نشده است.</p>
      </article>

      <article class="panel reports-groups" data-testid="reports-groups">
        <header class="panel__head"><h2>عملکرد گروه‌ها</h2></header>
        <div v-if="reports?.groups?.length" class="reports-table-wrap">
          <table class="reports-table">
            <thead>
              <tr><th>گروه</th><th>درخواست</th><th>میانگین پاسخ</th><th>پذیرش</th><th>رضایت</th><th>وضعیت</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in reports.groups" :key="row.id">
                <td><span class="reports-table__dot" :style="{ background: row.color }" />{{ row.name }}</td>
                <td>{{ format.number(row.requests) }}</td>
                <td>{{ row.avgResponseSeconds !== null ? format.duration(row.avgResponseSeconds) : '—' }}</td>
                <td>{{ row.acceptanceRate !== null ? format.number(row.acceptanceRate) + '٪' : '—' }}</td>
                <td>{{ row.ratingAvg !== null ? format.number(row.ratingAvg) : '—' }}</td>
                <td>
                  <span v-if="groupGrade(row)" class="status-pill" :class="groupGrade(row)!.tone">{{ groupGrade(row)!.label }}</span>
                  <span v-else class="is-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="panel__empty">گروهی ثبت نشده است.</p>
      </article>

      <article class="panel reports-export">
        <header class="panel__head"><h2>خروجی</h2></header>
        <div class="export-row">
          <button v-for="item in exports" :key="item.href" type="button" class="admin-action" @click="download(item.href)">
            {{ item.label }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.reports-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.reports-hero h2 { margin: 0; font-size: 20px; font-weight: 800; }
.reports-hero p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.reports-period { display: flex; align-items: center; gap: 6px; }
.reports-period__label { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 12px; }
.reports-period__chip { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 6px 12px; font-size: 11.5px; cursor: pointer; }
.reports-period__chip.is-active { background: var(--primary); border-color: var(--primary); color: var(--on-accent); font-weight: 700; }
.reports-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.report-kpi { display: grid; gap: 6px; align-content: start; }
.report-kpi__head { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; }
.report-kpi__icon { inline-size: 32px; block-size: 32px; display: grid; place-items: center; border-radius: var(--r11); background: var(--primary-soft); color: var(--primary); font-size: 17px; }
.report-kpi strong { font-size: 22px; font-weight: 800; }
.report-kpi small { font-size: 10.5px; }
.report-kpi small.is-good { color: var(--success); }
.report-kpi small.is-bad { color: var(--danger); }
.report-kpi small.is-muted { color: var(--muted); }
.reports-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 12px; }
.reports-trend svg { inline-size: 100%; block-size: 140px; }
.reports-trend__grid { stroke: var(--row-line); stroke-width: 1; }
.reports-trend__legend { display: flex; align-items: center; gap: 14px; margin-block-start: 8px; font-size: 11px; color: var(--muted); }
.reports-trend__legend i { display: inline-block; inline-size: 14px; block-size: 4px; border-radius: 2px; margin-inline-end: 4px; vertical-align: middle; }
.reports-trend__legend .is-requests { background: var(--primary); }
.reports-trend__legend .is-missions { background: var(--amber); }
.reports-trend__range { margin-inline-start: auto; direction: ltr; unicode-bidi: embed; }
.reports-donut__body { display: flex; align-items: center; gap: 16px; }
.reports-donut__chart { inline-size: 132px; block-size: 132px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
.reports-donut__chart > div { inline-size: 84px; block-size: 84px; border-radius: 50%; background: var(--surface); display: grid; place-content: center; text-align: center; }
.reports-donut__chart strong { font-size: 17px; display: block; }
.reports-donut__chart span { font-size: 9px; color: var(--muted); }
.reports-donut__legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 11px; flex: 1; }
.reports-donut__legend li { display: flex; align-items: center; gap: 6px; }
.reports-donut__legend i { inline-size: 10px; block-size: 10px; border-radius: 3px; flex-shrink: 0; }
.reports-donut__legend span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reports-bars { display: flex; align-items: flex-end; gap: 10px; block-size: 170px; padding-block-start: 8px; }
.reports-bar { flex: 1; display: grid; grid-template-rows: auto 1fr auto; justify-items: center; gap: 4px; block-size: 100%; min-width: 0; }
.reports-bar__count { font-size: 11px; font-weight: 700; }
.reports-bar__track { inline-size: 26px; block-size: 100%; background: var(--surface-3); border-radius: 6px 6px 2px 2px; display: flex; align-items: flex-end; overflow: hidden; }
.reports-bar__track i { inline-size: 100%; border-radius: 6px 6px 2px 2px; min-block-size: 4px; }
.reports-bar__label { font-size: 9.5px; color: var(--muted); max-inline-size: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reports-table-wrap { overflow-x: auto; }
.reports-table { inline-size: 100%; border-collapse: collapse; font-size: 11px; }
.reports-table th { text-align: start; color: var(--muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--row-line); }
.reports-table td { padding: 8px; border-bottom: 1px solid var(--row-line); vertical-align: middle; }
.reports-table__dot { display: inline-block; inline-size: 9px; block-size: 9px; border-radius: 3px; margin-inline-end: 6px; vertical-align: middle; }
@media (max-width: 1100px) { .reports-kpis { grid-template-columns: repeat(2, 1fr); } .reports-grid { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .reports-kpis { grid-template-columns: 1fr; } }
</style>
