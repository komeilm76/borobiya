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

      <v-menu location="top start" :offset="10" max-width="260">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" class="admin-account" type="button" aria-label="حساب مدیر">
            <span class="admin-account__avatar">{{ accountInitial }}</span>
            <span class="admin-account__meta">
              <strong>{{ accountName }}</strong>
              <small>مدیر ارشد امداد</small>
            </span>
            <v-icon class="admin-account__chevron" icon="mdi-chevron-up" size="16" />
          </button>
        </template>
        <v-list class="admin-account__menu" density="compact">
          <v-list-item :title="accountName" subtitle="مدیر سامانه" prepend-icon="mdi-shield-account-outline" />
          <v-divider />
          <v-list-item
            :prepend-icon="theme.isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
            :title="theme.isDark ? 'حالت روشن' : 'حالت تاریک'"
            data-test="admin-theme"
            @click="theme.toggleTheme()"
          />
          <v-list-item prepend-icon="mdi-map-outline" title="نقشه و نمای کاربری" @click="goToUserMap" />
          <v-divider />
          <v-list-item
            prepend-icon="mdi-logout"
            title="خروج از حساب"
            data-test="admin-logout"
            @click="logoutConfirmation.request()"
          />
        </v-list>
      </v-menu>
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
          <span
            v-if="!isOnline"
            class="admin-tool admin-tool--offline"
            role="status"
            aria-label="اتصال به سرور برقرار نیست"
            title="اتصال به سرور برقرار نیست؛ داده‌های این صفحه به‌روز نمی‌شوند."
          >
            <v-icon icon="mdi-cloud-off-outline" size="17" />
            <span class="admin-tool--offline__label" aria-hidden="true">آفلاین</span>
          </span>
          <button class="admin-search" type="button" :title="searchHint" @click="paletteOpen = true">
            <v-icon icon="mdi-magnify" size="17" />
            <span>جست‌وجو در پنل…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <RouterLink class="admin-tool admin-tool--bell" to="/_admin/alerts" aria-label="هشدارها" title="هشدارها">
            <v-icon icon="mdi-bell-outline" size="20" />
          </RouterLink>
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

    <v-dialog v-model="paletteOpen" max-width="520" scrim="rgba(0,0,0,.45)">
      <v-card class="admin-palette" rounded="xl" elevation="0">
        <v-text-field
          v-model="query"
          class="admin-palette__input"
          placeholder="جست‌وجوی بخش، حساب یا درخواست…"
          prepend-inner-icon="mdi-magnify"
          variant="solo-filled"
          density="comfortable"
          hide-details
          autofocus
          clearable
          role="combobox"
          aria-label="جست‌وجوی پنل مدیریت"
          aria-controls="admin-palette-results"
          :aria-expanded="allHits.length > 0"
          :aria-activedescendant="activeOptionId"
          @keydown.enter.prevent="openFirst"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.home.prevent="activeIndex = 0"
          @keydown.end.prevent="activeIndex = Math.max(allHits.length - 1, 0)"
          @keydown.esc="paletteOpen = false"
        />

        <div id="admin-palette-results" class="admin-palette__results" role="listbox" aria-label="نتایج">
          <div v-if="matches.length > 0" role="group" aria-label="بخش‌های پنل">
            <ul class="admin-palette__list" role="presentation">
              <li v-for="hit in matches" :key="hit.key" role="presentation">
                <button
                  :id="optionId(`page-${hit.key}`)"
                  type="button"
                  class="admin-palette__item"
                  :class="{ 'admin-palette__item--active': activeKey === `page-${hit.key}` }"
                  role="option"
                  :aria-selected="activeKey === `page-${hit.key}`"
                  @click="open(hit.to)"
                  @mouseenter="activate(`page-${hit.key}`)"
                >
                  <v-icon :icon="hit.icon" size="18" />
                  <span class="admin-palette__label">{{ hit.label }}</span>
                  <small>{{ hit.group }}</small>
                </button>
              </li>
            </ul>
          </div>

          <p v-if="recordSearching" class="admin-palette__status" role="status">
            در حال جست‌وجوی حساب‌ها و درخواست‌ها…
          </p>

          <div v-if="accountMatches.length > 0" role="group" aria-label="حساب‌ها">
            <ul class="admin-palette__list admin-palette__list--accounts" role="presentation">
              <li v-for="hit in accountMatches" :key="hit.id" role="presentation">
                <button
                  :id="optionId(`account-${hit.id}`)"
                  type="button"
                  class="admin-palette__item"
                  :class="{ 'admin-palette__item--active': activeKey === `account-${hit.id}` }"
                  role="option"
                  :aria-selected="activeKey === `account-${hit.id}`"
                  @click="openUser(hit.id)"
                  @mouseenter="activate(`account-${hit.id}`)"
                >
                  <v-icon icon="mdi-account-outline" size="18" />
                  <span class="admin-palette__label" dir="ltr">{{ hit.username }}</span>
                  <small>{{ hit.isActive ? "حساب فعال" : "حساب غیرفعال" }}</small>
                </button>
              </li>
            </ul>
          </div>
          <p v-else-if="accountError !== ''" class="admin-palette__status" role="status">{{ accountError }}</p>

          <div v-if="requestMatches.length > 0" role="group" aria-label="درخواست‌های اضطراری">
            <ul class="admin-palette__list admin-palette__list--requests" role="presentation">
              <li v-for="hit in requestMatches" :key="hit.id" role="presentation">
                <button
                  :id="optionId(`request-${hit.id}`)"
                  type="button"
                  class="admin-palette__item"
                  :class="{ 'admin-palette__item--active': activeKey === `request-${hit.id}` }"
                  role="option"
                  :aria-selected="activeKey === `request-${hit.id}`"
                  @click="openRequest(hit.id)"
                  @mouseenter="activate(`request-${hit.id}`)"
                >
                  <v-icon icon="mdi-alarm-light-outline" size="18" />
                  <span class="admin-palette__label admin-palette__label--clipped">{{ hit.description }}</span>
                  <small>{{ statusLabel(hit.status) }}</small>
                </button>
              </li>
            </ul>
          </div>
          <p v-else-if="requestError !== ''" class="admin-palette__status" role="status">{{ requestError }}</p>

          <p v-if="recordSearchEmpty" class="admin-palette__empty">
            بخش، حساب یا درخواستی با این نام پیدا نشد.
          </p>
        </div>
        <footer class="admin-palette__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> جابه‌جایی</span>
          <span><kbd>↵</kbd> بازکردن</span>
          <span><kbd>Esc</kbd> بستن</span>
        </footer>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="logoutConfirmation.open.value"
      max-width="420"
      :persistent="logoutConfirmation.submitting.value"
      aria-labelledby="admin-logout-title"
      aria-describedby="admin-logout-description"
      @update:model-value="(visible: boolean) => { if (!visible) logoutConfirmation.cancel(); }"
    >
      <v-card rounded="xl">
        <v-card-title id="admin-logout-title">خروج از حساب کاربری؟</v-card-title>
        <v-card-text id="admin-logout-description">
          برای ادامه باید دوباره وارد شوید. درخواست‌های اضطراری در حال پیگیری از این پنجره از دست نمی‌روند،
          اما این پنل بسته می‌شود.
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" rounded="lg" :disabled="logoutConfirmation.submitting.value" @click="logoutConfirmation.cancel()">
            انصراف
          </v-btn>
          <v-spacer />
          <v-btn
            color="error"
            variant="flat"
            rounded="lg"
            :loading="logoutConfirmation.submitting.value"
            :disabled="logoutConfirmation.submitting.value"
            data-test="admin-logout-confirm"
            @click="logoutConfirmation.confirm()"
          >
            خروج
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { SosRequestRecord, UserProfile } from "@shared/index";
import { SOS_STATUS_PRESENTATION } from "../../admin/sos-alerts";
import { listAdminSosRequests } from "../../api/admin-sos";
import { listAdminUsers } from "../../api/admin-users";
import { useOnlineStatus } from "../../composables/online-status";
import { useAuthStore } from "../../stores/auth";
import { useThemeStore } from "../../stores/theme";
import { useLogoutConfirmation } from "../../composables/use-logout-confirmation";

