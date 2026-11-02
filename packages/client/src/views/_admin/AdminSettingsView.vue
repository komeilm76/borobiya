<template>
  <AdminShell
    active="settings"
    title="تنظیمات عملیاتی"
    description="تنظیماتی که سرویس امداد واقعاً می‌خواند؛ هر تغییر در دفتر رویدادها با نام مدیر ثبت می‌شود."
    :crumbs="['سامانه', 'تنظیمات']"
  >
    <template #actions>
      <v-btn variant="tonal" color="primary" rounded="lg" :loading="loading" @click="loadAll">
        <v-icon class="ms-2" icon="mdi-refresh" size="17" />
        بازخوانی مقادیر
      </v-btn>
    </template>

    <AdminStatePanel v-if="state === 'loading'" state="loading" title="در حال خواندن تنظیمات…" />
    <AdminStatePanel
      v-else-if="state === 'forbidden'"
      state="forbidden"
      title="دسترسی به تنظیمات برای نقش شما مجاز نیست"
      description="تغییر آستانه‌های امداد فقط برای مدیران سامانه مجاز است."
    />
    <AdminStatePanel
      v-else-if="state === 'error'"
      state="error"
      title="خواندن تنظیمات ناموفق بود"
      :description="errorMessage"
      :reference="errorReference"
      action-label="تلاش دوباره"
      action-icon="mdi-refresh"
      @retry="loadAll"
    />

    <template v-else>
      <v-card class="settings-card" elevation="0" rounded="xl">
        <header class="settings-card__head">
          <div>
            <h2>آستانه‌های هشدار لغو</h2>
            <p>سرویس لغو مأموریت این دو مقدار را هنگام هر لغو امدادگر می‌خواند.</p>
          </div>
          <v-chip size="small" variant="tonal" color="primary" rounded="lg">
            {{ toFa(settings.size) }} تنظیم فعال
          </v-chip>
        </header>

        <div v-for="row in rows" :key="row.key" class="settings-row">
          <div class="settings-row__text">
            <h3>{{ row.label }}</h3>
            <p>{{ row.description }}</p>
            <small v-if="row.updatedAt">آخرین تغییر: {{ dateOf(row.updatedAt) }} — {{ row.updatedBy ?? "نامشخص" }}</small>
            <small v-else>هنوز تغییری ثبت نشده؛ مقدار پیش‌فرض سامانه اعمال است.</small>
          </div>

          <div class="settings-row__control">
            <template v-if="row.kind === 'number'">
              <v-text-field
                v-model.number="numberDrafts[row.key]"
                class="settings-row__number"
                type="number"
                :min="row.min"
                :max="row.max"
                :suffix="row.suffix"
                variant="outlined"
                density="comfortable"
                hide-details
                dir="ltr"
              />
              <v-btn
                variant="tonal"
                color="primary"
                rounded="lg"
                :disabled="!isNumberDirty(row.key)"
                :loading="savingKey === row.key"
                @click="saveNumber(row.key)"
              >
                ذخیره
              </v-btn>
            </template>

            <template v-else>
              <v-switch
                :model-value="settings.get(row.key) === true"
                color="primary"
                hide-details
                inset
                :label="settings.get(row.key) === true ? 'فعال' : 'خاموش'"
                :loading="savingKey === row.key"
                :disabled="savingKey !== null"
                @update:model-value="saveBoolean(row.key, $event)"
              />
            </template>
          </div>
        </div>

        <footer class="settings-card__foot">
          <v-icon icon="mdi-shield-check-outline" size="17" />
          <span>مقادیر خارج از بازهٔ مجاز پیش از ذخیره‌شدن رد می‌شوند و رفتار قبلی سامانه دست‌نخورده می‌ماند.</span>
        </footer>
      </v-card>

      <section class="settings-status" aria-label="وضعیت جاری سامانه">
        <header class="settings-status__head">
          <h2>وضعیت جاری</h2>
          <RouterLink class="settings-status__link" to="/_admin/reports">
            تحلیل کامل در گزارش‌ها
            <v-icon icon="mdi-chevron-left" size="16" />
          </RouterLink>
        </header>

        <div class="settings-status__grid">
          <article v-for="tile in statusTiles" :key="tile.label" class="settings-status__tile">
            <p>{{ tile.label }}</p>
            <strong>{{ toFa(tile.value) }}</strong>
            <small>{{ tile.meta }}</small>
          </article>
        </div>
      </section>

      <AdminStatePanel
        v-if="statsState === 'error'"
        state="error"
        title="خواندن آمار جاری ناموفق بود"
        description="تنظیمات قابل ویرایش است؛ فقط این بخش نیاز به بازخوانی دارد."
        action-label="تلاش دوباره"
        action-icon="mdi-refresh"
        @retry="loadStats"
      />
    </template>

    <v-snackbar v-model="snackbar" :timeout="3600" location="bottom">
      {{ snackbarText }}
    </v-snackbar>
  </AdminShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import type { AdminSetting, AdminSettingKey, AdminSettingValue } from "@shared/index";
