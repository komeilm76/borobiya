<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEventListener, watchDebounced } from '@vueuse/core';
import { useAuthStore } from '@/stores/auth.ts';
import { useMapStore } from '@/stores/map.ts';
import { useSosStore } from '@/stores/sos.ts';
import { useTripsStore } from '@/stores/trips.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { useOfflineStore } from '@/stores/offline.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { useSosHold } from '@/composables/useSosHold.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { HTTP_EVENTS, WS_EVENTS } from '@shared/protocol.ts';
import { useToast } from '@/composables/useToast.ts';
import MapCanvas from '@/components/MapCanvas.vue';
import TrackConsentPrompt from '@/components/TrackConsentPrompt.vue';
import TrackRecordingIndicator from '@/components/TrackRecordingIndicator.vue';
import { useTrackStore } from '@/stores/track.ts';

/**
 * Mobile application shell: the map canvas stays mounted while the bottom sheet shows the
 * active screen. Realtime events, geolocation and the SOS hold gesture live here so they
 * survive route changes between the map, mission, sharing, trips and profile screens.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const map = useMapStore();
const sos = useSosStore();
const trips = useTripsStore();
const realtime = useRealtimeStore();
const track = useTrackStore();
const offline = useOfflineStore();
const motion = useMotionPreferences();
const toast = useToast();

const tabs = [
  { name: ROUTE_NAMES.history, label: 'تاریخچه', icon: 'history' },
  { name: ROUTE_NAMES.map, label: 'نقشه', icon: 'routes' },
  { name: ROUTE_NAMES.trips, label: 'سفرها', icon: 'map-marker-path' },
  { name: ROUTE_NAMES.sharing, label: 'اشتراک‌گذاری', icon: 'share-variant' },
  { name: ROUTE_NAMES.mission, label: 'مأموریت', icon: 'web' }
] as const;

const activeTab = computed(() => {
  const name = String(route.name);
  if (name === ROUTE_NAMES.sos || name === ROUTE_NAMES.talk) return ROUTE_NAMES.map;
  // Profile is not a tab either; the documented contract keeps the history tab highlighted.
  if (name === ROUTE_NAMES.profile) return ROUTE_NAMES.history;
  return name;
});

const hold = useSosHold(() => {
  void router.push({ name: ROUTE_NAMES.sos });
});

/**
 * Crosshairs control: centre on the user's own fix when there is one; otherwise resume the
 * geolocation watch so a fix can arrive. Never silently no-ops.
 */
function onCenterOnMe(): void {
  if (!map.centerOnOwnFix()) {
    map.startLocation();
    toast.push('هنوز موقعیتی ثبت نشده است؛ موقعیت شما در حال دریافت است.', 'info', 2600);
  }
}

const unsubscribers: Array<() => void> = [];

// Consented trajectory publishing: best-effort and gated inside the track store (opt-in +
// per-context consent). The live location socket keeps working even when the gate refuses.
watch(() => map.ownFix, (fix) => { if (fix) track.publishFix(fix); });

onMounted(async () => {
  map.startLocation();
  await Promise.all([map.load(), sos.load(), trips.load()]);
  await realtime.connect();
  unsubscribers.push(
    realtime.on(HTTP_EVENTS.SOS_CREATED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.SOS_DISPATCHED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.SOS_ACCEPTED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.MISSION_UPDATED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.LOCATION_SHARE_CREATED, () => void map.load()),
    realtime.on(HTTP_EVENTS.TRIP_UPDATED, () => void trips.load()),
    realtime.on(HTTP_EVENTS.TRIP_INVITATION, () => void trips.load()),
    realtime.on(WS_EVENTS.LOCATION_PEER, (payload: { userId: string; username?: string; fix: Record<string, number> }) => {
      if (!payload?.userId || !payload.fix) return;
      map.applyLiveFix({ userId: payload.userId, username: payload.username, ...payload.fix } as never);
    })
  );
});

onUnmounted(() => {
  for (const off of unsubscribers.splice(0)) off();
  map.stopLocation();
  realtime.disconnect();
});

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && ['sos', 'talk', 'mission', 'profile', 'sharing', 'history', 'trips'].includes(String(route.name))) {
    void router.push({ name: ROUTE_NAMES.map });
  }
});

/**
 * Offline search over the only data the device actually owns: the user's saved places and the
 * points of interest baked into the vector-map configuration. There is no online geocoder to
 * fall back to — a search box that answers nothing when the network is gone is worse than an
 * honest empty state, so everything below resolves against local data, synchronously, offline.
 */
interface SearchResult {
  id: string;
  name: string;
  kind: 'place' | 'poi';
  detail: string;
  icon: string;
  latitude: number;
  longitude: number;
}

/** Search sources carry a hidden haystack used only for matching. */
interface SearchSourceEntry extends SearchResult {
  haystack: string;
}

