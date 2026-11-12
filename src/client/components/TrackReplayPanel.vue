<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useTrackStore } from '@/stores/track.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import type { TrackAvailability, TrackResponse } from '@/api/types.ts';

/**
 * Replay panel for one trip/mission track (Stage D). Availability is explicit and honest:
 * `available` renders the persisted summary and the recorded fixes, `expired` states that the
 * raw points were purged after the retention window, `none` states that nothing was recorded
 * (or recording never became eligible). Never renders an invented route.
 */
const props = defineProps<{
  contextType: 'trip' | 'mission';
  contextId: string;
  availability: TrackAvailability;
  from?: number;
  to?: number;
}>();

const track = useTrackStore();
const format = useFormatters();

const cacheKey = computed(() => `${props.contextType}:${props.contextId}:${props.from ?? ''}:${props.to ?? ''}`);
const response = computed<TrackResponse | undefined>(() => track.replay[cacheKey.value]);
const loading = computed(() => Boolean(track.replayLoading[cacheKey.value]));
const error = computed(() => track.replayError[cacheKey.value] ?? null);

async function load(): Promise<void> {
  if (props.availability !== 'available') return;
  await track.loadReplay(props.contextType, props.contextId, props.from, props.to);
}

onMounted(() => void load());
watch(() => props.availability, (value) => { if (value === 'available' && !response.value) void load(); });

const emptySummary = computed(() => response.value?.summaries ?? []);
const accessNote = computed(() => {
  const current = response.value;
  if (!current) return null;
  if (current.access === 'share' && current.authorizedUntil) {
    return `دسترسی اشتراکی تا ${format.dateTime(current.authorizedUntil)}`;
  }
  return null;
});

/* Schematic path, not map tiles: normalize every fix of the context into a shared view box. */
const SERIES_COLORS = ['#0E6666', '#B57A12', '#316D86', '#8A4B0F', '#2C7A57'];
const paths = computed(() => {
  const points = response.value?.points ?? [];
  if (!points.length) return [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude); maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude); maxLng = Math.max(maxLng, point.longitude);
  }
  const latSpan = Math.max(maxLat - minLat, 1e-6);
  const lngSpan = Math.max(maxLng - minLng, 1e-6);
  const span = Math.max(latSpan, lngSpan);
  const byUser = new Map<string, typeof points>();
  for (const point of points) {
    const list = byUser.get(point.userId) ?? [];
    list.push(point);
    byUser.set(point.userId, list);
  }
  const pad = span * 0.08;
  const total = span + pad * 2;
  const project = (point: { latitude: number; longitude: number }): string => {
    const x = ((point.longitude - minLng + (span - lngSpan) / 2 + pad) / total) * 100;
    const y = ((maxLat - point.latitude + (span - latSpan) / 2 + pad) / total) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  return [...byUser.entries()].map(([userId, list], index) => ({
    userId,
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    points: list.map(project).join(' '),
    single: list.length === 1 ? project(list[0]) : null
  }));
});
const singles = computed(() => paths.value.filter((series) => series.single !== null)
  .map((series) => ({ userId: series.userId, color: series.color, cx: series.single!.split(',')[0], cy: series.single!.split(',')[1] })));
const pointCount = computed(() => response.value?.points.length ?? 0);
</script>

<template>
  <div class="track-replay" :data-testid="`track-replay-${contextType}-${contextId}`">
    <p v-if="availability === 'none'" class="sheet__status" data-testid="track-replay-none">
      مسیر ثبت‌شده‌ای برای این {{ contextType === 'trip' ? 'سفر' : 'مأموریت' }} وجود ندارد؛ یا ثبت مسیر فعال نبوده است.
    </p>
    <p v-else-if="availability === 'expired'" class="sheet__status" data-testid="track-replay-expired">
      نقاط خام مسیر پس از پایان مهلت نگهداری حذف شده‌اند؛ خلاصهٔ سفر/مأموریت همچنان دردسترس است.
    </p>
    <template v-else>
      <p v-if="loading" class="sheet__status">در حال دریافت مسیر…</p>
      <div v-else-if="error" class="track-replay__error" role="alert">
        <span>{{ error }}</span>
        <button type="button" class="text-link" data-testid="track-replay-retry" @click="track.clearReplay(contextType, contextId, from, to); load()">تلاش دوباره</button>
      </div>
      <template v-else-if="response">
        <p class="track-replay__meta">
          <span v-if="accessNote">{{ accessNote }} · </span>بازه: {{ format.dateTime(response.window.from) }} تا {{ format.dateTime(response.window.to) }} · نگهداری خام: {{ format.number(response.retentionDays) }} روز
        </p>

        <ul class="track-replay__summaries" data-testid="track-replay-summaries">
          <li v-for="summary in emptySummary" :key="summary.userId">
            <strong>{{ summary.username }}</strong>
            <small>
              {{ summary.quality === 'ok'
                ? `مسافت ${format.distance(summary.distanceM ?? 0)} · زمان ${format.duration((summary.durationMs ?? 0) / 1000)}`
                : 'دادهٔ کافی برای محاسبهٔ مسافت ثبت نشده است' }}
              · {{ format.number(summary.pointCount) }} نقطه · {{ format.dateTime(summary.firstPointAt) }} تا {{ format.dateTime(summary.lastPointAt) }}
            </small>
          </li>
        </ul>
        <p v-if="!emptySummary.length" class="sheet__status">خلاصه‌ای برای این بازه ثبت نشده است.</p>

        <svg v-if="paths.length" class="track-replay__map" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="نمای ساده مسیر ثبت‌شده (بدون کاشی نقشه)" data-testid="track-replay-path">
          <polyline v-for="series in paths" :key="series.userId" :points="series.points" fill="none" :stroke="series.color" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          <circle v-for="dot in singles" :key="`${dot.userId}-dot`" :cx="dot.cx" :cy="dot.cy" r="2" :fill="dot.color" />
        </svg>
        <p v-if="paths.length" class="track-replay__caption">نمای سادهٔ مسیر (بدون نقشه) · {{ format.number(pointCount) }} نقطه{{ response.truncated ? ' · بخشی از مسیر به‌دلیل محدودیت نمایش داده نمی‌شود' : '' }}</p>
        <p v-else class="sheet__status">نقطه‌ای در این بازه ثبت نشده است.</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.track-replay {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: var(--r12, 12px);
  background: var(--surface-2);
  border: 1px solid var(--line-1, var(--surface-3));
}
.track-replay__meta { margin: 0; font-size: 11px; color: var(--text-2); line-height: 1.8; }
.track-replay__summaries { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.track-replay__summaries li { display: grid; gap: 2px; }
.track-replay__summaries small { color: var(--text-2); line-height: 1.8; }
.track-replay__map { inline-size: 100%; block-size: 140px; border-radius: var(--r8, 8px); background: var(--map-land); border: 1px solid var(--line-1, var(--surface-3)); }
.track-replay__caption { margin: 0; font-size: 11px; color: var(--text-2); }
.track-replay__error { display: flex; gap: 8px; align-items: center; color: var(--danger); font-size: 12px; }
</style>
