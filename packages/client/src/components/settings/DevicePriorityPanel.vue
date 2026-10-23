<template>
  <div class="device-priority">
    <v-card class="device-priority__card" elevation="0" rounded="xl">
      <header class="device-priority__header">
        <div>
          <p class="device-priority__kicker">نشست‌های فعال همین حساب</p>
          <h2>دستگاه‌ها</h2>
        </div>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          :loading="api.loading.value"
          aria-label="تازه‌کردن فهرست دستگاه‌ها"
          @click="api.refresh()"
        >
          تازه‌سازی
        </v-btn>
      </header>

      <v-table v-if="api.deviceRows.value.length" class="device-priority__table">
        <thead>
          <tr>
            <th scope="col">دستگاه</th>
            <th scope="col">وضعیت</th>
            <th scope="col">آخرین فعالیت</th>
            <th scope="col">IP</th>
            <th scope="col">پخش‌کنندهٔ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in api.deviceRows.value" :key="row.deviceId">
            <td>
              <span class="device-priority__device-name">{{ row.label }}</span>
              <span v-if="row.isCurrent" class="device-priority__badge">همین دستگاه</span>
            </td>
            <td>
              <v-chip size="x-small" :color="row.isOnline ? 'success' : 'grey'" variant="tonal">
                {{ row.isOnline ? "آنلاین" : "آفلاین" }}
              </v-chip>
            </td>
            <td>{{ ageText(row.minutesSinceActive) }}</td>
            <td>{{ row.ip ?? "—" }}</td>
            <td>
              <span v-if="row.pinnedShareCount">{{ pluralShares(row.pinnedShareCount) }}</span>
              <span v-else class="device-priority__muted">—</span>
            </td>
          </tr>
        </tbody>
      </v-table>

      <p v-else-if="api.loading.value" class="device-priority__muted" role="status">در حال خواندن دستگاه‌ها…</p>
      <p v-else class="device-priority__hint">
        این فهرست فقط نشست‌هایی را نشان می‌دهد که هنوز توکن تازه‌کردن دارند؛ دستگاهی که از آن خارج شده‌اید
        در اینجا نیامده است.
      </p>
      <p v-if="!api.hasMultipleDevices.value && api.deviceRows.value.length === 1" class="device-priority__hint">
        با یک دستگاهِ فعال، انتخابی لازم نیست: هر اشتراک تازه به همین دستگاه وصل می‌شود.
      </p>
      <p v-if="api.failed.value" class="device-priority__hint device-priority__hint--error">
        آخرین خواندن ناموفق بود؛ مقادیر بالا ممکن است کهنه باشند.
      </p>
    </v-card>

    <v-card class="device-priority__card" elevation="0" rounded="xl">
      <header class="device-priority__header">
        <div>
          <p class="device-priority__kicker">کدام دستگاه موقعیت بفرستد</p>
          <h2>دستگاه پخش‌کنندهٔ هر اشتراک</h2>
        </div>
        <v-btn
          v-if="api.hasMultipleDevices.value && api.shareRows.value.length"
          size="small"
          variant="flat"
          color="primary"
          :loading="api.bulkRunning.value"
          @click="applyToAll"
        >
          اعمال این دستگاه برای همه
        </v-btn>
      </header>

      <div v-if="api.shareRows.value.length" class="device-priority__shares">
        <div v-for="entry in api.shareRows.value" :key="entry.share.id" class="device-priority__share">
          <div class="device-priority__share-head">
            <v-icon icon="mdi-crosshairs-gps" size="18" />
            <span class="device-priority__share-name">{{ shareLabel(entry.share) }}</span>
            <v-chip size="x-small" variant="tonal" :color="chipColor(entry.row.kind)">
              {{ stateLabel(entry.row.kind, entry.row.remainingMinutes) }}
            </v-chip>
          </div>
          <div class="device-priority__share-body">
            <v-select
              v-model="drafts[entry.share.id]"
              :items="api.choicesFor(entry.share)"
              item-title="label"
              item-value="value"
              :disabled="entry.row.kind === 'expired' || busy(entry.share.id)"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :label="`دستگاه پخش‌کننده`"
            />
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              :loading="busy(entry.share.id)"
              :disabled="!canApply(entry)"
              @click="apply(entry.share.id)"
            >
              اعمال
            </v-btn>
          </div>
          <p class="device-priority__share-now">
            اکنون: {{ pinnedLabel(entry.share) }}
          </p>
        </div>
      </div>
      <p v-else-if="api.loading.value" class="device-priority__muted" role="status">در حال خواندن اشتراک‌ها…</p>
      <p v-else class="device-priority__hint">
        هنوز اشتراک زنده‌ای باز نکرده‌اید؛ دستگاه پخش‌کننده هنگام ساختن اولین اشتراک انتخاب می‌شود.
      </p>

      <p class="device-priority__status" role="status" aria-live="polite" :class="statusClass">
        {{ api.status.value?.text ?? "تغییری انجام نشده است." }}
      </p>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import type { LocationShare } from "@shared/index";
import { formatDuration, shareRowLabel, type ShareRowKind } from "@/sharing/share-form";
import type { DeviceSettings } from "@/composables/use-device-settings";
import { deviceLabelFor } from "@/settings/priority-device";

/**
 * The Active Devices table and the per-share priority chooser (spec §7.3, T2.3.5).
 *
 * A renderer: the ages, the eligibility of a row, the body a click produces and every refusal sentence
 * come from `use-device-settings` and `settings/priority-device.ts`. The one thing decided here is what
 * the drafts hold — a per-share selection that has not been applied yet, kept out of the composable so
 * that a user can look at a different device before committing to it.
 */