type NavKey =
  | "dashboard"
  | "dispatch"
  | "reports"
  | "users"
  | "services"
  | "incidents"
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

const searchHint = "جست‌وجوی بخش‌ها، حساب‌ها و درخواست‌ها (Ctrl K)";

const crumbList = computed(() => props.crumbs ?? []);
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { isOnline } = useOnlineStatus();
const navOpen = ref(false);
const paletteOpen = ref(false);
const query = ref("");

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
      { key: "incidents", label: "نوع رویدادها", icon: "mdi-alert-rhombus-outline", to: "/_admin/incidents" },
      { key: "services", label: "گروه‌های امداد", icon: "mdi-lifebuoy", to: "/_admin/services" }
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

/**
 * The palette searches the panel's own pages, then the two records an admin actually hunts for: accounts and SOS
 * requests. Both list routes take `q`, so neither search is a client-side filter over one page of results.
 * Incident types have no `q` yet, and the field does not claim them.
 */
const pages = computed(() =>
  navGroups.flatMap((group) =>
    group.items.map((item) => ({ key: item.key, label: item.label, icon: item.icon, to: item.to, group: group.label }))
  )
);

const matches = computed(() => {
  const term = query.value.trim();
  if (term === "") return pages.value;
  return pages.value.filter((hit) => `${hit.label} ${hit.group}`.includes(term));
});

