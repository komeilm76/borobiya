<template>
  <button
    type="button"
    class="sos-fab"
    data-test="sos-trigger"
    aria-label="درخواست امداد فوری (SOS)"
    title="درخواست امداد فوری (SOS)"
    @click="$emit('trigger')"
  >
    <span class="sos-fab__ring" aria-hidden="true" />
    <v-icon icon="mdi-alarm-light" size="22" class="sos-fab__icon" />
    <span class="sos-fab__label">SOS امداد</span>
  </button>
</template>

<script setup lang="ts">
defineEmits<{
  (event: "trigger"): void;
}>();
</script>

<style scoped>
.sos-fab {
  position: fixed;
  inset-block-end: max(1.25rem, env(safe-area-inset-bottom, 0px));
  inset-inline-start: 1.25rem;
  z-index: 950;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1.25rem;
  border: 2px solid rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  color: #ffffff;
  font-weight: 800;
  font-size: 0.96rem;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 0.75rem 1.9rem rgba(185, 28, 28, 0.45);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.sos-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 1rem 2.2rem rgba(185, 28, 28, 0.58);
}

.sos-fab:focus-visible {
  outline: 3px solid #fecaca;
  outline-offset: 3px;
}

.sos-fab__ring {
  position: absolute;
  inset: -4px;
  border-radius: inherit;
  border: 2px solid rgba(220, 38, 38, 0.55);
  pointer-events: none;
  animation: sos-pulse 2.4s ease-out infinite;
}

@keyframes sos-pulse {
  0% {
    transform: scale(1);
    opacity: 0.85;
  }
  75%,
  100% {
    transform: scale(1.16);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sos-fab {
    transition: none;
  }
  .sos-fab__ring {
    animation: none;
    opacity: 0.45;
  }
}
</style>
