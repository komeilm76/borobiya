<template>
  <v-card
    class="broadcast-bar"
    :class="[`broadcast-bar--${state.tone}`, { 'broadcast-bar--compact': compact, 'broadcast-bar--inset': inset }]"
    elevation="2"
    rounded="xl"
  >
    <div class="broadcast-bar__body">
      <span class="broadcast-bar__indicator" aria-hidden="true" />
      <div class="broadcast-bar__copy" role="status" aria-live="polite">
        <p class="broadcast-bar__headline">{{ state.headline }}</p>
        <p class="broadcast-bar__detail">{{ state.detail }}</p>
      </div>
      <div class="broadcast-bar__actions">
        <v-btn
          v-if="state.showDevicesLink"
          size="small"
          variant="text"
          color="primary"
          to="/_user/devices"
        >
          دستگاه‌ها
        </v-btn>
        <v-btn
          size="small"
          :color="state.isActive ? 'error' : 'primary'"
          :variant="state.isActive ? 'tonal' : 'flat'"
          rounded="lg"
          :disabled="!broadcast.isSupported"
          @click="broadcast.toggle()"
        >
          <v-icon
            class="me-1"
            :icon="state.isActive ? 'mdi-stop-circle-outline' : 'mdi-broadcast'"
            size="18"
          />
          {{ state.actionLabel }}
        </v-btn>
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
withDefaults(defineProps<{ compact?: boolean; inset?: boolean }>(), { compact: false, inset: false });

const broadcast = useBroadcastStore();
const state = computed(() => broadcast.view);

onMounted(() => {
  void broadcast.refreshPriority();
});
</script>

<style scoped>
.broadcast-bar {
  padding: 0.75rem 1rem;
  border: 1px solid rgba(25, 53, 54, 0.09);
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(10px);
}

.broadcast-bar--compact {
  padding: 0.6rem 0.85rem;
}

/* The dashboard places this card inside another card; standalone bars keep xl corners. */
.broadcast-bar--inset {
  border-radius: var(--bb-radius-nested, 16px) !important;
}

.broadcast-bar__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 0.85rem;
}

.broadcast-bar__indicator {
  flex: 0 0 auto;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: #7d9291;
}

.broadcast-bar--active .broadcast-bar__indicator {
  background: #1f8a5b;
  box-shadow: 0 0 0 4px rgba(31, 138, 91, 0.18);
}

.broadcast-bar--warn .broadcast-bar__indicator {
  background: #c57b14;
}

.broadcast-bar--error .broadcast-bar__indicator {
  background: #b3261e;
}

.broadcast-bar__copy {
  min-width: 12rem;
  flex: 1 1 auto;
}

.broadcast-bar__headline {
  margin: 0;
  color: #173b3c;
  font-size: 0.86rem;
  font-weight: 800;
  line-height: 1.4;
}

.broadcast-bar__detail {
  margin: 0.12rem 0 0;
  color: #536d6c;
  font-size: 0.75rem;
  line-height: 1.55;
}

.broadcast-bar__actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-inline-start: auto;
}

:global(:root.dark) .broadcast-bar {
  background: rgba(27, 41, 42, 0.95);
}

:global(:root.dark) .broadcast-bar__headline {
  color: #edf5f2;
}

:global(:root.dark) .broadcast-bar__detail {
  color: #a0b6b2;
}
</style>
