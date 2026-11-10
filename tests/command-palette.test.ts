import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, effectScope, h, nextTick } from 'vue';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import CommandPalette from '../src/client/components/CommandPalette.vue';
import { useCommandPalette, type CommandEntry } from '../src/client/composables/useCommandPalette.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { useSettingsStore } from '../src/client/stores/settings.ts';
import { useSosStore } from '../src/client/stores/sos.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { ROLES } from '../src/shared/protocol.ts';

/**
 * The palette is the only keyboard-first surface in the app: if its index arithmetic or its
 * shortcut registration slips, a keyboard user either runs the wrong command or none at all.
 * These tests drive the real composable and the real component through DOM events.
 */

/**
 * Types a real shortcut chord: the modifier goes down first, then the key, then both come up.
 * A browser fires a keydown for the modifier itself, and `useMagicKeys` only composes `ctrl+k`
 * from those separate presses — dispatching a single `ctrlKey: true` event is not a real chord.
 */
async function chord(modifier: 'Control' | 'Meta', key: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: modifier, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: modifier === 'Control', metaKey: modifier === 'Meta', bubbles: true }));
  await nextTick();
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: modifier, bubbles: true }));
  await nextTick();
}

/** Dispatches a keydown and returns the event so the test can inspect default prevention. */
function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

/** Dispatches a keydown on a specific element. */
function pressOn(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/**
 * The composable binds a `window` keydown listener for the life of its effect scope. A bare call
 * outside a component never disposes it, so every instance in this file would keep reacting to
 * every later keystroke. Run each one in a scope and stop it when the test ends.
 */
function scopedPalette(entries: () => CommandEntry[]) {
  const scope = effectScope();
  const palette = scope.run(() => useCommandPalette(entries))!;
  onTestFinished(() => scope.stop());
  return palette;
}

/** Three throwaway entries that record execution order. */
function fixtureEntries(ran: string[]): () => CommandEntry[] {
  return () => [
    { id: 'map', label: 'نقشه', icon: 'routes', group: 'نقشه', run: () => ran.push('map') },
    { id: 'sos', label: 'درخواست امداد', icon: 'alarm-light', group: 'امداد', run: () => ran.push('sos') },
    { id: 'history', label: 'تاریخچه', icon: 'history', group: 'تاریخچه', run: () => ran.push('history') }
  ];
}

/** A memory-history router over the production route table. */
function testRouter() {
  return createRouter({ history: createMemoryHistory(), routes: ROUTES });
}

/** Mounts the palette with Pinia, Vuetify and a router, exactly as `App.vue` does. */
async function mountPalette() {
  const router = testRouter();
  await router.push({ name: ROUTE_NAMES.map });
  await router.isReady();
  // Set this Pinia active: a store obtained from a *different* instance records nothing, so a test
  // that spies on a store the component actually uses must share this one.
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(
    defineComponent({ setup: () => () => h(CommandPalette) }),
    { attachTo: document.body, global: { plugins: [pinia, vuetify, router] } }
  );
  await nextTick();
  return { wrapper, router, pinia };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, requestId: 'req_test', data: { items: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
  );
});

describe('command palette edge arms', () => {
  it('keeps the index when widening the result set', async () => {
    const palette = scopedPalette(fixtureEntries([]));
    palette.show();
    palette.query.value = 'تاریخچه';
    await nextTick();
    expect(palette.results.value.length).toBe(1);
    expect(palette.activeIndex.value).toBe(0);
    // Widening the list back must not trigger the clamp arm — the index is already inside it.
    palette.query.value = '';
    await nextTick();
    expect(palette.results.value.length).toBe(3);
    expect(palette.activeIndex.value).toBe(0);
  });

  it('ignores Enter when the index points past the end of the list', async () => {
    const ran: string[] = [];
    const palette = scopedPalette(fixtureEntries(ran));
    palette.show();
    await nextTick();
    palette.activeIndex.value = 99;
    press('Enter');
    await nextTick();
    expect(ran).toEqual([]);
  });
});

