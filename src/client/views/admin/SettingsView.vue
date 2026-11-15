<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { VAlert, VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import AdminInlineError from '@/components/AdminInlineError.vue';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';

/** System settings and the read-only health snapshot. */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const values = ref<Record<string, string>>({});
const formError = ref<string | null>(null);
const settings = computed(() => admin.settings);

/** The settings the server accepts as `'0'` or `'1'`. */
const BOOLEAN_KEYS = ['sos_auto_dispatch', 'mission_ready_required', 'maintenance_mode'];

/** How each setting is described in the form, so a raw key is not the only label. */
const LABELS: Record<string, string> = {
  sos_auto_dispatch: 'اعزام خودکار',
  default_dispatch_radius_m: 'شعاع اعزام (متر)',
  mission_ready_required: 'الزام آماده‌باش برای مأموریت',
  maintenance_mode: 'حالت نگهداری'
};

/**
 * Checks the edited values against the rules the server applies.
 *
 * The payload is validated as a whole, so a single malformed row rejects the entire save with a
 * bare "Invalid request." and no indication of which setting is wrong. Every key is sent, including
 * ones the administrator did not touch, so this names the offending key in place.
 *
 * @returns The message to show, or null when the values would be accepted.
 */
function settingsIssue(): string | null {
  for (const [key, rawValue] of Object.entries(values.value)) {
    const value = String(rawValue ?? '').trim();
    if (BOOLEAN_KEYS.includes(key) && value !== '0' && value !== '1') {
      return `${LABELS[key] ?? key} باید ۰ یا ۱ باشد.`;
    }
    if (key === 'default_dispatch_radius_m' && !/^\d{2,6}$/.test(value)) {
      return `${LABELS[key] ?? key} باید عددی میان ۱۰ و ۹۹۹۹۹۹ متر باشد.`;
    }
  }
  return null;
}
const health = computed(() => admin.health ?? {});

watch(
  () => admin.settings,
  (rows) => {
    values.value = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  },
  { immediate: true, deep: true }
);

async function save(): Promise<void> {
  formError.value = null;
  const issue = settingsIssue();
  if (issue) {
    formError.value = issue;
    return;
  }
  try {
    await admin.saveSettings(values.value);
    toast.push('تنظیمات ذخیره شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

async function reload(): Promise<void> {
  await Promise.all([admin.loadSettings(), admin.loadHealth()]);
}

onMounted(() => void reload());
</script>

<template>
  <section class="admin-page" data-testid="admin-settings">
    <article class="panel">
      <header class="panel__head"><h2>تنظیمات سامانه</h2></header>
      <form class="stack-form" @submit.prevent="save">
        <div v-if="admin.loading && !settings.length" class="skeleton-stack" role="status" data-testid="settings-loading" aria-label="در حال بارگذاری تنظیمات">
          <div v-for="row in 4" :key="row" class="skeleton-stack__row">
            <span class="skeleton skeleton--bar skeleton--bar-sm" />
            <span class="skeleton skeleton--bar skeleton--bar-wide" />
          </div>
        </div>
        <template v-if="!(admin.loading && !settings.length)">
          <label v-for="row in settings" :key="row.key" class="settings-row">
            <span>{{ LABELS[row.key] ?? row.key }}</span>
            <VTextField
              v-model="values[row.key]"
              density="compact"
              hide-details
              :placeholder="BOOLEAN_KEYS.includes(row.key) ? '۰ یا ۱' : 'مثال: ۵۰۰۰'"
            />
          </label>
        </template>
        <VAlert v-if="formError" type="error" variant="tonal" density="compact">{{ formError }}</VAlert>
        <VBtn type="submit" color="primary" :disabled="admin.loading && !settings.length">ذخیره</VBtn>
      </form>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>سلامت سیستم</h2></header>
      <div v-if="admin.loading && !admin.health" class="skeleton-stack" role="status" data-testid="health-loading" aria-label="در حال بارگذاری سلامت سیستم">
        <div v-for="row in 3" :key="row" class="skeleton-stack__row">
          <span class="skeleton skeleton--avatar" />
          <span class="skeleton skeleton--bar skeleton--bar-wide" />
        </div>
      </div>
      <ul v-else class="admin-list">
        <li><span class="mdi mdi-database" aria-hidden="true" /><div><strong>کاربران</strong><small>{{ format.number(Number((health.database as any)?.users ?? 0)) }}</small></div></li>
        <li><span class="mdi mdi-lan-connect" aria-hidden="true" /><div><strong>اتصال‌های زنده</strong><small>{{ format.number(Number((health.realtime as any)?.connections ?? 0)) }}</small></div></li>
        <li><span class="mdi mdi-clock-outline" aria-hidden="true" /><div><strong>زمان سرور</strong><small>{{ health.serverTime ? format.dateTime(Number(health.serverTime)) : '—' }}</small></div></li>
      </ul>
    </article>
    <AdminInlineError testid="settings" :retry="reload" />
  </section>
</template>
