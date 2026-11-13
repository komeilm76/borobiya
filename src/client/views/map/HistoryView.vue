<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSosStore } from '@/stores/sos.ts';
import { useTripsStore } from '@/stores/trips.ts';
import TrackReplayPanel from '@/components/TrackReplayPanel.vue';
import { useAuthStore } from '@/stores/auth.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { useRouter } from 'vue-router';
import { statusLabel, statusTone } from '@/utils/status.ts';
import { get, errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import HistorySharePanel from '@/components/history/HistorySharePanel.vue';
import type { ShareView, SosView, TripView } from '@/api/types.ts';

/**
 * History (Stage 6): past work in three explicit categories — trips, missions (my requests as
 * requester, my missions as responder) and location shares. Every record expands inline to show
 * the detail the API holds, and any record can spawn a scoped history-window share. There is no
 * routing engine behind any of this, so entries carry facts, not ETAs or polyline replay.
 */
const sos = useSosStore();
const trips = useTripsStore();
const auth = useAuthStore();
const format = useFormatters();
const router = useRouter();
const toast = useToast();

const activeTab = ref<'trips' | 'missions' | 'shares'>('missions');
const missionsView = ref<'requests' | 'missions'>('requests');

const history = computed(() => sos.requests);
const missions = computed(() => sos.missions);
const authUserId = computed(() => auth.user?.id ?? '');
const shareHistory = ref<ShareView[]>([]);
const sharesFailed = ref(false);

/** Full share list (active + expired + revoked); a failure shows a retry row instead of silence. */
async function loadShares(): Promise<void> {
  sharesFailed.value = false;
  try {
    const result = await get<{ items?: ShareView[] }>('/_user/location/shares', { include: 'all' });
    shareHistory.value = result.items ?? [];
  } catch {
    shareHistory.value = [];
    sharesFailed.value = true;
  }
}

onMounted(() => {
  void sos.load();
  void trips.load();
  void loadShares();
});

const SHARE_STATE_LABEL = { active: 'فعال', expired: 'منقضی‌شده', revoked: 'قطع‌شده' } as const;
const SHARE_STATE_TONE = { active: 'status-pill status-pill--success', expired: 'status-pill status-pill--warning', revoked: 'status-pill status-pill--neutral' } as const;

function shareCounterpart(share: ShareView): string {
  return share.ownerId === authUserId.value ? (share.recipientUsername ?? '—') : (share.ownerUsername ?? '—');
}
function shareDirection(share: ShareView): string {
  return share.ownerId === authUserId.value ? 'ارسال موقعیت شما' : 'دریافت موقعیت';
}

/* ---------- day grouping (طراحی: امروز/دیروز/date buckets) ---------- */
interface DayGroup<T> { key: number; label: string; items: T[] }
function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
function dayLabel(ts: number): string {
  const diff = startOfDay(Date.now()) - startOfDay(ts);
  if (diff === 0) return 'امروز';
  if (diff === 86_400_000) return 'دیروز';
  return new Date(ts).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function groupByDay<T>(items: T[], time: (item: T) => number): DayGroup<T>[] {
  const buckets = new Map<number, T[]>();
  for (const item of items) {
    const key = startOfDay(time(item));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, group]) => ({ key, label: dayLabel(key), items: [...group].sort((a, b) => time(b) - time(a)) }));
}

/* ---------- filters (Stage E): date range + status, minimal and practical ---------- */
const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'امروز' },
  { value: 'week', label: '۷ روز اخیر' },
  { value: 'month', label: '۳۰ روز اخیر' },
  { value: 'all', label: 'همه' }
] as const;
type DateRange = typeof DATE_RANGE_OPTIONS[number]['value'];
const dateRange = ref<DateRange>('all');
const statusFilter = ref<'all' | 'completed' | 'cancelled'>('all');
const shareStateFilter = ref<'all' | 'active' | 'expired' | 'revoked'>('all');
const filtersActive = computed(() => dateRange.value !== 'all' || statusFilter.value !== 'all' || shareStateFilter.value !== 'all');