/** Persian/Arabic-insensitive comparison key: unify letter shapes, drop diacritics, fold digits. */
function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Arabic/Persian diacritics
    .replace(/\u0640/g, '') // tatweel
    .replace(/\u200C|\u200D/g, '') // ZWJ/ZWNJ
    .replace(/ي/g, 'ی').replace(/ى/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه')
    .replace(/[أإٱآ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ی')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const query = ref('');
const results = ref<SearchResult[]>([]);
const searchState = ref<'idle' | 'loading' | 'done' | 'error'>('idle');
const searchError = ref<string | null>(null);
const activeIndex = ref(-1);
const searchOpen = ref(false);
let searchToken = 0;

function searchSources(): SearchSourceEntry[] {
  const fromPlaces = map.places.map((place) => ({
    id: `place-${place.id}`,
    name: place.name,
    kind: 'place' as const,
    detail: place.label || place.address || 'مکان ذخیره‌شده',
    icon: place.icon || 'map-marker-outline',
    latitude: place.latitude,
    longitude: place.longitude,
    haystack: `${place.name} ${place.label ?? ''} ${place.address ?? ''}`
  }));
  const fromPois = (map.config?.pois ?? []).map((poi) => ({
    id: `poi-${poi.id}`,
    name: poi.name,
    kind: 'poi' as const,
    detail: poi.kind === 'road' ? 'خیابان' : String(poi.kind),
    icon: 'map-marker',
    latitude: poi.latitude,
    longitude: poi.longitude,
    haystack: poi.name
  }));
  return [...fromPlaces, ...fromPois];
}

async function runSearch(raw: string): Promise<void> {
  const token = ++searchToken;
  const q = normalizeSearchText(raw);
  results.value = [];
  activeIndex.value = -1;
  if (q.length < 2) {
    searchState.value = 'idle';
    searchError.value = null;
    return;
  }
  searchState.value = 'loading';
  searchError.value = null;
  searchOpen.value = true;
  try {
    // Yield once so the loading state can paint; both sources are local and synchronous.
    await Promise.resolve();
    const matches = searchSources()
      .filter((entry) => normalizeSearchText(entry.haystack).includes(q))
      .slice(0, 8)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        kind: entry.kind,
        detail: entry.detail,
        icon: entry.icon,
        latitude: entry.latitude,
        longitude: entry.longitude
      }));
    if (token !== searchToken) return; // a newer search superseded this one
    results.value = matches;
    searchState.value = 'done';
  } catch (caught) {
    if (token !== searchToken) return;
    results.value = [];
    searchState.value = 'error';
    // The message is deliberately generic: the only failure mode here is corrupt local data.
    searchError.value = 'جست‌وجو ناموفق بود؛ دوباره تلاش کنید.';
  }
}

watchDebounced(query, (value) => void runSearch(value), { debounce: 150, maxWait: 600 });

const listOpen = computed(() => searchOpen.value && normalizeSearchText(query.value).length >= 2);

function chooseResult(result: SearchResult): void {
  map.focusOn({ latitude: result.latitude, longitude: result.longitude }, result.name);
  query.value = result.name;
  searchState.value = 'idle';
  results.value = [];
  searchOpen.value = false;
  activeIndex.value = -1;
}

function pickActiveOrFirst(): void {
  const index = activeIndex.value >= 0 ? activeIndex.value : 0;
  const target = results.value[index];
  if (target) chooseResult(target);
}

function moveActive(delta: number): void {
  if (!results.value.length) return;
  const next = activeIndex.value + delta;
  activeIndex.value = ((next % results.value.length) + results.value.length) % results.value.length;
}

function closeSearch(): void {
  searchOpen.value = false;
  activeIndex.value = -1;
}

async function retrySearch(): Promise<void> {
  await runSearch(query.value);
}

async function logout(): Promise<void> {
  await auth.logout();
  realtime.disconnect();
  await router.push({ name: ROUTE_NAMES.login });
}
</script>

