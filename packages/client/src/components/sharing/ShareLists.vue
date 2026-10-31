<template>
  <v-card class="share-lists bb-surface-card" elevation="0" rounded="xl">
    <div class="share-lists__header">
      <div>
        <p class="share-lists__kicker">مدیریت دسترسی</p>
        <h2>همراهان و دستگاه‌ها</h2>
      </div>
      <div class="share-lists__tools">
        <v-btn
          size="small"
          variant="text"
          :loading="loading"
          aria-label="تازه‌سازی فهرست اشتراک‌ها"
          @click="refresh"
        >
          <v-icon class="me-1" icon="mdi-refresh" size="18" />
          تازه‌سازی
        </v-btn>
        <v-btn size="small" color="primary" variant="tonal" rounded="lg" @click="emit('create')">
          <v-icon class="me-1" icon="mdi-plus" size="18" />
          اشتراک تازه
        </v-btn>
      </div>
    </div>

    <v-tabs v-model="activeTab" class="share-lists__tabs" color="primary" grow aria-label="نوع اشتراک موقعیت">
      <v-tab value="owned">اشتراک‌های من</v-tab>
      <v-tab value="received">از دیگران</v-tab>
    </v-tabs>

    <v-alert v-if="loadError" class="mt-3" type="error" variant="tonal" density="compact" role="alert">
      {{ loadError }}
    </v-alert>

    <div v-if="loading && !loaded" role="status" aria-live="polite">
      <span class="sr-only">در حال دریافت اشتراک‌های موقعیت…</span>
      <v-skeleton-loader type="list-item@3" class="mt-2" aria-hidden="true" />
    </div>

    <template v-else>
      <p v-if="pendingRevocation" class="share-lists__pending" role="status">
        در حال لغو…
      </p>

      <section v-if="activeTab === 'owned'" class="share-lists__section" aria-labelledby="share-lists-owned-title">
        <h3 id="share-lists-owned-title">
          موقعیت زندهٔ من
          <v-chip v-if="liveFresh && !loading" size="x-small" variant="tonal">{{ ownedRows.length }}</v-chip>
        </h3>
        <v-btn v-if="canApplyAll || deviceSettings.bulkRunning.value" size="small" variant="tonal"
          color="primary" class="share-lists__bulk" :disabled="!canApplyAll" :loading="deviceSettings.bulkRunning.value"
          @click="bulkConfirmOpen = true">پخش همه از همین دستگاه</v-btn>
        <ul v-if="ownedRows.length" class="share-lists__rows" role="list">
          <li v-for="row in ownedRows" :key="row.id" class="share-lists__row share-lists__row--owned">
            <div class="share-lists__row-top">
              <v-icon :icon="row.kind === 'expired' ? 'mdi-map-marker-off-outline' : 'mdi-map-marker-outline'" size="20" />
              <div class="share-lists__row-main">
                <p class="share-lists__row-title">
                  <bdi dir="ltr">{{ row.label }}</bdi>
                  <span class="share-lists__row-state">{{ stateText(row.kind) }}</span>
                </p>
                <p class="share-lists__row-sub">{{ detail(row).join(" • ") }}</p>
              </div>
              <v-btn
                size="x-small"
                variant="text"
                color="error"
                :loading="pendingRevocation === row.id"
                :disabled="revoking"
                :aria-label="`لغو اشتراک با ${row.label}`"
                @click="askRevoke(row)"
              >
                لغو
              </v-btn>
            </div>
            <div v-if="row.kind !== 'expired'" class="share-lists__device-line">
              <span class="share-lists__device-caption">پخش از</span>
              <v-select
                :model-value="drafts[row.id] ?? row.share.priorityDeviceId"
                :items="deviceSettings.choicesFor(row.share)"
                item-title="label" item-value="value" density="compact" variant="outlined" hide-details
                :aria-label="`دستگاه پخش‌کنندهٔ ${row.label}`" placeholder="انتخاب دستگاه"
                :disabled="deviceSettings.loading.value || deviceSettings.failed.value || !deviceSettings.loaded.value || Boolean(deviceSettings.busyShareId.value) || deviceSettings.bulkRunning.value"
                @update:model-value="drafts[row.id] = $event"
              />
              <v-btn size="small" variant="tonal" color="primary"
                :loading="deviceSettings.busyShareId.value === row.id"
                :disabled="!canApplyDevice(row)"
                :aria-label="`اعمال دستگاه برای ${row.label}`" @click="applyDevice(row)">اعمال</v-btn>
            </div>
          </li>
        </ul>
        <p v-else-if="ownState === 'empty'" class="share-lists__empty">هیچ‌کس موقعیت زندهٔ شما را نمی‌بیند.</p>
        <p v-else-if="ownState === 'unavailable'" class="share-lists__empty">
          وضعیت دسترسی به موقعیت زنده را نتوانستیم بررسی کنیم؛ دوباره تازه‌سازی کنید.
        </p>
        <p v-else class="share-lists__empty" role="status">در حال بررسی اشتراک‌های زنده…</p>
      </section>

      <section v-if="activeTab === 'received'" class="share-lists__section" aria-labelledby="share-lists-received-title">
        <h3 id="share-lists-received-title">
          موقعیت‌ها و مسیرهای دریافتی
          <v-chip v-if="liveFresh && historyFresh && !loading" size="x-small" variant="tonal">
            {{ receivedRows.length + receivedHistoryRows.length }}
          </v-chip>
        </h3>
        <ul v-if="receivedRows.length || receivedHistoryRows.length" class="share-lists__rows" role="list">
          <li v-for="row in receivedRows" :key="row.id" class="share-lists__row">
            <v-icon icon="mdi-account-eye-outline" size="20" />
            <div class="share-lists__row-main">
              <p class="share-lists__row-title">
                <bdi dir="ltr">{{ row.label }}</bdi>
                <span class="share-lists__row-state">{{ stateText(row.kind) }}</span>
              </p>
              <p class="share-lists__row-sub">{{ receivedDetail(row).join(" • ") }}</p>
            </div>
            <v-btn size="x-small" variant="text" color="primary" to="/_user/map">
              نقشه
            </v-btn>
          </li>
          <li v-for="row in receivedHistoryRows" :key="`rh-${row.id}`" class="share-lists__row">
            <v-icon icon="mdi-map-marker-path" size="20" />
            <div class="share-lists__row-main">
              <p class="share-lists__row-title">
                <bdi dir="ltr">{{ row.label }}</bdi>
                <span class="share-lists__row-state">تاریخچه مسیر</span>
              </p>
              <p class="share-lists__row-sub">{{ historyDetail(row).join(" • ") }}</p>
            </div>
            <v-btn
              size="x-small"
              variant="text"
              color="primary"
              :to="{ path: '/_user/map', query: { historyShare: row.id } }"
            >
              پخش در نقشه
            </v-btn>
          </li>
        </ul>
        <p v-else-if="receivedState === 'empty'" class="share-lists__empty">اشتراک فعالی برای شما باز نیست.</p>
        <p v-else-if="receivedState === 'unavailable'" class="share-lists__empty">
          وضعیت اشتراک‌های دریافتی را نتوانستیم بررسی کنیم؛ دوباره تازه‌سازی کنید.
        </p>
        <p v-else class="share-lists__empty" role="status">در حال بررسی اشتراک‌های دریافتی…</p>
      </section>

      <section v-if="activeTab === 'owned' && historyRows.length > 0" class="share-lists__section" aria-labelledby="share-lists-history-title">
        <h3 id="share-lists-history-title">
          بازه‌های تاریخچه
          <v-chip v-if="historyFresh && !loading" size="x-small" variant="tonal">{{ historyRows.length }}</v-chip>
        </h3>
        <ul class="share-lists__rows" role="list">
          <li v-for="row in historyRows" :key="row.id" class="share-lists__row">
            <v-icon :icon="row.isOpen ? 'mdi-clock-check-outline' : 'mdi-clock-check'" size="20" />
            <div class="share-lists__row-main">
              <p class="share-lists__row-title">
                <bdi dir="ltr">{{ row.label }}</bdi>
                <span class="share-lists__row-state">{{ row.isOpen ? "باز" : "بسته" }}</span>
              </p>
              <p class="share-lists__row-sub">{{ historyDetail(row).join(" • ") }}</p>
            </div>
            <v-btn
              size="x-small"
              variant="text"
              color="error"
              :loading="pendingRevocation === row.id"
              :disabled="revoking"
              :aria-label="`حذف دسترسی ${row.label} به این بازه`"
              @click="askRevokeHistory(row)"
            >
              حذف
            </v-btn>
          </li>
        </ul>
      </section>
    </template>

    <p v-if="activeTab === 'owned' && deviceSettings.status.value" class="share-lists__device-status"
      :class="`share-lists__device-status--${deviceSettings.status.value.tone}`" role="status" aria-live="polite">
      {{ deviceSettings.status.value.text }}
    </p>

    <v-dialog v-model="bulkConfirmOpen" max-width="420" scrollable aria-labelledby="share-bulk-title">
      <v-card rounded="xl">
        <v-card-title id="share-bulk-title">تغییر دستگاه همهٔ همراهان؟</v-card-title>
        <v-card-text class="share-lists__confirm-body">
          <p class="share-lists__confirm">دستگاه همین نشست برای اشتراک‌های زنده‌ای که به دستگاه دیگری وصل‌اند انتخاب می‌شود. مدت هیچ اشتراکی بیشتر نمی‌شود. هر تغییر جداگانه انجام می‌شود؛ ممکن است بعضی موفق و بعضی ناموفق باشند.</p>
        </v-card-text>
        <v-card-actions class="share-lists__confirm-actions">
          <v-spacer />
          <v-btn variant="text" :disabled="deviceSettings.bulkRunning.value" @click="bulkConfirmOpen = false">بازگشت</v-btn>
          <v-btn color="primary" variant="flat" :loading="deviceSettings.bulkRunning.value"
            :disabled="!canApplyAll" @click="applyAllDevices">تأیید تغییر</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="confirmOpen" max-width="420" scrollable aria-labelledby="share-revoke-title">
      <v-card rounded="xl" v-if="pendingRow">
        <v-card-title id="share-revoke-title">{{ pendingRow.history ? "حذف دسترسی تاریخچه؟" : "لغو این اشتراک؟" }}</v-card-title>
        <v-card-text class="share-lists__confirm-body">
          <p v-if="pendingRow.history" class="share-lists__confirm">
            دسترسی <bdi dir="ltr">{{ pendingRow.label }}</bdi> به این بازهٔ تاریخچهٔ مسیر بلافاصله قطع می‌شود.
          </p>
          <p v-else class="share-lists__confirm">
            <bdi dir="ltr">{{ pendingRow.label }}</bdi> از این پس موقعیت زندهٔ شما را نخواهد دید.
            تاریخچهٔ بازه‌های قبلی پاک نمی‌شود.
          </p>
        </v-card-text>
        <v-card-actions class="share-lists__confirm-actions">
          <v-spacer />
          <v-btn variant="text" :disabled="revoking" @click="confirmOpen = false">بازگشت</v-btn>
          <v-btn color="error" variant="flat" :loading="revoking" @click="confirmRevoke">
            {{ pendingRow.history ? "حذف دسترسی" : "لغو اشتراک" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type {
  LocationHistoryShare,
  LocationShare,
  OwnedLocationShare,
  OwnedLocationHistoryShare,
  ReceivedLocationHistoryShare,
  ReceivedLocationShare
} from "@shared/index";
import { friendlyErrorMessage } from "@/api/error-message";
import type { DeviceSettings } from "@/composables/use-device-settings";
import {
  listLocationHistoryShares,
  listLocationShares,
  revokeLocationHistoryShare,
  revokeLocationShare
} from "@/api/location";
import { useAuthStore } from "@/stores/auth";
import {
  buildShareNameMap,
  describeHistoryShareRow,
  describeLiveShareRow,
  formatDuration,
  shareRowLabel,
  type ShareRowKind
} from "@/sharing/share-form";
import { shareSectionPresentation } from "@/sharing/share-list-presentation";
import { createShareEndedSubscription } from "@/sharing/share-list-session";
import { createShareSubmissionFence, shareSessionKey } from "@/sharing/share-submission-fence";

/**
 * "My Shares" / "Shared With Me" (spec §7.2, tracker T2.1.7), plus the history grants that share
 * the same privacy question. The rows come from `describeLiveShareRow` / `describeHistoryShareRow`
 * so the expiry arithmetic is the tested one, and the tick on every refresh is a real request:
 * a share can be revoked from another device at any moment.
 */
const { deviceSettings } = defineProps<{ deviceSettings: DeviceSettings }>();
const emit = defineEmits<{
  (event: "create"): void;
  (event: "changed"): void;
}>();

interface LiveRowView {
  id: string;
  label: string;
  kind: ShareRowKind;
  remainingMinutes: number | null;
  note: string | null;
  history: false;
}

interface OwnedView extends LiveRowView {
  share: OwnedLocationShare;
}

interface HistoryRowView {
  id: string;
  label: string;
  isOpen: boolean;
  from: string;
  to: string;
  maxPoints: number | null;
  history: true;
}

interface ReceivedView extends LiveRowView {
  lastLocation: { lat: number; lon: number } | null;
}

const auth = useAuthStore();
const sessionKey = computed(() => shareSessionKey(auth.user?.id ?? null, auth.accessToken));

const activeTab = ref<"owned" | "received">("owned");
const bulkConfirmOpen = ref(false);
const drafts = reactive<Record<string, string>>({});
const loading = ref(true);
const loaded = ref(false);
const liveFresh = ref(false);
const historyFresh = ref(false);
const loadError = ref<string | null>(null);
let readVersion = 0;
const owned = ref<OwnedLocationShare[]>([]);
const received = ref<ReceivedLocationShare[]>([]);
const ownedHistory = ref<OwnedLocationHistoryShare[]>([]);
const receivedHistory = ref<ReceivedLocationHistoryShare[]>([]);
const pendingRow = ref<LiveRowView | HistoryRowView | null>(null);
const confirmOpen = ref(false);
const revoking = ref(false);
const pendingRevocation = ref<string | null>(null);
let disposed = false;
const revocationFence = createShareSubmissionFence({
  ownerId: () => auth.user?.id ?? null,
  accessToken: () => auth.accessToken,
  // The confirmation may close after the server acknowledges the write. That must not
  // suppress the same owner's local removal/re-read, only a session change or unmount.
  isOpen: () => !disposed
});

/**
 * Names for owned rows whose `targetUsername` the server could not read (it left-joins the target for
 * exactly that reason). The fallback is what this session has already seen — a received row's owner, or
 * the picker — and failing that the row shows a short id rather than pretending to know a name.
 */
const names = computed(() => {
  const entries: { id: string; username: string }[] = [];
  for (const share of received.value) entries.push({ id: share.owner.id, username: share.owner.username });
  for (const share of receivedHistory.value) entries.push({ id: share.owner.id, username: share.owner.username });
  return buildShareNameMap(entries);
});

/**
 * The wall clock every row computed reads. Vue caches a computed whose only time source was
 * `new Date()` inside its own body, so without this ref the countdowns render once and freeze: a share
 * that has already closed would keep saying "۵ دقیقه مانده" and stay in the "active" section for as long
 * as the tab stayed open — the one thing this panel exists to answer honestly. 30 seconds is finer than
 * any resolution these rows show, and the tick is deliberately unconditional: gating it on "are there
 * rows yet" would need re-checking at every place rows change, which is how leaked timers happen.
 */
const nowMs = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  clock = setInterval(() => {
    nowMs.value = Date.now();
  }, 30_000);
});
onBeforeUnmount(() => {
  if (clock !== undefined) clearInterval(clock);
  clock = undefined;
});