import { getAdminSettings, getAdminStats, updateAdminSetting, type AdminStats } from "../../api/admin-governance";
import { friendlyErrorMessage } from "../../api/error-message";
import { ApiError } from "../../api/http";
import AdminShell from "../../components/admin/AdminShell.vue";
import AdminStatePanel from "../../components/admin/AdminStatePanel.vue";
import { useAuthStore } from "../../stores/auth";
import { adminSessionToken } from "../../admin/admin-token";

/**
 * A settings page is only honest if the server reads what it shows. These two keys are consumed by
 * `sos-cancellation-store`; the copy for each row names the behaviour instead of restating the key.
 */
interface SettingRow {
  key: AdminSettingKey;
  label: string;
  description: string;
  kind: "number" | "boolean";
  min?: number;
  max?: number;
  suffix?: string;
}

const ROWS: SettingRow[] = [
  {
    key: "alerts.cancellation_daily_threshold",
    label: "آستانهٔ لغو روزانهٔ امدادگر",
    description:
      "اگر تعداد لغوهای یک امدادگر در یک روز از این عدد بیشتر شود، برای مدیر هشدار بررسی ثبت می‌شود.",
    kind: "number",
    min: 0,
    max: 50,
    suffix: "لغو"
  },
  {
    key: "alerts.other_reason_notify",
    label: "هشدار برای دلیل «سایر»",
    description: "وقتی امدادگر دلیل «سایر» را انتخاب می‌کند، حتی برای اولین بار هشدار تأیید ثبت شود.",
    kind: "boolean"
  }
];

const auth = useAuthStore();
const settings = ref<Map<AdminSettingKey, AdminSettingValue>>(new Map());
const settingsMeta = reactive<Record<string, AdminSetting | undefined>>({});
const numberDrafts = reactive<Record<string, number>>({});
const loading = ref(true);
const error = ref<unknown>(null);
const forbidden = ref(false);
const savingKey = ref<AdminSettingKey | null>(null);
const snackbar = ref(false);
const snackbarText = ref("");
const stats = ref<AdminStats | null>(null);
const statsState = ref<"loading" | "ready" | "error">("loading");

const numberFormatter = new Intl.NumberFormat("fa-IR");
const dateFormatter = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

let controller: AbortController | null = null;

const state = computed(() => {
  if (loading.value) return "loading" as const;
  if (forbidden.value) return "forbidden" as const;
  if (error.value) return "error" as const;
  return "ready" as const;
});

const errorMessage = computed(() => (error.value ? friendlyErrorMessage(error.value, "لطفاً دوباره تلاش کنید.") : ""));
const errorReference = computed(() => (error.value instanceof ApiError ? error.value.code : ""));

const rows = computed(() =>
  ROWS.map((row) => ({
    ...row,
    updatedAt: settingsMeta[row.key]?.updatedAt ?? null,
    updatedBy: settingsMeta[row.key]?.updatedByUsername ?? null
  }))
);

const statusTiles = computed(() => {
  const counts = stats.value?.counts ?? {};
  const sum = Object.values(counts).reduce((total, value) => total + value, 0);
  return [
    { label: "در انتظار اعزام", value: counts.pending ?? 0, meta: "ثبت‌شده و بدون امدادگر" },
    { label: "در حال اعزام", value: counts.dispatched ?? 0, meta: "امدادگر انتخاب شده" },
    { label: "در حال امداد", value: counts.accepted ?? 0, meta: "پذیرفته‌شده توسط امدادگر" },
    { label: "پایان‌یافته", value: counts.completed ?? 0, meta: "از مجموع کل درخواست‌ها" },
    { label: "مأموریت‌های فعال", value: stats.value?.activeMissions ?? 0, meta: "در جریان یا در انتظار" },
    { label: "کاربران آنلاین", value: stats.value?.onlineUsers ?? 0, meta: `از ${toFa(sum)} درخواست ثبت‌شده` }
  ];
});

function toFa(value: number): string {
  return numberFormatter.format(value);
}

