<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';

/** Audit log with a text filter and CSV export. */
const admin = useAdminStore();
const format = useFormatters();
const query = ref('');
const entries = computed(() => admin.audit?.items ?? []);

async function search(): Promise<void> {
  await admin.loadAudit({ q: query.value || undefined, limit: 100 });
}

onMounted(() => void admin.loadAudit());
</script>

<template>
  <section class="admin-page" data-testid="admin-audit">
    <article class="panel">
      <header class="panel__head">
        <h2>رویدادهای سیستم</h2>
        <div class="panel__filters">
          <VTextField v-model="query" density="compact" placeholder="جست‌وجو در رویداد" hide-details @keyup.enter="search" />
          <VBtn size="small" variant="tonal" @click="search">جست‌وجو</VBtn>
          <a class="admin-action" href="/_admin/audit.csv" download>CSV</a>
        </div>
      </header>
      <table class="admin-table">
        <thead><tr><th>زمان</th><th>عامل</th><th>کنش</th><th>هدف</th></tr></thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td>{{ format.dateTime(entry.createdAt) }}</td>
            <td>{{ entry.actorUsername ?? entry.actorId ?? '—' }}</td>
            <td>{{ entry.action }}</td>
            <td>{{ entry.target }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!entries.length" class="panel__empty">رویدادی ثبت نشده است.</p>
    </article>
  </section>
</template>
