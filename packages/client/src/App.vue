<template>
  <v-app :class="{ 'app-shell--map': isMapRoute, 'app-shell--auth': isAuthRoute, 'app-shell--public': isPublicRoute, 'app-shell--workspace': !isAuthRoute && !isPublicRoute }">
    <v-app-bar v-if="!isMapRoute && !isAuthRoute && !isPublicRoute" class="app-topbar px-sm-6" flat height="64">
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
        <NetworkStatusIcon />
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
              :to="{ path: '/_user/map', query: { offer: proposal.id } }"
            />
            <v-divider />
            <v-list-item title="مشاهدهٔ همهٔ پیشنهادها روی نقشه" prepend-icon="mdi-arrow-left" to="/_user/map?inbox=1" />
          </v-list>
        </v-menu>
        <v-btn
          v-for="item in navItems"
          :key="item.to"
          class="nav-button d-none d-xxl-flex"
          :to="item.to"
          :active="route.path === item.to"
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
          <v-list class="top-nav__sections" density="compact" min-width="210" aria-label="بخش‌های برنامه">
            <v-list-item prepend-icon="mdi-home-outline" title="خانه" to="/_public/landing" />
            <v-list-item
              v-for="item in navItems"
              :key="`mobile-${item.to}`"
              :prepend-icon="item.icon"
              :title="item.label"
              :to="item.to"
              :active="route.path === item.to"
            />
          </v-list>
        </v-menu>
        <v-btn v-if="!auth.isAuthenticated" class="login-button" to="/_auth/login" color="primary" variant="flat" rounded="lg">
          ورود
        </v-btn>
        <AccountProfileMenu
          :authenticated="auth.isAuthenticated"
          :user="auth.user"
          :categories="auth.userCategories"
          :preference="appTheme.preference"
          :is-dark="appTheme.isDark"
          @change-theme="appTheme.setPreference"
          @request-logout="logoutConfirmation.request()"
        />
      </nav>
    </v-app-bar>

    <MapSidebar
      v-if="isMapRoute"
      :items="mapNavItems"
      :user="auth.user"
      :categories="auth.userCategories"
      :preference="appTheme.preference"
      :is-dark="appTheme.isDark"
      @change-theme="appTheme.setPreference"
      @request-logout="logoutConfirmation.request()"
    />
    <MapProposalSidebar
      v-if="route.name === 'user-map' && auth.isAuthenticated && auth.user?.role === 'user' && !auth.mustCompleteSecurityQuestions"
      :inbox="proposalInbox"
      :user-id="auth.user.id"
    />

    <v-dialog
      :model-value="logoutConfirmation.open.value"
      scrollable
      :persistent="logoutConfirmation.submitting.value"
      max-width="420"
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-description"
      @update:model-value="(visible: boolean) => { if (!visible) logoutConfirmation.cancel(); }"
      @after-leave="restoreLogoutFocus"
    >
      <v-card rounded="xl">
        <v-card-title id="logout-confirm-title">خروج از حساب کاربری؟</v-card-title>
        <v-card-text id="logout-confirm-description">
          آیا مطمئن هستید که می‌خواهید از حساب خود خارج شوید؟
        </v-card-text>
        <v-card-actions class="logout-confirm-actions">
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

    <v-snackbar v-model="logoutUnconfirmed" color="warning" location="top" :timeout="-1" multi-line>
      <span role="alert">خروج محلی انجام شد، اما لغو نشست در سرور تأیید نشد. پس از اتصال، دوباره وارد شوید و نشست قبلی را از بخش دستگاه‌ها لغو کنید.</span>
      <template #actions><v-btn variant="text" @click="logoutUnconfirmed = false">متوجه شدم</v-btn></template>
    </v-snackbar>

    <v-main class="app-main dark:text-slate-100">
      <header v-if="isPublicRoute" class="public-chrome">
        <RouterLink class="public-chrome__brand" to="/_public/landing" aria-label="بوروبیا؛ صفحهٔ اصلی">
          <span class="public-chrome__mark" aria-hidden="true"><v-icon icon="mdi-plus" size="26" /></span>
          <span>بوروبیا<small>شبکهٔ امداد و همراهی</small></span>
        </RouterLink>
        <nav class="public-chrome__nav" aria-label="پیمایش عمومی">
          <RouterLink to="/_public/landing">خانه</RouterLink>
          <RouterLink to="/_public/health">وضعیت سرور</RouterLink>
        </nav>
        <div class="public-chrome__actions">
          <button class="public-chrome__theme" type="button"
            :aria-label="appTheme.isDark ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'"
            :title="appTheme.isDark ? 'حالت روشن' : 'حالت تاریک'" @click="appTheme.toggleTheme()">
            <v-icon :icon="appTheme.isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'" size="21" aria-hidden="true" />
          </button>
          <RouterLink v-if="auth.isAuthenticated" class="public-chrome__login" to="/_user/map">نقشه</RouterLink>
          <template v-else>
            <RouterLink class="public-chrome__login" to="/_auth/login">ورود</RouterLink>
            <RouterLink class="public-chrome__join" to="/_auth/register">ساخت حساب <v-icon icon="mdi-arrow-left" size="19" aria-hidden="true" /></RouterLink>
          </template>
        </div>
      </header>
      <header v-if="isAuthRoute" class="auth-chrome" aria-label="پیمایش حساب">
        <RouterLink class="auth-chrome__brand" to="/_public/landing" aria-label="بوروبیا؛ بازگشت به صفحهٔ اصلی">
          <span class="auth-chrome__mark" aria-hidden="true"><v-icon icon="mdi-plus" size="25" /></span>
          <span>بوروبیا</span>
        </RouterLink>
        <div class="auth-chrome__actions">
          <v-btn class="auth-chrome__theme" icon variant="text"
            :aria-label="appTheme.isDark ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'"
            :title="appTheme.isDark ? 'حالت روشن' : 'حالت تاریک'"
            @click="appTheme.toggleTheme()">
            <v-icon :icon="appTheme.isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'" />
          </v-btn>
          <RouterLink class="auth-chrome__home" to="/_public/landing">
            صفحهٔ اصلی <v-icon icon="mdi-arrow-left" size="18" aria-hidden="true" />
          </RouterLink>
        </div>
      </header>
      <RouterView v-slot="{ Component, route }">
        <div v-if="!Component" class="app-route-pending" role="status" aria-live="polite">
          <strong>در حال اتصال به بوروبیا…</strong>
          <span>در شبکهٔ کند ممکن است این مرحله چند لحظه طول بکشد.</span>
        </div>
        <Transition v-else mode="out-in" name="page-fade">
          <!-- Map query changes must not tear down a live trip, dispatch selection or MapLibre. -->
          <component :is="Component" :key="route.name === 'user-map' || route.name === 'admin-dispatch' ? route.path : route.fullPath" />
        </Transition>
      </RouterView>
    </v-main>

    <SosTriggerButton v-if="showSosButton" @trigger="sosSheet.openSheet()" />
    <SosRequestSheet v-if="showSosButton" v-model="sosSheet.open" />
    <v-snackbar :model-value="Boolean(missionShare.statusError || missionShare.gpsError) && (missionShare.hadActiveMission || !!proposalInbox.acceptedMissionId || route.name === 'user-mission')"
      color="warning" location="top" multi-line :timeout="-1" role="alert">
      {{ missionShare.statusError || missionShare.gpsError }}
      <template #actions><v-btn variant="text" :loading="missionShare.refreshing" @click="missionShare.retry()">بررسی دوباره</v-btn></template>
    </v-snackbar>

    <v-snackbar
      :model-value="Boolean(adminSos.latestAlert) && !adminSos.urgentReplacement"
      :content-props="{ class: 'admin-sos-toast__wrapper' }"
      location="top" variant="flat" :timeout="-1"
    >
      <div v-if="adminSos.latestAlert" class="admin-sos-toast__message" role="alert" aria-live="assertive">
        <v-icon icon="mdi-alarm-light-outline" size="20" aria-hidden="true" />
        <span><strong>درخواست SOS جدید</strong><small>{{ shortSosNotice(adminSos.latestAlert.description) }}</small></span>
      </div>
      <template #actions>
        <v-btn color="primary" size="small" variant="tonal" @click="openAlertOnMap">بررسی</v-btn>
        <v-btn icon="mdi-close" size="small" variant="text" aria-label="بستن هشدار SOS" @click="adminSos.dismissLatestAlert()" />
      </template>
    </v-snackbar>

    <v-snackbar
      :model-value="Boolean(adminSos.urgentReplacement) && route.name !== 'admin-dispatch'"
      :content-props="{ class: 'admin-sos-toast__wrapper' }"
      location="top" variant="flat" :timeout="-1"
    >
      <div v-if="adminSos.urgentReplacement" class="admin-sos-toast__message" role="alert" aria-live="assertive">
        <v-icon icon="mdi-alert-circle-outline" size="20" aria-hidden="true" />
        <span><strong>اعزام جایگزین</strong><small>مأموریت توسط امدادگر لغو شد{{ adminSos.urgentReplacement.reviewRequired ? ' · نیازمند بررسی' : '' }}</small></span>
      </div>
      <template #actions>
        <v-btn color="primary" size="small" variant="tonal" @click="openReplacementOnMap">بررسی</v-btn>
        <v-btn icon="mdi-close" size="small" variant="text" aria-label="بستن هشدار اعزام جایگزین"
          @click="adminSos.dismissUrgentReplacement()" />
      </template>
    </v-snackbar>

    <footer v-if="isPublicRoute" class="public-footer">
      <div class="public-footer__inner">
        <p><strong>بوروبیا</strong><span>برای روزهایی که کنار هم بودن مهم است.</span></p>
        <nav aria-label="پیوندهای عمومی">
          <RouterLink to="/_public/landing">خانه</RouterLink>
          <RouterLink to="/_public/health">وضعیت سرور</RouterLink>
          <RouterLink v-if="auth.isAuthenticated" to="/_user/map">نقشه</RouterLink>
          <RouterLink v-else to="/_auth/login">ورود</RouterLink>
        </nav>
      </div>
    </footer>
    <footer v-if="!isAuthRoute && !isPublicRoute" class="app-footer">
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
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import AccountProfileMenu from "./components/shell/AccountProfileMenu.vue";
import NetworkStatusIcon from "./components/shell/NetworkStatusIcon.vue";
import SosTriggerButton from "./components/sos/SosTriggerButton.vue";
// Do not make the public/login entry download the map's navigation, offer inbox,
// or SOS form. They load in parallel with the map route (or when auth resolves).
const MapSidebar = defineAsyncComponent(() => import("./components/shell/MapSidebar.vue"));
const MapProposalSidebar = defineAsyncComponent(() => import("./components/shell/MapProposalSidebar.vue"));
const SosRequestSheet = defineAsyncComponent(() => import("./components/sos/SosRequestSheet.vue"));
import { useLogoutConfirmation } from "./composables/use-logout-confirmation";
import { accountSessionKey } from "./composables/device-identity";
import { pinia } from "./stores";
import { useAdminSosStore } from "./stores/admin-sos";
import { useProposalInboxStore } from "./stores/proposal-inbox";
import { useRequesterMissionShareStore } from "./stores/requester-mission-share";
import { useRescuerMissionShareStore } from "./stores/rescuer-mission-share";
import { mapTripSession } from "./map/trip-session";
import { useBroadcastStore } from "./stores/broadcast";
import { requestJson } from "./api/http";
import { useAuthStore } from "./stores/auth";
import { useSosSheetStore } from "./stores/sos-sheet";
import { useThemeStore } from "./stores/theme";