const ownedRows = computed<OwnedView[]>(() => {
  const now = new Date(nowMs.value);
  return owned.value.map((share) => {
    const described = describeLiveShareRow(share, now);
    return {
      ...described,
            // The server names the target; `names` is the fallback for the row its left join could not name.
      label: shareRowLabel(share.targetUserId, names.value, share.targetUsername),
      history: false,
      share
    };
  });
});

const receivedRows = computed<ReceivedView[]>(() => {
  const now = new Date(nowMs.value);
  return received.value.map((share) => {
    const described = describeLiveShareRow(share, now);
    return {
      ...described,
      label: share.owner.username,
      history: false,
      lastLocation: share.owner.lastLocation
        ? { lat: share.owner.lastLocation.lat, lon: share.owner.lastLocation.lon }
        : null
    };
  });
});

const historyRows = computed<HistoryRowView[]>(() => {
  const now = new Date(nowMs.value);
  return ownedHistory.value.map((share) => {
    const described = describeHistoryShareRow(share, now);
    return {
      ...described,
            // The server names the target; `names` is the fallback for the row its left join could not name.
      label: shareRowLabel(share.targetUserId, names.value, share.targetUsername),
      history: true
    };
  });
});

const receivedHistoryRows = computed<HistoryRowView[]>(() => {
  const now = new Date(nowMs.value);
  return receivedHistory.value.map((share) => {
    const described = describeHistoryShareRow(share, now);
    return {
      ...described,
      label: shareRowLabel(share.owner.id, names.value, share.owner.username),
      history: true
    };
  });
});

