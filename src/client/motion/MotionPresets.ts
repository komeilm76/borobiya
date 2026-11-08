import type { Variants } from 'motion-v';

/**
 * Shared `motion-v` variants. Durations stay under 360ms and collapse under reduced motion,
 * which keeps the animation budget measurable in the performance gate.
 */
export const routeVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] } },
  leave: { opacity: 0, y: -8, transition: { duration: 0.16 } }
};

/** Sheet transition used by the mobile map bottom sheet. */
export const sheetVariants: Variants = {
  initial: { opacity: 0, y: 40 },
  enter: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 32 } },
  leave: { opacity: 0, y: 30, transition: { duration: 0.16 } }
};

/** Row/item transition for live lists. */
export const listVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  leave: { opacity: 0, transition: { duration: 0.12 } }
};

/** SOS state-change emphasis; deliberately short so emergencies are not delayed by motion. */
export const pulseVariants: Variants = {
  idle: { scale: 1 },
  active: { scale: [1, 1.04, 1], transition: { duration: 0.36 } }
};
