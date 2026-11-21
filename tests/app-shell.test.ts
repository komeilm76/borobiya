import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import App from '../src/client/App.vue';
import { useSettingsStore } from '../src/client/stores/settings.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The root shell chooses which layout every screen renders inside, and stamps two attributes that
 * the stylesheet keys on: `data-mode` on `<body>` selects the layout's CSS scope, and `data-theme`
 * on `<html>` selects the palette. If either is missing the app still renders — it just renders
 * with another layout's or another theme's rules, which is invisible in a component test and
 * obvious to a user.
 */

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_app', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double for whatever a layout asks for. */
function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      if (path === '/_user/me') {
        return new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'UNAUTHORIZED', message: 'no' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        });
      }
      return json({ items: [], total: 0 });
    })
  );
}

/**
 * Mounts the app at a route.
 *
 * The layouts are stubbed: this suite is about the shell's choice of layout and the attributes it
 * sets, not about the layout internals, which have their own suites.
 */
async function render(name: (typeof ROUTE_NAMES)[keyof typeof ROUTE_NAMES]) {
  stubApi();
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [pinia, vuetify, router],
      stubs: {
        AuthLayout: { template: '<div data-layout-stub="auth" />' },
        MapLayout: { template: '<div data-layout-stub="map" />' },
        AdminLayout: { template: '<div data-layout-stub="admin" />' },
        CommandPalette: true,
        AppToastHost: true
      }
    }
  });
  await flushPromises();
  return { wrapper, router, settings: useSettingsStore() };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  delete document.body.dataset.mode;
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete document.body.dataset.mode;
  document.documentElement.removeAttribute('data-theme');
});

describe('layout selection', () => {
  it('renders the auth layout for the sign-in screen', async () => {
    const { wrapper } = await render(ROUTE_NAMES.login);
    expect(wrapper.attributes('data-layout')).toBe('auth');
    expect(wrapper.find('[data-layout-stub="auth"]').exists()).toBe(true);
    expect(wrapper.find('[data-layout-stub="map"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the map layout for a signed-in user screen', async () => {
    const { wrapper } = await render(ROUTE_NAMES.map);
    expect(wrapper.attributes('data-layout')).toBe('map');
    expect(wrapper.find('[data-layout-stub="map"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders the admin layout for the console', async () => {
    const { wrapper } = await render(ROUTE_NAMES.adminOverview);
    expect(wrapper.attributes('data-layout')).toBe('admin');
    expect(wrapper.find('[data-layout-stub="admin"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('falls back to the auth layout when a route declares none', async () => {
    // A new route without `meta.layout` must not render an empty page.
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/bare', name: 'bare', component: { template: '<div />' } }]
    });
    await router.push('/bare');
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [pinia, vuetify, router],
        stubs: {
          AuthLayout: { template: '<div data-layout-stub="auth" />' },
          MapLayout: { template: '<div data-layout-stub="map" />' },
          AdminLayout: { template: '<div data-layout-stub="admin" />' },
          CommandPalette: true,
          AppToastHost: true
        }
      }
    });
    await flushPromises();
    expect(wrapper.attributes('data-layout')).toBe('auth');
    wrapper.unmount();
  });
});

describe('document attributes the stylesheet depends on', () => {
  it('stamps the layout mode on the body', async () => {
    const { wrapper } = await render(ROUTE_NAMES.map);
    // `data-mode` scopes the layout rules; without it the page keeps the previous layout's styling.
    expect(document.body.dataset.mode).toBe('map');
    wrapper.unmount();
  });

  it('updates the body mode when the route changes layout', async () => {
    const { wrapper, router } = await render(ROUTE_NAMES.login);
    expect(document.body.dataset.mode).toBe('auth');

    await router.push({ name: ROUTE_NAMES.adminOverview });
    await flushPromises();
    expect(document.body.dataset.mode).toBe('admin');
    wrapper.unmount();
  });

  it('stamps the resolved theme on the document element', async () => {
    const { wrapper } = await render(ROUTE_NAMES.login);
    // The whole palette is selected by this attribute; a missing one leaves the default theme.
    expect(['light', 'dark']).toContain(document.documentElement.getAttribute('data-theme'));
    wrapper.unmount();
  });

  it('rewrites the theme attribute when the stored choice changes', async () => {
    const { wrapper, settings } = await render(ROUTE_NAMES.login);
    // `apply` both persists and stamps; the shell's watcher is what keeps the attribute honest
    // when the choice changes without a reload.
    settings.apply('dark');
    await flushPromises();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    settings.apply('light');
    await flushPromises();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    wrapper.unmount();
  });
});

describe('global hosts', () => {
  it('mounts the global hosts outside the layouts', async () => {
    const { wrapper, router } = await render(ROUTE_NAMES.login);
    // Both hosts are siblings of the layout, so navigating between layouts keeps queued toasts and
    // an open palette. Mounting either inside a layout would drop them on every route change.
    const shell = wrapper.find('.app-shell');
    expect(shell.exists()).toBe(true);
    expect(shell.find('[data-layout-stub="auth"]').exists()).toBe(true);

    await router.push({ name: ROUTE_NAMES.map });
    await flushPromises();
    // The layout swap is an `out-in` transition, so the incoming layout mounts a tick after the
    // route changes rather than in the same flush.
    await vi.waitFor(() => expect(wrapper.find('[data-layout-stub="map"]').exists()).toBe(true));
    expect(wrapper.find('.app-shell').exists()).toBe(true);
    wrapper.unmount();
  });
});
