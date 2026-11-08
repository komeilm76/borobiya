<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';

/** Incident-type catalog with the canonical semantic colors. */
const admin = useAdminStore();
const format = useFormatters();
const items = computed(() => admin.incidentTypes);

onMounted(() => void admin.loadIncidentTypes());
</script>

<template>
  <section class="admin-page" data-testid="admin-incidents">
    <article class="panel">
      <header class="panel__head">
        <h2>نوع حادثه</h2>
        <span class="panel__hint">{{ format.number(items.length) }} مورد</span>
      </header>
      <ul class="admin-list">
        <li v-for="item in items" :key="item.id">
          <i class="group-dot" :style="{ background: item.color }" />
          <div><strong>{{ item.label }}</strong><small>{{ item.id }}</small></div>
          <span :class="['mdi', `mdi-${item.icon}`]" aria-hidden="true" />
        </li>
      </ul>
    </article>
  </section>
</template>