const auth = useAuthStore(pinia);
const adminSos = useAdminSosStore(pinia);
const proposalInbox = useProposalInboxStore(pinia);
const missionShare = useRescuerMissionShareStore(pinia);
// Requester GPS is verified and app-owned too, not dependent on opening the room panel.
const requesterShare = useRequesterMissionShareStore(pinia);
const broadcast = useBroadcastStore(pinia);
const sosSheet = useSosSheetStore(pinia);
watch(() => proposalInbox.acceptedMissionId, (id) => { if (id) void missionShare.refresh(); }, { flush: "sync" });
const confirmedOfferId = ref<string | null>(null);
watch(() => proposalInbox.acceptedMissionId, (id) => { if (!id) confirmedOfferId.value = null; }, { flush: "sync" });
watch(() => missionShare.mission?.id, (id) => {
  if (id && id === proposalInbox.acceptedMissionId) confirmedOfferId.value = id;
}, { flush: "sync" });
watch(() => [missionShare.refreshing, missionShare.mission?.id, missionShare.statusError] as const,
  ([refreshing, id, error]) => {
    // Do not reopen offers after a network failure or an unverified room event.
    if (!refreshing && !id && !error && confirmedOfferId.value) {
      proposalInbox.releaseAcceptedMission(confirmedOfferId.value);
      confirmedOfferId.value = null;
    }
  }, { flush: "post" });
