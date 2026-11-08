<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useToast } from '@/composables/useToast.ts';

/** Reports screen: status distribution and export links. */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const statuses = computed(() => admin.overview?.statuses ?? []);
const exports = [
  { label: 'کاربران (CSV)', href: '/_admin/users.csv' },
  { label: 'رویدادها (CSV)', href: '/_admin/audit.csv' }
];

onMounted(() => void admin.loadOverview());

function download(href: string): void {
  window.location.assign(href);
  toast.push('صدور فایل آغاز شد.', 'info', 2200);
}
</script>

<template>
  <section class="admin-page" data-testid="admin-reports">
    <article class="panel">
      <header class="panel__head"><h2>توزیع وضعیت درخواست‌ها</h2></header>
      <ul class="admin-list">
        <li v-for="item in statuses" :key="item.status">
          <span class="mdi mdi-chart-bar" aria-hidden="true" />
          <div><strong>{{ item.status }}</strong><small>{{ format.number(item.count) }} مورد</small></div>
        </li>
      </ul>
      <p v-if="!statuses.length" class="panel__empty">داده‌ای برای گزارش نیست.</p>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>صدور داده</h2></header>
      <div class="export-row">
        <button v-for="item in exports" :key="item.href" type="button" class="admin-action" @click="download(item.href)">
          {{ item.label }}
        </button>
      </div>
    </article>
  </section>
</template>
