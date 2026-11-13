import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import AdminLayout from '../src/client/layouts/AdminLayout.vue';
import { useAdminStore } from '../src/client/stores/admin.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { useRealtimeStore } from '../src/client/stores/realtime.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { HTTP_EVENTS } from '../src/shared/protocol.ts';
import { commandPaletteOpen } from '../src/client/composables/useCommandPalette.ts';

/**
 * The administrator shell is the only place that keeps the console live. It subscribes to realtime
 * events and refreshes just the slice each one invalidates; if a subscription is dropped, that
 * counter silently stops updating and the console displays stale operational data — the one thing
 * it must not do. It is also the only screen a disconnected operator sees, so the connection pill
 * has to be honest.
 */

const UNRESOLVED_ALERT = {
  id: 'alt_1',
  kind: 'capacity',
  severity: 'high',
  message: 'گروه پزشکی از ظرفیت گذشت.',
  createdAt: 1794136403220,
  resolvedAt: null,
  resolvedBy: null
};

const RESOLVED_ALERT = {
  ...UNRESOLVED_ALERT,
  id: 'alt_2',
  message: 'هشدار پیشین',
  resolvedAt: 1794136403220,
  resolvedBy: 'usr_admin'
};

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_layout', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double covering everything `loadAll` requests. */
function stubApi(options: { alerts?: unknown[] } = {}) {
  const calls: Array<{ method: string; path: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path });

      if (path === '/_admin/overview') {
        return json({
          kpis: { onlineResponders: 1, requestsToday: 2, activeMissions: 0, averageResponseSeconds: 90 },
          statusCounts: { pending: 1 },
          trend: [{ day: '2026-11-08', count: 2 }],
          groups: [],
          alerts: [],
          recentRequests: [],
          serverTime: 1794136403220
        });
      }
      if (path === '/_admin/dispatch') return json({ queue: { items: [], total: 0 }, groups: { items: [], total: 0 }, incidentTypes: { items: [], total: 0 } });
      if (path === '/_admin/groups') return json({ items: [], total: 0 });
      if (path === '/_admin/alerts') {
        const items = options.alerts ?? [UNRESOLVED_ALERT, RESOLVED_ALERT];
        return json({ items, total: items.length });
      }
      if (path === '/_admin/settings') return json({ items: [], total: 0 });
      if (path === '/_admin/support-requests') return json({ items: [], total: 0 });
      if (path === '/_auth/logout') return json({ ok: true });
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

/** Mounts the shell on an admin route. */
async function render(options: { alerts?: unknown[] } = {}) {
  const calls = stubApi(options);
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminOverview });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(AdminLayout, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return {
    wrapper,
    router,
    calls,
    admin: useAdminStore(),
    auth: useAuthStore(),
    realtime: useRealtimeStore()
  };
}