const appTheme = useThemeStore(pinia);
const showSosButton = computed(
  // A bearer can precede its verified profile on a slow connection. Never
  // expose SOS or location-sharing actions on that interim guest screen.
  () => auth.isAuthenticated && !!auth.user && !auth.mustCompleteSecurityQuestions
);
// Only an active activity can wake the general GPS publisher. Mission membership
// and trip duration are checked again by the server before persisting each fix.
watch(() => Boolean(missionShare.mission || requesterShare.missions.length),
  (active) => broadcast.setAutomatic("mission", active), { immediate: true, flush: "sync" });
watch(() => mapTripSession.navigating.value,
  (active) => broadcast.setAutomatic("navigation", active), { immediate: true, flush: "sync" });
let tripLeaseVersion = 0;
async function syncTripLease(active: boolean): Promise<void> {
  const version = ++tripLeaseVersion;
  const token = auth.accessToken;
  if (!token) return;
  try {
    await requestJson("/_user/location/trip", { method: "POST", accessToken: token, body: { active } });
    // An older in-flight activation must never outlive a Stop that crossed it.
    if (active && version !== tripLeaseVersion && !mapTripSession.navigating.value) await syncTripLease(false);
  } catch { /* A missing lease fails closed on the server; the next heartbeat retries. */ }
}
watch(() => mapTripSession.navigating.value, (active) => { void syncTripLease(active); }, { flush: "sync" });
let activityTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (auth.isAuthenticated && auth.user && !auth.mustCompleteSecurityQuestions) void broadcast.refreshPriority();
  activityTimer = setInterval(() => {
    if (mapTripSession.navigating.value) void syncTripLease(true);
    if (auth.isAuthenticated && auth.user && !auth.mustCompleteSecurityQuestions) {
      void broadcast.refreshPriority().then(() => broadcast.retryAutomatic());
    }
  }, 30_000);
});
onUnmounted(() => { if (activityTimer) clearInterval(activityTimer); });
// A trip started in another login must not silently inherit that session's GPS
// or leave a location publisher running for a revoked trip.
watch(() => accountSessionKey(auth.user?.id ?? null, auth.accessToken), (next, previous) => {
  if (previous && next !== previous && mapTripSession.navigating.value) mapTripSession.endForMission();
}, { flush: "sync" });

