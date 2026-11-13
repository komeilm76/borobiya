<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTheme } from 'vuetify';
import { useSettingsStore } from '@/stores/settings.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import AppToastHost from '@/components/AppToastHost.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import AuthLayout from '@/layouts/AuthLayout.vue';
import MapLayout from '@/layouts/MapLayout.vue';
import AdminLayout from '@/layouts/AdminLayout.vue';

/**
 * Root shell. Chooses the layout from the matched route, applies the reduced-motion aware
 * route transition, and mounts the global toast host and command palette.
 */
const route = useRoute();
const settings = useSettingsStore();
const motion = useMotionPreferences();
/** Vuetify keeps its own theme object; it must follow the app's resolved theme or every
 * Vuetify control (admin tables, fields, buttons, dialogs) stays light while the shell is dark. */
const vuetifyTheme = useTheme();

const layout = computed(() => String(route.meta.layout ?? 'auth'));

watch(
  () => layout.value,
  (value) => {
    document.body.dataset.mode = value;
  },
  { immediate: true }
);

watch(
  () => settings.resolvedTheme,
  (value) => {
    document.documentElement.setAttribute('data-theme', value);
    vuetifyTheme.change(value === 'dark' ? 'borobiyaDark' : 'borobiyaLight');
  },
  { immediate: true }
);
</script>

<template>
  <div class="app-shell" :data-layout="layout">
    <Transition name="bb-route" mode="out-in" :duration="motion.base.value">
      <AuthLayout v-if="layout === 'auth'" :key="'auth'" />
      <MapLayout v-else-if="layout === 'map'" :key="'map'" />
      <AdminLayout v-else :key="'admin'" />
    </Transition>
    <CommandPalette />
    <AppToastHost />
  </div>
</template>

<style>
.bb-route-enter-active,
.bb-route-leave-active {
  transition: opacity var(--bb-route-duration, 220ms) var(--ease), transform var(--bb-route-duration, 220ms) var(--ease);
}
.bb-route-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.bb-route-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (prefers-reduced-motion: reduce) {
  .bb-route-enter-active,
  .bb-route-leave-active {
    transition: none;
  }
  .bb-route-enter-from,
  .bb-route-leave-to {
    transform: none;
  }
}
</style>