const accountMatches = ref<UserProfile[]>([]);
const requestMatches = ref<SosRequestRecord[]>([]);
const accountError = ref("");
const requestError = ref("");
const recordSearching = ref(false);
let recordTimer: ReturnType<typeof setTimeout> | null = null;
let recordController: AbortController | null = null;
let recordRequest = 0;

/** Nothing matched anywhere, and nothing is still arriving: that is an empty result, not a blank panel. */
const recordSearchEmpty = computed(
  () =>
    matches.value.length === 0 &&
    accountMatches.value.length === 0 &&
    requestMatches.value.length === 0 &&
    !recordSearching.value &&
    accountError.value === "" &&
    requestError.value === ""
);

function clearRecordSearch(): void {
  activeIndex.value = 0;
  if (recordTimer !== null) clearTimeout(recordTimer);
  recordTimer = null;
  recordController?.abort();
  recordController = null;
  recordRequest += 1;
  accountMatches.value = [];
  requestMatches.value = [];
  accountError.value = "";
  requestError.value = "";
  recordSearching.value = false;
}

function statusLabel(status: SosRequestRecord["status"]): string {
  return SOS_STATUS_PRESENTATION[status]?.label ?? status;
}

function isAbort(caught: unknown): boolean {
  return caught instanceof DOMException && caught.name === "AbortError";
}

/**
 * Every record search reports its own failure: the two endpoints can fail independently, and an admin who sees
 * "no accounts" needs to know whether that was an answer or a broken request.
 */
function failureText(kind: "accounts" | "requests"): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return `برای جست‌وجوی ${kind === "accounts" ? "حساب‌ها" : "درخواست‌ها"} اتصال اینترنت لازم است.`;
  }
  return kind === "accounts" ? "جست‌وجوی حساب‌ها ممکن نشد." : "جست‌وجوی درخواست‌ها ممکن نشد.";
}

async function searchRecords(term: string): Promise<void> {
  const current = ++recordRequest;
  recordController?.abort();
  const active = new AbortController();
  recordController = active;
  try {
    await auth.ensureSession();
    if (current !== recordRequest) return;
    const accessToken = auth.accessToken;
    if (!accessToken) {
      accountError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد شوید.";
      requestError.value = "";
      return;
    }

    const [accounts, requests] = await Promise.allSettled([
      listAdminUsers({ q: term, page: 1, limit: 5 }, accessToken, active.signal),
      listAdminSosRequests(accessToken, { q: term, limit: 5, signal: active.signal })
    ]);
    if (current !== recordRequest) return;

    if (accounts.status === "fulfilled") accountMatches.value = accounts.value.items;
    else if (!isAbort(accounts.reason)) accountError.value = failureText("accounts");

    if (requests.status === "fulfilled") requestMatches.value = requests.value.items;
    else if (!isAbort(requests.reason)) requestError.value = failureText("requests");
  } catch (caught) {
    if (current !== recordRequest || isAbort(caught)) return;
    accountError.value = failureText("accounts");
    requestError.value = failureText("requests");
  } finally {
    if (current === recordRequest) {
      recordSearching.value = false;
      recordController = null;
    }
  }
}