<template>
  <main id="app" class="map-shell" tabindex="-1">
    <div class="map-shell__frame">
      <div class="status-bar" aria-hidden="true">
        <span class="status-bar__clock">{{ new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) }}</span>
        <span class="status-bar__icons">
          <span class="mdi mdi-signal" /><span class="mdi mdi-wifi" /><span class="mdi mdi-battery" />
        </span>
      </div>

      <nav class="top-pill" aria-label="بخش‌های اصلی">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          :to="{ name: tab.name }"
          class="top-pill__item"
          :class="{ 'is-active': activeTab === tab.name }"
          :aria-current="activeTab === tab.name ? 'page' : undefined"
        >
          <span :class="['mdi', `mdi-${tab.icon}`]" aria-hidden="true" />
          <span>{{ tab.label }}</span>
        </RouterLink>
      </nav>

      <TrackConsentPrompt />
      <TrackRecordingIndicator />

      <MapCanvas />

      <Transition name="bb-sheet" mode="out-in" :duration="motion.base.value">
        <section :key="String(route.name)" class="sheet" :data-detent="map.detent">
          <RouterView />
        </section>
      </Transition>

      <button
        type="button"
        class="sos-button"
        :class="{ 'is-holding': hold.holding.value }"
        :aria-label="hold.label.value"
        data-testid="sos-hold"
        @pointerdown="hold.start()"
        @pointerup="hold.stop()"
        @pointerleave="hold.stop()"
        @keydown.space.prevent="hold.start()"
        @keyup.space.prevent="hold.stop()"
      >
        <span>SOS</span>
        <span class="mdi mdi-alarm-light" aria-hidden="true" />
        <i class="sos-button__progress" :style="{ inlineSize: `${hold.progress.value * 100}%` }" />
      </button>

      <div v-if="offline.offline" class="offline-banner" role="status">
        <span class="mdi mdi-wifi-off" aria-hidden="true" />
        <span>حالت آفلاین — داده‌های ذخیره‌شده در دسترس‌اند.</span>
      </div>

      <div class="home-indicator" aria-hidden="true" />

      <form class="search-bar" role="search" @submit.prevent="pickActiveOrFirst">
        <button type="submit" aria-label="جست‌وجو" data-testid="search-submit"><span class="mdi mdi-magnify" aria-hidden="true" /></button>
        <input
          v-model="query"
          name="q"
          type="search"
          placeholder="کجا می‌روی؟"
          aria-label="جست‌وجوی مقصد"
          data-testid="map-search"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="listOpen"
          aria-controls="map-search-results"
          :aria-activedescendant="activeIndex >= 0 ? `map-search-option-${activeIndex}` : undefined"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.enter.prevent="pickActiveOrFirst"
          @keydown.escape="closeSearch"
          @focus="searchOpen = true"
        >
        <ul v-if="listOpen" id="map-search-results" class="search-results" role="listbox" aria-label="نتیجه‌های جست‌وجو" data-testid="search-results">
          <li v-if="searchState === 'loading'" class="search-results__status" role="presentation">در حال جست‌وجو…</li>
          <li v-else-if="searchState === 'error'" class="search-results__status search-results__error" role="alert">
            <span>{{ searchError }}</span>
            <button type="button" class="text-link" data-testid="search-retry" @click="retrySearch">تلاش دوباره</button>
          </li>
          <li v-else-if="!results.length" class="search-results__status">نتیجه‌ای یافت نشد</li>
          <li
            v-for="(result, index) in results"
            :id="`map-search-option-${index}`"
            :key="result.id"
            class="search-results__option"
            :class="{ 'is-active': index === activeIndex }"
            role="option"
            :aria-selected="index === activeIndex"
            @mouseenter="activeIndex = index"
            @click="chooseResult(result)"
          >
            <span :class="['mdi', `mdi-${result.icon}`]" aria-hidden="true" />
            <span class="search-results__name">{{ result.name }}</span>
            <small class="search-results__tag">{{ result.detail }}</small>
          </li>
        </ul>
      </form>

      <div class="right-controls">
        <button type="button" class="avatar-control" :aria-label="`نمایه ${auth.user?.username ?? ''}`" @click="router.push({ name: ROUTE_NAMES.profile })">
          <span>{{ (auth.user?.username ?? 'B').slice(0, 1).toUpperCase() }}</span><i />
        </button>
        <button type="button" class="round-control" aria-label="مرکز نقشه" @click="onCenterOnMe">
          <span class="mdi mdi-crosshairs-gps" aria-hidden="true" />
        </button>
        <button type="button" class="round-control" aria-label="خروج" @click="logout">
          <span class="mdi mdi-logout" aria-hidden="true" />
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.map-shell {
  display: grid;
  place-items: center;
  min-block-size: 100vh;
  background: var(--surface-3);
  padding: 0;
}
.map-shell__frame {
  position: relative;
  inline-size: min(393px, 100vw);
  block-size: min(852px, 100vh);
  overflow: hidden;
  background: var(--map-land);
  border-radius: 0;
}
@media (min-width: 640px) {
  .map-shell__frame {
    border-radius: var(--r32);
    box-shadow: var(--shadow-lg);
    block-size: min(852px, calc(100vh - 32px));
  }
}
.bb-sheet-enter-active,
.bb-sheet-leave-active { transition: opacity 200ms var(--ease), transform 200ms var(--ease); }
.bb-sheet-enter-from,
.bb-sheet-leave-to { opacity: 0; transform: translateY(16px); }
/* Approved decision 5: the SOS dock lives on the physical left edge, above the search bar.
   Physical positioning on purpose — the sheet opens from the bottom and the end side of an RTL row is the left, so a logical inset would silently move with document direction. */
.sos-button { position: absolute; inset-block-end: 92px; left: 14px; }
.offline-banner {
  position: absolute;
  inset-block-start: 54px;
  inset-inline: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  border-radius: var(--r16);
  background: var(--warning);
  color: #fff;
  font-size: 13px;
}
@media (prefers-reduced-motion: reduce) {
  .bb-sheet-enter-active,
  .bb-sheet-leave-active { transition: none; }
}
</style>
