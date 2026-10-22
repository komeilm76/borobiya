<template>
  <v-card class="share-lists" elevation="0" rounded="xl">
    <div class="share-lists__header">
      <div>
        <p class="share-lists__kicker">حریم خصوصی</p>
        <h2>اشتراک‌های موقعیت</h2>
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

    <v-alert v-if="loadError" class="mt-3" type="error" variant="tonal" density="compact">
      {{ loadError }}
    </v-alert>

    <v-skeleton-loader v-if="loading && !loaded" type="list-item@3" class="mt-2" />

    <template v-else>
      <p v-if="pendingRevocation" class="share-lists__pending" role="status">
        در حال لغو…
      </p>

      <section class="share-lists__section" aria-labelledby="share-lists-owned-title">
        <h3 id="share-lists-owned-title">
          اشتراک‌های من
          <v-chip size="x-small" variant="tonal">{{ ownedRows.length }}</v-chip>
        </h3>
        <p v-if="ownedRows.length === 0" class="share-lists__empty">
          هیچ‌کس موقعیت زندهٔ شما را نمی‌بیند.
        </p>
        <ul v-else class="share-lists__rows">
          <li v-for="row in ownedRows" :key="row.id" class="share-lists__row">
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
              :aria-label="`لغو اشتراک با ${row.label}`"
              @click="askRevoke(row)"
            >
              لغو
            </v-btn>
          </li>
        </ul>
      </section>

      <section class="share-lists__section" aria-labelledby="share-lists-received-title">
        <h3 id="share-lists-received-title">
          با من به اشتراک گذاشته‌اند
          <v-chip size="x-small" variant="tonal">{{ receivedRows.length }}</v-chip>
        </h3>
        <p v-if="receivedRows.length === 0" class="share-lists__empty">
          اشتراک فعالی برای شما باز نیست.
        </p>
        <ul v-else class="share-lists__rows">
          <li v-for="row in receivedRows" :key="row.id" class="share-lists__row">
            <v-icon icon="mdi-account-eye-outline" size="20" />
            <div class="share-lists__row-main">
              <p class="share-lists__row-title">
                <bdi dir="ltr">{{ row.label }}</bdi>
                <span class="share-lists__row-state">{{ stateText(row.kind) }}</span>
              </p>
              <p class="share-lists__row-sub">{{ receivedDetail(row).join(" • ") }}</p>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="historyRows.length > 0" class="share-lists__section" aria-labelledby="share-lists-history-title">
        <h3 id="share-lists-history-title">
          بازه‌های تاریخچه
          <v-chip size="x-small" variant="tonal">{{ historyRows.length }}</v-chip>
        </h3>
        <ul class="share-lists__rows">
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
              :aria-label="`حذف دسترسی ${row.label} به این بازه`"
              @click="askRevokeHistory(row)"
            >
              حذف
            </v-btn>
          </li>
        </ul>
      </section>
    </template>

    <v-dialog v-model="confirmOpen" max-width="420">
      <v-card rounded="xl" v-if="pendingRow">
        <v-card-title>لغو این اشتراک؟</v-card-title>
        <v-card-text>
          <p class="share-lists__confirm">
            <bdi dir="ltr">{{ pendingRow.label }}</bdi> از این پس موقعیت زندهٔ شما را نخواهد دید.
            تاریخچهٔ بازه‌های قبلی پاک نمی‌شود.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="revoking" @click="confirmOpen = false">بازگشت</v-btn>
          <v-btn color="error" variant="flat" :loading="revoking" @click="confirmRevoke">
            لغو اشتراک
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  LocationHistoryShare,
  LocationShare,
  OwnedLocationShare,
  OwnedLocationHistoryShare,
  ReceivedLocationHistoryShare,
  ReceivedLocationShare
} from "@shared/index";
import { friendlyErrorMessage } from "@/api/error-message";
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

/**
 * "My Shares" / "Shared With Me" (spec §7.2, tracker T2.1.7), plus the history grants that share
 * the same privacy question. The rows come from `describeLiveShareRow` / `describeHistoryShareRow`
 * so the expiry arithmetic is the tested one, and the tick on every refresh is a real request:
 * a share can be revoked from another device at any moment.
 */
