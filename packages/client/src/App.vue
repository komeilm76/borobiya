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
        <v-menu v-if="auth.isAuthenticated && auth.user?.role === 'user' && !auth.mustCompleteSecurityQuestions" location="bottom end">
          <template #activator="{ props: inboxProps }">
            <v-btn v-bind="inboxProps" icon variant="text" aria-label="پیشنهادهای مأموریت" @click="proposalInbox.refresh()">
              <v-badge :content="proposalInbox.total" :model-value="!proposalInbox.failed && proposalInbox.total > 0" color="error">
                <v-icon icon="mdi-bell-outline" />
              </v-badge>
            </v-btn>
          </template>
          <v-list density="compact" min-width="260" aria-label="پیشنهادهای امدادگری در انتظار پاسخ">
            <v-list-subheader>پیشنهادهای مأموریت ({{ proposalInbox.failed ? 'نامشخص' : proposalInbox.total }})</v-list-subheader>
            <v-list-item v-if="proposalInbox.loading" title="در حال دریافت…" />
            <v-list-item v-else-if="proposalInbox.failed" title="دریافت پیشنهادها ناموفق بود؛ فهرست قبلی ممکن است قدیمی باشد. دوباره تلاش کنید." @click="proposalInbox.refresh()" />
            <v-list-item v-else-if="proposalInbox.total === 0" title="پیشنهاد جدیدی ندارید." />
            <v-list-item
              v-for="proposal in proposalInbox.proposals"
              :key="proposal.id"
              :title="proposal.details?.incidentTypeName ?? `درخواست امداد ${proposal.sosRequestId.slice(0, 8)}`"
              :subtitle="new Date(proposal.createdAt).toLocaleString('fa-IR')"
              prepend-icon="mdi-lifebuoy"
              :to="{ path: '/_user/proposals', query: { offer: proposal.id } }"
            />
            <v-divider />
            <v-list-item title="مشاهدهٔ همهٔ پیشنهادها" prepend-icon="mdi-arrow-left" to="/_user/proposals" />
          </v-list>
        </v-menu>
        <v-btn class="nav-button d-none d-sm-flex" to="/_public/landing" variant="text" rounded="lg">
          خانه
        </v-btn>
        <v-btn
          v-for="item in navItems"
          :key="item.to"
class="nav-button d-none d-xxl-flex"
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
              class="d-xxl-none"
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
        <v-btn v-else class="login-button" color="primary" variant="tonal" rounded="lg" @click="logoutConfirmation.request()">
          خروج
        </v-btn>
      </nav>
    </v-app-bar>

    <v-dialog
      :model-value="logoutConfirmation.open.value"
      :persistent="logoutConfirmation.submitting.value"
      max-width="420"
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-description"
      @update:model-value="(visible: boolean) => { if (!visible) logoutConfirmation.cancel(); }"
    >
      <v-card rounded="xl">
        <v-card-title id="logout-confirm-title">خروج از حساب کاربری؟</v-card-title>
        <v-card-text id="logout-confirm-description">
          آیا مطمئن هستید که می‌خواهید از حساب خود خارج شوید؟
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" rounded="lg" :disabled="logoutConfirmation.submitting.value" @click="logoutConfirmation.cancel()">
            انصراف
          </v-btn>
          <v-spacer />
          <v-btn color="error" variant="flat" rounded="lg"
            :loading="logoutConfirmation.submitting.value"
            :disabled="logoutConfirmation.submitting.value"
            @click="logoutConfirmation.confirm()">
            بله، خروج از حساب
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-main class="app-main dark:text-slate-100">
      <RouterView v-slot="{ Component, route }">
        <Transition mode="out-in" name="page-fade">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </v-main>

    <SosTriggerButton v-if="showSosButton" @trigger="sosSheet.openSheet()" />
    <SosRequestSheet v-if="showSosButton" v-model="sosSheet.open" />

    <v-snackbar
      :model-value="Boolean(adminSos.latestAlert) && !adminSos.urgentReplacement"
      color="error"
      location="top"
      multi-line
      :timeout="-1"
    >
      <div v-if="adminSos.latestAlert" role="alert" aria-live="assertive">
        <strong>هشدار اضطراری SOS جدید:</strong>
        <span class="ms-1">{{ adminSos.latestAlert.description }}</span>
      </div>
      <template #actions>
        <v-btn variant="text" @click="openAlertOnMap">مشاهده روی نقشه</v-btn>
        <v-btn variant="text" @click="adminSos.dismissLatestAlert()">بستن</v-btn>
      </template>
    </v-snackbar>

    <v-snackbar
      :model-value="Boolean(adminSos.urgentReplacement)"
      color="error"
      location="top"
      multi-line
      :timeout="-1"
    >
      <div v-if="adminSos.urgentReplacement" class="replacement-signal" role="alert" aria-live="assertive">
        <strong>NEEDS REPLACEMENT · اعزام جایگزین فوری</strong>
        <span class="ms-1">امدادگر مأموریت را لغو کرده است. درخواست را بررسی و امدادگر دیگری اعزام کنید.</span>
        <span v-if="adminSos.urgentReplacement.reviewRequired" class="d-block mt-1">
          این لغو به بررسی مدیریتی نیاز دارد.
        </span>
      </div>
      <template #actions>
        <v-btn variant="text" @click="openReplacementOnMap">مشاهده و اعزام</v-btn>
        <v-btn variant="text" @click="adminSos.dismissUrgentReplacement()">بستن</v-btn>
      </template>
    </v-snackbar>

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
import { computed, onMounted, watch } from "vue";
import { RouterLink, RouterView, useRouter } from "vue-router";
import SosRequestSheet from "./components/sos/SosRequestSheet.vue";
import SosTriggerButton from "./components/sos/SosTriggerButton.vue";
import { useLogoutConfirmation } from "./composables/use-logout-confirmation";
import { pinia } from "./stores";
import { useAdminSosStore } from "./stores/admin-sos";
import { useProposalInboxStore } from "./stores/proposal-inbox";
import { useAuthStore } from "./stores/auth";
import { useSosSheetStore } from "./stores/sos-sheet";
import { useThemeStore } from "./stores/theme";
import type { ThemePreference } from "./theme/theme-preference";