watch(showSosButton, (visible) => {
  if (!visible) sosSheet.closeSheet();
});
const navItems = computed<{ to: string; label: string; icon: string }[]>(() => {
  if (!auth.isAuthenticated) return [];
  if (auth.mustCompleteSecurityQuestions) {
    return [{ to: "/_user/complete-security-questions", label: "تکمیل حساب", icon: "mdi-shield-key-outline" }];
  }
  if (auth.user?.role === "admin") {
    const dispatchLabel =
      adminSos.queueVerified && adminSos.filterStatus !== "dispatched" && adminSos.pendingCount > 0
        ? `مرکز امداد (${adminSos.pendingCount})`
        : "مرکز امداد";
    return [
      { to: "/_admin/dispatch", label: dispatchLabel, icon: "mdi-radar" },
      { to: "/_admin/users", label: "مدیریت کاربران", icon: "mdi-account-group-outline" },
      { to: "/_admin/categories", label: "گروه‌های امدادگر", icon: "mdi-shape-outline" },
      { to: "/_admin/incidents", label: "نوع رویدادها", icon: "mdi-alert-rhombus-outline" }
    ];
  }
  return [
    { to: "/_user/map", label: "نقشه", icon: "mdi-map-outline" },
    { to: "/_user/sos-history", label: "درخواست‌های من", icon: "mdi-history" },
    { to: "/_user/mission-history", label: "سوابق امدادگری", icon: "mdi-timeline-clock-outline" },
    { to: "/_user/location-shares", label: "اشتراک موقعیت", icon: "mdi-crosshairs-gps" },
    { to: "/_user/devices", label: "دستگاه‌ها", icon: "mdi-devices" }
  ];
});
// Admins can reach the user map; keep its current-route link available in the
// map sidebar alongside their admin destinations without changing other headers.
const mapNavItems = computed(() => {
  const items = auth.user?.role === "admin" && !auth.mustCompleteSecurityQuestions
    ? [{ to: "/_user/map", label: "نقشه", icon: "mdi-map-outline" }, ...navItems.value]
    : navItems.value;
  if (route.name !== "user-map") return items;
  return items.filter((item) => {
    if (item.to === "/_user/mission-history" && (mapTripSession.navigating.value || missionShare.mission || proposalInbox.acceptedMissionId)) return false;
    return true;
  });
});
const router = useRouter();
const route = useRoute();
// Map-first workspaces use the same full-viewport shell and navigation drawer.
// Proposal and route-choice overlays remain specific to the companion map.
const isMapRoute = computed(() => route.name === "user-map" || route.name === "user-mission" || route.name === "admin-dispatch");
const isAuthRoute = computed(() => route.name === "auth-login" || route.name === "auth-register" || route.name === "auth-forgot-password");
const isPublicRoute = computed(() => route.name === "public-landing" || route.name === "public-health" || route.name === "not-found");
const logoutUnconfirmed = ref(false);
const logoutConfirmation = useLogoutConfirmation({
  isAuthenticated: computed(() => auth.isAuthenticated),
  logout: () => auth.logout(),
  onLoggedOut: () => router.replace("/_auth/login"),
  onLogoutFailed: () => { logoutUnconfirmed.value = true; }
});