function dateOf(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function isNumberDirty(key: AdminSettingKey): boolean {
  const draft = numberDrafts[key];
  return typeof draft === "number" && draft !== settings.value.get(key);
}

function applySettings(items: AdminSetting[]): void {
  const map = new Map<AdminSettingKey, AdminSettingValue>();
  for (const item of items) {
    map.set(item.key, item.value);
    settingsMeta[item.key] = item;
    if (item.key === "alerts.cancellation_daily_threshold" && typeof item.value === "number") {
      numberDrafts[item.key] = item.value;
    }
  }
  settings.value = map;
}

async function loadSettings(accessToken: string, signal: AbortSignal): Promise<void> {
  applySettings(await getAdminSettings(accessToken, signal));
}

async function loadStats(): Promise<void> {
  const accessToken = await adminSessionToken(auth);
  if (!accessToken) {
    statsState.value = "error";
    return;
  }
  statsState.value = "loading";
  try {
    stats.value = await getAdminStats(accessToken);
    statsState.value = "ready";
  } catch {
    // The counters are supplementary: a failure here must not blank out editable settings.
    statsState.value = "error";
  }
}

async function loadAll(): Promise<void> {
  try {
    await auth.ensureSession();
  } catch {
    /* the token branch below reports it */
  }
  const accessToken = auth.accessToken;
  if (!accessToken) {
    loading.value = false;
    forbidden.value = true;
    return;
  }

  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = null;
  forbidden.value = false;

  try {
    await loadSettings(accessToken, controller.signal);
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return;
    if (caught instanceof ApiError && caught.status === 403) forbidden.value = true;
    else error.value = caught;
  } finally {
    loading.value = false;
  }

  if (state.value === "ready") void loadStats();
}

async function persist(key: AdminSettingKey, value: AdminSettingValue): Promise<boolean> {
  // Re-read the session on every write: the settings page is usually the last screen left open overnight.
  const accessToken = await adminSessionToken(auth);
  if (!accessToken) {
    snackbarText.value = "نشست مدیر منقضی شده است؛ دوباره وارد شوید.";
    snackbar.value = true;
    return false;
  }
  savingKey.value = key;
  try {
    // The server answers with the row it stored, so the page shows the authoritative value and author
    // rather than echoing what the form submitted.
    const updated = await updateAdminSetting(accessToken, key, value);
    settings.value = new Map(settings.value).set(key, updated.value);
    settingsMeta[key] = updated;
    snackbarText.value = "تنظیمات ذخیره شد و از همین لحظه در سرویس امداد اعمال می‌شود.";
    snackbar.value = true;
    return true;
  } catch (caught) {
    snackbarText.value = friendlyErrorMessage(caught, "ذخیرهٔ تنظیمات ناموفق بود.");
    snackbar.value = true;
    return false;
  } finally {
    savingKey.value = null;
  }
}

async function saveNumber(key: AdminSettingKey): Promise<void> {
  const draft = numberDrafts[key];
  if (typeof draft !== "number" || !Number.isInteger(draft)) {
    snackbarText.value = "مقدار باید یک عدد صحیح باشد.";
    snackbar.value = true;
    return;
  }
  const saved = await persist(key, draft);
  if (!saved) {
    const current = settings.value.get(key);
    if (typeof current === "number") numberDrafts[key] = current;
  }
}

async function saveBoolean(key: AdminSettingKey, next: boolean | null): Promise<void> {
  if (next === null) return;
  const previous = settings.value.get(key) === true;
  // Optimistic: a switch that waits for a round trip feels broken; a failed write flips it back.
  settings.value = new Map(settings.value).set(key, next);
  const saved = await persist(key, next);
  if (!saved) settings.value = new Map(settings.value).set(key, previous);
}

onMounted(() => {
  void loadAll();
});

onBeforeUnmount(() => {
  controller?.abort();
});
</script>

<style scoped>
.settings-card {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding: 20px 22px 0;
  margin-block-end: 18px;
}

.settings-card__head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding-block-end: 14px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.settings-card__head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.settings-card__head p {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.85rem;
}

.settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding-block: 16px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.settings-row__text h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.settings-row__text p {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.84rem;
  max-inline-size: 58ch;
}

.settings-row__text small {
  display: block;
  margin-block-start: 6px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8rem;
}

.settings-row__control {
  display: flex;
  gap: 10px;
  align-items: center;
}

.settings-row__number {
  inline-size: 132px;
}

.settings-card__foot {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-block: 14px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.settings-status__head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-block-end: 12px;
}

.settings-status__head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.settings-status__link {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: rgb(var(--v-theme-primary));
  font-size: 0.85rem;
  text-decoration: none;
}

.settings-status__link:hover {
  text-decoration: underline;
}

.settings-status__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-block-end: 16px;
}

.settings-status__tile {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  padding: 14px 16px;
  background: rgb(var(--v-theme-surface));
}

.settings-status__tile p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.82rem;
}

.settings-status__tile strong {
  display: block;
  margin-block-start: 4px;
  font-size: 1.45rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.settings-status__tile small {
  display: block;
  margin-block-start: 4px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.8rem;
}

@media (max-width: 720px) {
  .settings-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-row__control :deep(.v-btn) {
    min-block-size: 44px;
  }
}
</style>
