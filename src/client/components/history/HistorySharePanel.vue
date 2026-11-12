<script setup lang="ts">
import { computed, ref } from 'vue';
import { get, post, errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import type { UserSearchView } from '@/api/types.ts';

/**
 * Scoped history share spawned from a history record (Stage 6): the window defaults to the
 * record's own lifetime but stays editable, and the recipient never receives more than the
 * selected scope. The server re-validates the range (chronological, not future, at most 30 days).
 */
const props = defineProps<{ from: number; to: number; context: string }>();
const emit = defineEmits<{ (event: 'created'): void; (event: 'close'): void }>();

const toast = useToast();

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const query = ref('');
const results = ref<UserSearchView[]>([]);
const searched = ref(false);
const searching = ref(false);
const recipient = ref<UserSearchView | null>(null);
const scopeMotion = ref(true);
const scopeAccuracy = ref(true);
const fromInput = ref(toLocalInput(props.from));
const toInput = ref(toLocalInput(Math.min(Math.max(props.to, props.from + 60_000), Date.now())));
const submitting = ref(false);

/** Mirrors the server's share validation so the form fails fast with Persian copy. */
const rangeError = computed(() => {
  const from = Date.parse(fromInput.value);
  const to = Date.parse(toInput.value);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'بازه تاریخچه نامعتبر است.';
  if (from >= to) return 'ابتدای بازه باید پیش از انتهای آن باشد.';
  if (to > Date.now() + 60_000) return 'انتهای بازه نمی‌تواند در آینده باشد.';
  if (Date.now() - from > 30 * 24 * 60 * 60_000) return 'بازه تاریخچه حداکثر ۳۰ روز است.';
  return '';
});
const canSubmit = computed(() => Boolean(recipient.value) && rangeError.value === '' && !submitting.value);

async function searchRecipient(): Promise<void> {
  const q = query.value.trim();
  if (!q || searching.value) return;
  searching.value = true;
  try {
    const result = await get<{ items?: UserSearchView[] }>('/_user/users/search', { q, limit: 10 });
    results.value = result.items ?? [];
    searched.value = true;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    searching.value = false;
  }
}

function pick(user: UserSearchView): void {
  recipient.value = user;
}

async function submit(): Promise<void> {
  if (!canSubmit.value || !recipient.value) return;
  submitting.value = true;
  try {
    await post('/_user/location/shares', {
      recipientId: recipient.value.id,
      kind: 'history',
      historyFrom: Date.parse(fromInput.value),
      historyTo: Date.parse(toInput.value),
      scope: ['route', ...(scopeMotion.value ? ['motion'] : []), ...(scopeAccuracy.value ? ['accuracy'] : [])]
    });
    toast.push('اشتراک بازه ساخته شد.', 'success', 2400);
    emit('created');
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="share-create" data-testid="history-share-panel">
    <div class="share-create__head">
      <strong>اشتراک‌گذاری بازه: {{ context }}</strong>
      <button type="button" class="ghost-button" data-testid="history-share-close" aria-label="بستن" @click="emit('close')">
        <span class="mdi mdi-close" aria-hidden="true" />
      </button>
    </div>
    <form class="share-search" @submit.prevent="searchRecipient">
      <input v-model="query" type="text" data-testid="history-share-search" placeholder="نام کاربری گیرنده…" aria-label="جستجوی گیرنده اشتراک" />
      <button type="submit" class="ghost-button" :disabled="searching || !query.trim()" data-testid="history-share-search-submit">
        {{ searching ? '…' : 'جستجو' }}
      </button>
    </form>
    <ul v-if="results.length" class="share-results">
      <li v-for="user in results" :key="user.id">
        <button
          type="button"
          class="share-recipient"
          :class="{ 'is-selected': recipient?.id === user.id }"
          :data-testid="`history-share-recipient-${user.username}`"
          @click="pick(user)"
        >
          <span class="mdi mdi-account-circle-outline" aria-hidden="true" />
          <span class="share-recipient__meta">
            <strong>{{ user.username }}</strong>
            <small>{{ user.role === 'responder' ? 'امدادگر' : user.role === 'admin' ? 'مدیر' : 'کاربر' }} · {{ user.online ? 'آنلاین' : 'آفلاین' }}</small>
          </span>
        </button>
      </li>
    </ul>
    <p v-else-if="searched && !searching" class="sheet__status">کاربری با این نام پیدا نشد.</p>
    <div class="share-field">
      <label>از <input v-model="fromInput" type="datetime-local" data-testid="history-share-from" /></label>
      <label>تا <input v-model="toInput" type="datetime-local" data-testid="history-share-to" /></label>
      <p v-if="rangeError" class="share-error" data-testid="history-share-error">{{ rangeError }}</p>
    </div>
    <fieldset class="share-kind" data-testid="history-share-scope">
      <legend>جزئیات قابل اشتراک</legend>
      <label><input type="checkbox" checked disabled /> مسیر (نقاط و زمان)</label>
      <label><input v-model="scopeMotion" type="checkbox" data-testid="history-scope-motion" /> سرعت و جهت حرکت</label>
      <label><input v-model="scopeAccuracy" type="checkbox" data-testid="history-scope-accuracy" /> دقت موقعیت</label>
    </fieldset>
    <button type="button" class="primary-button" :disabled="!canSubmit" data-testid="history-share-submit" @click="submit">
      <span class="mdi mdi-share-variant" aria-hidden="true" />
      <span>{{ recipient ? `اشتراک با ${recipient.username}` : 'گیرنده را انتخاب کنید' }}</span>
    </button>
  </div>
</template>


<style scoped>
.share-create__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
