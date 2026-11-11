<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { useAuthStore } from '@/stores/auth.ts';
import { useAdminStore } from '@/stores/admin.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { useSettingsStore } from '@/stores/settings.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { useCommandPalette } from '@/composables/useCommandPalette.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { HTTP_EVENTS } from '@shared/protocol.ts';

/**
 * Administrator shell: fixed 1440×900 frame with a 264px sidebar, a 68px topbar and 28px
 * content padding, matching the canonical design references. Realtime events refresh the
 * alert and dispatch counters without a page reload.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const admin = useAdminStore();
const realtime = useRealtimeStore();
const settings = useSettingsStore();
const motion = useMotionPreferences();
const palette = useCommandPalette(() => []);

const navigation = [
  { name: ROUTE_NAMES.adminOverview, label: 'نمای کلی', icon: 'view-dashboard-outline' },
  { name: ROUTE_NAMES.adminDispatch, label: 'اعزام', icon: 'bullseye-arrow' },
  { name: ROUTE_NAMES.adminSupportRequests, label: 'درخواست‌های نیرو', icon: 'account-multiple-check-outline' },
  { name: ROUTE_NAMES.adminReports, label: 'گزارش‌ها', icon: 'file-chart-outline' },
  { name: ROUTE_NAMES.adminUsers, label: 'کاربران', icon: 'account-multiple-outline' },
  { name: ROUTE_NAMES.adminGroups, label: 'گروه‌ها', icon: 'account-group-outline' },
  { name: ROUTE_NAMES.adminIncidents, label: 'نوع حادثه', icon: 'alert-circle-outline' },
  { name: ROUTE_NAMES.adminJobTypes, label: 'نوع شغل', icon: 'briefcase-account-outline' },
  { name: ROUTE_NAMES.adminAudit, label: 'رویدادها', icon: 'clipboard-text-outline' },
  { name: ROUTE_NAMES.adminAlerts, label: 'هشدارها', icon: 'bell-alert-outline' },
  { name: ROUTE_NAMES.adminSettings, label: 'تنظیمات', icon: 'wrench-outline' }
] as const;

const unsubscribers: Array<() => void> = [];
const openAlerts = computed(() => admin.alerts.filter((alert) => !alert.resolvedAt).length);
const pendingSupportRequests = computed(() => admin.pendingSupportRequests);

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

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    palette.toggle();
  }
});

async function logout(): Promise<void> {
  await auth.logout();
  realtime.disconnect();
  await router.push({ name: ROUTE_NAMES.login });
}
</script>

<template>
  <main id="app" class="admin-shell" tabindex="-1">
    <aside class="admin-sidebar bb-admin-sidebar" aria-label="ناوبری مدیریت">
      <div class="admin-sidebar__brand">
        <span class="mdi mdi-compass-outline" aria-hidden="true" />
        <div>
          <strong>بورو بیا</strong>
          <small>کنسول مدیریت</small>
        </div>
      </div>
      <nav class="admin-nav">
        <RouterLink
          v-for="item in navigation"
          :key="item.name"
          :to="{ name: item.name }"
          class="admin-nav__item"
          :class="{ 'is-active': route.name === item.name }"
          :aria-current="route.name === item.name ? 'page' : undefined"
        >
          <span :class="['mdi', `mdi-${item.icon}`]" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <b v-if="item.name === ROUTE_NAMES.adminAlerts && openAlerts" class="admin-nav__badge">{{ openAlerts }}</b>
          <b v-else-if="item.name === ROUTE_NAMES.adminSupportRequests && pendingSupportRequests" class="admin-nav__badge" data-testid="support-requests-badge">{{ pendingSupportRequests }}</b>
        </RouterLink>
      </nav>
      <div class="admin-sidebar__footer">
        <button type="button" class="admin-link-button" @click="settings.cycle()">
          <span class="mdi mdi-theme-light-dark" aria-hidden="true" /><span>پوسته</span>
        </button>
        <button type="button" class="admin-link-button" @click="logout">
          <span class="mdi mdi-logout" aria-hidden="true" /><span>خروج</span>
        </button>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar bb-admin-topbar">
        <div>
          <h1>{{ route.meta.label }}</h1>
          <p>پنجره عملیات — {{ auth.user?.username }}</p>
        </div>
        <div class="admin-topbar__actions">
          <button type="button" class="admin-search" aria-label="جست‌وجوی فرمان" @click="palette.show()">
            <span class="mdi mdi-magnify" aria-hidden="true" />
            <span>جست‌وجو…</span>
            <kbd>Ctrl K</kbd>
          </button>
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
.admin-sidebar__brand { display: flex; gap: 10px; align-items: center; font-size: 18px; }
.admin-sidebar__brand .mdi { font-size: 26px; color: var(--primary); }
.admin-sidebar__brand small { display: block; font-size: 11px; color: var(--muted); }
.admin-nav { display: grid; gap: 4px; overflow-y: auto; }
.admin-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--r12);
  color: var(--text);
  text-decoration: none;
  font-size: 14px;
}
.admin-nav__item:hover { background: var(--surface-3); }
.admin-nav__item.is-active { background: var(--primary-soft); color: var(--primary-deep); font-weight: 600; }
.admin-nav__badge { margin-inline-start: auto; background: var(--danger); color: #fff; border-radius: 999px; padding: 0 7px; font-size: 11px; }
.admin-sidebar__footer { margin-block-start: auto; display: grid; gap: 4px; }
.admin-link-button {
  display: flex;
  gap: 8px;
  align-items: center;
  background: none;
  border: 0;
  padding: 8px 12px;
  border-radius: var(--r12);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
}
.admin-link-button:hover { background: var(--surface-3); color: var(--text); }
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
.bb-admin-panel-enter-active,
.bb-admin-panel-leave-active { transition: opacity 160ms var(--ease), transform 160ms var(--ease); }
.bb-admin-panel-enter-from,
.bb-admin-panel-leave-to { opacity: 0; transform: translateY(6px); }
@media (max-width: 1100px) {
  .admin-shell { grid-template-columns: minmax(0, 1fr); }
  .admin-sidebar { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .bb-admin-panel-enter-active,
  .bb-admin-panel-leave-active { transition: none; }
}
</style>
