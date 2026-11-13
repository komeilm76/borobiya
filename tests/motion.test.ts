import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import { createApp } from 'vue';
import { MotionPlugin } from '@vueuse/motion';
import { installMotion, revealTimeline } from '../src/client/motion/index.ts';
import { useMotionPreferences } from '../src/client/composables/useMotionPreferences.ts';
import OverviewView from '../src/client/views/admin/OverviewView.vue';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * Motion is an accessibility contract, not decoration.
 *
 * `prefers-reduced-motion: reduce` is how a user tells the platform that animation makes them ill.
 * The CSS collapses transitions, but the components choose their own durations and the GSAP
 * timeline picks its own easing and stagger — so the preference has to reach every one of them.
 * A missed path is not a cosmetic slip: it is the exact thing the user asked not to happen.
 */

/** Rebuilds the media-query stub with a chosen reduced-motion answer. */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduce : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
}

/** Runs the composable inside its own scope so its media listeners do not outlive the test. */
function preferences() {
  const scope = effectScope();
  const motion = scope.run(() => useMotionPreferences())!;
  return { motion, stop: () => scope.stop() };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('preferences without a reduced-motion request', () => {
  beforeEach(() => stubReducedMotion(false));

  it('uses the documented durations', () => {
    const { motion, stop } = preferences();
    // These are the numbers the design tokens and the performance gate refer to.
    expect(motion.reduced.value).toBe(false);
    expect(motion.fast.value).toBe(160);
    expect(motion.base.value).toBe(240);
    expect(motion.slow.value).toBe(360);
    stop();
  });

  it('animates the page preset', () => {
    const { motion, stop } = preferences();
    const page = motion.presets.value.page;
    expect(page.initial).toMatchObject({ opacity: 0 });
    expect(page.enter).toMatchObject({ opacity: 1, y: 0 });
    stop();
  });

  it('keeps every duration inside the animation budget', () => {
    const { motion, stop } = preferences();
    // The performance gate asserts the budget; a duration above it is a regression it cannot see
    // because it only measures what the CSS declares.
    for (const preset of [motion.presets.value.page, motion.presets.value.sheet, motion.presets.value.list]) {
      for (const phase of Object.values(preset)) {
        const duration = (phase as { transition?: { duration?: number } }).transition?.duration;
        if (duration !== undefined) expect(duration).toBeLessThanOrEqual(0.36);
      }
    }
    stop();
  });
});

describe('preferences under prefers-reduced-motion', () => {
  beforeEach(() => stubReducedMotion(true));

  it('collapses every duration to zero', () => {
    const { motion, stop } = preferences();
    // Zero, not "shorter": a 40ms slide is still a slide to someone who asked to stop them.
    expect(motion.reduced.value).toBe(true);
    expect(motion.fast.value).toBe(0);
    expect(motion.base.value).toBe(0);
    expect(motion.slow.value).toBe(0);
    stop();
  });

  it('removes movement from every preset, not just the duration', () => {
    const { motion, stop } = preferences();
    // A transition duration of 0 still jumps: the element must start where it ends.
    for (const preset of [motion.presets.value.page, motion.presets.value.sheet, motion.presets.value.list]) {
      for (const phase of Object.values(preset)) {
        expect(phase).toEqual({ opacity: 1 });
      }
    }
    stop();
  });
});

describe('GSAP timeline', () => {
  it('returns an idle timeline for an empty target list instead of warning', () => {
    // Views call this right after mount, before an async list has rendered its rows. GSAP logs
    // "target not found" for an empty target list, which would be a console error on every load.
    const timeline = revealTimeline([]);
    expect(timeline).toBeTruthy();
    expect(typeof timeline.play).toBe('function');
    // An idle timeline has nothing scheduled, so it must report zero children rather than a tween.
    expect((timeline as unknown as { getChildren: () => unknown[] }).getChildren()).toHaveLength(0);
  });

  it('accepts a NodeList, which is what a view actually passes', () => {
    document.body.innerHTML = '<div class="metric-card"></div><div class="metric-card"></div>';
    const timeline = revealTimeline(document.querySelectorAll('.metric-card'));
    expect((timeline as unknown as { getChildren: () => unknown[] }).getChildren().length).toBeGreaterThan(0);
    timeline.kill();
  });

  it('builds a stagger for a set of elements', () => {
    document.body.innerHTML = '<span class="a"></span><span class="b"></span><span class="c"></span>';
    const timeline = revealTimeline(document.querySelectorAll('.a, .b, .c'));
    const tween = (timeline as unknown as { getChildren: () => Array<{ vars: Record<string, unknown> }> }).getChildren()[0];
    // The stagger is what makes the reveal read as a sequence rather than a flash.
    expect(tween.vars.stagger).toBe(0.05);
    timeline.kill();
  });

  it('collapses the stagger and the duration when motion is reduced', () => {
    document.body.innerHTML = '<span class="a"></span><span class="b"></span>';
    const timeline = revealTimeline(document.querySelectorAll('.a, .b'), true);
    const tween = (timeline as unknown as { getChildren: () => Array<{ vars: Record<string, unknown> }> }).getChildren()[0];
    expect(tween.vars.duration).toBe(0);
    expect(tween.vars.stagger).toBe(0);
    timeline.kill();
  });
});



describe('a view honours the preference', () => {
  /** Mounts the admin overview with the chart present. */
  async function renderOverview() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            requestId: 'req_motion',
            data: {
              kpis: { onlineResponders: 1, requestsToday: 2, activeMissions: 0, averageResponseSeconds: 90 },
              statusCounts: { pending: 1 },
              trend: [{ day: '2026-11-08', count: 2 }],
              groups: [],
              alerts: [],
              recentRequests: [],
              serverTime: 1794136403220
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.adminOverview });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(OverviewView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { wrapper };
  }

  it('reveals the chart when motion is allowed', async () => {
    stubReducedMotion(false);
    const { wrapper } = await renderOverview();
    // The reveal leaves the cards at their resting state; asserting opacity catches a tween that
    // started and never finished, which would leave the chart invisible.
    const cards = wrapper.findAll('.metric-card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect((card.element as HTMLElement).style.opacity === '' || (card.element as HTMLElement).style.opacity === '1').toBe(true);
    }
    wrapper.unmount();
  });

  it('leaves the chart untouched when motion is reduced', async () => {
    stubReducedMotion(true);
    const { wrapper } = await renderOverview();
    const card = wrapper.find('.metric-card').element as HTMLElement;
    // No inline opacity or transform: nothing animated it, so it sits at its resting state.
    //
    // Note what this does *not* prove. The view guards with `!motion.reduced.value` before calling
    // `revealTimeline`, but passing `reduced` into the timeline instead produces the same resting
    // state (verified: both leave `style.opacity` and `style.transform` empty). The two forms are
    // behaviourally equivalent here, so no assertion can separate them — the guard is a
    // performance choice, not the accessibility guarantee. The guarantee lives in the composable
    // and in `revealTimeline`, both covered above.
    expect(card.style.opacity).toBe('');
    expect(card.style.transform).toBe('');
    wrapper.unmount();
  });
});

describe('motion plugin installation', () => {
  it('installs the VueUse motion plugin on the host application', () => {
    const app = createApp({ render: () => null });
    const use = vi.spyOn(app, 'use');
    installMotion(app);
    // installMotion must hand the real plugin to the Vue app — nothing more, nothing less.
    expect(use).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledWith(MotionPlugin);
  });
});