watch(query, (value) => {
  const term = value.trim();
  if (recordTimer !== null) clearTimeout(recordTimer);
  recordTimer = null;
  accountError.value = "";
  requestError.value = "";
  if (term.length < 2) {
    clearRecordSearch();
    return;
  }
  recordSearching.value = true;
  // Same 250 ms rhythm the users screen uses: a username is typed, not pasted.
  recordTimer = setTimeout(() => void searchRecords(term), 250);
});

watch(paletteOpen, (open) => {
  if (open) return;
  query.value = "";
  clearRecordSearch();
});

function open(to: string): void {
  paletteOpen.value = false;
  query.value = "";
  clearRecordSearch();
  void router.push(to);
}

/** Accounts open their drawer on the users screen, which owns the `?user=` state. */
function openUser(id: string): void {
  open(`/_admin/users?user=${encodeURIComponent(id)}`);
}

/** Requests open on the dispatch board, which owns the `?request=` selection. */
function openRequest(id: string): void {
  open(`/_admin/dispatch?request=${encodeURIComponent(id)}`);
}

/**
 * One flat list of everything the palette is showing, in the order it is drawn. The arrow keys, `Enter` and
 * `aria-activedescendant` all read from it, so "the highlighted row" and "the row Enter opens" cannot disagree.
 */
type PaletteHit = { key: string; kind: "page" | "account" | "request"; id: string };

const allHits = computed<PaletteHit[]>(() => [
  ...matches.value.map((hit) => ({ key: `page-${hit.key}`, kind: "page" as const, id: hit.key })),
  ...accountMatches.value.map((user) => ({ key: `account-${user.id}`, kind: "account" as const, id: user.id })),
  ...requestMatches.value.map((row) => ({ key: `request-${row.id}`, kind: "request" as const, id: row.id }))
]);

const activeIndex = ref(0);
const activeKey = computed(() => allHits.value[activeIndex.value]?.key ?? "");
const activeOptionId = computed(() => (activeKey.value ? optionId(activeKey.value) : undefined));

function optionId(key: string): string {
  return `admin-palette-option-${key}`;
}

/** The highlight follows the list it lives in; a shrinking list must not leave it past the end. */
watch(
  () => allHits.value.map((hit) => hit.key).join("|"),
  () => {
    if (activeIndex.value >= allHits.value.length) activeIndex.value = 0;
  }
);

function activate(key: string): void {
  const index = allHits.value.findIndex((hit) => hit.key === key);
  if (index >= 0) activeIndex.value = index;
}

/** Wraps in both directions, the way a command palette is expected to. */
function moveActive(delta: number): void {
  const total = allHits.value.length;
  if (total === 0) return;
  activeIndex.value = (activeIndex.value + delta + total) % total;
  // The field keeps focus, so the browser will not scroll for us.
  void nextTick(() => {
    const id = activeOptionId.value;
    if (id) document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  });
}

/** `Enter` opens the highlighted row — which is the first hit until an arrow key says otherwise. */
function openFirst(): void {
  const hit = allHits.value[activeIndex.value];
  if (!hit) return;
  if (hit.kind === "page") {
    const page = matches.value.find((candidate) => candidate.key === hit.id);
    if (page) open(page.to);
    return;
  }
  if (hit.kind === "account") openUser(hit.id);
  else openRequest(hit.id);
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  // Escape is the only keyboard way out of the off-canvas rail on a phone.
  if (event.key === "Escape" && navOpen.value) navOpen.value = false;
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  clearRecordSearch();
});

