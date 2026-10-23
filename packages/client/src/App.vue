<template>
  <v-app>
    <v-app-bar class="app-topbar px-sm-6" flat height="76">
      <RouterLink class="brand-link" to="/_public/landing" aria-label="بازگشت به صفحهٔ اصلی بوروبیا">
        <span class="brand-mark" aria-hidden="true">
          <v-icon icon="mdi-plus" size="26" />
        </span>
        <span class="brand-copy">
          <span class="brand-name">بوروبیا</span>
          <span class="brand-tagline">شبکهٔ امداد و همراهی</span>
        </span>
      </RouterLink>

      <v-spacer />

      <nav class="top-nav" aria-label="پیمایش اصلی">
        <v-menu location="bottom end">
          <template #activator="{ props: activatorProps }">
            <v-btn
              v-bind="activatorProps"
              class="theme-toggle"
              icon
              variant="text"
              :aria-label="themeMenuLabel"
              :title="themeMenuLabel"
            >
              <v-icon :icon="appTheme.isDark ? 'mdi-weather-night' : 'mdi-white-balance-sunny'" />
            </v-btn>
          </template>
          <v-list density="compact" min-width="200" aria-label="انتخاب پوسته">
            <v-list-subheader>پوستهٔ برنامه</v-list-subheader>
            <v-list-item
              v-for="option in themeOptions"
              :key="option.value"
              :active="appTheme.preference === option.value"
              :prepend-icon="option.icon"
              :title="option.title"
              @click="appTheme.setPreference(option.value)"
            />
          </v-list>
        </v-menu>
        <v-btn class="nav-button d-none d-sm-flex" to="/_public/landing" variant="text" rounded="lg">
          خانه
        </v-btn>
        <v-btn
          v-for="item in navItems"
          :key="item.to"
          class="nav-button d-none d-sm-flex"
          :to="item.to"
          variant="text"
          rounded="lg"
        >
          {{ item.label }}
        </v-btn>
        <v-menu v-if="navItems.length > 0" location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              class="d-sm-none"
              icon
              variant="text"
              aria-label="باز کردن فهرست بخش‌ها"
              title="فهرست بخش‌ها"
            >
              <v-icon icon="mdi-menu" />
            </v-btn>
          </template>
          <v-list density="compact" min-width="210" aria-label="بخش‌های برنامه">
            <v-list-item prepend-icon="mdi-home-outline" title="خانه" to="/_public/landing" />
            <v-list-item
              v-for="item in navItems"
              :key="`mobile-${item.to}`"
              :prepend-icon="item.icon"
              :title="item.label"
              :to="item.to"
            />
          </v-list>
        </v-menu>
        <v-btn v-if="!auth.isAuthenticated" class="login-button" to="/_auth/login" color="primary" variant="flat" rounded="lg">
          <v-icon class="me-1" icon="mdi-account-outline" />
          ورود
        </v-btn>
        <v-btn v-else class="login-button" color="primary" variant="tonal" rounded="lg" @click="logout">
          خروج
        </v-btn>
      </nav>
    </v-app-bar>

    <v-main class="app-main dark:text-slate-100">
      <RouterView v-slot="{ Component, route }">
        <Transition mode="out-in" name="page-fade">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </v-main>

    <footer class="app-footer">
      <span>بوروبیا، برای روزهایی که کنار هم بودن مهم است.</span>
      <a
        class="osm-attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="© OpenStreetMap contributors؛ اطلاعات مجوز Open Database License (ODbL)"
        title="OpenStreetMap contributors — Open Database License (ODbL)"
      >
        © OpenStreetMap contributors
      </a>
      <span class="footer-status"><span class="status-dot" /> نسخهٔ اولیه</span>
    </footer>
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink, RouterView, useRouter } from "vue-router";
import { pinia } from "./stores";
import { useAuthStore } from "./stores/auth";
import { useThemeStore } from "./stores/theme";
import type { ThemePreference } from "./theme/theme-preference";

const auth = useAuthStore(pinia);
const appTheme = useThemeStore(pinia);
const themeMenuLabel = computed(() => `انتخاب پوسته؛ پوستهٔ فعلی: ${appTheme.isDark ? "تیره" : "روشن"}`);
const themeOptions: { value: ThemePreference; title: string; icon: string }[] = [
  { value: "system", title: "پیروی از دستگاه", icon: "mdi-theme-light-dark" },
  { value: "light", title: "روشن", icon: "mdi-white-balance-sunny" },
  { value: "dark", title: "تیره", icon: "mdi-weather-night" }
];
const navItems = computed<{ to: string; label: string; icon: string }[]>(() => {
  if (!auth.isAuthenticated) return [];
  if (auth.mustCompleteSecurityQuestions) {
    return [{ to: "/_user/complete-security-questions", label: "تکمیل حساب", icon: "mdi-shield-key-outline" }];
  }
  if (auth.user?.role === "admin") {
    return [
      { to: "/_admin/users", label: "مدیریت کاربران", icon: "mdi-account-group-outline" },
      { to: "/_admin/categories", label: "گروه‌های امدادگر", icon: "mdi-shape-outline" },
      { to: "/_admin/incidents", label: "نوع رویدادها", icon: "mdi-alert-rhombus-outline" }
    ];
  }
  return [
    { to: "/_user/dashboard", label: "پیشخوان", icon: "mdi-view-dashboard-outline" },
    { to: "/_user/map", label: "نقشه", icon: "mdi-map-outline" },
    { to: "/_user/location-shares", label: "اشتراک موقعیت", icon: "mdi-crosshairs-gps" },
    { to: "/_user/devices", label: "دستگاه‌ها", icon: "mdi-devices" }
  ];
});
const router = useRouter();

async function logout(): Promise<void> {
  try {
    await auth.logout();
  } catch {
    // Clear the local session and return to the guest flow even if the network is unavailable.
  } finally {
    await router.replace("/_auth/login");
  }
}

onMounted(async () => {
  await auth.ensureSession();
  if (auth.isAuthenticated && auth.mustCompleteSecurityQuestions) {
    await router.replace("/_user/complete-security-questions");
  }
});
</script>