const emit = defineEmits<{ (event: "create"): void }>();

interface LiveRowView {
  id: string;
  label: string;
  kind: ShareRowKind;
  remainingMinutes: number | null;
  note: string | null;
  history: false;
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

const loading = ref(false);
const loaded = ref(false);
const loadError = ref<string | null>(null);
const owned = ref<OwnedLocationShare[]>([]);
const received = ref<ReceivedLocationShare[]>([]);
const ownedHistory = ref<OwnedLocationHistoryShare[]>([]);
const receivedHistory = ref<ReceivedLocationHistoryShare[]>([]);
const pendingRow = ref<LiveRowView | HistoryRowView | null>(null);
const confirmOpen = ref(false);
const revoking = ref(false);
const pendingRevocation = ref<string | null>(null);

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

const ownedRows = computed<LiveRowView[]>(() => {
  const now = new Date(nowMs.value);
  return owned.value.map((share) => {
    const described = describeLiveShareRow(share, now);
    return {
      ...described,
            // The server names the target; `names` is the fallback for the row its left join could not name.
      label: shareRowLabel(share.targetUserId, names.value, share.targetUsername),
      history: false
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

async function refresh(): Promise<void> {
  const token = auth.accessToken;
  if (!token) return;
  loading.value = true;
  loadError.value = null;
  // Re-read the clock with the data, so a manual refresh never shows a countdown measured against the
  // last tick (up to 30 s stale).
  nowMs.value = Date.now();
  try {
    // Both lists in parallel, but a failure of the history call must not blank the live one — the
    // privacy question ("who can see me right now") is the answer the user came here for.
    const [live, history] = await Promise.allSettled([listLocationShares(token), listLocationHistoryShares(token)]);
    if (live.status === "fulfilled") {
      owned.value = live.value.owned;
      received.value = live.value.sharedWithMe;
    }
    if (history.status === "fulfilled") {
      ownedHistory.value = history.value.owned;
      receivedHistory.value = history.value.sharedWithMe;
    }
    if (live.status === "rejected") throw live.reason;
    loaded.value = true;
  } catch (error) {
    loadError.value = friendlyErrorMessage(error, "فهرست اشتراک‌ها را نشد دید.");
  } finally {
    loading.value = false;
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

function askRevoke(row: LiveRowView): void {
  pendingRow.value = row;
  confirmOpen.value = true;
}

function askRevokeHistory(row: HistoryRowView): void {
  pendingRow.value = row;
  confirmOpen.value = true;
}

async function confirmRevoke(): Promise<void> {
  const row = pendingRow.value;
  const token = auth.accessToken;
  if (!row || !token) return;

  revoking.value = true;
  pendingRevocation.value = row.id;
  try {
    if (row.history) await revokeLocationHistoryShare(row.id, token);
    else await revokeLocationShare(row.id, token);
    confirmOpen.value = false;
    pendingRow.value = null;
    await refresh();
  } catch (error) {
    loadError.value = friendlyErrorMessage(error, "لغو اشتراک انجام نشد.");
    confirmOpen.value = false;
  } finally {
    revoking.value = false;
    pendingRevocation.value = null;
  }
}

onMounted(refresh);

defineExpose({ refresh });
</script>

<style scoped>
.share-lists {
  padding: clamp(1rem, 2.5vw, 1.5rem);
}

.share-lists__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.share-lists__kicker {
  margin: 0;
  color: #537879;
  font-size: 0.78rem;
  font-weight: 800;
}

.share-lists__header h2 {
  margin: 0.3rem 0 0;
  color: #173b3c;
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
  color: #23504f;
  font-size: 0.9rem;
  font-weight: 800;
}

.share-lists__empty {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.84rem;
}

.share-lists__pending {
  margin: 0.5rem 0 0;
  color: #537879;
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
  border-radius: 14px;
}

.share-lists__row-main {
  min-width: 0;
  flex: 1;
}

.share-lists__row-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  color: #173b3c;
  font-size: 0.88rem;
  font-weight: 700;
}

.share-lists__row-state {
  color: #537879;
  font-size: 0.72rem;
  font-weight: 600;
}

.share-lists__row-sub {
  margin: 0.15rem 0 0;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.78rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.share-lists__confirm {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.8;
}
</style>