const accountName = computed(() => auth.user?.username ?? "مدیر سامانه");
const accountInitial = computed(() => accountName.value.slice(0, 1));

const theme = useThemeStore();
// The global app bar and its account menu are suppressed on `/_admin*`, so the rail owns sign-out.
const logoutConfirmation = useLogoutConfirmation({
  isAuthenticated: computed(() => auth.isAuthenticated),
  logout: () => auth.logout(),
  onLoggedOut: () => router.replace("/_auth/login")
});

function goToUserMap(): void {
  void router.push("/_user/map");
}

watch(
  () => route.fullPath,
  () => {
    navOpen.value = false;
    paletteOpen.value = false;
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
  width: 100%;
  margin-top: auto;
  padding: 0.9rem 0.5rem 0.35rem;
  border: 0;
  border-top: 1px solid var(--admin-line);
  border-radius: 0 0 12px 12px;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: start;
}

.admin-account:hover,
.admin-account:focus-visible {
  background: var(--admin-soft);
}

.admin-account__chevron {
  margin-inline-start: auto;
  color: var(--admin-muted);
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

.admin-tool--bell {
  display: grid;
  place-items: center;
  inline-size: 38px;
  block-size: 38px;
  border-radius: 50%;
  color: rgba(var(--v-theme-on-surface), 0.72);
  text-decoration: none;
}

.admin-tool--bell:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

/* The top bar answers "is anything arriving?" on every admin screen, not only where a page keeps a banner. */
.admin-tool--offline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  block-size: 34px;
  padding-inline: 0.6rem;
  border: 1px solid rgba(var(--v-theme-warning), 0.35);
  border-radius: 999px;
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.1);
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.admin-palette {
  overflow: hidden;
}

.admin-palette__input :deep(.v-field) {
  border-radius: 16px 16px 0 0;
}

.admin-palette__list {
  max-block-size: 320px;
  overflow-y: auto;
  margin: 0;
  padding: 6px;
  list-style: none;
}

.admin-palette__item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  inline-size: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.admin-palette__item:hover,
.admin-palette__item:focus-visible {
  background: rgba(var(--v-theme-primary), 0.09);
  outline: none;
}

.admin-palette__label {
  font-size: 0.92rem;
}

.admin-palette__item small {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8rem;
}

.admin-palette__empty {
  margin: 0;
  padding: 22px 16px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.86rem;
  text-align: center;
}

/* The palette owns its scroll, so a long result set never pushes the footer off the dialog. */
.admin-palette__results {
  max-height: min(60vh, 460px);
  overflow-y: auto;
}

.admin-palette__item--active {
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary));
}

/* Accounts come after the pages; the rule keeps the two result kinds visually separate. */
.admin-palette__list--accounts {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  margin-top: 4px;
  padding-top: 4px;
}

.admin-palette__list--requests {
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  margin-top: 4px;
  padding-top: 4px;
}

/* A description is a sentence; the row stays one line and the tooltip keeps the rest readable. */
.admin-palette__label--clipped {
  overflow: hidden;
  max-width: 22ch;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-palette__status {
  margin: 0;
  padding: 14px 16px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
  text-align: center;
}

.admin-palette__foot {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8rem;
}

.admin-palette__foot kbd {
  padding: 1px 6px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 6px;
  font-size: 0.78rem;
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
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.5rem, 2.3vw, 1.95rem);
  font-weight: 750;
  line-height: 1.4;
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

  /* Phones get the icon with its accessible name; the word would push the search field out of the bar. */
  .admin-tool--offline {
    padding-inline: 0.45rem;
  }

  .admin-tool--offline__label {
    display: none;
  }

  .admin-shell__nav {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 40;
    width: 264px;
    transform: translateX(100%);
    transition: transform 0.2s ease, visibility 0.2s;
    /* A translated panel is still focusable: without this, Tab walks into a rail nobody can see. */
    visibility: hidden;
  }

  .admin-shell--nav-open .admin-shell__nav {
    transform: translateX(0);
    visibility: visible;
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