const ownState = computed(() => shareSectionPresentation(loading.value, liveFresh.value, ownedRows.value.length));
const receivedState = computed(() => shareSectionPresentation(loading.value, liveFresh.value && historyFresh.value,
  receivedRows.value.length + receivedHistoryRows.value.length));

async function refresh(): Promise<void> {
  const version = ++readVersion;
  loading.value = true;
  loadError.value = null;
  // Re-read the clock with the data, so a manual refresh never shows a countdown measured against the
  // last tick (up to 30 s stale).
  nowMs.value = Date.now();
  try {
    await auth.ensureSession();
    if (version !== readVersion) return;
    const token = auth.accessToken;
    if (!token || !sessionKey.value) {
      // A prior login's private rows must not linger when the bearer and profile disagree.
      owned.value = [];
      received.value = [];
      ownedHistory.value = [];
      receivedHistory.value = [];
      liveFresh.value = false;
      historyFresh.value = false;
      loadError.value = token
        ? "نشست و حساب هنوز هماهنگ نیستند؛ دوباره تلاش کنید."
        : "برای بررسی وضعیت اشتراک‌ها دوباره وارد حساب شوید.";
      return;
    }
    // Both lists in parallel, but a failure of either one must not discard the other's successful
    // read. In particular, no failed read may support the claim that nobody has access.
    const [live, history] = await Promise.allSettled([listLocationShares(token), listLocationHistoryShares(token)]);
    if (version !== readVersion) return;
    liveFresh.value = live.status === "fulfilled";
    historyFresh.value = history.status === "fulfilled";
    if (live.status === "fulfilled") {
      owned.value = live.value.owned;
      received.value = live.value.sharedWithMe;
    }
    if (history.status === "fulfilled") {
      ownedHistory.value = history.value.owned;
      receivedHistory.value = history.value.sharedWithMe;
    }
    const failures: string[] = [];
    if (live.status === "rejected") {
      failures.push(`خواندن اشتراک‌های زنده ناموفق بود؛ ردیف‌های موجود ممکن است قدیمی باشند: ${friendlyErrorMessage(live.reason, "دوباره تلاش کنید.")}`);
    }
    if (history.status === "rejected") {
      failures.push(`خواندن دسترسی‌های تاریخچه ناموفق بود؛ ردیف‌های موجود ممکن است قدیمی باشند: ${friendlyErrorMessage(history.reason, "دوباره تلاش کنید.")}`);
    }
    loadError.value = failures.length ? failures.join(" ") : null;
  } catch (error) {
    if (version !== readVersion) return;
    liveFresh.value = false;
    historyFresh.value = false;
    loadError.value = `${friendlyErrorMessage(error, "فهرست اشتراک‌ها را نشد دید؛ دوباره تلاش کنید.")} ردیف‌های موجود ممکن است قدیمی باشند.`;
  } finally {
    if (version === readVersion) {
      loaded.value = true;
      loading.value = false;
    }
  }
}

