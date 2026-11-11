<script setup lang="ts">
import { computed, ref } from 'vue';
import { TransitionGroup } from 'vue';
import { useMapStore } from '@/stores/map.ts';
import { useAuthStore } from '@/stores/auth.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { useToast } from '@/composables/useToast.ts';
import { del, get, post, errorMessage } from '@/api/client.ts';
import type { UserSearchView } from '@/api/types.ts';

/** Sharing Center («اشتراک‌گذاری»): live peers, incoming/outgoing grants, creating new grants and their expiry. */
const map = useMapStore();
const auth = useAuthStore();
const format = useFormatters();
const motion = useMotionPreferences();
const toast = useToast();
const peers = computed(() => map.peers);
const shares = computed(() => map.shares);
const authUserId = computed(() => auth.user?.id ?? '');
const revokingId = ref<string | null>(null);

const ROLE_LABEL = { user: 'کاربر', responder: 'امدادگر', admin: 'مدیر' } as const;

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

/* ---- Creating a new share («اشتراک موقعیت» / «بازه تاریخچه») ---- */

const SHARE_KINDS = ['live', 'history'] as const;
type ShareKind = (typeof SHARE_KINDS)[number];

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const sharePanelOpen = ref(false);
const shareQuery = ref('');
const searching = ref(false);
const searched = ref(false);
const shareResults = ref<UserSearchView[]>([]);
const selectedRecipient = ref<UserSearchView | null>(null);
const shareKind = ref<ShareKind>('live');
/** 0 = indefinite live grant (no expiry; revocable at any time). */
const liveDuration = ref(3600);
/** Which details a history grant authorizes: route is always shared; these are opt-in. */
const scopeMotion = ref(true);
const scopeAccuracy = ref(true);
const shareDirection = ref<'all' | 'outgoing' | 'incoming'>('all');
const historyFrom = ref(toLocalInput(Date.now() - 24 * 60 * 60_000));
const historyTo = ref(toLocalInput(Date.now()));
const sharing = ref(false);

const shareable = computed(() => Boolean(selectedRecipient.value) && !sharing.value);

/** Grants are inspectable from both sides: outgoing (I share) and incoming (they share). */
const visibleShares = computed(() => shares.value.filter((share) =>
  shareDirection.value === 'all'
  || (shareDirection.value === 'outgoing' ? direction(share) === 'outgoing' : direction(share) === 'incoming')));

/** Mirrors the server's share validation so the form fails fast with Persian copy. */
const historyRangeError = computed(() => {
  if (shareKind.value !== 'history') return '';
  const from = Date.parse(historyFrom.value);
  const to = Date.parse(historyTo.value);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'بازه تاریخچه نامعتبر است.';
  if (from >= to) return 'ابتدای بازه باید پیش از انتهای آن باشد.';
  if (to > Date.now() + 60_000) return 'انتهای بازه نمی‌تواند در آینده باشد.';
  if (Date.now() - from > 30 * 24 * 60 * 60_000) return 'بازه تاریخچه حداکثر ۳۰ روز است.';
  return '';
});

const canSubmitShare = computed(() => shareable.value && (shareKind.value === 'live' || historyRangeError.value === ''));

async function runShareSearch(): Promise<void> {
  const query = shareQuery.value.trim();
  if (!query || searching.value) return;
  searching.value = true;
  try {
    const result = await get<{ items?: UserSearchView[] }>('/_user/users/search', { q: query, limit: 10 });
    shareResults.value = result.items ?? [];
    searched.value = true;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    searching.value = false;
  }
}

function pickRecipient(user: UserSearchView): void {
  selectedRecipient.value = selectedRecipient.value?.id === user.id ? null : user;
}