function restoreLogoutFocus(): void {
  // The confirmation dialog has two different openers but no VDialog activator;
  // without an explicit target, Cancel leaves focus on its now-removed button.
  // Do not steal focus after a successful sign-out or while another dialog is open.
  if (!auth.isAuthenticated || logoutConfirmation.open.value || logoutConfirmation.submitting.value) return;
  const selector = isMapRoute.value ? ".map-sidebar__menu-button" : ".account-profile__trigger";
  document.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
}

// Keep the toast scannable; the full description remains in the selected SOS.
function shortSosNotice(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  return text.length > 65 ? `${text.slice(0, 65).trimEnd()}…` : text;
}

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
.app-route-pending { display: grid; align-content: center; gap: .35rem;
  min-height: min(65vh, 32rem); padding: 2rem; text-align: center;
  color: var(--bb-color-text); }
.app-route-pending strong { font-size: 1rem; }
.app-route-pending span { font-size: .875rem; color: var(--bb-color-muted); }
/* One compact, theme-aware treatment for both admin SOS notices. Vuetify
   teleports snackbars, so the content-props class is styled globally. */
:global(.v-snackbar__wrapper.admin-sos-toast__wrapper) {
  display: flex; flex-wrap: wrap; align-items: center; width: min(30rem, calc(100vw - 1rem));
  min-width: 0; max-width: calc(100vw - 1rem); min-height: 0;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay); direction: rtl; font-family: var(--bb-font-family);
}
:global(.admin-sos-toast__wrapper .v-snackbar__content) {
  flex: 1 1 12rem; min-width: 0; padding: .55rem .7rem;
  font-family: var(--bb-font-family); letter-spacing: normal;
}
:global(.admin-sos-toast__message) { display: flex; align-items: center; gap: .5rem; min-width: 0; }
:global(.admin-sos-toast__message > .v-icon) { flex: none; color: rgb(var(--v-theme-error)); }
:global(.admin-sos-toast__message > span) { display: grid; min-width: 0; gap: .1rem; }
:global(.admin-sos-toast__message strong) { font-size: var(--bb-shell-font-toastTitle); line-height: 1.3; }
:global(.admin-sos-toast__message small) { color: var(--bb-color-muted); font-size: var(--bb-shell-font-toastSmall); line-height: 1.35; overflow-wrap: anywhere; }
:global(.admin-sos-toast__wrapper .v-snackbar__actions) { gap: .15rem; margin: 0; padding: .35rem .4rem; }
:global(.admin-sos-toast__wrapper .v-snackbar__actions .v-btn) {
  min-width: 38px; min-height: 38px; height: 38px; border-radius: var(--bb-shell-radius-toastAction);
  font-family: var(--bb-font-family); font-size: var(--bb-shell-font-toastSmall); letter-spacing: normal;
}
:global(.admin-sos-toast__wrapper .v-snackbar__actions .v-btn:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
@media (max-width: 599px) {
  :global(.admin-sos-toast__wrapper .v-snackbar__actions .v-btn) { min-width: 44px; min-height: 44px; height: 44px; }
  .logout-confirm-actions { flex-direction: column; align-items: stretch; gap: 8px; }
  .logout-confirm-actions :deep(.v-spacer) { display: none; }
  .logout-confirm-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }
  .logout-confirm-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
}
</style>