const auth = useAuthStore(pinia);
const adminSos = useAdminSosStore(pinia);
const proposalInbox = useProposalInboxStore(pinia);
const sosSheet = useSosSheetStore(pinia);
const appTheme = useThemeStore(pinia);
const showSosButton = computed(
  () => auth.isAuthenticated && !auth.mustCompleteSecurityQuestions
);

watch(showSosButton, (visible) => {
  if (!visible) sosSheet.closeSheet();
});
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
    const dispatchLabel =
      adminSos.pendingCount > 0 ? `مرکز امداد (${adminSos.pendingCount})` : "مرکز امداد";
    return [
      { to: "/_admin/dispatch", label: dispatchLabel, icon: "mdi-radar" },
      { to: "/_admin/users", label: "مدیریت کاربران", icon: "mdi-account-group-outline" },
      { to: "/_admin/categories", label: "گروه‌های امدادگر", icon: "mdi-shape-outline" },
      { to: "/_admin/incidents", label: "نوع رویدادها", icon: "mdi-alert-rhombus-outline" }
    ];
  }
  return [
    { to: "/_user/dashboard", label: "پیشخوان", icon: "mdi-view-dashboard-outline" },
    { to: "/_user/map", label: "نقشه", icon: "mdi-map-outline" },
    { to: "/_user/proposals", label: !proposalInbox.failed && proposalInbox.total ? `پیشنهادها (${proposalInbox.total})` : "پیشنهادها", icon: "mdi-hand-heart-outline" },
    { to: "/_user/mission", label: "مأموریت من", icon: "mdi-lifebuoy" },
    { to: "/_user/sos-history", label: "درخواست‌های من", icon: "mdi-history" },
    { to: "/_user/mission-history", label: "سوابق امدادگری", icon: "mdi-timeline-clock-outline" },
    { to: "/_user/location-shares", label: "اشتراک موقعیت", icon: "mdi-crosshairs-gps" },
    { to: "/_user/devices", label: "دستگاه‌ها", icon: "mdi-devices" }
  ];
});
const router = useRouter();
const logoutConfirmation = useLogoutConfirmation({
  isAuthenticated: computed(() => auth.isAuthenticated),
  logout: () => auth.logout(),
  onLoggedOut: () => router.replace("/_auth/login")
});

async function openAlertOnMap(): Promise<void> {
  const alertId = adminSos.latestAlert?.id;
  adminSos.dismissLatestAlert();
  if (alertId) {
    adminSos.selectRequest(alertId);
    await router.push({ path: "/_admin/dispatch", query: { request: alertId } });
  }
}

async function openReplacementOnMap(): Promise<void> {
  const requestId = adminSos.urgentReplacement?.sosRequestId;
  if (!requestId) return;
  adminSos.setFilterStatus("pending");
  adminSos.selectRequest(requestId);
  await router.push({ path: "/_admin/dispatch", query: { request: requestId } });
}

onMounted(async () => {
  await auth.ensureSession();
  if (auth.isAuthenticated && auth.mustCompleteSecurityQuestions) {
    await router.replace("/_user/complete-security-questions");
  }
});
</script>

<style scoped>
.replacement-signal { animation: urgent-outline 1.1s ease-in-out 2; }
@keyframes urgent-outline { 50% { outline: 3px solid currentColor; outline-offset: 4px; } }
@media (prefers-reduced-motion: reduce) { .replacement-signal { animation: none; } }
</style>
