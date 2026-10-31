<template>
  <v-card class="device-priority__card" elevation="0" rounded="xl">
    <header class="device-priority__header">
      <div>
        <p class="device-priority__kicker">امنیت حساب</p>
        <h2>نشست‌های واردشده</h2>
      </div>
      <v-btn size="small" variant="tonal" color="primary" :loading="api.loading.value"
        aria-label="تازه‌کردن فهرست دستگاه‌ها" @click="api.refresh()">
        <v-icon icon="mdi-refresh" class="me-1" size="18" />تازه‌سازی
      </v-btn>
    </header>
    <p class="device-priority__hint">فقط نشست‌هایی که هنوز وارد حساب هستند نمایش داده می‌شوند. نشانی IP، محل تقریبی نیست.</p>
    <p v-if="api.loading.value && api.loaded.value" class="device-priority__hint" role="status">
      در حال به‌روزرسانی؛ جزئیات زیر ممکن است کهنه باشند…
    </p>
    <div v-if="api.loading.value && !api.loaded.value" class="device-priority__skeleton" role="status">
      <span>در حال خواندن دستگاه‌ها…</span>
      <v-skeleton-loader type="list-item-two-line@3" aria-hidden="true" />
    </div>
    <ul v-else-if="api.deviceRows.value.length" class="device-priority__list" role="list">
      <li v-for="row in api.deviceRows.value" :key="row.deviceId" class="device-priority__session">
        <v-icon class="device-priority__icon" icon="mdi-devices" size="22" aria-hidden="true" />
        <div class="device-priority__details">
          <div class="device-priority__name-line">
            <strong class="device-priority__name">{{ row.label }}</strong>
            <v-chip v-if="row.isCurrent" size="x-small" color="primary" variant="tonal">همین نشست</v-chip>
          </div>
          <p class="device-priority__meta">
            <span>{{ row.isOnline ? 'متصل' : 'بدون اتصال زنده' }}</span>
            <span>آخرین فعالیت: {{ ageText(row.minutesSinceActive) }}</span>
          </p>
          <p class="device-priority__meta">
            <span>IP: <bdi dir="ltr">{{ row.ip ?? 'ثبت نشده' }}</bdi></span>
          </p>
        </div>
        <v-btn v-if="!row.isCurrent" size="small" variant="tonal" color="error"
          :disabled="api.loading.value || api.failed.value || terminating"
          :aria-label="`پایان نشست ${row.label}`" @click="askTerminate(row)">پایان نشست</v-btn>
      </li>
    </ul>
    <p v-else-if="api.loading.value" class="device-priority__hint" role="status">در حال بازبینی نشست‌ها…</p>
    <p v-else-if="api.failed.value" class="device-priority__hint device-priority__hint--error" role="alert">
      فهرست نشست‌ها تأیید نشد؛ دوباره تلاش کنید.
    </p>
    <p v-else class="device-priority__hint">نشست واردشده‌ای پیدا نشد.</p>
    <p v-if="api.failed.value && api.deviceRows.value.length" class="device-priority__hint device-priority__hint--error" role="alert">
      آخرین خواندن ناموفق بود؛ نشست‌های بالا ممکن است دیگر فعال نباشند. برای پایان نشست، فهرست را تازه کنید.
    </p>
    <p v-if="api.deviceRows.value.some(row => row.isCurrent)" class="device-priority__hint">
      برای پایان همین نشست، از گزینهٔ «خروج» در منوی حساب استفاده کنید.
    </p>
    <p v-if="message" class="device-priority__hint" :class="error ? 'device-priority__hint--error' : ''" role="status" aria-live="polite">{{ message }}</p>

    <v-dialog v-model="confirmOpen" max-width="420" scrollable aria-labelledby="device-termination-title">
      <v-card v-if="pending" rounded="xl">
        <v-card-title id="device-termination-title">پایان این نشست؟</v-card-title>
        <v-card-text class="device-priority__confirm">
          <p>دسترسی <bdi dir="auto">{{ pending.label }}</bdi> بلافاصله قطع می‌شود. اگر این دستگاه موقعیت اشتراکی را پخش می‌کند، ممکن است پخش تا انتخاب یا بازتخصیص دستگاه دیگری متوقف شود.</p>
        </v-card-text>
        <v-card-actions class="device-priority__confirm-actions">
          <v-spacer />
          <v-btn variant="text" :disabled="terminating" @click="confirmOpen = false">بازگشت</v-btn>
          <v-btn color="error" variant="flat" :loading="terminating" @click="terminate">پایان نشست</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { revokeUserDevice } from "@/api/devices";
import { friendlyErrorMessage } from "@/api/error-message";
import { formatDuration } from "@/sharing/share-form";
import type { DeviceSettings } from "@/composables/use-device-settings";
import type { DeviceRow } from "@/settings/priority-device";
import { shareSessionKey } from "@/sharing/share-submission-fence";

const { api } = defineProps<{ api: DeviceSettings }>();
const auth = useAuthStore();
const confirmOpen = ref(false);
const pending = ref<DeviceRow | null>(null);
const terminating = ref(false);
const message = ref<string | null>(null);
const error = ref(false);
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
const session = () => shareSessionKey(auth.user?.id ?? null, auth.accessToken);

