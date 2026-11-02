<template>
  <div class="network-status-icon" :class="{ 'network-status-icon--floating': floating }">
    <v-btn
      class="network-status-icon__button"
      color="surface"
      variant="flat"
      icon
      :aria-label="`وضعیت ارتباط: ${presentation.label}؛ بررسی دوباره`"
      :title="presentation.label"
      @click="monitor.check()"
    >
      <v-icon :icon="presentation.icon" :color="presentation.color" size="23" aria-hidden="true" />
    </v-btn>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ presentation.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { createNetworkStatusMonitor, NETWORK_STATUS_PRESENTATION } from "@/composables/network-status";

defineProps<{ floating?: boolean }>();
const monitor = createNetworkStatusMonitor();
const presentation = computed(() => NETWORK_STATUS_PRESENTATION[monitor.status.value]);
onMounted(monitor.start);
onBeforeUnmount(monitor.stop);
</script>

<style scoped>
.network-status-icon { display: inline-flex; flex: 0 0 auto; align-items: center; }
.network-status-icon--floating {
  position: fixed; z-index: 900;
  top: calc(0.75rem + env(safe-area-inset-top, 0px));
  right: calc(0.75rem + env(safe-area-inset-right, 0px));
}
.network-status-icon__button {
  width: 44px; height: 44px; min-width: 44px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 1rem;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-surface), 0.97) !important;
  box-shadow: var(--bb-shadow-overlay) !important;
}
.network-status-icon__button:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
</style>
