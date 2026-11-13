<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { useAuthStore } from '@/stores/auth.ts';
import { useAdminStore } from '@/stores/admin.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { commandPaletteOpen } from '@/composables/useCommandPalette.ts';
import AdminNav from '@/components/AdminNav.vue';
import { ROUTE_NAMES } from '@/router/index.ts';
import { HTTP_EVENTS } from '@shared/protocol.ts';

/**
 * Administrator shell: fixed 1440×900 frame with a 264px sidebar, a 68px topbar and 28px
 * content padding, matching the canonical design references. Realtime events refresh the
 * alert and dispatch counters without a page reload.
 */
const route = useRoute();
const auth = useAuthStore();
const admin = useAdminStore();
const realtime = useRealtimeStore();
const motion = useMotionPreferences();
/** Off-canvas navigation for small screens; the fixed sidebar is hidden below 1100px. */
const navOpen = ref(false);

const unsubscribers: Array<() => void> = [];
const openAlerts = computed(() => admin.alerts.filter((alert) => !alert.resolvedAt).length);

onMounted(async () => {
  await admin.loadAll();
  await realtime.connect();
  unsubscribers.push(
    realtime.on(HTTP_EVENTS.SOS_CREATED, () => void admin.loadDispatch()),
    realtime.on(HTTP_EVENTS.SOS_DISPATCHED, () => void admin.loadDispatch()),
    realtime.on(HTTP_EVENTS.ADMIN_ALERT, () => void admin.loadAlerts()),
    realtime.on(HTTP_EVENTS.SETTINGS_UPDATED, () => void admin.loadSettings()),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_CREATED, () => void admin.loadPendingSupportRequests()),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, () => void admin.loadPendingSupportRequests()),
    realtime.on(HTTP_EVENTS.SUPPORT_REQUEST_CANCELLED, () => void admin.loadPendingSupportRequests())
  );
});

onUnmounted(() => {
  for (const off of unsubscribers.splice(0)) off();
  realtime.disconnect();
});

watch(() => route.name, () => { navOpen.value = false; });

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') navOpen.value = false;
});

</script>

<template>
  <main id="app" class="admin-shell" tabindex="-1">
    <aside class="admin-sidebar bb-admin-sidebar" aria-label="ناوبری مدیریت">
      <AdminNav />
    </aside>

    <div class="admin-main">
      <header class="admin-topbar bb-admin-topbar">
        <div>
          <h1>{{ route.meta.label }}</h1>
          <p>پنجره عملیات — {{ auth.user?.username }}</p>
        </div>
        <div class="admin-topbar__actions">
          <button type="button" class="admin-menu-button" :aria-expanded="navOpen" aria-controls="admin-drawer" aria-label="باز کردن منو" @click="navOpen = !navOpen">
            <span :class="['mdi', navOpen ? 'mdi-close' : 'mdi-menu']" aria-hidden="true" />
          </button>
          <button type="button" class="admin-search" aria-label="جست‌وجوی فرمان" @click="commandPaletteOpen = true">
            <span class="mdi mdi-magnify" aria-hidden="true" />
            <span>جستجوی کاربر، مأموریت یا حادثه…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <RouterLink class="admin-bell" :to="{ name: ROUTE_NAMES.adminAlerts }" :aria-label="openAlerts ? `هشدارها — ${openAlerts} باز` : 'هشدارها'">
            <span class="mdi mdi-bell-outline" aria-hidden="true" />
            <i v-if="openAlerts" class="admin-bell__dot" aria-hidden="true" />
          </RouterLink>
          <span v-if="realtime.status === 'connected'" class="status-pill status-pill--success">زنده</span>
          <span v-else class="status-pill status-pill--neutral">اتصال مجدد…</span>
        </div>
      </header>
      <section class="admin-content bb-admin-pad">
        <Transition name="bb-admin-panel" mode="out-in" :duration="motion.fast.value">
          <RouterView :key="String(route.name)" />
        </Transition>
      </section>
    </div>

    <div v-if="navOpen" class="admin-drawer-backdrop" aria-hidden="true" @click="navOpen = false"></div>
    <aside v-if="navOpen" id="admin-drawer" class="admin-drawer" role="dialog" aria-modal="true" aria-label="ناوبری مدیریت">
      <AdminNav />
    </aside>
  </main>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  min-block-size: 100vh;
  background: var(--surface-2);
}
.admin-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 16px;
  background: var(--surface);
  border-inline-end: 1px solid var(--border);
  position: sticky;
  inset-block-start: 0;
  block-size: 100vh;
}
.admin-bell { position: relative; display: grid; place-items: center; inline-size: 40px; block-size: 40px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); text-decoration: none; }
.admin-bell:hover { background: var(--surface-3); }
.admin-bell__dot { position: absolute; inset-block-start: 9px; inset-inline-end: 10px; inline-size: 9px; block-size: 9px; border-radius: 50%; background: var(--danger); border: 2px solid var(--surface-2); }
.admin-main { display: flex; flex-direction: column; min-inline-size: 0; }
.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-inline: 28px;
  border-block-end: 1px solid var(--border);
  background: var(--surface);
}
.admin-topbar h1 { font-size: 18px; font-weight: 600; }
.admin-topbar p { font-size: 12px; color: var(--muted); }
.admin-topbar__actions { display: flex; gap: 10px; align-items: center; }
.admin-search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 240px;
  padding: 8px 12px;
  border-radius: var(--r12);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
}
.admin-search kbd { margin-inline-start: auto; font-size: 11px; color: var(--muted); }
.admin-content { flex: 1; min-inline-size: 0; }
.admin-menu-button {
  display: none;
  align-items: center;
  justify-content: center;
  inline-size: 40px;
  block-size: 40px;
  border-radius: var(--r12);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  font: inherit;
}
.admin-menu-button .mdi { font-size: 22px; }
.admin-drawer-backdrop { display: none; }
.admin-drawer { display: none; }
.bb-admin-panel-enter-active,
.bb-admin-panel-leave-active { transition: opacity 160ms var(--ease), transform 160ms var(--ease); }
.bb-admin-panel-enter-from,
.bb-admin-panel-leave-to { opacity: 0; transform: translateY(6px); }
@media (max-width: 1100px) {
  .admin-shell { grid-template-columns: minmax(0, 1fr); }
  .admin-sidebar { display: none; }
  /* the sidebar disappears on small screens, so the same destinations must stay
     reachable: a hamburger toggles the off-canvas drawer */
  .admin-menu-button { display: inline-flex; }
  .admin-drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(9, 30, 30, .45);
  }
  .admin-drawer {
    display: block;
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    inline-size: 264px;
    z-index: 61;
    padding: 20px 16px;
    background: var(--surface);
    border-inline-end: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* let the content grow past the viewport so the drawer scrolls instead of clipping the footer */
  .admin-drawer :deep(.admin-nav-content) { block-size: auto; min-block-size: 100%; }
  /* scoped rules out-specify the global compaction, so repeat it here: the search
     button collapses to an icon and the top bar stops overflowing on small screens */
  .admin-search { min-inline-size: 0; }
  .admin-topbar p { display: none; }
  .admin-topbar h1 { font-size: 15px; white-space: nowrap; }
}
@media (prefers-reduced-motion: reduce) {
  .bb-admin-panel-enter-active,
  .bb-admin-panel-leave-active { transition: none; }
}
</style>