function inRange(ts: number): boolean {
  if (dateRange.value === 'all') return true;
  if (dateRange.value === 'today') return ts >= startOfDay(Date.now());
  const windowMs = dateRange.value === 'week' ? 7 * 86_400_000 : 30 * 86_400_000;
  return Date.now() - ts <= windowMs;
}
const isCancelledLike = (status: string): boolean => status === 'cancelled' || status === 'expired';
function matchesStatus(status: string): boolean {
  if (statusFilter.value === 'all') return true;
  if (statusFilter.value === 'completed') return status === 'completed';
  return isCancelledLike(status);
}
function resetFilters(): void {
  dateRange.value = 'all';
  statusFilter.value = 'all';
  shareStateFilter.value = 'all';
}

/* ---------- trips category ---------- */
const TRIP_STATUS_LABEL: Record<string, string> = {
  planned: 'برنامه‌ریزی‌شده', active: 'در حال انجام', completed: 'تکمیل‌شده', cancelled: 'لغوشده'
};
const TRIP_ROLE_LABEL: Record<string, string> = { leader: 'رهبر', member: 'عضو' };
const SEVERITY_LABEL: Record<string, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد' };
const EVENT_ACTION_LABEL: Record<string, string> = { assign: 'اعزام', accept: 'پذیرش', arrive: 'رسیدن', start: 'شروع', complete: 'تکمیل', cancel: 'لغو' };

const finishedTrips = computed(() => trips.trips.filter((trip) => trip.status === 'completed' || trip.status === 'cancelled'));
const tripCount = computed(() => finishedTrips.value.length);
const missionCount = computed(() => history.value.length + missions.value.length);

/* Filtered views drive the lists; the tab badges keep the totals. */
const filteredTrips = computed(() =>
  finishedTrips.value.filter((trip) => inRange(trip.startedAt ?? trip.createdAt) && matchesStatus(trip.status)));
const filteredRequests = computed(() =>
  history.value.filter((item) => inRange(item.createdAt) && matchesStatus(item.status)));
const filteredMissions = computed(() =>
  missions.value.filter((mission) => inRange(mission.updatedAt) && matchesStatus(mission.status)));
const shareState = (share: ShareView): 'active' | 'expired' | 'revoked' => share.state ?? 'active';
const filteredShares = computed(() =>
  shareHistory.value.filter((share) => shareStateFilter.value === 'all' || shareState(share) === shareStateFilter.value));
const filterEmptied = computed(() => {
  if (!filtersActive.value) return false;
  if (activeTab.value === 'trips') return finishedTrips.value.length > 0 && filteredTrips.value.length === 0;
  if (activeTab.value === 'shares') return shareHistory.value.length > 0 && filteredShares.value.length === 0;
  const universe = missionsView.value === 'requests' ? history.value : missions.value;
  const filtered = missionsView.value === 'requests' ? filteredRequests.value : filteredMissions.value;
  return universe.length > 0 && filtered.length === 0;
});
const tripGroups = computed(() => groupByDay(filteredTrips.value, (trip) => trip.startedAt ?? trip.createdAt));
const requestGroups = computed(() => groupByDay(filteredRequests.value, (item) => item.createdAt));
const missionGroups = computed(() => groupByDay(filteredMissions.value, (item) => item.updatedAt));

