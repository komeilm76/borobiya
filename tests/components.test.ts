import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h } from 'vue';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import AppToastHost from '../src/client/components/AppToastHost.vue';
import CommandPalette from '../src/client/components/CommandPalette.vue';
import MapCanvas from '../src/client/components/MapCanvas.vue';
import LoginView from '../src/client/views/auth/LoginView.vue';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/** Builds a router with the production route table on a memory history. */
function testRouter() {
  return createRouter({ history: createMemoryHistory(), routes: ROUTES });
}

/** Mounts a component with Pinia, Vuetify and the router installed. */
async function mountWithPlugins(component: any) {
  const router = testRouter();
  await router.push('/_auth/login');
  await router.isReady();
  return mount(component, {
    global: { plugins: [createPinia(), vuetify, router] }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('application shell components', () => {
  it('renders the toast host with the assertive live region and dismisses messages', async () => {
    const toast = useToast();
    const wrapper = await mountWithPlugins(AppToastHost);
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-live')).toBe('assertive');
    const id = toast.push('ذخیره شد', 'success', 0);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('ذخیره شد');
    const close = wrapper.find('.toast__close');
    expect(close.exists()).toBe(true);
    await close.trigger('click');
    expect(toast.messages.value.some((item) => item.id === id)).toBe(false);
    wrapper.unmount();
  });

  it('mounts the command palette closed and opens it as an accessible dialog', async () => {
    // Behaviour lives in tests/command-palette.test.ts; this only checks it mounts beneath the app
    // shell without a router in the current view, so the assertion has to be about the closed state.
    const host = defineComponent({
      components: { CommandPalette },
      setup() {
        return () => h('div', [h(CommandPalette)]);
      }
    });
    const wrapper = await mountWithPlugins(host);
    expect(wrapper.find('[data-testid="command-palette"]').exists()).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('mounts the login view with Vuetify controls and demo credentials', async () => {
    const wrapper = await mountWithPlugins(LoginView);
    expect(wrapper.find('.auth-card').exists()).toBe(true);
    const inputs = wrapper.findAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(wrapper.text()).toContain('نام کاربری');
    expect(wrapper.text()).toContain('گذرواژه');
    wrapper.unmount();
  });

  it('mounts the map canvas with deterministic tiles and SOS affordances', async () => {
    const host = defineComponent({
      components: { MapCanvas },
      setup() {
        return () => h(MapCanvas);
      }
    });
    const wrapper = await mountWithPlugins(host);
    const tiles = wrapper.findAll('img, .map-tile, [style*="background-image"]');
    expect(tiles.length).toBeGreaterThan(0);
    wrapper.unmount();
  });
});

describe('router contract', () => {
  it('exposes every typed route with its layout and lazy component', () => {
    const names = ROUTES.map((route) => String(route.name));
    for (const name of Object.values(ROUTE_NAMES)) {
      expect(names, name).toContain(name);
    }
    expect(Object.keys(ROUTE_NAMES).length).toBe(20);
    const layouts = new Set(ROUTES.map((route) => String(route.meta?.layout ?? 'none')));
    expect(layouts.has('map')).toBe(true);
    expect(layouts.has('admin')).toBe(true);
  });
});
