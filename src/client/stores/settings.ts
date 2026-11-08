import { computed, watch } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage, useMediaQuery, usePreferredReducedMotion } from '@vueuse/core';

/** Theme choice persisted in local storage. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** Canonical design tokens from `design/` — the single source of visual truth. */
export const DESIGN_TOKENS = Object.freeze({
  mobile: { width: 393, height: 852, scale: 2 },
  admin: { width: 1440, height: 900, sidebar: 264, topbar: 68, padding: 28 },
  colors: {
    primary: '#0E6666',
    primaryDeep: '#0A4B4B',
    danger: '#AF3438',
    mapLand: '#F0F2EC',
    mapWater: '#B6D7E4',
    mapPark: '#D3E6C6',
    mutedInk: '#4C5F60'
  },
  /** Ordered administrator chart series; red is reserved for SOS, incidents and errors. */
  adminSeries: ['#0E6666', '#B57A12', '#316D86', '#8A4B0F', '#2C7A57']
} as const);

/**
 * Theme, motion preference and canonical layout metrics.
 * System preference is observed through VueUse media queries instead of a hand-written listener.
 */
export const useSettingsStore = defineStore('settings', () => {
  const persisted = useLocalStorage<ThemeChoice>('bb-theme', 'system', {
    serializer: {
      read: (value: string): ThemeChoice => (value === 'light' || value === 'dark' || value === 'system' ? value : 'system'),
      write: (value: ThemeChoice): string => value
    }
  });
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const reducedMotion = usePreferredReducedMotion();
  const compactViewport = useMediaQuery('(max-width: 900px)');

  const themeChoice = computed<ThemeChoice>(() => persisted.value);
  const resolvedTheme = computed<'light' | 'dark'>(() => (persisted.value === 'system' ? (systemDark.value ? 'dark' : 'light') : persisted.value));
  const prefersReducedMotion = computed(() => reducedMotion.value === 'reduce');

  /**
   * Applies the resolved theme to the document element.
   *
   * @param choice Theme to persist.
   */
  function apply(choice: ThemeChoice): void {
    persisted.value = choice;
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme-choice', choice);
    document.documentElement.setAttribute('data-theme', resolvedTheme.value);
  }

  /** Cycles system → light → dark → system. */
  function cycle(): ThemeChoice {
    const next: ThemeChoice = persisted.value === 'system' ? 'light' : persisted.value === 'light' ? 'dark' : 'system';
    apply(next);
    return next;
  }

  watch(resolvedTheme, (value) => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', value);
  }, { immediate: true });

  return { themeChoice, resolvedTheme, prefersReducedMotion, compactViewport, apply, cycle, tokens: DESIGN_TOKENS };
});