/** One honest, per-tab summary line: counts the filter actually shows, plus recorded/rating facts when they exist. */
const summaryLine = computed(() => {
  if (activeTab.value === 'trips') {
    const recorded = filteredTrips.value.filter((trip) => trip.trackStatus === 'available').length;
    return `${format.number(filteredTrips.value.length)} سفر${recorded ? ` · ${format.number(recorded)} سفر با مسیر ثبت‌شده` : ''}`;
  }
  if (activeTab.value === 'shares') {
    const active = filteredShares.value.filter((share) => shareState(share) === 'active').length;
    return `${format.number(active)} فعال از ${format.number(filteredShares.value.length)} اشتراک`;
  }
  if (missionsView.value === 'requests') {
    return `${format.number(filteredRequests.value.length)} درخواست`;
  }
  const rated = filteredMissions.value.filter((mission) => mission.rating != null);
  if (!rated.length) return `${format.number(filteredMissions.value.length)} مأموریت`;
  const average = rated.reduce((sum, mission) => sum + Number(mission.rating ?? 0), 0) / rated.length;
  return `${format.number(filteredMissions.value.length)} مأموریت · میانگین امتیاز ${format.number(average.toFixed(1))} از ۵ (${format.number(rated.length)} ارزیابی)`;
});

/* ---------- expansion and share windows ---------- */
const expanded = ref<string | null>(null);
const sharing = ref<string | null>(null);
const tripDetail = ref<TripView | null>(null);
const tripDetailLoading = ref(false);
const requestDetail = ref<SosView | null>(null);
const requestDetailLoading = ref(false);

const expandedTrip = computed(() => (expanded.value?.startsWith('trip:') ? finishedTrips.value.find((t) => `trip:${t.id}` === expanded.value) ?? null : null));
const expandedRequest = computed(() => (expanded.value?.startsWith('req:') ? history.value.find((i) => `req:${i.id}` === expanded.value) ?? null : null));
const expandedMission = computed(() => (expanded.value?.startsWith('mis:') ? missions.value.find((m) => `mis:${m.id}` === expanded.value) ?? null : null));

const shareWindow = computed(() => {
  if (expandedTrip.value) {
    const detail = tripDetail.value;
    const from = detail?.startedAt ?? detail?.createdAt ?? expandedTrip.value.createdAt;
    const to = detail?.completedAt ?? detail?.updatedAt ?? expandedTrip.value.updatedAt;
    return { from, to: Math.max(to, from + 1_000), context: detail?.name ?? expandedTrip.value.name };
  }
  if (expandedRequest.value) {
    const from = expandedRequest.value.createdAt;
    return { from, to: Math.max(expandedRequest.value.updatedAt, from + 1_000), context: expandedRequest.value.incidentLabel };
  }
  if (expandedMission.value) {
    const from = expandedMission.value.createdAt;
    return { from, to: Math.max(expandedMission.value.updatedAt, from + 1_000), context: expandedMission.value.incidentLabel };
  }
  return { from: 0, to: 0, context: '' };
});

async function toggleTrip(id: string): Promise<void> {
  const key = `trip:${id}`;
  if (expanded.value === key) { expanded.value = null; sharing.value = null; return; }
  expanded.value = key;
  sharing.value = null;
  tripDetail.value = null;
  tripDetailLoading.value = true;
  tripDetail.value = await trips.open(id);
  tripDetailLoading.value = false;
}
async function toggleRequest(id: string): Promise<void> {
  const key = `req:${id}`;
  if (expanded.value === key) { expanded.value = null; sharing.value = null; return; }
  expanded.value = key;
  sharing.value = null;
  requestDetail.value = null;
  requestDetailLoading.value = true;
  requestDetail.value = await sos.loadDetail(id);
  requestDetailLoading.value = false;
}
function toggleMission(id: string): void {
  const key = `mis:${id}`;
  expanded.value = expanded.value === key ? null : key;
  sharing.value = null;
}
function toggleShareFor(key: string): void {
  sharing.value = sharing.value === key ? null : key;
}
async function onShareCreated(): Promise<void> {
  sharing.value = null;
  await loadShares();
}

