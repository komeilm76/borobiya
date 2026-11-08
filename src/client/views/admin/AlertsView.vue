<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { TransitionGroup } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';

/** Operational alerts, with resolve actions and severity tones. */
const admin = useAdminStore();
const format = useFormatters();
const motion = useMotionPreferences();
const includeResolved = ref(false);
const alerts = computed(() => admin.alerts);

function reload(): void {
  void admin.loadAlerts(includeResolved.value);
}

onMounted(reload);
</script>

<template>
  <section class="admin-page" data-testid="admin-alerts">
    <article class="panel">
      <header class="panel__head">
        <h2>هشدارهای عملیاتی</h2>
        <label class="panel__toggle">
          <input v-model="includeResolved" type="checkbox" @change="reload">
          <span>نمایش بسته‌شده‌ها</span>
        </label>
      </header>
      <TransitionGroup tag="ul" name="bb-alert" class="admin-list" :duration="motion.fast.value">
        <li v-for="alert in alerts" :key="alert.id" :data-severity="alert.severity">
          <span :class="['mdi', alert.severity === 'danger' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline']" aria-hidden="true" />
          <div>
            <strong>{{ alert.message }}</strong>
            <small>{{ alert.kind }} · {{ format.dateTime(alert.createdAt) }}</small>
          </div>
          <button v-if="!alert.resolvedAt" type="button" class="admin-action" @click="admin.resolveAlert(alert.id)">بستن</button>
          <span v-else class="status-pill status-pill--neutral">بسته شده</span>
        </li>
      </TransitionGroup>
      <p v-if="!alerts.length" class="panel__empty">هشدار بازی وجود ندارد.</p>
    </article>
  </section>
</template>
