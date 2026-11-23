<template>
  <div class="network-status-icon" :class="`network-status-icon--${monitor.status.value}`" :title="presentation.label">
    <span class="network-status-icon__dot" aria-hidden="true" />
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ presentation.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { createNetworkStatusMonitor, NETWORK_STATUS_PRESENTATION } from "@/composables/network-status";

const monitor = createNetworkStatusMonitor();
const presentation = computed(() => NETWORK_STATUS_PRESENTATION[monitor.status.value]);
onMounted(monitor.start);
onBeforeUnmount(monitor.stop);
</script>

<style scoped>
.network-status-icon { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 12px; height: 12px; }
.network-status-icon__dot {
  display: block; width: 10px; height: 10px; border-radius: 50%;
  background: rgb(var(--v-theme-info));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.35);
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
}
.network-status-icon--reachable .network-status-icon__dot { background: rgb(var(--v-theme-success)); }
.network-status-icon--unavailable .network-status-icon__dot { background: rgb(var(--v-theme-warning)); }
.network-status-icon--offline .network-status-icon__dot { background: rgb(var(--v-theme-error)); }
</style>
