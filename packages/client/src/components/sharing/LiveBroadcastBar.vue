<template>
  <v-card
    class="broadcast-bar"
    :class="[`broadcast-bar--${state.tone}`, { 'broadcast-bar--compact': compact, 'broadcast-bar--inset': inset, 'bb-floating-card': compact }]"
    :elevation="inset ? 0 : 2"
    rounded="xl"
  >
    <div class="broadcast-bar__body">
      <span class="broadcast-bar__indicator" aria-hidden="true" />
      <div class="broadcast-bar__copy" role="status" aria-live="polite">
        <p class="broadcast-bar__headline">{{ state.headline }}</p>
        <p class="broadcast-bar__detail">{{ state.detail }}</p>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useBroadcastStore } from "@/stores/broadcast";

/**
 * Pure renderer for the user's outgoing live-location broadcast (`T2.1.5`) and multi-device
 * priority state (`T2.3.6`). Every sentence and tone is derived in `@/live/broadcast-status`.
 */
withDefaults(defineProps<{ compact?: boolean; inset?: boolean }>(),
  { compact: false, inset: false });

const broadcast = useBroadcastStore();
const state = computed(() => broadcast.view);

onMounted(() => {
  void broadcast.refreshPriority();
});
</script>

<style scoped>
.broadcast-bar {
  container-type: inline-size;
  padding: var(--bb-rhythm-r075) var(--bb-rhythm-r100);
  border: 1px solid var(--bb-finish-broadcastEdge);
  background: var(--bb-finish-broadcastFill);
  backdrop-filter: var(--bb-finish-broadcastBlur);
}

.broadcast-bar--compact {
  padding: var(--bb-rhythm-r060) var(--bb-rhythm-r085);
}
/* The dashboard places this card inside another card; standalone bars keep xl corners. */
.broadcast-bar--inset {
  border-radius: var(--bb-radius-nested, 16px) !important;
}

.broadcast-bar__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bb-rhythm-r065) var(--bb-rhythm-r085);
}

.broadcast-bar__indicator {
  flex: 0 0 auto;
  width: var(--bb-content-icon-broadcastDot);
  height: var(--bb-content-icon-broadcastDot);
  border-radius: 50%;
  background: var(--bb-audience-broadcastIdle);
}

.broadcast-bar--active .broadcast-bar__indicator {
  background: var(--bb-audience-broadcastActive);
  box-shadow: var(--bb-audience-broadcastHalo);
}

.broadcast-bar--warn .broadcast-bar__indicator {
  background: var(--bb-audience-broadcastWarn);
}

.broadcast-bar--error .broadcast-bar__indicator {
  background: var(--bb-audience-broadcastError);
}

.broadcast-bar__copy {
  min-width: 12rem;
  flex: 1 1 auto;
}

.broadcast-bar__headline {
  margin: 0;
  color: var(--bb-audience-broadcastTitle);
  font-size: var(--bb-audience-font-broadcastTitle);
  font-weight: var(--bb-weight-heavy);
  line-height: var(--bb-content-leading-row);
}

.broadcast-bar__detail {
  margin: var(--bb-rhythm-r012) 0 0;
  color: var(--bb-audience-broadcastDetail);
  font-size: var(--bb-audience-font-broadcastDetail);
  line-height: var(--bb-content-leading-broadcastDetail);
}

/* Compact map overlays and dashboard inset cards can be narrow even on desktop.
 * At text zoom the 12rem copy minimum otherwise overflows the card;
 * size from the host, not from the viewport. */
@container (max-width: 380px) {
  .broadcast-bar__body { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; }
  .broadcast-bar__indicator { margin-top: var(--bb-rhythm-r035); }
  .broadcast-bar__copy { min-width: 0; overflow-wrap: anywhere; }
}

:global(:root.dark .broadcast-bar) {
  background: var(--bb-finish-broadcastFill);
}

:global(:root.dark .broadcast-bar__headline) {
  color: var(--bb-audience-broadcastTitle);
}

:global(:root.dark .broadcast-bar__detail) {
  color: var(--bb-audience-broadcastDetail);
}
</style>