function stateText(kind: ShareRowKind): string {
  switch (kind) {
    case "permanent":
      return "تا لغو دستی";
    case "expired":
      return "به پایان رسیده";
    default:
      return "فعال";
  }
}

/**
 * Rows share `formatDuration` with the share dialog: one rule for "how long" means a list cannot say
 * "4320 دقیقه" while the dialog says "3 روز".
 */
function timingText(row: LiveRowView): string {
  if (row.kind === "expired") return "مهلتش به پایان رسیده";
  if (row.remainingMinutes === null) return "بدون مهلت";
  return `${formatDuration(row.remainingMinutes)} مانده`;
}

function detail(row: LiveRowView): string[] {
  return [timingText(row), row.note ?? ""].filter((part) => part.length > 0);
}

function receivedDetail(row: ReceivedView): string[] {
  const position = row.lastLocation
    ? `آخرین موقعیت ${row.lastLocation.lat.toFixed(3)}، ${row.lastLocation.lon.toFixed(3)}`
    : "هنوز موقعیتی نفرستاده است";
  return [timingText(row), position];
}

function historyDetail(row: HistoryRowView): string[] {
  const window = `از ${formatInstant(row.from)} تا ${formatInstant(row.to)}`;
  return row.maxPoints === null ? [window] : [window, `سقف ${row.maxPoints} نقطه`];
}

