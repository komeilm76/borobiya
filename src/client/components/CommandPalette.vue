<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { useCommandPalette, commandPaletteOpen } from '@/composables/useCommandPalette.ts';
import { useAuthStore } from '@/stores/auth.ts';
import { useSosStore } from '@/stores/sos.ts';
import { useSettingsStore } from '@/stores/settings.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { ROLES } from '@shared/protocol.ts';

/**
 * Global command palette (Ctrl/Cmd + K). Command discovery is role-aware and execution routes
 * through the same stores as the visible navigation, so there is no second code path.
 */
const router = useRouter();
const auth = useAuthStore();
const sos = useSosStore();
const settings = useSettingsStore();
const palette = useCommandPalette(() => [
  ...(auth.user?.role === ROLES.ADMIN
    ? [
        { id: 'admin-overview', label: 'نمای کلی', icon: 'view-dashboard-outline', group: 'مدیریت', run: () => router.push({ name: ROUTE_NAMES.adminOverview }) },
        { id: 'admin-dispatch', label: 'تخته اعزام', icon: 'bullseye-arrow', group: 'مدیریت', run: () => router.push({ name: ROUTE_NAMES.adminDispatch }) },
        { id: 'admin-users', label: 'کاربران', icon: 'account-multiple-outline', group: 'مدیریت', run: () => router.push({ name: ROUTE_NAMES.adminUsers }) },
        { id: 'admin-alerts', label: 'هشدارها', icon: 'bell-alert-outline', group: 'مدیریت', run: () => router.push({ name: ROUTE_NAMES.adminAlerts }) },
        { id: 'admin-settings', label: 'تنظیمات', icon: 'wrench-outline', group: 'مدیریت', run: () => router.push({ name: ROUTE_NAMES.adminSettings }) }
      ]
    : [
        { id: 'map', label: 'نقشه', icon: 'routes', group: 'نقشه', run: () => router.push({ name: ROUTE_NAMES.map }) },
        { id: 'sos', label: 'درخواست امداد', icon: 'alarm-light', group: 'امداد', run: () => router.push({ name: ROUTE_NAMES.sos }) },
        { id: 'mission', label: 'مأموریت', icon: 'web', group: 'امداد', run: () => router.push({ name: ROUTE_NAMES.mission }) },
        { id: 'sharing', label: 'اشتراک‌گذاری', icon: 'share-variant', group: 'اشتراک‌گذاری', run: () => router.push({ name: ROUTE_NAMES.sharing }) },
        { id: 'history', label: 'تاریخچه', icon: 'history', group: 'تاریخچه', run: () => router.push({ name: ROUTE_NAMES.history }) },
        { id: 'trips', label: 'سفرها', icon: 'map-marker-path', group: 'نقشه', run: () => router.push({ name: ROUTE_NAMES.trips }) }
      ]),
  { id: 'profile', label: 'نمایه و دستگاه‌ها', icon: 'account', group: 'حساب', run: () => router.push({ name: ROUTE_NAMES.profile }) },
  { id: 'theme', label: 'تغییر پوسته', icon: 'theme-light-dark', group: 'تنظیمات', run: () => settings.cycle() },
  { id: 'refresh', label: 'به‌روزرسانی داده‌ها', icon: 'sync', group: 'تنظیمات', run: () => void sos.load() }
], commandPaletteOpen);

const searchInput = ref<HTMLInputElement | null>(null);

async function activate(index: number): Promise<void> {
  const entry = palette.results.value[index];
  if (!entry) return;
  palette.hide();
  entry.run();
}

watch(
  () => palette.open.value,
  async (value) => {
    if (!value) return;
    await nextTick();
    searchInput.value?.focus();
  }
);

useEventListener(searchInput, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  // The composable already listens on `window`, and the search field is inside it, so this event
  // reaches both handlers. Move the highlight here and stop it there: one press must move one row.
  // Without this the highlight advanced twice per press and Enter ran the command below it.
  event.stopPropagation();
  event.preventDefault();
  const total = palette.results.value.length;
  if (!total) return;
  const delta = event.key === 'ArrowDown' ? 1 : -1;
  palette.activeIndex.value = (palette.activeIndex.value + delta + total) % total;
});

const hasResults = computed(() => palette.results.value.length > 0);
</script>

<template>
  <Transition name="bb-palette">
    <div v-if="palette.open.value" class="command-backdrop" data-testid="command-palette" @click.self="palette.hide()">
      <div class="command-panel" role="dialog" aria-modal="true" aria-label="فرمان‌های سریع">
        <div class="command-search">
          <span class="mdi mdi-magnify" aria-hidden="true" />
          <input
            ref="searchInput"
            v-model="palette.query.value"
            type="search"
            placeholder="جست‌وجوی فرمان"
            aria-label="جست‌وجوی فرمان"
            data-testid="command-search"
          >
          <kbd>Esc</kbd>
        </div>
        <p class="command-status" data-testid="command-status" role="status" aria-live="polite">
          {{ palette.results.value.length }} فرمان
        </p>
        <ul class="command-list" role="listbox" :aria-label="`${palette.results.value.length} فرمان`">
          <li v-for="(entry, index) in palette.results.value" :key="entry.id" role="none">
            <button
              type="button"
              role="option"
              :aria-selected="index === palette.activeIndex.value ? 'true' : 'false'"
              :class="['command-item', { 'is-keyboard-active': index === palette.activeIndex.value }]"
              @click="activate(index)"
            >
              <span :class="['mdi', `mdi-${entry.icon}`]" aria-hidden="true" />
              <span>{{ entry.label }}</span>
              <small>{{ entry.group }}</small>
            </button>
          </li>
        </ul>
        <p v-if="!hasResults" class="command-empty">فرمانی پیدا نشد.</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bb-palette-enter-active,
.bb-palette-leave-active {
  transition: opacity 180ms var(--ease);
}
.bb-palette-enter-from,
.bb-palette-leave-to {
  opacity: 0;
}
.command-status {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.command-panel {
  inline-size: min(560px, calc(100vw - 32px));
  margin: 12vh auto 0;
}
@media (prefers-reduced-motion: reduce) {
  .bb-palette-enter-active,
  .bb-palette-leave-active {
    transition: none;
  }
}
</style>
