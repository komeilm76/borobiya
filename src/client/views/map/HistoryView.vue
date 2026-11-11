<script setup lang="ts">
import { computed } from 'vue';
import { useSosStore } from '@/stores/sos.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { useRouter } from 'vue-router';
import { statusLabel, statusTone } from '@/utils/status.ts';

/** History screen: your past SOS requests and the missions you took as responder. */
const sos = useSosStore();
const format = useFormatters();
const router = useRouter();
const history = computed(() => sos.requests);
const missions = computed(() => sos.missions);
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>تاریخچه</strong>
      <span>{{ format.number(history.length + missions.length) }} رویداد ثبت‌شده</span>
    </div>
    <button type="button" class="sheet__expand" aria-label="نمایه" @click="router.push({ name: ROUTE_NAMES.profile })">
      <span class="mdi mdi-account" aria-hidden="true" />
    </button>
  </div>
  <div class="sheet__body">
    <h3 class="sheet__subtitle">درخواست‌های امدادی</h3>
    <ul class="history-list">
      <li v-for="item in history" :key="item.id" class="history-row">
        <span class="mdi mdi-alert-circle-outline" aria-hidden="true" />
        <div>
          <strong>{{ item.incidentLabel }}</strong>
          <small>{{ format.dateTime(item.createdAt) }}</small>
        </div>
        <span :class="statusTone(item.status)">{{ statusLabel(item.status) }}</span>
      </li>
    </ul>
    <p v-if="!history.length" class="sheet__status">درخواستی ثبت نشده است.</p>
    <template v-if="missions.length">
      <h3 class="sheet__subtitle">مأموریت‌ها</h3>
      <ul class="history-list">
        <li v-for="mission in missions" :key="mission.id" class="history-row">
          <span class="mdi mdi-car" aria-hidden="true" />
          <div>
            <strong>{{ mission.incidentLabel }}</strong>
            <small>{{ format.dateTime(mission.updatedAt) }}</small>
          </div>
          <span :class="statusTone(mission.status)">{{ statusLabel(mission.status) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>
