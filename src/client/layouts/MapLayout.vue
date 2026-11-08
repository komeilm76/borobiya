<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { useAuthStore } from '@/stores/auth.ts';
import { useMapStore } from '@/stores/map.ts';
import { useSosStore } from '@/stores/sos.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { useOfflineStore } from '@/stores/offline.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { useSosHold } from '@/composables/useSosHold.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { HTTP_EVENTS, WS_EVENTS } from '@shared/protocol.ts';
import MapCanvas from '@/components/MapCanvas.vue';

/**
 * Mobile application shell: the map canvas stays mounted while the bottom sheet shows the
 * active screen. Realtime events, geolocation and the SOS hold gesture live here so they
 * survive route changes between the map, mission, companions and profile screens.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const map = useMapStore();
const sos = useSosStore();
const realtime = useRealtimeStore();
const offline = useOfflineStore();
const motion = useMotionPreferences();

const tabs = [
  { name: ROUTE_NAMES.history, label: 'تاریخچه', icon: 'history' },
  { name: ROUTE_NAMES.map, label: 'مسیریابی', icon: 'routes' },
  { name: ROUTE_NAMES.companions, label: 'همراهان', icon: 'account-group-outline' },
  { name: ROUTE_NAMES.mission, label: 'مأموریت', icon: 'web' }
] as const;

const activeTab = computed(() => {
  const name = String(route.name);
  if (name === ROUTE_NAMES.sos || name === ROUTE_NAMES.talk) return ROUTE_NAMES.map;
  if (name === ROUTE_NAMES.profile) return ROUTE_NAMES.history;
  return name;
});

const hold = useSosHold(() => {
  void router.push({ name: ROUTE_NAMES.sos });
});

const unsubscribers: Array<() => void> = [];

onMounted(async () => {
  map.startLocation();
  await Promise.all([map.load(), sos.load()]);
  await realtime.connect();
  unsubscribers.push(
    realtime.on(HTTP_EVENTS.SOS_CREATED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.SOS_DISPATCHED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.SOS_ACCEPTED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.MISSION_UPDATED, () => void sos.load()),
    realtime.on(HTTP_EVENTS.LOCATION_SHARE_CREATED, () => void map.load()),
    realtime.on(WS_EVENTS.LOCATION_PEER, (payload: { userId: string; fix: Record<string, number> }) => {
      if (!payload?.userId || !payload.fix) return;
      map.applyLiveFix({ userId: payload.userId, ...payload.fix } as never);
    })
  );
});

onUnmounted(() => {
  for (const off of unsubscribers.splice(0)) off();
  map.stopLocation();
  realtime.disconnect();
});

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && ['sos', 'talk', 'mission', 'profile', 'companions', 'history'].includes(String(route.name))) {
    void router.push({ name: ROUTE_NAMES.map });
  }
});

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

      <MapCanvas :motion="motion" />

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

      <form class="search-bar" role="search" @submit.prevent="router.push({ name: ROUTE_NAMES.map })">
        <button type="submit" aria-label="جست‌وجو"><span class="mdi mdi-magnify" aria-hidden="true" /></button>
        <input name="q" type="search" placeholder="کجا می‌روی؟" aria-label="جست‌وجوی مقصد">
      </form>

      <div class="right-controls">
        <button type="button" class="avatar-control" :aria-label="`نمایه ${auth.user?.username ?? ''}`" @click="router.push({ name: ROUTE_NAMES.profile })">
          <span>{{ (auth.user?.username ?? 'B').slice(0, 1).toUpperCase() }}</span><i />
        </button>
        <button type="button" class="round-control" aria-label="مرکز نقشه" @click="map.startLocation()">
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
.sos-button { position: absolute; inset-inline-start: 50%; transform: translateX(50%); inset-block-end: 92px; }
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
