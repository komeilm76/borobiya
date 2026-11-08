<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';

/** System settings and the read-only health snapshot. */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const values = ref<Record<string, string>>({});
const settings = computed(() => admin.settings);
const health = computed(() => admin.health ?? {});

watch(
  () => admin.settings,
  (rows) => {
    values.value = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  },
  { immediate: true, deep: true }
);

async function save(): Promise<void> {
  try {
    await admin.saveSettings(values.value);
    toast.push('تنظیمات ذخیره شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

onMounted(async () => {
  await Promise.all([admin.loadSettings(), admin.loadHealth()]);
});
</script>

<template>
  <section class="admin-page" data-testid="admin-settings">
    <article class="panel">
      <header class="panel__head"><h2>تنظیمات سامانه</h2></header>
      <form class="stack-form" @submit.prevent="save">
        <label v-for="row in settings" :key="row.key" class="settings-row">
          <span>{{ row.key }}</span>
          <VTextField v-model="values[row.key]" density="compact" hide-details />
        </label>
        <VBtn type="submit" color="primary">ذخیره</VBtn>
      </form>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>سلامت سیستم</h2></header>
      <ul class="admin-list">
        <li><span class="mdi mdi-database" aria-hidden="true" /><div><strong>کاربران</strong><small>{{ format.number(Number((health.database as any)?.users ?? 0)) }}</small></div></li>
        <li><span class="mdi mdi-lan-connect" aria-hidden="true" /><div><strong>اتصال‌های زنده</strong><small>{{ format.number(Number((health.realtime as any)?.connections ?? 0)) }}</small></div></li>
        <li><span class="mdi mdi-memory" aria-hidden="true" /><div><strong>نسخه داده</strong><small>{{ String(health.dataVersion ?? '—') }}</small></div></li>
      </ul>
    </article>
  </section>
</template>
