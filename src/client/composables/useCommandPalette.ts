import { computed, ref } from 'vue';
import { useMagicKeys, whenever, useEventListener } from '@vueuse/core';

/** One entry in the command palette. */
export interface CommandEntry {
  id: string;
  label: string;
  icon: string;
  group: string;
  run: () => void;
}

/**
 * Keyboard command palette state.
 * `Ctrl/Cmd + K` is captured through VueUse `useMagicKeys`; arrow navigation is handled
 * with a single keydown listener rather than ad-hoc DOM queries.
 *
 * @param entries Commands available to the current role.
 * @returns Reactive open state, filtered list and keyboard handlers.
 */
export function useCommandPalette(entries: () => CommandEntry[]) {
  const open = ref(false);
  const query = ref('');
  const activeIndex = ref(0);
  const keys = useMagicKeys({ passive: false });

  const results = computed(() => {
    const term = query.value.trim().toLowerCase();
    const all = entries();
    if (!term) return all;
    return all.filter((entry) => `${entry.label} ${entry.group}`.toLowerCase().includes(term));
  });

  const show = (): void => {
    open.value = true;
    query.value = '';
    activeIndex.value = 0;
  };
  const hide = (): void => {
    open.value = false;
  };
  const toggle = (): void => {
    if (open.value) hide();
    else show();
  };

  whenever(computed(() => keys['Ctrl+K'].value || keys['Meta+K'].value), () => toggle());

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (!open.value) return;
    if (event.key === 'Escape') {
      hide();
      return;
    }
    if (!results.value.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex.value = (activeIndex.value + 1) % results.value.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      activeIndex.value = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      activeIndex.value = results.value.length - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = results.value[activeIndex.value];
      if (entry) {
        hide();
        entry.run();
      }
    }
  });

  return { open, query, activeIndex, results, show, hide, toggle };
}
