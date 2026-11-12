<script setup lang="ts">
import { computed } from 'vue';
import { useTrackStore } from '@/stores/track.ts';
import { useToast } from '@/composables/useToast.ts';
import { errorMessage } from '@/api/client.ts';

/**
 * Per-context consent prompt (Stage D decision 2). Shown once per trip/mission while the
 * account-level opt-in is on and no decision has been recorded; the decision itself is
 * persisted server-side and re-read from the server afterwards.
 */
const track = useTrackStore();
const toast = useToast();
const pending = computed(() => track.pendingPrompt);
const isMission = computed(() => pending.value?.type === 'mission');

async function decide(decision: 'accepted' | 'declined'): Promise<void> {
  try {
    await track.decide(decision);
    toast.push(decision === 'accepted' ? 'ثبت مسیر فعال شد.' : 'ثبت مسیر رد شد.', 'success', 2600);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}
</script>

<template>
  <div v-if="pending" class="track-consent" role="alertdialog" aria-labelledby="track-consent-title" aria-describedby="track-consent-body" data-testid="track-consent-prompt">
    <span class="mdi" :class="isMission ? 'mdi-web' : 'mdi-map-marker-path'" aria-hidden="true" />
    <div class="track-consent__body">
      <strong id="track-consent-title">ثبت مسیر {{ isMission ? 'مأموریت' : 'سفر' }}</strong>
      <p id="track-consent-body">
        با تأیید، مسیر شما در «{{ pending.label }}» ثبت می‌شود و {{ isMission ? 'برای درخواست‌کننده و اعضای تیم' : 'برای اعضای سفر' }} قابل‌مشاهده است.
        می‌توانید هر زمان ثبت مسیر را از پروفایل خاموش کنید.
      </p>
      <div class="track-consent__actions">
        <button type="button" class="primary-button" :disabled="track.decisionBusy" data-testid="track-consent-accept" @click="decide('accepted')">
          {{ track.decisionBusy ? 'در حال ثبت…' : 'تأیید و ثبت مسیر' }}
        </button>
        <button type="button" class="ghost-button" :disabled="track.decisionBusy" data-testid="track-consent-decline" @click="decide('declined')">رد</button>
      </div>
      <p v-if="track.decisionError" class="track-consent__error" role="alert">{{ track.decisionError }}</p>
    </div>
  </div>
</template>

<style scoped>
.track-consent {
  position: absolute;
  inset-block-start: 96px;
  inset-inline: 12px;
  z-index: 30;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: var(--r16);
  background: var(--surface-1);
  border: 1px solid var(--primary);
  box-shadow: var(--shadow-lg);
  font-size: 12px;
}
.track-consent__body { display: grid; gap: 6px; }
.track-consent__body p { margin: 0; line-height: 1.7; color: var(--text-2); }
.track-consent__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.track-consent__error { color: var(--danger); }
.mdi { font-size: 22px; color: var(--primary); margin-block-start: 2px; }
</style>
