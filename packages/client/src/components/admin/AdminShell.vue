<template>
  <div class="admin-shell" dir="rtl" :class="{ 'admin-shell--nav-open': navOpen }">
    <div v-if="navOpen" class="admin-shell__scrim" aria-hidden="true" @click="navOpen = false" />

    <aside class="admin-shell__nav" aria-label="ناوبری پنل مدیریت">
      <RouterLink class="admin-brand" to="/_admin/dashboard" @click="navOpen = false">
        <span class="admin-brand__mark"><v-icon icon="mdi-lifebuoy" size="20" /></span>
        <span class="admin-brand__text">
          <strong>بورو بی‌بیا</strong>
          <small>پنل مدیریت امداد</small>
        </span>
      </RouterLink>

      <nav class="admin-nav">
        <template v-for="group in navGroups" :key="group.label">
          <p class="admin-nav__label">{{ group.label }}</p>
          <template v-for="item in group.items" :key="item.key">
            <RouterLink
              class="admin-nav__item"
              :class="{ 'admin-nav__item--active': item.key === active }"
              :to="item.to"
              @click="navOpen = false"
            >
              <v-icon class="admin-nav__icon" :icon="item.icon" size="19" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </template>
        </template>
      </nav>

      <div class="admin-account">
        <span class="admin-account__avatar">{{ accountInitial }}</span>
        <span class="admin-account__meta">
          <strong>{{ accountName }}</strong>
          <small>مدیر ارشد امداد</small>
        </span>
      </div>
    </aside>

    <div class="admin-shell__main">
      <header class="admin-shell__topbar">
        <v-btn
          class="admin-shell__menu"
          icon="mdi-menu"
          variant="text"
          size="small"
          aria-label="نمایش منو"
          @click="navOpen = true"
        />
        <nav class="admin-crumbs" aria-label="مسیر صفحه">
          <span class="admin-crumbs__root">پنل مدیریت</span>
          <template v-for="(crumb, index) in crumbList" :key="crumb">
            <v-icon icon="mdi-chevron-left" size="15" class="admin-crumbs__sep" />
            <span :class="{ 'admin-crumbs__current': index === crumbList.length - 1 }">{{ crumb }}</span>
          </template>
        </nav>

        <div class="admin-shell__tools">
          <button class="admin-search" type="button" :title="searchHint" @click="$emit('search')">
            <v-icon icon="mdi-magnify" size="17" />
            <span>جست‌وجو در پنل…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <v-btn
            class="admin-tool"
            icon="mdi-bell-outline"
            variant="text"
            size="small"
            aria-label="هشدارها"
            @click="$emit('alerts')"
          />
          <span class="admin-tool admin-tool--avatar" :title="accountName">{{ accountInitial }}</span>
        </div>
      </header>

      <main class="admin-shell__content">
        <header class="admin-shell__head">
          <div>
            <h1>{{ title }}</h1>
            <p v-if="description">{{ description }}</p>
          </div>
          <div v-if="$slots.actions" class="admin-shell__actions">
            <slot name="actions" />
          </div>
        </header>
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../../stores/auth";

type NavKey =
  | "dashboard"
  | "dispatch"
  | "reports"
  | "users"
  | "services"
  | "categories"
  | "audit"
  | "alerts"
  | "settings";

interface NavItem {
  key: NavKey;
  label: string;
  icon: string;
  to: string;
}

const props = defineProps<{
  active: NavKey;
  title: string;
  description?: string;
  crumbs?: string[];
}>();

defineEmits<{ search: []; alerts: [] }>();

const searchHint = "جست‌وجوی سراسری پنل پس از افزودن سرویس سرور فعال می‌شود";

const crumbList = computed(() => props.crumbs ?? []);
const route = useRoute();
const auth = useAuthStore();
const navOpen = ref(false);

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "عملیات",
    items: [
      { key: "dashboard", label: "نمای کلی", icon: "mdi-view-dashboard-outline", to: "/_admin/dashboard" },
      { key: "dispatch", label: "اعزام و امداد", icon: "mdi-alarm-light-outline", to: "/_admin/dispatch" },
      { key: "reports", label: "گزارش‌ها", icon: "mdi-chart-box-outline", to: "/_admin/reports" }
    ]
  },
  {
    label: "مدیریت",
    items: [
      { key: "users", label: "کاربران", icon: "mdi-account-multiple-outline", to: "/_admin/users" },
      { key: "services", label: "گروه‌های امداد", icon: "mdi-lifebuoy", to: "/_admin/services" },
      { key: "categories", label: "انواع حادثه", icon: "mdi-shape-outline", to: "/_admin/categories" }
    ]
  },
  {
    label: "سامانه",
    items: [
      { key: "audit", label: "گزارش رویدادها", icon: "mdi-history", to: "/_admin/audit" },
      { key: "alerts", label: "هشدارها", icon: "mdi-bell-alert-outline", to: "/_admin/alerts" },
      { key: "settings", label: "تنظیمات", icon: "mdi-cog-outline", to: "/_admin/settings" }
    ]
  }
];

