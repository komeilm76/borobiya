<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { DESIGN_TOKENS } from '@/stores/settings.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { revealTimeline } from '@/motion/index.ts';

/** Administrator overview: KPI cards, the status trend chart and recent requests. */
const admin = useAdminStore();
const format = useFormatters();
const motion = useMotionPreferences();
const chart = ref<HTMLElement | null>(null);

const kpis = computed(() => {
  const source = admin.overview?.kpis ?? {};
  // The overview payload carries unresolved alerts as a list, so the open-alert count is its
  // length; there is no `openAlerts` key and reading one always showed a reassuring zero.
  const openAlerts = admin.overview?.alerts?.length ?? 0;
  return [
    { key: 'requestsToday', label: 'درخواست امروز', icon: 'alarm-light-outline', value: Number(source.requestsToday ?? 0) },
    { key: 'activeMissions', label: 'مأموریت جاری', icon: 'web', value: Number(source.activeMissions ?? 0) },
    { key: 'onlineResponders', label: 'امدادگر آنلاین', icon: 'account-check-outline', value: Number(source.onlineResponders ?? 0) },
    { key: 'openAlerts', label: 'هشدار باز', icon: 'bell-alert-outline', value: openAlerts }
  ];
});

// The API sends `{ day, count }`; the chart below wants a label and a value.
const trend = computed(() =>
  (admin.overview?.trend ?? []).map((point) => ({ label: format.date(point.day), value: point.count }))
);
const recent = computed(() => admin.overview?.recentRequests ?? []);
const seriesColors = DESIGN_TOKENS.adminSeries;

function sparklinePoints(values: number[]): string {
  const points = values.length ? values : [0, 0];
  const max = Math.max(...points, 1);
  return points.map((value, index) => `${(index / Math.max(1, points.length - 1)) * 220},${54 - (value / max) * 44}`).join(' ');
}

onMounted(async () => {
  await admin.loadOverview();
  if (chart.value && !motion.reduced.value) revealTimeline(chart.value.querySelectorAll('.metric-card'));
});
</script>

<template>
  <section class="admin-page" data-testid="admin-overview">
    <div class="admin-cards">
      <article v-for="item in kpis" :key="item.key" class="metric-card">
        <span :class="['mdi', `mdi-${item.icon}`]" aria-hidden="true" />
        <div>
          <small>{{ item.label }}</small>
          <strong>{{ format.number(item.value) }}</strong>
        </div>
      </article>
    </div>
    <div class="admin-grid">
      <article class="panel" ref="chart">
        <header class="panel__head">
          <h2>روند درخواست‌ها</h2>
          <span class="panel__hint">۷ روز گذشته</span>
        </header>
        <svg class="sparkline" viewBox="0 0 220 60" preserveAspectRatio="none" role="img" aria-label="روند درخواست‌ها">
          <line x1="0" y1="14" x2="220" y2="14" />
          <line x1="0" y1="36" x2="220" y2="36" />
          <polyline :points="sparklinePoints(trend.map((item) => item.value))" fill="none" :stroke="seriesColors[0]" stroke-width="2.5" stroke-linecap="round" />
        </svg>
        <ul class="legend">
          <li v-for="(item, index) in trend" :key="item.label">
            <i :style="{ background: seriesColors[index % seriesColors.length] }" />
            <span>{{ item.label }}</span>
            <strong>{{ format.number(item.value) }}</strong>
          </li>
        </ul>
      </article>
      <article class="panel">
        <header class="panel__head"><h2>درخواست‌های اخیر</h2></header>
        <ul class="admin-list">
          <li v-for="item in recent" :key="item.id">
            <span class="mdi mdi-alert-circle-outline" aria-hidden="true" />
            <div>
              <strong>{{ item.incidentLabel }}</strong>
              <small>{{ format.dateTime(item.createdAt) }}</small>
            </div>
            <span class="status-pill status-pill--neutral">{{ item.status }}</span>
          </li>
        </ul>
        <p v-if="!recent.length" class="panel__empty">درخواستی ثبت نشده است.</p>
      </article>
    </div>
    <p v-if="admin.error" class="panel__error">{{ admin.error }}</p>
  </section>
</template>