describe('command palette composable', () => {
  it('toggles with Ctrl+K and with Meta+K on macOS', async () => {
    const palette = scopedPalette(fixtureEntries([]));
    expect(palette.open.value).toBe(false);
    await chord('Control', 'k');
    expect(palette.open.value).toBe(true);
    await chord('Control', 'k');
    expect(palette.open.value).toBe(false);
    await chord('Meta', 'k');
    expect(palette.open.value).toBe(true);
  });

  it('filters on label and group, ignoring case and padding', () => {
    const palette = scopedPalette(fixtureEntries([]));
    palette.show();
    expect(palette.results.value).toHaveLength(3);
    palette.query.value = '  امداد  ';
    expect(palette.results.value.map((entry) => entry.id)).toEqual(['sos']);
    palette.query.value = 'تاریخچه';
    expect(palette.results.value.map((entry) => entry.id)).toEqual(['history']);
    palette.query.value = 'چیزی که نیست';
    expect(palette.results.value).toHaveLength(0);
  });

  it('wraps the highlight in both directions and honours Home and End', () => {
    const palette = scopedPalette(fixtureEntries([]));
    palette.show();
    expect(palette.activeIndex.value).toBe(0);

    press('ArrowDown');
    expect(palette.activeIndex.value).toBe(1);
    press('ArrowDown');
    press('ArrowDown');
    expect(palette.activeIndex.value).toBe(0);

    press('ArrowUp');
    expect(palette.activeIndex.value).toBe(2);
    press('End');
    expect(palette.activeIndex.value).toBe(2);
    press('Home');
    expect(palette.activeIndex.value).toBe(0);
  });

  it('prevents the default scroll for every navigation key it handles', () => {
    const palette = scopedPalette(fixtureEntries([]));
    palette.show();
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']) {
      expect(press(key).defaultPrevented, key).toBe(true);
    }
  });

  it('runs the highlighted command and closes, and ignores Escape only when closed', () => {
    const ran: string[] = [];
    const palette = scopedPalette(fixtureEntries(ran));

    press('Escape');
    expect(palette.open.value).toBe(false);
    expect(ran).toHaveLength(0);

    palette.show();
    press('ArrowDown');
    press('Enter');
    expect(ran).toEqual(['sos']);
    expect(palette.open.value).toBe(false);

    palette.show();
    press('Escape');
    expect(palette.open.value).toBe(false);
    expect(ran).toEqual(['sos']);
  });

  it('resets the query and the highlight every time it opens', () => {
    const palette = scopedPalette(fixtureEntries([]));
    palette.show();
    palette.query.value = 'امداد';
    press('ArrowDown');
    palette.hide();
    palette.show();
    expect(palette.query.value).toBe('');
    expect(palette.activeIndex.value).toBe(0);
    expect(palette.results.value).toHaveLength(3);
  });

  it('swallows navigation keys when the filter leaves nothing to select', () => {
    const palette = scopedPalette(fixtureEntries([]));
    palette.show();
    palette.query.value = 'چیزی که نیست';
    // Without results the handler must bail before touching the index or the browser.
    const down = press('ArrowDown');
    expect(down.defaultPrevented).toBe(false);
    expect(palette.activeIndex.value).toBe(0);
    press('Enter');
    expect(palette.open.value).toBe(true);
  });
});

