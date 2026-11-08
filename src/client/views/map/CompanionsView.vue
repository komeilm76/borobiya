<script setup lang="ts">
import { computed } from 'vue';
import { TransitionGroup } from 'vue';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';

/** Companion screen: live peers, active shares and their expiry. */
const map = useMapStore();
const format = useFormatters();
const motion = useMotionPreferences();
const peers = computed(() => map.peers);
const shares = computed(() => map.shares);
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>همراهان</strong>
      <span>اشتراک موقعیت زنده و تاریخچه</span>
    </div>
    <span class="status-pill status-pill--success">{{ format.number(peers.length) }} آنلاین</span>
  </div>
  <div class="sheet__body">
    <TransitionGroup tag="ul" name="bb-list" class="peer-list" :duration="motion.fast.value">
      <li v-for="peer in peers" :key="peer.userId" class="peer-row">
        <span class="peer-row__avatar"><span class="mdi mdi-account" aria-hidden="true" /></span>
        <span>
          <strong>{{ peer.username ?? peer.userId }}</strong>
          <small>دقت {{ format.distance(peer.accuracy) }} · {{ format.relative(peer.recordedAt) }}</small>
        </span>
      </li>
    </TransitionGroup>
    <p v-if="!peers.length" class="sheet__status">همراهی در حال اشتراک موقعیت نیست.</p>
    <h3 class="sheet__subtitle">اشتراک‌های فعال</h3>
    <ul class="share-list">
      <li v-for="share in shares" :key="share.shareId">
        <span class="mdi mdi-map-marker-path" aria-hidden="true" />
        <div>
          <strong>{{ share.kind === 'live' ? 'اشتراک زنده' : 'بازه تاریخچه' }}</strong>
          <span>{{ share.expiresAt ? format.dateTime(share.expiresAt) : 'بدون انقضا' }}</span>
        </div>
      </li>
    </ul>
    <p v-if="!shares.length" class="sheet__status">اشتراک فعالی وجود ندارد.</p>
  </div>
</template>
