<script setup lang="ts">
import { computed } from 'vue';
import { useSosStore } from '@/stores/sos.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { useRouter } from 'vue-router';

/** History screen: previous SOS requests and completed missions. */
const sos = useSosStore();
const format = useFormatters();
const router = useRouter();
const history = computed(() => sos.requests);
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>تاریخچه درخواست‌ها</strong>
      <span>{{ format.number(history.length) }} درخواست ثبت‌شده</span>
    </div>
    <button type="button" class="sheet__expand" aria-label="نمایه" @click="router.push({ name: ROUTE_NAMES.profile })">
      <span class="mdi mdi-account" aria-hidden="true" />
    </button>
  </div>
  <div class="sheet__body">
    <ul class="history-list">
      <li v-for="item in history" :key="item.id" class="history-row">
        <span class="mdi mdi-alert-circle-outline" aria-hidden="true" />
        <div>
          <strong>{{ item.incidentLabel }}</strong>
          <small>{{ format.dateTime(item.createdAt) }} · {{ item.status }}</small>
        </div>
        <span class="status-pill status-pill--neutral">{{ format.number(item.trackingCode) }}</span>
      </li>
    </ul>
    <p v-if="!history.length" class="sheet__status">تاریخچه‌ای ثبت نشده است.</p>
  </div>
</template>