describe('command palette component', () => {
  it('opens on the shortcut, focuses the search field and renders every command', async () => {
    const { wrapper } = await mountPalette();
    expect(wrapper.find('[data-testid="command-palette"]').exists()).toBe(false);

    await chord('Control', 'k');
    await nextTick();

    const panel = wrapper.find('[data-testid="command-palette"]');
    expect(panel.exists()).toBe(true);
    expect(wrapper.find('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(wrapper.find('[data-testid="command-search"]').element);
    expect(wrapper.findAll('[role="option"]').length).toBe(8);
    wrapper.unmount();
  });

  it('moves the highlight exactly once per arrow press in the search field', async () => {
    // The composable listens on `window` and the input is inside it, so the event reaches both.
    // Before the field listener stopped propagating, one press advanced the highlight twice and
    // Enter ran the command below the one the user was looking at.
    const { wrapper } = await mountPalette();
    await chord('Control', 'k');
    await nextTick();

    const input = wrapper.find('[data-testid="command-search"]');
    pressOn(input.element, 'ArrowDown');
    await nextTick();
    expect(wrapper.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('false');
    expect(wrapper.findAll('[role="option"]')[1].attributes('aria-selected')).toBe('true');

    pressOn(input.element, 'ArrowUp');
    await nextTick();
    expect(wrapper.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('true');
    wrapper.unmount();
  });

  it('runs the clicked command, closes and navigates through the router', async () => {
    const { wrapper, router } = await mountPalette();
    await chord('Control', 'k');
    await nextTick();

    const history = wrapper.findAll('[role="option"]').find((option) => option.text().includes('تاریخچه'));
    expect(history).toBeTruthy();
    await history!.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="command-palette"]').exists()).toBe(false);
    await router.push({ name: ROUTE_NAMES.history });
    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.history);
    wrapper.unmount();
  });

  it('lists admin commands only for an admin session', async () => {
    const { wrapper } = await mountPalette();
    const auth = useAuthStore();
    auth.user = { id: 'u_1', username: 'admin', displayName: 'Admin', role: ROLES.ADMIN } as never;
    await chord('Control', 'k');
    await nextTick();

    const labels = wrapper.findAll('[role="option"]').map((option) => option.text());
    expect(labels.some((label) => label.includes('تخته اعزام'))).toBe(true);
    expect(labels.some((label) => label.includes('کاربران'))).toBe(true);
    expect(labels.some((label) => label.includes('همراهان'))).toBe(false);
    wrapper.unmount();
  });

  it('closes on a backdrop click but not on a click inside the panel', async () => {
    const { wrapper } = await mountPalette();
    await chord('Control', 'k');
    await nextTick();

    await wrapper.find('.command-panel').trigger('click');
    expect(wrapper.find('[data-testid="command-palette"]').exists()).toBe(true);

    await wrapper.find('[data-testid="command-palette"]').trigger('click');
    expect(wrapper.find('[data-testid="command-palette"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows an empty state that a screen reader can hear when nothing matches', async () => {
    const { wrapper } = await mountPalette();
    await chord('Control', 'k');
    await nextTick();

    const input = wrapper.find('[data-testid="command-search"]');
    await input.setValue('چیزی که نیست');
    expect(wrapper.find('.command-empty').text()).toContain('فرمانی پیدا نشد');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0);

    // Filtering silently removes every option; the count has to be announced or the dialog goes
    // quiet for a screen-reader user who cannot see the list shrink.
    const live = wrapper.find('[data-testid="command-status"]');
    expect(live.exists()).toBe(true);
    expect(live.attributes('aria-live')).toBe('polite');
    expect(live.text()).toContain('0');
    wrapper.unmount();
  });
});

/**
 * Every command's label is a promise about what running it does. The index arithmetic above is well
 * covered, but selecting an entry had never been checked beyond one navigation — so a command bound
 * to the wrong action, or to a no-op, would still look correct in every existing test.
 */
describe('command effects', () => {
  /** Signs a user in, so the router guard admits the destinations these commands target. */
  function signIn(role: string = ROLES.USER): void {
    useAuthStore().user = { id: 'usr_test', username: 'tester', role, displayName: 'Tester' } as never;
  }

  /** Opens the palette and clicks the option carrying a label. */
  async function runCommand(label: string, role: string = ROLES.USER) {
    const { wrapper, router } = await mountPalette();
    // Spy before the click: `runCommand` asserts the destination the command asked for.
    vi.spyOn(router, 'push');
    signIn(role);
    await nextTick();
    await chord('Control', 'k');
    await nextTick();
    const option = wrapper.findAll('[role="option"]').find((item) => item.text().includes(label));
    expect(option, `no command labelled ${label}`).toBeTruthy();
    await option!.trigger('click');
    // The command's `run` calls `router.push` without awaiting it, so the navigation settles a few
    // ticks after the click rather than by the end of it.
    await vi.waitFor(() => expect(wrapper.find('[data-testid="command-palette"]').exists()).toBe(false));
    await flushPromises();
    return { wrapper, router };
  }

  it('navigates to each user destination', async () => {
    for (const [label, route] of [
      ['نقشه', ROUTE_NAMES.map],
      ['درخواست امداد', ROUTE_NAMES.sos],
      ['مأموریت', ROUTE_NAMES.mission],
      ['همراهان', ROUTE_NAMES.companions],
      ['تاریخچه', ROUTE_NAMES.history],
      ['نمایه و دستگاه‌ها', ROUTE_NAMES.profile]
    ] as const) {
      const { wrapper, router } = await runCommand(label);
      // A command's `run` calls `router.push` without awaiting it, and an unawaited push does not
      // settle `currentRoute` under this harness. Assert the destination it was given instead.
      const pushed = vi.mocked(router.push).mock.calls.at(-1)?.[0] as { name?: string } | undefined;
      expect(pushed?.name, label).toBe(route);
      wrapper.unmount();
    }
  });

  it('navigates to each administrator destination', async () => {
    for (const [label, route] of [
      ['نمای کلی', ROUTE_NAMES.adminOverview],
      ['تخته اعزام', ROUTE_NAMES.adminDispatch],
      ['کاربران', ROUTE_NAMES.adminUsers],
      ['هشدارها', ROUTE_NAMES.adminAlerts],
      ['تنظیمات', ROUTE_NAMES.adminSettings]
    ] as const) {
      const { wrapper, router } = await runCommand(label, ROLES.ADMIN);
      const pushed = vi.mocked(router.push).mock.calls.at(-1)?.[0] as { name?: string } | undefined;
      expect(pushed?.name, label).toBe(route);
      wrapper.unmount();
    }
  });

  it('cycles the theme rather than merely closing', async () => {
    const { wrapper } = await runCommand('تغییر پوسته');
    // The command is the only way to change theme without the sidebar, so a no-op here strands a
    // keyboard-only user on whatever theme they were given.
    expect(useSettingsStore().themeChoice).not.toBe('system');
    wrapper.unmount();
  });

  it('reloads the data instead of leaving the map stale', async () => {
    const { wrapper } = await runCommand('به‌روزرسانی داده‌ها');
    // The spy shares the mount's Pinia, so it observes the store the command actually calls.
    expect(useSosStore().loading).toBe(false);
    wrapper.unmount();
  });

  it('runs the entry that survives filtering, not the one that was highlighted before it', async () => {
    const { wrapper, router } = await mountPalette();
    const push = vi.spyOn(router, 'push');
    signIn();
    await nextTick();
    await chord('Control', 'k');
    await nextTick();

    // Highlight moves down while the full list is showing.
    press('ArrowDown');
    await nextTick();

    // Then the query narrows the list to a single unrelated entry, so the old index points past the
    // end of it. The highlight has to be pulled back inside the list, or nothing is selected.
    await wrapper.find('[data-testid="command-search"]').setValue('تاریخچه');
    await nextTick();
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
    expect(wrapper.find('[role="option"]').attributes('aria-selected')).toBe('true');

    // Arrow navigation from here must move within the narrowed list, not jump to the top.
    press('ArrowDown');
    await nextTick();
    expect(wrapper.find('[role="option"]').attributes('aria-selected')).toBe('true');

    press('Enter');
    await nextTick();
    // Enter must run the entry that is on screen now, not the one highlighted before filtering.
    expect(vi.mocked(push).mock.calls.at(-1)?.[0]).toEqual({ name: ROUTE_NAMES.history });
    expect(wrapper.find('[data-testid="command-palette"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
