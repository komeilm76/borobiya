import { computed } from 'vue';
import { usePreferredReducedMotion } from '@vueuse/core';

/** Return type of {@link useMotionPreferences}; exported for component props. */
export interface MotionPreferences {
  reduced: import('vue').ComputedRef<boolean>;
  fast: import('vue').ComputedRef<number>;
  base: import('vue').ComputedRef<number>;
  slow: import('vue').ComputedRef<number>;
  easing: string;
  presets: import('vue').ComputedRef<{
    page: { initial: Record<string, unknown>; enter: Record<string, unknown>; leave: Record<string, unknown> };
    sheet: { initial: Record<string, unknown>; enter: Record<string, unknown>; leave: Record<string, unknown> };
    list: { initial: Record<string, unknown>; enter: Record<string, unknown> };
  }>;
}

/**
 * Motion configuration derived from the user's reduced-motion preference.
 * Every animation in the application asks this composable for its timing so accessibility
 * is enforced in one place instead of per component.
 *
 * @returns Durations and easing for transitions, plus a flag for expensive motion.
 */
export function useMotionPreferences(): MotionPreferences {
  const preference = usePreferredReducedMotion();
  const reduced = computed(() => preference.value === 'reduce');
  const fast = computed(() => (reduced.value ? 0 : 160));
  const base = computed(() => (reduced.value ? 0 : 240));
  const slow = computed(() => (reduced.value ? 0 : 360));
  const easing = 'cubic-bezier(.2,.8,.2,1)';

  return {
    reduced,
    fast,
    base,
    slow,
    easing,
    /** Motion presets for `motion-v` and `@vueuse/motion`. */
    presets: computed(() => ({
      page: reduced.value
        ? { initial: { opacity: 1 }, enter: { opacity: 1 }, leave: { opacity: 1 } }
        : {
            initial: { opacity: 0, y: 12 },
            enter: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] } },
            leave: { opacity: 0, y: -8, transition: { duration: 0.16 } }
          },
      sheet: reduced.value
        ? { initial: { opacity: 1 }, enter: { opacity: 1 }, leave: { opacity: 1 } }
        : {
            initial: { opacity: 0, y: 40 },
            enter: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 32 } },
            leave: { opacity: 0, y: 30, transition: { duration: 0.16 } }
          },
      list: reduced.value
        ? { initial: { opacity: 1 }, enter: { opacity: 1 } }
        : {
            initial: { opacity: 0, y: 8 },
            enter: { opacity: 1, y: 0, transition: { duration: 0.2 } }
          }
    }))
  };
}