async function submitShare(): Promise<void> {
  const recipient = selectedRecipient.value;
  if (!recipient || !canSubmitShare.value) return;
  sharing.value = true;
  const body: Record<string, unknown> = { recipientId: recipient.id, kind: shareKind.value };
  if (shareKind.value === 'live') {
    body.durationSeconds = liveDuration.value;
  } else {
    body.historyFrom = Date.parse(historyFrom.value);
    body.historyTo = Date.parse(historyTo.value);
    // Explicitly selected detail set: route always, motion/accuracy only when checked.
    body.scope = ['route', ...(scopeMotion.value ? ['motion'] : []), ...(scopeAccuracy.value ? ['accuracy'] : [])];
  }
  try {
    await post('/_user/location/shares', body);
    toast.push('اشتراک موقعیت ساخته شد.', 'success', 2600);
    selectedRecipient.value = null;
    shareResults.value = [];
    shareQuery.value = '';
    searched.value = false;
    sharePanelOpen.value = false;
    await map.load();
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    sharing.value = false;
  }
}
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>اشتراک‌گذاری</strong>
      <span>اشتراک موقعیت زنده، تاریخچه و بازه‌های گذشته</span>
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
    <p v-if="!peers.length" class="sheet__status">کسی در حال اشتراک موقعیت با شما نیست.</p>

    <h3 class="sheet__subtitle">اشتراک موقعیت جدید</h3>
    <button type="button" class="ghost-button" data-testid="share-create-toggle" :aria-expanded="sharePanelOpen" @click="sharePanelOpen = !sharePanelOpen">
      <span class="mdi mdi-map-marker-plus-outline" aria-hidden="true" />
      <span>{{ sharePanelOpen ? 'بستن فرم اشتراک' : 'اشتراک با یک کاربر…' }}</span>
    </button>
    <div v-if="sharePanelOpen" class="share-create" data-testid="share-create-panel">
      <form class="share-search" @submit.prevent="runShareSearch">
        <input v-model="shareQuery" type="text" data-testid="share-search" placeholder="نام کاربری گیرنده…" aria-label="جستجوی گیرنده" />
        <button type="submit" class="ghost-button" :disabled="searching || !shareQuery.trim()" data-testid="share-search-submit">
          {{ searching ? '…' : 'جستجو' }}
        </button>
      </form>
      <ul v-if="shareResults.length" class="share-results">
        <li v-for="user in shareResults" :key="user.id">
          <button type="button" class="share-recipient" :class="{ 'is-selected': selectedRecipient?.id === user.id }" :data-testid="`share-recipient-${user.username}`" :aria-pressed="selectedRecipient?.id === user.id" @click="pickRecipient(user)">
            <span class="mdi mdi-account-circle-outline" aria-hidden="true" />
            <span class="share-recipient__meta">
              <strong>{{ user.username }}</strong>
              <small>{{ ROLE_LABEL[user.role] }} · {{ user.online ? 'آنلاین' : 'آفلاین' }} · امتیاز {{ format.number(user.averageRating) }}</small>
            </span>
            <span v-if="selectedRecipient?.id === user.id" class="mdi mdi-check-circle" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else-if="searched && !searching" class="sheet__status" data-testid="share-search-empty">کاربری با این نام پیدا نشد.</p>

      <fieldset class="share-kind">
        <legend>نوع اشتراک</legend>
        <label><input v-model="shareKind" type="radio" value="live" data-testid="share-kind-live" /> اشتراک زنده (موقعیت لحظه‌ای)</label>
        <label><input v-model="shareKind" type="radio" value="history" data-testid="share-kind-history" /> بازه تاریخچه (موقعیت‌های گذشته)</label>
      </fieldset>
      <label v-if="shareKind === 'live'" class="share-field">
        <span>مدت اشتراک</span>
        <select v-model.number="liveDuration" data-testid="share-duration">
          <option :value="900">۱۵ دقیقه</option>
          <option :value="3600">۱ ساعت</option>
          <option :value="14400">۴ ساعت</option>
          <option :value="86400">۲۴ ساعت</option>
          <option :value="0">بدون انقضا</option>
        </select>
      </label>
      <template v-else>
        <label class="share-field">
          <span>از</span>
          <input v-model="historyFrom" type="datetime-local" data-testid="share-history-from" />
        </label>
        <label class="share-field">
          <span>تا</span>
          <input v-model="historyTo" type="datetime-local" data-testid="share-history-to" />
        </label>
        <p v-if="historyRangeError" class="sheet__status share-error" data-testid="share-history-error">{{ historyRangeError }}</p>
        <fieldset class="share-kind" data-testid="share-history-scope">
          <legend>جزئیات قابل مشاهده</legend>
          <label><input type="checkbox" checked disabled data-testid="share-scope-route" /> مسیر (نقاط و زمان)</label>
          <label><input v-model="scopeMotion" type="checkbox" data-testid="share-scope-motion" /> سرعت و جهت حرکت</label>
          <label><input v-model="scopeAccuracy" type="checkbox" data-testid="share-scope-accuracy" /> دقت موقعیت</label>
        </fieldset>
      </template>
      <button type="button" class="primary-button" data-testid="share-submit" :disabled="!canSubmitShare" @click="submitShare">
        <span class="mdi mdi-share-variant" aria-hidden="true" />
        <span>{{ sharing ? 'در حال ساخت…' : 'ساخت اشتراک' }}</span>
      </button>
    </div>

    <h3 class="sheet__subtitle">اشتراک‌های من</h3>
    <div class="share-direction" role="group" aria-label="فیلتر جهت اشتراک‌گذاری">
      <button v-for="option in [{ id: 'all', label: 'همه' }, { id: 'outgoing', label: 'ارسالی' }, { id: 'incoming', label: 'دریافتی' }]" :key="option.id"
        type="button" class="ghost-button" :class="{ 'is-active': shareDirection === option.id }"
        :data-testid="`share-direction-${option.id}`" @click="shareDirection = option.id as 'all' | 'outgoing' | 'incoming'">
        {{ option.label }}
      </button>
    </div>
    <ul class="share-list">
      <li v-for="share in visibleShares" :key="share.id" class="share-row">
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
    <p v-if="!visibleShares.length" class="sheet__status">اشتراک فعالی وجود ندارد.</p>
  </div>
</template>
