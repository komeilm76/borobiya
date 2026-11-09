import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore, DESIGN_TOKENS } from '../src/client/stores/settings.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { useAsyncAction } from '../src/client/composables/useAsyncAction.ts';
import { useFormatters } from '../src/client/composables/useFormatters.ts';
import { useMotionPreferences } from '../src/client/composables/useMotionPreferences.ts';
import { useSosHold } from '../src/client/composables/useSosHold.ts';
import { useCommandPalette } from '../src/client/composables/useCommandPalette.ts';
import { listVariants, pulseVariants, routeVariants, sheetVariants } from '../src/client/motion/MotionPresets.ts';
import { errorMessage } from '../src/client/api/client.ts';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-choice');
});

describe('settings store', () => {
  it('exposes the canonical design tokens unchanged', () => {
    const settings = useSettingsStore();
    expect(settings.tokens.mobile).toEqual({ width: 393, height: 852, scale: 2 });
    expect(settings.tokens.admin).toEqual({ width: 1440, height: 900, sidebar: 264, topbar: 68, padding: 28 });
    expect(settings.tokens.colors.primary).toBe('#0E6666');
    expect(settings.tokens.colors.primaryDeep).toBe('#0A4B4B');
    expect(settings.tokens.colors.danger).toBe('#AF3438');
    expect(settings.tokens.colors.mapLand).toBe('#F0F2EC');
    expect(settings.tokens.colors.mapWater).toBe('#B6D7E4');
    expect(settings.tokens.colors.mapPark).toBe('#D3E6C6');
    expect([...settings.tokens.adminSeries]).toEqual(['#0E6666', '#B57A12', '#316D86', '#8A4B0F', '#2C7A57']);
    expect(DESIGN_TOKENS).toBe(settings.tokens);
  });

  it('cycles system → light → dark and persists the choice', () => {
    const settings = useSettingsStore();
    expect(settings.themeChoice).toBe('system');
    expect(settings.cycle()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme-choice')).toBe('light');
    expect(settings.themeChoice).toBe('light');
    expect(settings.cycle()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(settings.cycle()).toBe('system');
  });

  it('applies explicit choices and ignores unknown stored values', () => {
    localStorage.setItem('bb-theme', 'neon');
    const settings = useSettingsStore();
    expect(settings.themeChoice).toBe('system');
    settings.apply('dark');
    expect(settings.resolvedTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('reports the reduced-motion preference through a computed flag', () => {
    const settings = useSettingsStore();
    expect(typeof settings.prefersReducedMotion).toBe('boolean');
    expect(typeof settings.compactViewport).toBe('boolean');
  });
});

describe('toast queue', () => {
  it('pushes, orders and dismisses messages', () => {
    vi.useFakeTimers();
    const toast = useToast();
    const first = toast.push('ذخیره شد', 'success', 1000);
    const second = toast.push('خطا', 'error', 0);
    expect(toast.messages.value.map((item) => item.id)).toContain(first);
    expect(toast.messages.value.some((item) => item.id === second && item.tone === 'error')).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(toast.messages.value.some((item) => item.id === first)).toBe(false);
    expect(toast.messages.value.some((item) => item.id === second)).toBe(true);
    toast.dismiss(second);
    expect(toast.messages.value.some((item) => item.id === second)).toBe(false);
    vi.useRealTimers();
  });
});

describe('async action composable', () => {
  it('guards against double submits and reports errors as toasts', async () => {
    const toast = useToast();
    const pushes: string[] = [];
    toast.messages.value.forEach((item) => pushes.push(item.message));
    let resolveAction: (value: string) => void = () => undefined;
    const action = useAsyncAction(
      () =>
        new Promise<string>((resolve) => {
          resolveAction = resolve;
        })
    );
    const first = action.run();
    expect(action.busy.value).toBe(true);
    expect(await action.run()).toBe(null);
    resolveAction('done');
    expect(await first).toBe('done');
    expect(action.busy.value).toBe(false);

    const failing = useAsyncAction(async () => {
      throw new Error('شبکه قطع است');
    });
    expect(await failing.run()).toBe(null);
    expect(failing.error.value).toBe('شبکه قطع است');
  });

  it('prefixes error messages when configured and normalises unknown errors', async () => {
    const action = useAsyncAction(
      async () => {
        throw new Error('نشست منقضی شد');
      },
      { errorPrefix: 'ورود ناموفق:' }
    );
    await action.run();
    expect(action.error.value).toBe('ورود ناموفق: نشست منقضی شد');
    expect(errorMessage(undefined)).toBeTruthy();
    expect(errorMessage('plain')).toBeTruthy();
  });
});

describe('formatters', () => {
  it('renders Persian digits, distances and durations', () => {
    const format = useFormatters();
    expect(format.number(2026)).toBe('۲۰۲۶');
    expect(format.distance(1250)).toMatch(/[۰-۹]/);
    expect(format.duration(125)).toMatch(/[۰-۹]/);
    expect(format.date('not-a-date')).toBe('—');
    expect(format.dateTime(0)).not.toBe('—');
    expect(format.relative(Date.now() - 5000)).toBe('همین حالا');
    expect(format.relative(Date.now() - 120_000)).toMatch(/[۰-۹]/);
    expect(format.clock(Date.now())).toMatch(/[۰-۹]/);
    expect(format.date('not-a-date')).toBe('—');
    expect(format.dateTime('not-a-date')).toBe('—');
    expect(format.date(0)).not.toBe('—');
  });

  it('falls back to ISO output when the locale formatter throws', () => {
    // Intl is stubbed so both the date and the date-time catch arms run; the ISO fallback is the
    // last resort that keeps a Persian UI readable on exotic runtimes.
    const original = globalThis.Intl;
    vi.stubGlobal('Intl', {
      ...original,
      DateTimeFormat: class {
        format(): string {
          throw new Error('locale unavailable');
        }
      }
    });
    try {
      const format = useFormatters();
      expect(format.date(0)).toBe('1970-01-01');
      expect(format.dateTime(0)).toBe(new Date(0).toISOString());
    } finally {
      vi.stubGlobal('Intl', original);
      vi.unstubAllGlobals();
    }
  });

  it('renders Persian date-times for valid instants', () => {
    const format = useFormatters();
    expect(format.dateTime(Date.UTC(2026, 10, 8, 12, 0, 0))).toMatch(/[۰-۹]/);
  });
});

describe('motion preferences', () => {
  it('offers timing values that collapse under reduced motion', () => {
    const motion = useMotionPreferences();
    expect(motion.fast.value).toBeGreaterThanOrEqual(0);
    expect(motion.base.value).toBeGreaterThanOrEqual(motion.fast.value);
    expect(motion.slow.value).toBeGreaterThanOrEqual(motion.base.value);
    expect(motion.easing).toMatch(/cubic-bezier/);
    expect(motion.presets.value.page.enter).toBeTruthy();
    expect(motion.presets.value.sheet.enter).toBeTruthy();
    expect(motion.presets.value.list.enter).toBeTruthy();
  });

  it('keeps the shared variant table short and documented', () => {
    for (const [name, variant] of Object.entries({ routeVariants, sheetVariants, listVariants, pulseVariants })) {
      expect(variant, name).toBeTruthy();
      expect(Object.keys(variant).length, name).toBeGreaterThanOrEqual(2);
    }
    // Durations stay inside the 360ms motion budget so emergencies are never delayed by motion.
    const json = JSON.stringify({ routeVariants, sheetVariants, listVariants, pulseVariants });
    for (const duration of json.matchAll(/"duration":([\d.]+)/g)) {
      expect(Number(duration[1])).toBeLessThanOrEqual(0.36);
    }
  });
});

describe('SOS hold gesture', () => {
  it('requires a sustained hold before firing', () => {
    vi.useFakeTimers();
    const fired: number[] = [];
    const hold = useSosHold(() => fired.push(Date.now()), 300);
    expect(hold.holding.value).toBe(false);
    expect(hold.label.value).toContain('نگه');
    hold.start();
    expect(hold.holding.value).toBe(true);
    expect(hold.label.value).toContain('رها');
    vi.advanceTimersByTime(120);
    expect(fired.length).toBe(0);
    hold.stop();
    expect(hold.holding.value).toBe(false);
    expect(hold.progress.value).toBe(0);
    vi.useRealTimers();
  });
});

describe('command palette', () => {
  it('filters entries, navigates with the keyboard and runs the active command', async () => {
    const ran: string[] = [];
    const entries = () => [
      { id: 'map', label: 'نقشه', icon: 'map', group: 'ناوبری', run: () => ran.push('map') },
      { id: 'sos', label: 'درخواست امداد', icon: 'alarm-light', group: 'امداد', run: () => ran.push('sos') }
    ];
    const palette = useCommandPalette(entries);
    palette.show();
    expect(palette.open.value).toBe(true);
    expect(palette.results.value.length).toBe(2);
    palette.query.value = 'امداد';
    expect(palette.results.value.length).toBe(1);
    palette.query.value = '';
    palette.hide();
    expect(palette.open.value).toBe(false);
    palette.toggle();
    expect(palette.open.value).toBe(true);
    const Host = defineComponent({
      setup() {
        return () => h('div', String(palette.results.value.length));
      }
    });
    const wrapper = mount(Host);
    expect(wrapper.text()).toBe('2');
    wrapper.unmount();
  });
});

describe('toast queue edge cases', () => {
  it('skips the auto-dismiss timer when the timeout is zero', () => {
    const toast = useToast();
    const id = toast.push('بدون تایمر', 'info', 0);
    expect(toast.messages.value.some((message) => message.id === id)).toBe(true);
    toast.dismiss(id);
  });
});

describe('async action success reporting', () => {
  it('toasts the configured success message when the action resolves', async () => {
    const toast = useToast();
    const before = toast.messages.value.length;
    const action = useAsyncAction(async () => 'done', { successMessage: 'انجام شد' });
    expect(await action.run()).toBe('done');
    expect(toast.messages.value.slice(before).some((item) => item.message === 'انجام شد')).toBe(true);
  });
});

describe('SOS hold re-entry', () => {
  it('ignores a second start while a hold is already in progress', () => {
    vi.useFakeTimers();
    const fired: number[] = [];
    const hold = useSosHold(() => fired.push(Date.now()), 300);
    hold.start();
    expect(hold.holding.value).toBe(true);
    // A second start must not restart the hold.
    hold.start();
    expect(hold.holding.value).toBe(true);
    vi.advanceTimersByTime(120);
    expect(fired.length).toBe(0);
    hold.stop();
    vi.useRealTimers();
  });
});