/** Delivers a server-sent event through the realtime client's registered handlers. */
async function deliver(realtime: ReturnType<typeof useRealtimeStore>, type: string, payload: unknown) {
  // `RealtimeClient.emit` is private, so reach the handler map the same way the socket does.
  const handlers = (realtime.client as any)?.handlers as Map<string, Set<(data: unknown) => void>> | undefined;
  const set = handlers?.get(type);
  if (set) for (const handler of set) handler(payload);
  await flushPromises();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.stubGlobal('WebSocket', class {
    static OPEN = 1;
    readyState = 0;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: unknown) => void) | null = null;
    constructor(public url: string) {}
    send() {}
    close() {}
  });
  vi.stubGlobal('fetch', vi.fn(async () => json({ ticket: 'ticket_1' })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('navigation', () => {
  it('lists every administrator destination', async () => {
    const { wrapper } = await render();
    const links = wrapper.findAll('.admin-nav__item');
    expect(links).toHaveLength(11);
    const labels = links.map((link) => link.text());
    expect(labels.some((label) => label.includes('اعزام'))).toBe(true);
    expect(labels.some((label) => label.includes('درخواست‌های نیرو'))).toBe(true);
    expect(labels.some((label) => label.includes('تنظیمات'))).toBe(true);
    wrapper.unmount();
  });

  it('marks the current screen as the current page', async () => {
    const { wrapper } = await render();
    const current = wrapper.findAll('.admin-nav__item').filter((link) => link.attributes('aria-current') === 'page');
    // Exactly one, or a screen reader announces the whole sidebar as the current page.
    expect(current).toHaveLength(1);
    expect(current[0].text()).toContain('نمای کلی');
    wrapper.unmount();
  });

  it('shows the page heading and the signed-in operator', async () => {
    const { wrapper, auth } = await render();
    auth.user = { id: 'usr_admin', username: 'admin', role: 'admin' } as any;
    await flushPromises();
    expect(wrapper.find('.admin-topbar').text()).toContain('admin');
    wrapper.unmount();
  });
});

describe('small-screen navigation', () => {
  it('opens the drawer from the hamburger and closes it on Escape', async () => {
    const { wrapper } = await render();
    expect(wrapper.find('.admin-drawer').exists()).toBe(false);

    await wrapper.find('.admin-menu-button').trigger('click');
    expect(wrapper.find('.admin-drawer').exists()).toBe(true);
    // The drawer must carry the full labeled destinations, not icon-only dots.
    expect(wrapper.find('.admin-drawer').text()).toContain('اعزام');
    expect(wrapper.find('.admin-drawer').text()).toContain('تنظیمات');
    expect(wrapper.find('.admin-menu-button').attributes('aria-expanded')).toBe('true');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('.admin-drawer').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes the drawer when the backdrop is clicked', async () => {
    const { wrapper } = await render();
    await wrapper.find('.admin-menu-button').trigger('click');
    expect(wrapper.find('.admin-drawer').exists()).toBe(true);

    await wrapper.find('.admin-drawer-backdrop').trigger('click');
    expect(wrapper.find('.admin-drawer').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes the drawer when the route changes', async () => {
    const { wrapper, router } = await render();
    await wrapper.find('.admin-menu-button').trigger('click');
    expect(wrapper.find('.admin-drawer').exists()).toBe(true);

    await router.push({ name: ROUTE_NAMES.adminUsers });
    await flushPromises();
    expect(wrapper.find('.admin-drawer').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('alert badge', () => {
  it('counts only unresolved alerts', async () => {
    const { wrapper } = await render();
    const badge = wrapper.find('.admin-nav__badge');
    // The resolved alert must not inflate an operator's sense of what needs attention.
    expect(badge.text()).toBe('1');
    wrapper.unmount();
  });

  it('hides the badge when nothing is outstanding', async () => {
    const { wrapper } = await render({ alerts: [RESOLVED_ALERT] });
    expect(wrapper.find('.admin-nav__badge').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('live updates', () => {
  it('refreshes the dispatch queue when an SOS arrives', async () => {
    const { wrapper, calls, realtime } = await render();
    const before = calls.filter((call) => call.path === '/_admin/dispatch').length;
    await deliver(realtime, HTTP_EVENTS.SOS_CREATED, { sosId: 'sos_1' });
    const after = calls.filter((call) => call.path === '/_admin/dispatch').length;
    // Without this the board shows a fixed queue while requests keep arriving.
    expect(after).toBeGreaterThan(before);
    wrapper.unmount();
  });

  it('refreshes the dispatch queue when a request is dispatched', async () => {
    const { wrapper, calls, realtime } = await render();
    const before = calls.filter((call) => call.path === '/_admin/dispatch').length;
    await deliver(realtime, HTTP_EVENTS.SOS_DISPATCHED, { sosId: 'sos_1', groupId: 'grp_medical' });
    const after = calls.filter((call) => call.path === '/_admin/dispatch').length;
    expect(after).toBeGreaterThan(before);
    wrapper.unmount();
  });

  it('refreshes the alert badge when a new alert arrives', async () => {
    const { wrapper, calls, realtime } = await render();
    const before = calls.filter((call) => call.path === '/_admin/alerts').length;
    await deliver(realtime, HTTP_EVENTS.ADMIN_ALERT, { id: 'alt_3' });
    const after = calls.filter((call) => call.path === '/_admin/alerts').length;
    expect(after).toBeGreaterThan(before);
    wrapper.unmount();
  });

  it('refreshes settings when another operator changes them', async () => {
    const { wrapper, calls, realtime } = await render();
    const before = calls.filter((call) => call.path === '/_admin/settings').length;
    await deliver(realtime, HTTP_EVENTS.SETTINGS_UPDATED, { key: 'sos_auto_dispatch' });
    const after = calls.filter((call) => call.path === '/_admin/settings').length;
    // The console shows operational switches; displaying values another operator already replaced
    // invites an administrator to "fix" something that is no longer set that way.
    expect(after).toBeGreaterThan(before);
    wrapper.unmount();
  });

  it('stops listening once the shell is gone', async () => {
    const { wrapper, calls, realtime } = await render();
    wrapper.unmount();
    const before = calls.filter((call) => call.path === '/_admin/alerts').length;
    await deliver(realtime, HTTP_EVENTS.ADMIN_ALERT, { id: 'alt_4' });
    const after = calls.filter((call) => call.path === '/_admin/alerts').length;
    // A listener left behind keeps hitting the API after the user has navigated away. The store
    // also unsubscribes on its own `reset()`, so this holds even if the shell's explicit teardown is
    // removed — that line is defence in depth, not the only guard.
    expect(after).toBe(before);
  });
});

describe('connection state', () => {
  it('says it is reconnecting unless the socket is live', async () => {
    const { wrapper } = await render();
    // A console that claims to be live while disconnected is worse than one that admits it.
    expect(wrapper.find('.admin-topbar').text()).toContain('اتصال مجدد');
    expect(wrapper.find('.admin-topbar').text()).not.toContain('زنده');
    wrapper.unmount();
  });
});

describe('shortcuts and logout', () => {
  it('opens the command palette from the search button', async () => {
    const { wrapper } = await render();
    commandPaletteOpen.value = false;
    await wrapper.find('.admin-search').trigger('click');
    await flushPromises();
    // The trigger flips the shared open flag the global palette renders from — earlier it
    // toggled a private empty instance, so the button visibly did nothing.
    expect(commandPaletteOpen.value).toBe(true);
    commandPaletteOpen.value = false;
    wrapper.unmount();
  });

  it('signs out and returns to the login screen', async () => {
    const { wrapper, router, calls } = await render();
    const navigations = vi.spyOn(router, 'push');
    const logoutButton = wrapper.findAll('.admin-link-button').find((button) => button.text().includes('خروج'))!;
    await logoutButton.trigger('click');
    await flushPromises();

    expect(calls.some((call) => call.path === '/_auth/logout')).toBe(true);
    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.login });
    wrapper.unmount();
  });

  it('offers a theme control next to sign-out', async () => {
    const { wrapper } = await render();
    const themeButton = wrapper.findAll('.admin-link-button').find((button) => button.text().includes('پوسته'))!;
    expect(themeButton.exists()).toBe(true);
    await themeButton.trigger('click');
    await flushPromises();
    wrapper.unmount();
  });
});
