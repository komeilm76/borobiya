<script setup lang="ts">
import { computed, ref } from 'vue';
import { TransitionGroup } from 'vue';
import { useMapStore } from '@/stores/map.ts';
import { useAuthStore } from '@/stores/auth.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { useToast } from '@/composables/useToast.ts';
import { del, errorMessage } from '@/api/client.ts';

/** Companion screen: live peers, active shares and their expiry. */
const map = useMapStore();
const auth = useAuthStore();
const format = useFormatters();
const motion = useMotionPreferences();
const toast = useToast();
const peers = computed(() => map.peers);
const shares = computed(() => map.shares);
const authUserId = computed(() => auth.user?.id ?? '');
const revokingId = ref<string | null>(null);

/** The counterpart of a share, from my point of view. */
function counterpart(share: { ownerId: string; ownerUsername?: string; recipientId: string; recipientUsername?: string }): string {
  return share.ownerId === authUserId.value ? (share.recipientUsername ?? '—') : (share.ownerUsername ?? '—');
}
function direction(share: { ownerId: string }): 'outgoing' | 'incoming' {
  return share.ownerId === authUserId.value ? 'outgoing' : 'incoming';
}
const revoking = computed(() => revokingId.value !== null);

async function revoke(share: { id: string }): Promise<void> {
  if (revoking.value) return;
  revokingId.value = share.id;
  try {
    await del(`/_user/location/shares/${encodeURIComponent(share.id)}`);
    toast.push('اشتراک موقعیت قطع شد.', 'success', 2400);
    await map.load();
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    revokingId.value = null;
  }
}
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
      <li v-for="share in shares" :key="share.id" class="share-row">
        <span class="mdi mdi-map-marker-path" aria-hidden="true" />
        <div>
          <strong>{{ share.kind === 'live' ? 'اشتراک زنده' : 'بازه تاریخچه' }} با {{ counterpart(share) }}</strong>
          <span>{{ direction(share) === 'outgoing' ? 'ارسال موقعیت شما' : 'دریافت موقعیت' }} · {{ share.expiresAt ? `تا ${format.dateTime(share.expiresAt)}` : 'بدون انقضا' }}</span>
        </div>
        <button v-if="direction(share) === 'outgoing'" type="button" class="ghost-button" :disabled="revoking" data-testid="revoke-share" @click="revoke(share)">
          {{ revokingId === share.id ? 'در حال قطع…' : 'قطع اشتراک' }}
        </button>
      </li>
    </ul>
    <p v-if="!shares.length" class="sheet__status">اشتراک فعالی وجود ندارد.</p>
  </div>
</template>