/** Local time on purpose: "until 15:30" is what the owner meant, and UTC would read as a lie. */
function formatInstant(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const canApplyAll = computed(() => {
  const current = deviceSettings.currentDeviceId.value;
  return Boolean(current && deviceSettings.loaded.value && !deviceSettings.failed.value &&
    !deviceSettings.loading.value && !deviceSettings.busyShareId.value && !deviceSettings.bulkRunning.value &&
    ownedRows.value.some(row => row.kind !== "expired" && row.share.priorityDeviceId !== current));
});

async function applyAllDevices(): Promise<void> {
  if (!canApplyAll.value) return;
  const identity = sessionKey.value;
  await deviceSettings.assignCurrentDevice();
  if (disposed || identity !== sessionKey.value) return;
  bulkConfirmOpen.value = false;
  for (const key of Object.keys(drafts)) delete drafts[key];
  await refresh();
  if (!disposed && identity === sessionKey.value) emit("changed");
}

function canApplyDevice(row: OwnedView): boolean {
  const chosen = drafts[row.id];
  return Boolean(chosen && chosen !== row.share.priorityDeviceId && row.kind !== "expired" &&
    deviceSettings.loaded.value && !deviceSettings.failed.value && !deviceSettings.loading.value &&
    !deviceSettings.busyShareId.value && !deviceSettings.bulkRunning.value);
}

async function applyDevice(row: OwnedView): Promise<void> {
  if (!canApplyDevice(row)) return;
  const choice = drafts[row.id];
  const identity = sessionKey.value;
  if (!choice) return;
  const applied = await deviceSettings.assign(row.id, choice);
  if (!applied || disposed || identity !== sessionKey.value) return;
  delete drafts[row.id];
  await refresh();
  if (!disposed && identity === sessionKey.value) emit("changed");
}

function askRevoke(row: LiveRowView): void {
  if (revoking.value) return;
  pendingRow.value = row;
  confirmOpen.value = true;
}

function askRevokeHistory(row: HistoryRowView): void {
  if (revoking.value) return;
  pendingRow.value = row;
  confirmOpen.value = true;
}

async function confirmRevoke(): Promise<void> {
  const row = pendingRow.value;
  if (!row || revoking.value) return;
  const revocation = revocationFence.begin();
  if (!revocation) return;

  revoking.value = true;
  pendingRevocation.value = row.id;
  try {
    await auth.ensureSession();
    if (!revocationFence.isActive(revocation)) return;
    const token = auth.accessToken;
    if (!token) {
      loadError.value = "برای لغو اشتراک دوباره وارد حساب شوید.";
      confirmOpen.value = false;
      return;
    }
    if (!revocationFence.isCurrent(revocation)) return;
    // Reconcile only after the server confirms the privacy write. If the subsequent read fails,
    // the revoked row must not keep claiming to be active, but an empty list cannot be certified yet.
    if (row.history) {
      await revokeLocationHistoryShare(row.id, token);
      if (!revocationFence.isCurrent(revocation)) return;
      ownedHistory.value = ownedHistory.value.filter((share) => share.id !== row.id);
      historyFresh.value = false;
    } else {
      await revokeLocationShare(row.id, token);
      if (!revocationFence.isCurrent(revocation)) return;
      owned.value = owned.value.filter((share) => share.id !== row.id);
      liveFresh.value = false;
    }
    confirmOpen.value = false;
    pendingRow.value = null;
    await refresh();
    if (!revocationFence.isCurrent(revocation)) return;
    emit("changed");
  } catch (error) {
    if (!revocationFence.isCurrent(revocation)) return;
    loadError.value = friendlyErrorMessage(error, "لغو اشتراک انجام نشد.");
    confirmOpen.value = false;
  } finally {
    if (revocationFence.isActive(revocation)) {
      revoking.value = false;
      pendingRevocation.value = null;
    }
  }
}

function resetShareRows(): void {
  // A logout, account change, or new JWT login must invalidate reads and privacy writes before
  // an old bearer can update this session's rows or announce a false success.
  readVersion += 1;
  revocationFence.invalidate();
  revoking.value = false;
  pendingRevocation.value = null;
  owned.value = [];
  for (const key of Object.keys(drafts)) delete drafts[key];
  received.value = [];
  ownedHistory.value = [];
  receivedHistory.value = [];
  liveFresh.value = false;
  historyFresh.value = false;
  loaded.value = true;
  loading.value = false;
  loadError.value = sessionKey.value ? null : auth.accessToken
    ? "نشست و حساب هنوز هماهنگ نیستند؛ دوباره تلاش کنید."
    : "برای بررسی وضعیت اشتراک‌ها دوباره وارد حساب شوید.";
  confirmOpen.value = false;
  bulkConfirmOpen.value = false;
  pendingRow.value = null;
}

function handleShareEnded(payload: unknown): void {
  const candidate = payload as { shareId?: unknown } | null | undefined;
  const shareId = typeof candidate?.shareId === "string" ? candidate.shareId : "";
  if (!shareId) return;
  const hadOwned = owned.value.some((row) => row.id === shareId);
  const hadReceived = received.value.some((row) => row.id === shareId);
  if (!hadOwned && !hadReceived) return;
  if (hadOwned) owned.value = owned.value.filter((row) => row.id !== shareId);
  if (hadReceived) received.value = received.value.filter((row) => row.id !== shareId);
  emit("changed");
}

const shareSync = createShareEndedSubscription(async (token) => {
  // The Socket.IO transport is still downloaded only when this panel has a real bearer.
  const { createRealtimeClient } = await import("@/services/socket");
  return createRealtimeClient(token);
}, handleShareEnded);

watch(
  () => auth.accessToken,
  (token, previousToken) => {
    // Identity changes are handled by the session watcher below. Let only same-session
    // renewals re-handshake here, so a new login does not open its socket twice.
    const previousKey = shareSessionKey(auth.user?.id ?? null, previousToken ?? null);
    if (previousToken === undefined || sessionKey.value === previousKey) {
      void shareSync.setToken(sessionKey.value ? token : null);
    }
  },
  { immediate: true, flush: "sync" }
);

watch(sessionKey, (next, previous) => {
  if (next === previous) return; // Same-session bearer renewal only re-handshakes the socket.
  void shareSync.setToken(next ? auth.accessToken : null);
  if (previous || loaded.value) resetShareRows();
  // A cold mount's onMounted read owns its recovery. A later account/login switch needs a new read.
  if (next && (previous || loaded.value)) void refresh();
}, { flush: "sync" });

onBeforeUnmount(() => {
  disposed = true;
  revocationFence.invalidate();
  readVersion += 1;
  shareSync.close();
});
onMounted(refresh);

defineExpose({ refresh });
</script>

<style scoped>
.share-lists {
  padding: clamp(1rem, 2.5vw, 1.5rem);
}

.share-lists__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.share-lists__kicker {
  margin: 0;
  color: var(--bb-color-muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.share-lists__header h2 {
  margin: 0.3rem 0 0;
  color: var(--bb-color-text);
  font-size: 1.1rem;
  font-weight: 800;
}

.share-lists__tools {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.share-lists__section {
  margin-top: 1.1rem;
}

.share-lists__section h3 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.35rem;
  color: var(--bb-color-text);
  font-size: 0.9rem;
  font-weight: 800;
}

.share-lists__empty {
  margin: 0;
  color: var(--bb-color-muted);
  font-size: 0.84rem;
}

.share-lists__pending {
  margin: 0.5rem 0 0;
  color: var(--bb-color-muted);
  font-size: 0.78rem;
}

.share-lists__rows {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.share-lists__row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: var(--bb-radius-nested, 16px);
}

.share-lists__bulk { margin-bottom: 0.6rem; min-height: 44px; max-width: 100%; height: auto; }
.share-lists__bulk :deep(.v-btn__content) { white-space: normal; text-align: center; }
.share-lists__device-caption { flex: 0 0 auto; color: var(--bb-color-muted); font-size: 0.76rem; font-weight: 700; }
.share-lists__tabs { margin-top: 1rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1); }
.share-lists__tabs :deep(.v-tab) { min-width: 0; min-height: 48px; white-space: normal; font-size: 0.82rem; }
.share-lists__row--owned { display: block; }
.share-lists__row-top { display: flex; align-items: center; gap: 0.6rem; }
.share-lists__row-top > .v-btn { min-width: 44px; min-height: 44px; }
.share-lists__device-line { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.5rem; margin-top: 0.45rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08); color: var(--bb-color-muted); }
.share-lists__device-line :deep(.v-select) { flex: 1 1 auto; min-width: 0; }
.share-lists__device-line > .v-btn { min-width: 50px; min-height: 44px; }
.share-lists__device-status { margin: 0.65rem 0 0; color: var(--bb-color-muted); font-size: 0.82rem; line-height: 1.7; }
.share-lists__device-status--ok { color: #195e46; }
.share-lists__device-status--error { color: #b3261e; }
:global(:root.dark .share-lists__device-status--ok) { color: #7fdcb2; }
:global(:root.dark .share-lists__device-status--error) { color: #ffb4ab; }

.share-lists__row-main {
  min-width: 0;
  flex: 1;
}

.share-lists__row-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  color: var(--bb-color-text);
  font-size: 0.88rem;
  font-weight: 700;
}

.share-lists__row-title bdi { min-width: 0; overflow-wrap: anywhere; }
.share-lists__row-state {
  color: var(--bb-color-muted);
  font-size: 0.72rem;
  font-weight: 600;
}

.share-lists__row-sub {
  margin: 0.15rem 0 0;
  color: var(--bb-color-muted);
  font-size: 0.78rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.share-lists__confirm {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.share-lists__confirm-body { min-height: 0; overflow-y: auto; }

@media (max-width: 599px) {
  .share-lists__header > div:first-child { width: 100%; }
  .share-lists__tools { flex: 1 1 100%; justify-content: flex-end; }
  .share-lists__confirm-actions { flex-direction: column; align-items: stretch; gap: 0.5rem; }
  .share-lists__confirm-actions :deep(.v-spacer) { display: none; }
  .share-lists__confirm-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }
  .share-lists__confirm-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
}
</style>
