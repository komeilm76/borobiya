import type { App } from 'vue';
import { MotionPlugin } from '@vueuse/motion';
import { gsap } from 'gsap';

/** Motion features used by the application; documented for the performance gate. */
export const MOTION_SURFACE = Object.freeze({
  route: 'Vue <Transition> with a 160–240ms fade/slide that collapses to 0ms under reduced motion',
  sheet: 'motion-v spring transition for the mobile map sheet',
  list: '<TransitionGroup> for live SOS, mission and alert rows',
  directive: '@vueuse/motion v-motion directives on cards and command palette',
  timeline: 'GSAP timelines for the SOS rail and administrator chart reveals only'
});

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
  timeline.fromTo(targets, { opacity: 0, y: reduced ? 0 : 10 }, { opacity: 1, y: 0 });
  return timeline;
}
