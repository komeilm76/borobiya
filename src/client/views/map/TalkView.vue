<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRealtimeStore } from '@/stores/realtime.ts';
import { useMapStore } from '@/stores/map.ts';
import { TalkAudio } from '@/utils/audio.ts';
import { WS_EVENTS } from '@shared/protocol.ts';
import { useToast } from '@/composables/useToast.ts';
import { useAsyncAction } from '@/composables/useAsyncAction.ts';

/**
 * One-to-one push-to-talk screen. Audio is ephemeral: the capture stream is released on
 * release of the button and no recording is stored anywhere.
 */
const realtime = useRealtimeStore();
const map = useMapStore();
const toast = useToast();
const talkId = ref(0);
const active = ref(false);
const target = ref('');
const audio = new TalkAudio((frame) => realtime.sendBinary(frame));
const unsubscribers: Array<() => void> = [];

const { run: start } = useAsyncAction(async () => {
  if (!target.value) return;
  await audio.start(talkId.value || Date.now() >>> 0);
  realtime.send({ type: WS_EVENTS.TALK_START, peerUserId: target.value, requestId: `talk-${Date.now()}` });
  active.value = true;
});

const { run: stop } = useAsyncAction(async () => {
  audio.stop();
  realtime.send({ type: WS_EVENTS.TALK_STOP, talkId: talkId.value, requestId: `talk-${Date.now()}` });
  active.value = false;
});

onMounted(() => {
  unsubscribers.push(
    realtime.on(WS_EVENTS.ACK, (message: { kind?: string; talkId?: number }) => {
      if (message.kind === WS_EVENTS.TALK_START && message.talkId) talkId.value = Number(message.talkId);
    }),
    realtime.on('binary', (frame: ArrayBuffer) => audio.play(frame)),
    realtime.on(WS_EVENTS.ERROR, (message: { message?: string }) => toast.push(String(message?.message ?? 'خطای گفت‌وگو'), 'error', 3600))
  );
});

onUnmounted(() => {
  for (const off of unsubscribers.splice(0)) off();
  audio.destroy();
});
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>گفت‌وگوی یک‌به‌یک</strong>
      <span>فشار و نگه‌داشتن برای صحبت</span>
    </div>
    <span class="status-pill" :class="active ? 'status-pill--danger' : 'status-pill--neutral'">{{ active ? 'در حال ارسال' : 'آماده' }}</span>
  </div>
  <div class="sheet__body">
    <label class="sos-label" for="talk-target">همراه مورد نظر</label>
    <select id="talk-target" v-model="target" class="talk-select">
      <option value="" disabled>انتخاب همراه</option>
      <option v-for="peer in map.peers" :key="peer.userId" :value="peer.userId">{{ peer.username ?? peer.userId }}</option>
    </select>
    <button
      type="button"
      class="talk-button"
      :class="{ 'is-active': active }"
      :aria-pressed="active ? 'true' : 'false'"
      @pointerdown="start"
      @pointerup="stop"
      @pointerleave="stop"
    >
      <span class="mdi mdi-microphone" aria-hidden="true" />
      <span>{{ active ? 'در حال صحبت…' : 'نگه دارید تا صحبت کنید' }}</span>
    </button>
    <p class="sheet__status">هیچ صدایی ذخیره نمی‌شود؛ فقط جریان زنده منتقل می‌شود.</p>
  </div>
</template>

<style scoped>
.talk-select { inline-size: 100%; padding: 12px; border-radius: var(--r12); border: 1px solid var(--border); font: inherit; margin-block: 8px 18px; }
.talk-button {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  inline-size: 100%;
  padding: 18px;
  border: 0;
  border-radius: var(--r20);
  background: var(--primary);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.talk-button.is-active { background: var(--danger); }
</style>