const props = defineProps<{
  api: DeviceSettings;
  names?: ReadonlyMap<string, string>;
}>();

const drafts = reactive<Record<string, string>>({});

const statusClass = computed(() =>
  props.api.status.value ? `device-priority__status--${props.api.status.value.tone}` : ""
);

function shareLabel(share: { targetUserId: string; targetUsername?: string | null }): string {
  const names = props.names ?? new Map<string, string>();
  return shareRowLabel(share.targetUserId, names, share.targetUsername);
}

function ageText(minutes: number): string {
  return `${formatDuration(minutes)} پیش`;
}

function pluralShares(count: number): string {
  return `${count.toLocaleString("fa-IR")} اشتراک`;
}

function stateLabel(kind: ShareRowKind, remainingMinutes: number | null): string {
  if (kind === "permanent") return "همیشگی";
  if (kind === "expired") return "منقضی شده";
  return `${formatDuration(remainingMinutes ?? 0)} مانده`;
}

function chipColor(kind: ShareRowKind): string {
  if (kind === "expired") return "grey";
  return kind === "permanent" ? "primary" : "secondary";
}

function pinnedLabel(share: LocationShare): string {
  return deviceLabelFor(props.api.deviceRows.value, share.priorityDeviceId);
}

function busy(shareId: string): boolean {
  return props.api.busyShareId.value === shareId;
}

function canApply(entry: { share: LocationShare; row: { kind: ShareRowKind } }): boolean {
  const chosen = drafts[entry.share.id];
  if (!chosen || entry.row.kind === "expired" || busy(entry.share.id)) return false;
  // The button is disabled when it would do nothing the server has not already done. The composable
  // refuses the same case; a control that is lit for a no-op is a bug the user finds by pressing it.
  return chosen !== entry.share.priorityDeviceId;
}

function apply(shareId: string): void {
  const chosen = drafts[shareId];
  if (!chosen) return;
  void props.api.assign(shareId, chosen);
}

function applyToAll(): void {
  const chosen = props.api.currentDeviceId.value;
  if (!chosen) return;
  void props.api.assignEverywhere(chosen);
}
</script>

<style scoped>
.device-priority {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.device-priority__card {
  border: 1px solid rgba(25, 53, 54, 0.08);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 12px 34px rgba(25, 53, 54, 0.055);
}

.device-priority__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem 1.3rem 0.6rem;
}

.device-priority__kicker {
  margin: 0;
  color: #718584;
  font-size: 0.72rem;
  font-weight: 700;
}

.device-priority__header h2 {
  margin: 0.15rem 0 0;
  color: #193536;
  font-size: 1.05rem;
  font-weight: 800;
}

.device-priority__table {
  padding: 0 0.4rem 0.6rem;
}

.device-priority__table th {
  color: #718584;
  font-size: 0.72rem;
  font-weight: 700;
}

.device-priority__table td {
  font-size: 0.82rem;
}

.device-priority__device-name {
  font-weight: 700;
}

.device-priority__badge {
  margin-inline-start: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(14, 102, 102, 0.12);
  color: #0e6666;
  font-size: 0.66rem;
  font-weight: 700;
}

.device-priority__muted {
  color: #718584;
}

.device-priority__hint {
  margin: 0;
  padding: 0 1.3rem 1rem;
  color: #536d6c;
  font-size: 0.76rem;
  line-height: 1.7;
}

.device-priority__hint--error {
  color: #b3261e;
}

.device-priority__shares {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0 1.3rem 0.6rem;
}

.device-priority__share {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid rgba(25, 53, 54, 0.1);
  border-radius: 0.9rem;
}

.device-priority__share-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.device-priority__share-name {
  font-size: 0.88rem;
  font-weight: 800;
}

.device-priority__share-body {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.device-priority__share-body :deep(.v-select) {
  flex: 1 1 auto;
  min-width: 0;
}

.device-priority__share-body .v-btn {
  flex: 0 0 auto;
  margin-top: 0.35rem;
}

.device-priority__share-now {
  margin: 0;
  color: #718584;
  font-size: 0.72rem;
}

.device-priority__status {
  margin: 0;
  padding: 0.55rem 1.3rem 1rem;
  color: #536d6c;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.7;
}

.device-priority__status--ok {
  color: #1b6f4d;
}

.device-priority__status--error {
  color: #b3261e;
}

:global(:root.dark) .device-priority__card {
  border-color: rgba(226, 240, 238, 0.12);
  background: rgb(27, 41, 42);
}

:global(:root.dark) .device-priority__header h2 {
  color: #edf5f2;
}

:global(:root.dark) .device-priority__kicker,
:global(:root.dark) .device-priority__table th,
:global(:root.dark) .device-priority__muted,
:global(:root.dark) .device-priority__hint,
:global(:root.dark) .device-priority__status,
:global(:root.dark) .device-priority__share-now {
  color: #a0b6b2;
}

:global(:root.dark) .device-priority__hint--error,
:global(:root.dark) .device-priority__status--error {
  color: #ffb4ab;
}

:global(:root.dark) .device-priority__status--ok {
  color: #7fdcb2;
}

:global(:root.dark) .device-priority__share {
  border-color: rgba(226, 240, 238, 0.14);
}

@media (max-width: 600px) {
  .device-priority__header,
  .device-priority__hint,
  .device-priority__status {
    padding-inline: 0.85rem;
  }

  .device-priority__shares {
    padding-inline: 0.85rem;
  }

  .device-priority__share-body {
    flex-wrap: wrap;
  }
}
</style>
