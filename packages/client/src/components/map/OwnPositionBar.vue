<template>
  <v-card class="own-position bb-floating-card" :class="`own-position--${tone}`" elevation="2" rounded="xl">
    <div class="own-position__body">
      <span class="own-position__indicator" aria-hidden="true" />
      <div class="own-position__copy">
        <h2 class="own-position__headline">موقعیت من</h2>
        <p class="own-position__detail" role="status" aria-live="polite">
          {{ !ready && !api.active.value && !api.error.value
            ? 'پس از بارگذاری نقشه می‌توانید موقعیت خود را نمایش دهید.'
            : ownPositionLabel(api.position.value, api.active.value, api.error.value) }}
        </p>
      </div>
      <div class="own-position__actions">
        <v-btn
          v-if="!api.active.value"
          size="small"
          color="primary"
          variant="flat"
          rounded="lg"
          prepend-icon="mdi-crosshairs-gps"
          :disabled="!ready"
          @click="emit('start')"
        >
          نمایش زندهٔ موقعیت من
        </v-btn>
        <v-btn
          v-else
          size="small"
          color="error"
          variant="tonal"
          rounded="lg"
          prepend-icon="mdi-stop-circle-outline"
          @click="api.stop()"
        >
          توقف نمایش
        </v-btn>
        <v-btn
          v-if="api.position.value && ready"
          size="small"
          color="primary"
          variant="text"
          rounded="lg"
          prepend-icon="mdi-crosshairs"
          @click="emit('center')"
        >
          مرکز روی من
        </v-btn>
      </div>
    </div>
    <p class="own-position__note">فقط روی این دستگاه؛ نمایش موقعیت، اشتراک‌گذاری را فعال نمی‌کند.</p>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { useOwnMapPosition } from "@/composables/use-own-map-position";
import { ownPositionLabel, ownPositionTone } from "@/map/own-position";

/** Renderer only: the map view owns the GPS watch and camera; this card never publishes location. */
const props = defineProps<{ api: ReturnType<typeof useOwnMapPosition>; ready: boolean }>();
const emit = defineEmits<{ start: []; center: [] }>();
const tone = computed(() => ownPositionTone(props.api.position.value, props.api.active.value, props.api.error.value));
</script>

<style scoped>
.own-position {
  container-type: inline-size;
  padding: 0.6rem 0.85rem;
  border: 1px solid rgba(25, 53, 54, 0.09);
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(10px);
}

.own-position__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 0.85rem;
}

.own-position__indicator {
  flex: 0 0 auto;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: #7d9291;
}

.own-position--active .own-position__indicator {
  background: #1f8a5b;
  box-shadow: 0 0 0 4px rgba(31, 138, 91, 0.18);
}

.own-position--warn .own-position__indicator { background: #c57b14; }
.own-position--error .own-position__indicator { background: #b3261e; }

.own-position__copy {
  min-width: 0;
  flex: 1 1 9rem;
}

.own-position__headline {
  margin: 0;
  color: #173b3c;
  font-size: 0.86rem;
  font-weight: 800;
  line-height: 1.4;
}

.own-position__detail {
  margin: 0.12rem 0 0;
  color: #536d6c;
  font-size: 0.82rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.own-position__actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-inline-start: auto;
}

.own-position__note {
  margin: 0.6rem 0 0;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  color: #536d6c;
  font-size: 0.82rem;
  line-height: 1.6;
}

/* The compact map card is narrow even on desktop; keep both actions reachable at text zoom. */
@container (max-width: 380px) {
  .own-position__body { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; }
  .own-position__indicator { margin-top: 0.35rem; }
  .own-position__copy { min-width: 0; }
  .own-position__actions { grid-column: 1 / -1; width: 100%; min-width: 0; margin-inline-start: 0; flex-wrap: wrap; }
  .own-position__actions :deep(.v-btn) { flex: 1 1 100%; max-width: 100%; min-width: 0; min-height: 44px; height: auto; }
  .own-position__actions :deep(.v-btn__content) { white-space: normal; overflow-wrap: anywhere; text-align: center; }
}

:global(:root.dark .own-position) { background: rgba(27, 41, 42, 0.95); }
:global(:root.dark .own-position__headline) { color: #edf5f2; }
:global(:root.dark .own-position__detail),
:global(:root.dark .own-position__note) { color: #a0b6b2; }
</style>
