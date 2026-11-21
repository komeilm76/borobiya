<script setup lang="ts">
import { useToast } from '@/composables/useToast.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { TransitionGroup } from 'vue';

/**
 * Accessible toast host. Messages are announced through the assertive live region in the
 * document shell; animations respect the reduced-motion preference.
 */
const { messages, dismiss } = useToast();
const motion = useMotionPreferences();

const iconFor = (tone: string): string =>
  tone === 'success' ? 'mdi-check-circle-outline' : tone === 'error' ? 'mdi-alert-circle-outline' : tone === 'warning' ? 'mdi-alert-outline' : 'mdi-information-outline';
</script>

<template>
  <div id="toast-root" class="toast-root" aria-live="assertive" role="status">
    <TransitionGroup name="bb-toast" :duration="motion.base.value">
      <div
        v-for="message in messages"
        :key="message.id"
        class="toast"
        :class="`toast--${message.tone}`"
        role="alert"
      >
        <span :class="['mdi', iconFor(message.tone)]" aria-hidden="true" />
        <span>{{ message.message }}</span>
        <button type="button" class="toast__close" aria-label="بستن پیام" @click="dismiss(message.id)">
          <span class="mdi mdi-close" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.bb-toast-enter-active,
.bb-toast-leave-active {
  transition: opacity 200ms var(--ease), transform 200ms var(--ease);
}
.bb-toast-enter-from,
.bb-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