/** Re-creates a finished trip from its saved stops (design 06 «تکرار این سفر»). */
async function repeatTrip(): Promise<void> {
  const detail = tripDetail.value;
  if (!detail) return;
  try {
    await trips.create(
      detail.name,
      detail.stops.map((stop) => ({ label: stop.label, latitude: stop.latitude, longitude: stop.longitude, placeId: stop.placeId }))
    );
    toast.push('سفر جدید بر پایه این سفر ساخته شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}
async function toggleTripSave(): Promise<void> {
  const detail = tripDetail.value;
  if (!detail) return;
  try {
    await trips.toggleSave(detail.id, !detail.saved);
    tripDetail.value = { ...detail, saved: !detail.saved };
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

function starRow(rating: number): number[] {
  return Array.from({ length: Math.max(0, Math.min(5, Math.round(rating))) }, (_, index) => index);
}
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>تاریخچه</strong>
      <span>{{ format.number(missionCount + tripCount + shareHistory.length) }} رویداد ثبت‌شده</span>
    </div>
    <button type="button" class="sheet__expand" aria-label="نمایه" @click="router.push({ name: ROUTE_NAMES.profile })">
      <span class="mdi mdi-account" aria-hidden="true" />
    </button>
  </div>
  <div class="sheet__body">
    <div class="history-tabs" role="tablist" aria-label="دسته‌بندی تاریخچه">
      <button type="button" role="tab" class="history-tab" :class="{ 'is-active': activeTab === 'trips' }" :aria-selected="activeTab === 'trips'" data-testid="history-tab-trips" @click="activeTab = 'trips'">
        <span class="mdi mdi-map-marker-path" aria-hidden="true" /><span>سفرها</span><em>{{ format.number(tripCount) }}</em>
      </button>
      <button type="button" role="tab" class="history-tab" :class="{ 'is-active': activeTab === 'missions' }" :aria-selected="activeTab === 'missions'" data-testid="history-tab-missions" @click="activeTab = 'missions'">
        <span class="mdi mdi-car" aria-hidden="true" /><span>مأموریت‌ها</span><em>{{ format.number(missionCount) }}</em>
      </button>
      <button type="button" role="tab" class="history-tab" :class="{ 'is-active': activeTab === 'shares' }" :aria-selected="activeTab === 'shares'" data-testid="history-tab-shares" @click="activeTab = 'shares'">
        <span class="mdi mdi-share-variant" aria-hidden="true" /><span>اشتراک‌ها</span><em>{{ format.number(shareHistory.length) }}</em>
      </button>
    </div>

    <div class="history-filters" data-testid="history-filters">
      <div class="history-filter-row" role="group" aria-label="بازه زمانی">
        <button v-for="option in DATE_RANGE_OPTIONS" :key="option.value" type="button" class="history-chip" :class="{ 'is-active': dateRange === option.value }" :aria-pressed="dateRange === option.value" :data-testid="`history-range-${option.value}`" @click="dateRange = option.value">{{ option.label }}</button>
      </div>
      <div v-if="activeTab !== 'shares'" class="history-filter-row" role="group" aria-label="وضعیت">
        <button type="button" class="history-chip" :class="{ 'is-active': statusFilter === 'all' }" :aria-pressed="statusFilter === 'all'" data-testid="history-status-all" @click="statusFilter = 'all'">همه</button>
        <button type="button" class="history-chip" :class="{ 'is-active': statusFilter === 'completed' }" :aria-pressed="statusFilter === 'completed'" data-testid="history-status-completed" @click="statusFilter = 'completed'">تکمیل‌شده</button>
        <button type="button" class="history-chip" :class="{ 'is-active': statusFilter === 'cancelled' }" :aria-pressed="statusFilter === 'cancelled'" data-testid="history-status-cancelled" @click="statusFilter = 'cancelled'">لغوشده</button>
      </div>
      <div v-else class="history-filter-row" role="group" aria-label="وضعیت اشتراک">
        <button type="button" class="history-chip" :class="{ 'is-active': shareStateFilter === 'all' }" :aria-pressed="shareStateFilter === 'all'" data-testid="history-share-state-all" @click="shareStateFilter = 'all'">همه</button>
        <button type="button" class="history-chip" :class="{ 'is-active': shareStateFilter === 'active' }" :aria-pressed="shareStateFilter === 'active'" data-testid="history-share-state-active" @click="shareStateFilter = 'active'">فعال</button>
        <button type="button" class="history-chip" :class="{ 'is-active': shareStateFilter === 'expired' }" :aria-pressed="shareStateFilter === 'expired'" data-testid="history-share-state-expired" @click="shareStateFilter = 'expired'">منقضی‌شده</button>
        <button type="button" class="history-chip" :class="{ 'is-active': shareStateFilter === 'revoked' }" :aria-pressed="shareStateFilter === 'revoked'" data-testid="history-share-state-revoked" @click="shareStateFilter = 'revoked'">قطع‌شده</button>
      </div>
      <p class="history-summary" data-testid="history-summary">{{ summaryLine }}</p>
    </div>

    <!-- ===== Trips ===== -->
    <template v-if="activeTab === 'trips'">
      <p v-if="trips.error" class="sheet__status share-error" data-testid="history-trips-error">{{ trips.error }}</p>
      <button v-if="trips.error" type="button" class="ghost-button" data-testid="history-trips-retry" @click="() => trips.load()">تلاش دوباره</button>
      <template v-for="group in tripGroups" :key="group.key">
        <h3 class="sheet__subtitle">{{ group.label }}</h3>
        <ul class="history-list">
          <li v-for="trip in group.items" :key="trip.id" class="history-row history-row--column">
            <button type="button" class="history-row__main" :data-testid="`history-trip-${trip.id}`" :aria-expanded="expanded === `trip:${trip.id}`" @click="toggleTrip(trip.id)">
              <span class="mdi mdi-flag-checkered" aria-hidden="true" />
              <span class="history-row__text">
                <strong>{{ trip.name }}</strong>
                <small>{{ format.dateTime(trip.startedAt ?? trip.createdAt) }} · {{ format.number(trip.stopCount) }} توقف · {{ TRIP_ROLE_LABEL[trip.role] ?? trip.role }}</small>
              </span>
              <span class="status-pill" :class="trip.status === 'completed' ? 'status-pill--success' : 'status-pill--danger'">{{ TRIP_STATUS_LABEL[trip.status] ?? trip.status }}</span>
            </button>
            <div v-if="expanded === `trip:${trip.id}`" class="history-detail" data-testid="history-trip-detail">
              <p v-if="tripDetailLoading" class="sheet__status">در حال دریافت…</p>
              <template v-else-if="tripDetail">
                <ol class="trip-stop-list">
                  <li v-for="stop in tripDetail.stops" :key="stop.id"><strong>{{ format.number(stop.rank) }}. {{ stop.label }}</strong></li>
                </ol>
                <p class="sheet__status">
                  آغاز: {{ tripDetail.startedAt ? format.dateTime(tripDetail.startedAt) : '—' }} · پایان: {{ tripDetail.completedAt ? format.dateTime(tripDetail.completedAt) : '—' }} ·
                  اعضا: {{ (tripDetail.members ?? []).map((member) => member.username).join('، ') }}
                </p>
              </template>
              <TrackReplayPanel
                v-if="tripDetail"
                context-type="trip"
                :context-id="tripDetail.id"
                :availability="tripDetail.trackStatus ?? 'none'"
                :from="tripDetail.startedAt ?? tripDetail.createdAt"
                :to="tripDetail.completedAt ?? tripDetail.updatedAt"
              />
              <div class="history-detail__actions">
                <button type="button" class="ghost-button" data-testid="history-trip-repeat" @click="repeatTrip">
                  <span class="mdi mdi-repeat" aria-hidden="true" /><span>تکرار این سفر</span>
                </button>
                <button type="button" class="ghost-button" data-testid="history-trip-toggle-save" @click="toggleTripSave">
                  <span class="mdi mdi-star" :class="{ 'is-active': tripDetail?.saved }" aria-hidden="true" /><span>{{ tripDetail?.saved ? 'برداشتن از ذخیره‌ها' : 'ذخیره سفر' }}</span>
                </button>
                <button type="button" class="ghost-button" :data-testid="`history-share-toggle-trip-${trip.id}`" @click="toggleShareFor(`trip:${trip.id}`)">
                  <span class="mdi mdi-share-variant" aria-hidden="true" /><span>اشتراک این بازه</span>
                </button>
              </div>
              <HistorySharePanel
                v-if="sharing === `trip:${trip.id}`"
                :from="shareWindow.from"
                :to="shareWindow.to"
                :context="shareWindow.context"
                @created="onShareCreated"
                @close="sharing = null"
              />
            </div>
          </li>
        </ul>
      </template>
      <template v-if="!tripGroups.length && !trips.error">
        <p class="sheet__status" data-testid="history-trips-empty">{{ filterEmptied ? 'هیچ رکوردی با این فیلترها نیست.' : 'هنوز سفری تکمیل یا لغو نشده است.' }}</p>
        <button v-if="filterEmptied" type="button" class="ghost-button" data-testid="history-filter-reset-trips" @click="resetFilters">حذف فیلترها</button>
      </template>
    </template>

    <!-- ===== Missions ===== -->
    <template v-else-if="activeTab === 'missions'">
      <div class="history-subtabs" role="tablist" aria-label="نمای مأموریت‌ها">
        <button type="button" role="tab" class="history-subtab" :class="{ 'is-active': missionsView === 'requests' }" :aria-selected="missionsView === 'requests'" data-testid="history-subtab-requests" @click="missionsView = 'requests'">
          درخواست‌های من <em>{{ format.number(history.length) }}</em>
        </button>
        <button type="button" role="tab" class="history-subtab" :class="{ 'is-active': missionsView === 'missions' }" :aria-selected="missionsView === 'missions'" data-testid="history-subtab-missions" @click="missionsView = 'missions'">
          مأموریت‌های من <em>{{ format.number(missions.length) }}</em>
        </button>
      </div>
      <p v-if="sos.error" class="sheet__status share-error" data-testid="history-missions-error">{{ sos.error }}</p>
      <button v-if="sos.error" type="button" class="ghost-button" data-testid="history-missions-retry" @click="() => sos.load()">تلاش دوباره</button>

      <template v-if="missionsView === 'requests'">
        <template v-for="group in requestGroups" :key="group.key">
          <h3 class="sheet__subtitle">{{ group.label }}</h3>
          <ul class="history-list">
            <li v-for="item in group.items" :key="item.id" class="history-row history-row--column">
              <button type="button" class="history-row__main" :data-testid="`history-request-${item.id}`" :aria-expanded="expanded === `req:${item.id}`" @click="toggleRequest(item.id)">
                <span class="mdi mdi-alert-circle-outline" aria-hidden="true" />
                <span class="history-row__text">
                  <strong>{{ item.incidentLabel }}</strong>
                  <small>{{ format.dateTime(item.createdAt) }} · شدت {{ SEVERITY_LABEL[item.severity] ?? item.severity }}</small>
                </span>
                <span :class="statusTone(item.status)">{{ statusLabel(item.status) }}</span>
              </button>
              <div v-if="expanded === `req:${item.id}`" class="history-detail" data-testid="history-request-detail">
                <p class="sheet__status">{{ item.description }}</p>
                <p class="sheet__status">
                  ردیابی: {{ format.number(item.trackingCode) }} · شدت: {{ SEVERITY_LABEL[item.severity] ?? item.severity }}
                  <span v-if="item.isManual" class="status-pill status-pill--warning">موقعیت دستی</span>
                </p>
                <p v-if="requestDetailLoading" class="sheet__status">در حال دریافت گزارش…</p>
                <ol v-else-if="requestDetail?.timeline?.length" class="history-timeline" data-testid="history-request-timeline">
                  <li v-for="(event, index) in requestDetail.timeline" :key="index">
                    <span class="mdi mdi-circle-medium" aria-hidden="true" />
                    <span>{{ format.dateTime(event.createdAt) }} · {{ EVENT_ACTION_LABEL[event.action] ?? event.action }} ({{ statusLabel(event.fromStatus) }} ← {{ statusLabel(event.toStatus) }}){{ event.note ? ` — ${event.note}` : '' }}</span>
                  </li>
                </ol>
                <div class="history-detail__actions">
                  <button type="button" class="ghost-button" :data-testid="`history-share-toggle-req-${item.id}`" @click="toggleShareFor(`req:${item.id}`)">
                    <span class="mdi mdi-share-variant" aria-hidden="true" /><span>اشتراک این بازه</span>
                  </button>
                </div>
                <HistorySharePanel
                  v-if="sharing === `req:${item.id}`"
                  :from="shareWindow.from"
                  :to="shareWindow.to"
                  :context="shareWindow.context"
                  @created="onShareCreated"
                  @close="sharing = null"
                />
              </div>
            </li>
          </ul>
        </template>
        <template v-if="!filteredRequests.length && !sos.error">
          <p class="sheet__status" data-testid="history-requests-empty">{{ filterEmptied ? 'هیچ رکوردی با این فیلترها نیست.' : 'درخواستی ثبت نشده است.' }}</p>
          <button v-if="filterEmptied" type="button" class="ghost-button" data-testid="history-filter-reset-requests" @click="resetFilters">حذف فیلترها</button>
        </template>
      </template>

      <template v-else>
        <template v-for="group in missionGroups" :key="group.key">
          <h3 class="sheet__subtitle">{{ group.label }}</h3>
          <ul class="history-list">
            <li v-for="mission in group.items" :key="mission.id" class="history-row history-row--column">
              <button type="button" class="history-row__main" :data-testid="`history-mission-${mission.id}`" :aria-expanded="expanded === `mis:${mission.id}`" @click="toggleMission(mission.id)">
                <span class="mdi mdi-car" aria-hidden="true" />
                <span class="history-row__text">
                  <strong>{{ mission.incidentLabel }}</strong>
                  <small>{{ format.dateTime(mission.updatedAt) }}<span v-if="mission.rating != null"> · امتیاز {{ format.number(mission.rating) }} از ۵</span></small>
                </span>
                <span :class="statusTone(mission.status)">{{ statusLabel(mission.status) }}</span>
              </button>
              <div v-if="expanded === `mis:${mission.id}`" class="history-detail" data-testid="history-mission-detail">
                <p class="sheet__status">ردیابی: {{ format.number(mission.trackingCode) }} · ایجاد: {{ format.dateTime(mission.createdAt) }} · آخرین به‌روزرسانی: {{ format.dateTime(mission.updatedAt) }}</p>
                <div v-if="mission.rating != null" class="history-rating" data-testid="history-mission-rating">
                  <span v-for="index in starRow(mission.rating)" :key="index" class="mdi mdi-star" aria-hidden="true" />
                  <span>{{ format.number(mission.rating) }} از ۵</span>
                </div>
                <p v-if="mission.ratingNote" class="sheet__status">یادداشت درخواست‌کننده: {{ mission.ratingNote }}</p>
                <p v-else-if="mission.rating == null" class="sheet__status">هنوز امتیازی ثبت نشده است.</p>
                <TrackReplayPanel
                  context-type="mission"
                  :context-id="mission.id"
                  :availability="mission.trackStatus ?? 'none'"
                  :from="mission.createdAt"
                  :to="mission.updatedAt"
                />
                <div class="history-detail__actions">
                  <button type="button" class="ghost-button" :data-testid="`history-share-toggle-mis-${mission.id}`" @click="toggleShareFor(`mis:${mission.id}`)">
                    <span class="mdi mdi-share-variant" aria-hidden="true" /><span>اشتراک این بازه</span>
                  </button>
                </div>
                <HistorySharePanel
                  v-if="sharing === `mis:${mission.id}`"
                  :from="shareWindow.from"
                  :to="shareWindow.to"
                  :context="shareWindow.context"
                  @created="onShareCreated"
                  @close="sharing = null"
                />
              </div>
            </li>
          </ul>
        </template>
        <template v-if="!filteredMissions.length && !sos.error">
          <p class="sheet__status" data-testid="history-missions-empty">{{ filterEmptied ? 'هیچ رکوردی با این فیلترها نیست.' : 'مأموریتی ثبت نشده است.' }}</p>
          <button v-if="filterEmptied" type="button" class="ghost-button" data-testid="history-filter-reset-missions" @click="resetFilters">حذف فیلترها</button>
        </template>
      </template>
    </template>

    <!-- ===== Shares ===== -->
    <template v-else>
      <p v-if="sharesFailed" class="sheet__status share-error" data-testid="history-shares-error">فهرست اشتراک‌ها دریافت نشد.</p>
      <button v-if="sharesFailed" type="button" class="ghost-button" data-testid="history-shares-retry" @click="loadShares">تلاش دوباره</button>
      <ul class="history-list">
        <li v-for="share in filteredShares" :key="share.id" class="history-row" data-testid="history-share-row">
          <span class="mdi mdi-map-marker-path" aria-hidden="true" />
          <div>
            <strong>{{ share.kind === 'live' ? 'اشتراک زنده' : 'بازه تاریخچه' }} با {{ shareCounterpart(share) }}</strong>
            <small>{{ shareDirection(share) }} · {{ format.dateTime(share.createdAt) }}</small>
          </div>
          <span :class="SHARE_STATE_TONE[share.state ?? 'active']">{{ SHARE_STATE_LABEL[share.state ?? 'active'] }}</span>
        </li>
      </ul>
      <template v-if="!filteredShares.length && !sharesFailed">
        <p class="sheet__status" data-testid="history-shares-empty">{{ filterEmptied ? 'هیچ اشتراکی با این فیلترها نیست.' : 'هنوز اشتراکی ثبت نشده است.' }}</p>
        <button v-if="filterEmptied" type="button" class="ghost-button" data-testid="history-filter-reset-shares" @click="resetFilters">حذف فیلترها</button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.history-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-block: 4px 12px;
}
.history-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: var(--r12, 12px);
  background: var(--surface-2);
}
.history-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.history-chip {
  border: 1px solid var(--border, rgba(128, 128, 128, 0.35));
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
}
.history-chip.is-active {
  background: var(--brand, #0f6fff);
  border-color: var(--brand, #0f6fff);
  color: #fff;
}
.history-summary {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
.history-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px 4px;
  border: 0;
  border-radius: var(--r12, 12px);
  background: var(--surface-3);
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.history-tab em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.85;
}
.history-tab.is-active {
  background: var(--primary);
  color: #fff;
}
.history-subtabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-block-end: 10px;
}
.history-subtab {
  padding: 8px 4px;
  border: 1px solid var(--border, #d8dedd);
  border-radius: var(--r12, 12px);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.history-subtab.is-active {
  border-color: var(--primary);
  color: var(--primary-deep, var(--primary));
  background: var(--primary-soft, #eef4f3);
}
.history-row--column {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.history-row__main {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.history-row__text {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.history-row__text small {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-detail {
  display: grid;
  gap: 8px;
  padding: 8px 10px 10px;
  border-radius: var(--r12, 12px);
  background: var(--surface-2);
}
.history-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.history-timeline {
  list-style: none;
  margin: 0;
  padding: 0 6px;
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.history-timeline li {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.trip-stop-list {
  display: grid;
  gap: 6px;
  padding-inline-start: 20px;
  margin: 4px 0;
  font-size: 12px;
}
.history-rating {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--warning, #c78b1e);
}
.history-rating span:last-child {
  color: var(--muted);
  font-size: 12px;
  margin-inline-start: 6px;
}
.mdi-star.is-active {
  color: var(--warning, #c78b1e);
}
</style>