watch(session, () => {
  pending.value = null;
  confirmOpen.value = false;
  message.value = null;
}, { flush: "sync" });

function ageText(minutes: number): string {
  return minutes <= 0 ? "همین الان" : `${formatDuration(minutes)} پیش`;
}

function askTerminate(row: DeviceRow): void {
  if (row.isCurrent || api.failed.value || api.loading.value || terminating.value) return;
  pending.value = row;
  message.value = null;
  confirmOpen.value = true;
}

async function terminate(): Promise<void> {
  const target = pending.value;
  if (!target || target.isCurrent || terminating.value || api.failed.value || api.loading.value) return;
  const identity = session();
  terminating.value = true;
  try {
    await auth.ensureSession();
    if (!identity || identity !== session() || disposed) return;
    const token = auth.accessToken;
    const device = api.devices.value.find(row => row.deviceId === target.deviceId);
    if (!token || !device || device.isCurrentDevice) {
      confirmOpen.value = false;
      pending.value = null;
      message.value = "این نشست دیگر در فهرست نیست؛ فهرست را تازه کنید.";
      error.value = true;
      await api.refresh();
      return;
    }
    await revokeUserDevice(device.id, token);
    if (identity !== session() || disposed) return;
    confirmOpen.value = false;
    pending.value = null;
    message.value = "نشست پایان یافت. وضعیت دستگاه پخش‌کننده را در اشتراک‌های موقعیت بررسی کنید.";
    error.value = false;
    await api.refresh();
  } catch (cause) {
    if (identity !== session() || disposed) return;
    message.value = friendlyErrorMessage(cause, "پایان نشست انجام نشد؛ دوباره تلاش کنید.");
    error.value = true;
    confirmOpen.value = false;
    await api.refresh();
  } finally {
    terminating.value = false;
  }
}
</script>

<style scoped>
.device-priority__card {
  border: 1px solid rgba(25, 53, 54, 0.08);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--bb-shadow-surface) !important;
  padding-bottom: 0.5rem;
}
.device-priority__header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem 1.2rem 0.35rem; }
.device-priority__kicker { margin: 0; color: #536d6c; font-size: 0.82rem; font-weight: 700; }
.device-priority__header h2 { margin: 0.1rem 0 0; color: #193536; font-size: 1.08rem; font-weight: 800; }
.device-priority__hint { margin: 0; padding: 0.4rem 1.2rem; color: #536d6c; font-size: 0.82rem; line-height: 1.7; }
.device-priority__hint--error { color: #b3261e; }
.device-priority__skeleton { padding: 0.5rem 1.2rem; color: #536d6c; font-size: 0.82rem; }
.device-priority__list { display: grid; gap: 0.5rem; list-style: none; padding: 0.5rem 1.2rem; margin: 0; }
.device-priority__session { display: flex; align-items: center; gap: 0.85rem; padding: 0.8rem;
  border: 1px solid rgba(25, 53, 54, 0.1); border-radius: var(--bb-radius-nested, 16px); }
.device-priority__icon { flex: none; color: #536d6c; }
.device-priority__details { min-width: 0; flex: 1 1 auto; }
.device-priority__name-line { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
.device-priority__name { color: #193536; font-size: 0.93rem; overflow-wrap: anywhere; }
.device-priority__meta { margin: 0.2rem 0 0; display: flex; flex-wrap: wrap; gap: 0.2rem 0.8rem;
  color: #536d6c; font-size: 0.82rem; line-height: 1.5; }
.device-priority__meta bdi { overflow-wrap: anywhere; }
.device-priority__session > .v-btn { flex: none; min-height: 44px; }
.device-priority__confirm p { margin: 0 0 0.5rem; line-height: 1.7; overflow-wrap: anywhere; }
:global(:root.dark .device-priority__card) { border-color: rgba(226, 240, 238, 0.12); background: rgb(27, 41, 42); }
:global(:root.dark .device-priority__header h2), :global(:root.dark .device-priority__name) { color: #edf5f2; }
:global(:root.dark .device-priority__kicker), :global(:root.dark .device-priority__hint),
:global(:root.dark .device-priority__meta), :global(:root.dark .device-priority__icon),
:global(:root.dark .device-priority__skeleton) { color: #a0b6b2; }
:global(:root.dark .device-priority__hint--error) { color: #ffb4ab; }
:global(:root.dark .device-priority__session) { border-color: rgba(226, 240, 238, 0.14); }
@media (max-width: 599px) {
  .device-priority__header, .device-priority__hint, .device-priority__skeleton { padding-inline: 0.85rem; }
  .device-priority__list { padding-inline: 0.85rem; }
  .device-priority__session { flex-wrap: wrap; }
  .device-priority__meta bdi { overflow-wrap: anywhere; }
.device-priority__session > .v-btn { margin-inline-start: auto; }
  .device-priority__confirm-actions { flex-direction: column; align-items: stretch; gap: 0.5rem; }
  .device-priority__confirm-actions :deep(.v-spacer) { display: none; }
  .device-priority__confirm-actions :deep(.v-btn) { width: 100%; min-height: 44px; margin: 0; }
}
</style>
