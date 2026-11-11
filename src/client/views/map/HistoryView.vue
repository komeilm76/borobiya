<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSosStore } from '@/stores/sos.ts';
import { useAuthStore } from '@/stores/auth.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { useRouter } from 'vue-router';
import { statusLabel, statusTone } from '@/utils/status.ts';
import { get } from '@/api/client.ts';
import type { ShareView } from '@/api/types.ts';

/** History screen: your past SOS requests and the missions you took as responder. */
const sos = useSosStore();
const format = useFormatters();
const router = useRouter();
const history = computed(() => sos.requests);
const missions = computed(() => sos.missions);
const auth = useAuthStore();
/** Full share list (active + expired + revoked); failures stay silent and hide the section. */
const shareHistory = ref<ShareView[]>([]);
const authUserId = computed(() => auth.user?.id ?? '');

onMounted(async () => {
  try {
    const result = await get<{ items?: ShareView[] }>('/_user/location/shares', { include: 'all' });
    shareHistory.value = result.items ?? [];
  } catch {
    shareHistory.value = [];
  }
});

const SHARE_STATE_LABEL = { active: 'فعال', expired: 'منقضی‌شده', revoked: 'قطع‌شده' } as const;
const SHARE_STATE_TONE = { active: 'status-pill status-pill--success', expired: 'status-pill status-pill--warning', revoked: 'status-pill status-pill--neutral' } as const;

function shareCounterpart(share: ShareView): string {
  return share.ownerId === authUserId.value ? (share.recipientUsername ?? '—') : (share.ownerUsername ?? '—');
}
function shareDirection(share: ShareView): string {
  return share.ownerId === authUserId.value ? 'ارسال موقعیت شما' : 'دریافت موقعیت';
}
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
    <template v-if="shareHistory.length">
      <h3 class="sheet__subtitle">اشتراک‌های موقعیت</h3>
      <ul class="history-list">
        <li v-for="share in shareHistory" :key="share.id" class="history-row" data-testid="history-share-row">
          <span class="mdi mdi-map-marker-path" aria-hidden="true" />
          <div>
            <strong>{{ share.kind === 'live' ? 'اشتراک زنده' : 'بازه تاریخچه' }} با {{ shareCounterpart(share) }}</strong>
            <small>{{ shareDirection(share) }} · {{ format.dateTime(share.createdAt) }}</small>
          </div>
          <span :class="SHARE_STATE_TONE[share.state ?? 'active']">{{ SHARE_STATE_LABEL[share.state ?? 'active'] }}</span>
        </li>
      </ul>
    </template>
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
