<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.ts';
import { useAdminStore } from '@/stores/admin.ts';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { useSettingsStore } from '@/stores/settings.ts';
import { ROUTE_NAMES } from '@/router/index.ts';

/**
 * Administrator navigation: brand, sectioned destinations and the operator footer.
 * Rendered twice — inside the fixed desktop sidebar and inside the off-canvas drawer
 * shown at or below 1100px — so the two must never drift apart.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const admin = useAdminStore();
const realtime = useRealtimeStore();
const settings = useSettingsStore();

/** Sidebar sections mirror the reference information architecture. */
const sections = [
  {
    label: 'عملیات',
    items: [
      { name: ROUTE_NAMES.adminOverview, label: 'نمای کلی', icon: 'view-dashboard-outline' },
      { name: ROUTE_NAMES.adminDispatch, label: 'اعزام', icon: 'bullseye-arrow' },
      { name: ROUTE_NAMES.adminSupportRequests, label: 'درخواست‌های نیرو', icon: 'account-multiple-check-outline' },
      { name: ROUTE_NAMES.adminReports, label: 'گزارش‌ها', icon: 'file-chart-outline' }
    ]
  },
  {
    label: 'مدیریت',
    items: [
      { name: ROUTE_NAMES.adminUsers, label: 'کاربران', icon: 'account-multiple-outline' },
      { name: ROUTE_NAMES.adminGroups, label: 'گروه‌ها', icon: 'account-group-outline' },
      { name: ROUTE_NAMES.adminIncidents, label: 'نوع حادثه', icon: 'alert-circle-outline' },
      { name: ROUTE_NAMES.adminJobTypes, label: 'نوع شغل', icon: 'briefcase-account-outline' }
    ]
  },
  {
    label: 'سامانه',
    items: [
      { name: ROUTE_NAMES.adminAudit, label: 'رویدادها', icon: 'clipboard-text-outline' },
      { name: ROUTE_NAMES.adminAlerts, label: 'هشدارها', icon: 'bell-alert-outline' },
      { name: ROUTE_NAMES.adminSettings, label: 'تنظیمات', icon: 'wrench-outline' }
    ]
  }
] as const;
const ROLE_LABEL: Record<string, string> = { admin: 'مدیر سیستم', responder: 'امدادگر', user: 'کاربر' };
const roleLabel = computed(() => ROLE_LABEL[auth.user?.role ?? ''] ?? 'کاربر');
const initials = computed(() => (auth.user?.username ?? '؟').replace(/^(\w)(\w)?.*$/, '$1$2').toUpperCase());

const openAlerts = computed(() => admin.alerts.filter((alert) => !alert.resolvedAt).length);
const pendingSupportRequests = computed(() => admin.pendingSupportRequests);

async function logout(): Promise<void> {
  await auth.logout();
  realtime.disconnect();
  await router.push({ name: ROUTE_NAMES.login });
}
</script>

<template>
  <div class="admin-nav-content">
    <div class="admin-sidebar__brand">
      <span class="mdi mdi-compass-outline" aria-hidden="true" />
      <div>
        <strong>بورو بیا</strong>
        <small>کنسول مدیریت</small>
      </div>
    </div>
    <nav class="admin-nav" aria-label="ناوبری مدیریت">
      <section v-for="section in sections" :key="section.label" class="admin-nav__section">
        <h2 class="admin-nav__label">{{ section.label }}</h2>
        <RouterLink
          v-for="item in section.items"
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
      </section>
    </nav>
    <div class="admin-sidebar__footer">
      <div class="admin-usercard">
        <span class="admin-usercard__avatar" aria-hidden="true">{{ initials }}</span>
        <span class="admin-usercard__meta">
          <strong>{{ auth.user?.username }}</strong>
          <small>{{ roleLabel }}</small>
        </span>
      </div>
      <button type="button" class="admin-link-button" @click="settings.cycle()">
        <span class="mdi mdi-theme-light-dark" aria-hidden="true" /><span>پوسته</span>
      </button>
      <button type="button" class="admin-link-button" @click="logout">
        <span class="mdi mdi-logout" aria-hidden="true" /><span>خروج</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.admin-nav-content { display: flex; flex-direction: column; gap: 18px; block-size: 100%; }
.admin-sidebar__brand { display: flex; gap: 10px; align-items: center; font-size: 18px; }
.admin-sidebar__brand .mdi { font-size: 26px; color: var(--primary); }
.admin-sidebar__brand small { display: block; font-size: 11px; color: var(--muted); }
.admin-nav { display: grid; gap: 14px; overflow-y: auto; }
.admin-nav__section { display: grid; gap: 4px; }
.admin-nav__label { margin: 0 12px 2px; font-size: 10.5px; font-weight: 700; color: var(--muted); letter-spacing: .02em; }
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
.admin-nav__item.is-active { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.admin-nav__badge { margin-inline-start: auto; background: var(--danger); color: var(--on-accent); border-radius: 999px; padding: 0 7px; font-size: 11px; }
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
.admin-usercard { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--r12); background: var(--surface-2); border: 1px solid var(--border); }
.admin-usercard__avatar { inline-size: 38px; block-size: 38px; display: grid; place-items: center; border-radius: 50%; background: var(--primary-soft); color: var(--primary); font-size: 13px; font-weight: 800; }
.admin-usercard__meta { display: grid; gap: 1px; min-inline-size: 0; }
.admin-usercard__meta strong { font-size: 13px; }
.admin-usercard__meta small { font-size: 10.5px; color: var(--muted); }
</style>
