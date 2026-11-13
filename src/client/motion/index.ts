import type { App } from 'vue';
import { MotionPlugin } from '@vueuse/motion';
import { gsap } from 'gsap';

/**
 * Installs the VueUse motion plugin (v-motion directives and variants).
 *
 * @param app Vue application instance.
 */
export function installMotion(app: App): void {
  app.use(MotionPlugin);
}

/**
 * Builds a short GSAP timeline that respects the reduced-motion preference.
 * GSAP is used only where a declarative Vue transition cannot express a coordinated sequence.
 *
 * @param targets Elements to animate.
 * @param reduced Whether motion must be skipped.
 * @returns The created timeline (already configured with safe defaults).
 */
export function revealTimeline(targets: Element[] | NodeListOf<Element>, reduced = false) {
  const timeline = gsap.timeline({ defaults: { duration: reduced ? 0 : 0.32, ease: 'power2.out', stagger: reduced ? 0 : 0.05 } });
  // Views call this right after mount, before an async list has necessarily rendered its rows.
  // GSAP logs "target not found" for an empty target list, so skip the tween and return an idle
  // timeline instead of warning on a legitimately empty chart.
  if ((targets as ArrayLike<Element>).length === 0) return timeline;
  timeline.fromTo(targets, { opacity: 0, y: reduced ? 0 : 10 }, { opacity: 1, y: 0 });
  return timeline;
}
