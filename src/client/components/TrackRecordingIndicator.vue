<script setup lang="ts">
import { computed } from 'vue';
import { useTrackStore } from '@/stores/track.ts';
import { useToast } from '@/composables/useToast.ts';
import { errorMessage } from '@/api/client.ts';

/**
 * Honest recording indicator (Stage D): shown only while fixes actually carry a context and
 * leave the device, and always offers a one-tap stop (account-level opt-out).
 */
const track = useTrackStore();
const toast = useToast();
const context = computed(() => track.recordingContext);
const isMission = computed(() => context.value?.type === 'mission');

async function stop(): Promise<void> {
  try {
    await track.setOptIn(false);
    toast.push('ثبت مسیر خاموش شد.', 'success', 2600);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}
</script>

<template>
  <div v-if="context" class="track-rec" role="status" aria-live="polite" data-testid="track-recording-indicator">
    <span class="track-rec__dot" aria-hidden="true" />
    <span class="track-rec__label">در حال ثبت مسیر {{ isMission ? 'مأموریت' : 'سفر' }} «{{ context.label }}»</span>
    <button type="button" class="track-rec__stop" :disabled="track.optInBusy" data-testid="track-recording-stop" @click="stop">توقف</button>
  </div>
</template>

<style scoped>
.track-rec {
  position: absolute;
  inset-block-start: 116px; /* below the 44px top pill (top: 64px) + 8px breathing room */
  inset-inline: 0;
  margin-inline: auto;
  inline-size: max-content;
  z-index: 25;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  max-inline-size: min(340px, calc(100% - 24px));
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--danger);
  box-shadow: var(--shadow-md);
  font-size: 11px;
  color: var(--text);
}
.track-rec__dot {
  inline-size: 8px;
  block-size: 8px;
  border-radius: 50%;
  background: var(--danger);
  flex: none;
  animation: track-rec-pulse 1.6s ease-in-out infinite;
}
@keyframes track-rec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.75); }
}
@media (prefers-reduced-motion: reduce) {
  .track-rec__dot { animation: none; }
}
.track-rec__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-rec__stop {
  border: 0;
  background: var(--danger);
  color: #fff;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
  flex: none;
}
</style>