const accountName = computed(() => auth.user?.username ?? "مدیر سامانه");
const accountInitial = computed(() => accountName.value.slice(0, 1));

watch(
  () => route.fullPath,
  () => {
    navOpen.value = false;
  }
);
</script>

<style scoped>
.admin-shell {
  --admin-card: rgb(var(--v-theme-surface));
  --admin-line: rgba(var(--v-theme-on-surface), 0.1);
  --admin-muted: rgba(var(--v-theme-on-surface), 0.62);
  --admin-soft: rgba(var(--v-theme-primary), 0.1);
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-surface));
}

.admin-shell__nav {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem 0.9rem;
  border-inline-start: 1px solid var(--admin-line);
  background: var(--admin-card);
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.25rem 0.35rem 0.75rem;
  color: inherit;
  text-decoration: none;
}

.admin-brand__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.admin-brand__text {
  display: grid;
  line-height: 1.25;
}

.admin-brand__text strong {
  font-size: 0.95rem;
  font-weight: 700;
}

.admin-brand__text small {
  color: var(--admin-muted);
  font-size: 0.8rem;
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  overflow-y: auto;
}

.admin-nav__label {
  margin: 0.75rem 0.55rem 0.35rem;
  color: var(--admin-muted);
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}

.admin-nav__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  color: inherit;
  font-size: 0.84rem;
  text-decoration: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.admin-nav__item:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.admin-nav__item--active {
  background: var(--admin-soft);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.admin-nav__icon {
  opacity: 0.85;
}

.admin-account {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: auto;
  padding-top: 0.9rem;
  border-top: 1px solid var(--admin-line);
}

.admin-account__avatar,
.admin-tool--avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--admin-soft);
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.admin-account__meta {
  display: grid;
  line-height: 1.3;
}

.admin-account__meta strong {
  font-size: 0.82rem;
}

.admin-account__meta small {
  color: var(--admin-muted);
  font-size: 0.8rem;
}

.admin-shell__main {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.admin-shell__topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.5rem;
  border-bottom: 1px solid var(--admin-line);
  background: var(--admin-card);
}

.admin-shell__menu {
  display: none !important;
}

.admin-crumbs {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--admin-muted);
  font-size: 0.82rem;
  white-space: nowrap;
}

.admin-crumbs__root {
  color: inherit;
}

.admin-crumbs__current {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}

.admin-crumbs__sep {
  opacity: 0.6;
}

.admin-shell__tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-inline-start: auto;
}

.admin-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 250px;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--admin-line);
  border-radius: 999px;
  background: transparent;
  color: var(--admin-muted);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.admin-search kbd {
  margin-inline-start: auto;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--admin-line);
  border-radius: 6px;
  font-size: 0.8rem;
}

.admin-shell__content {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  padding: 1.4rem 1.5rem 2rem;
}

.admin-shell__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.admin-shell__head h1 {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.35;
}

.admin-shell__head p {
  margin: 0.35rem 0 0;
  color: var(--admin-muted);
  font-size: 0.82rem;
  line-height: 1.7;
}

.admin-shell__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.admin-shell__scrim {
  display: none;
}

@media (max-width: 1023px) {
  .admin-shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-shell__nav {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 40;
    width: 264px;
    transform: translateX(100%);
    transition: transform 0.2s ease;
  }

  .admin-shell--nav-open .admin-shell__nav {
    transform: translateX(0);
  }

  .admin-shell--nav-open .admin-shell__scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: block;
    background: rgba(0, 0, 0, 0.35);
  }

  .admin-shell__menu {
    display: inline-flex !important;
  }

  .admin-search {
    display: none;
  }

  .admin-shell__content {
    padding: 1rem 1rem 2rem;
  }
}
</style>
