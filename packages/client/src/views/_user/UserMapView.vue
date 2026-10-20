<template>
  <section class="user-map-view" aria-label="نقشهٔ تعاملی همراهان">
    <MapCanvas
      class="user-map-view__canvas"
      :style-url="mapStyleUrl"
      aria-label="نقشهٔ تعاملی"
    />

    <header class="user-map-view__toolbar">
      <v-card class="user-map-view__toolbar-card" elevation="3" rounded="xl">
        <v-btn
          class="user-map-view__dashboard-button"
          to="/_user/dashboard"
          variant="tonal"
          color="primary"
          icon
          aria-label="بازگشت به پیشخوان"
          title="بازگشت به پیشخوان"
        >
          <v-icon icon="mdi-view-dashboard-outline" />
        </v-btn>
        <div class="user-map-view__title-block">
          <p>نقشهٔ محلی</p>
          <h1>نقشهٔ همراهان</h1>
        </div>
        <v-chip class="user-map-view__map-chip" color="primary" variant="tonal" size="small">
          تهران
        </v-chip>
      </v-card>
    </header>

    <v-card class="user-map-view__notice" elevation="2" rounded="lg" role="status">
      <v-icon icon="mdi-information-outline" size="19" />
      <span>در این نسخه نقشهٔ پایه در دسترس است؛ موقعیت‌های همراهان هنوز نمایش داده نمی‌شوند.</span>
    </v-card>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
const mapStyleUrl = computed(() => mapStyleForTheme(theme.isDark));
</script>

<style scoped>
.user-map-view {
  position: relative;
  width: 100%;
  height: calc(100dvh - 132px);
  min-height: 28rem;
  overflow: hidden;
  background: #e8efec;
  isolation: isolate;
}

.user-map-view__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
}

.user-map-view__toolbar {
  position: absolute;
  z-index: 2;
  inset-block-start: 1rem;
  inset-inline-end: 1rem;
  width: min(25rem, calc(100% - 2rem));
  pointer-events: none;
}

.user-map-view__toolbar-card {
  display: flex;
  min-height: 4.6rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}

.user-map-view__dashboard-button {
  flex: 0 0 auto;
}

.user-map-view__title-block {
  min-width: 0;
  flex: 1 1 auto;
}

.user-map-view__title-block p {
  margin: 0;
  color: #718584;
  font-size: 0.72rem;
  font-weight: 700;
}

.user-map-view__title-block h1 {
  margin: 0.15rem 0 0;
  color: #193536;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.45;
}

.user-map-view__map-chip {
  flex: 0 0 auto;
}

.user-map-view__notice {
  position: absolute;
  z-index: 2;
  inset-block-end: 1rem;
  inset-inline-start: 1rem;
  display: flex;
  max-width: min(30rem, calc(100% - 2rem));
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.75rem 0.9rem;
  color: #536d6c;
  background: rgba(var(--v-theme-surface), 0.94);
  font-size: 0.76rem;
  line-height: 1.65;
  backdrop-filter: blur(10px);
}

.user-map-view__notice :deep(.v-icon) {
  flex: 0 0 auto;
  margin-top: 0.08rem;
  color: #0e6666;
}

:global(:root.dark) .user-map-view__toolbar-card,
:global(:root.dark) .user-map-view__notice {
  background: rgba(27, 41, 42, 0.94);
}

:global(:root.dark) .user-map-view__title-block p,
:global(:root.dark) .user-map-view__notice {
  color: #a0b6b2;
}

:global(:root.dark) .user-map-view__title-block h1 {
  color: #edf5f2;
}

:global(:root.dark) .user-map-view__notice :deep(.v-icon) {
  color: #71c7be;
}

@media (max-width: 600px) {
  .user-map-view {
    height: calc(100dvh - 132px);
    min-height: 24rem;
  }

  .user-map-view__toolbar {
    inset-block-start: 0.65rem;
    inset-inline-end: 0.65rem;
    width: min(24rem, calc(100% - 1.3rem));
  }

  .user-map-view__toolbar-card {
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
  }

  .user-map-view__title-block h1 {
    font-size: 0.92rem;
  }

  .user-map-view__notice {
    inset-block-end: 0.65rem;
    inset-inline-start: 0.65rem;
    max-width: calc(100% - 1.3rem);
  }
}
</style>
