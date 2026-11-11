import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import ProfileView from '../src/client/views/map/ProfileView.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { useMapStore } from '../src/client/stores/map.ts';

/**
 * The device list is the screen where a user revokes a stolen session. The payload here is copied
 * verbatim from a live `GET /_user/devices` response, because the screen previously read fields the
 * API does not return (`id`, `lastSeenAt`, `current`) and failed silently: keys were undefined and
 * the revoke button addressed a session id that never existed.
 */

/** One device exactly as the server serializes it. */
const CURRENT_DEVICE = {
  sessionId: 'ses_current000000000000000000000001',
  deviceId: 'dev_0001',
  deviceName: 'این مرورگر',
  ip: '10.0.0.5',
  lastActiveAt: 1794136200653,
  createdAt: 1794036200653,
  expiresAt: 1794222600653,
  isCurrentDevice: true,
  isOnline: true
};

const OTHER_DEVICE = {
  sessionId: 'ses_other0000000000000000000000002',
  deviceId: 'dev_0002',
  deviceName: 'گوشی قدیمی',
  ip: '10.0.0.9',
  lastActiveAt: 1794136000000,
  createdAt: 1793036200653,
  expiresAt: 1794220000000,
  isCurrentDevice: false,
  isOnline: false
};

/** Installs a fetch double serving the device list and logging deletes. */
function stubApi(devices: unknown[] = [CURRENT_DEVICE, OTHER_DEVICE]) {
  const calls: Array<{ method: string; path: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path });
      const data = path === '/_user/devices' && method === 'GET' ? { items: devices, total: devices.length } : { ok: true };
      return new Response(JSON.stringify({ ok: true, requestId: 'req_dev', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

/** Mounts the profile screen on its route and waits for the device read. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.profile });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ProfileView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('profile device list', () => {
  it('renders one row per session with the device name and a real timestamp', async () => {
    stubApi();
    const { wrapper } = await render();
    const rows = wrapper.findAll('.device-list li');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('این مرورگر');
    expect(rows[1].text()).toContain('گوشی قدیمی');
    // `lastActiveAt` is a number of milliseconds; an unmapped field would print the placeholder.
    expect(rows[0].text()).not.toContain('—');
    expect(rows[0].text()).toContain('10.0.0.5');
    wrapper.unmount();
  });

  it('disables revoking the session the user is holding', async () => {
    stubApi();
    const { wrapper } = await render();
    const buttons = wrapper.findAll('.device-list button');
    expect(buttons[0].attributes('disabled')).toBeDefined();
    expect(buttons[0].text()).toContain('این دستگاه');
    expect(buttons[1].attributes('disabled')).toBeUndefined();
    expect(buttons[1].text()).toContain('پایان');
    wrapper.unmount();
  });

  it('revokes the other session by its session id, then reloads the list', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.findAll('.device-list button')[1].trigger('click');
    await flushPromises();

    const revoked = calls.find((call) => call.method === 'DELETE');
    expect(revoked?.path).toBe(`/_user/devices/${OTHER_DEVICE.sessionId}`);
    // A stale row would let the user press the same button again against a dead session.
    expect(calls.filter((call) => call.method === 'GET' && call.path === '/_user/devices').length).toBe(2);
    wrapper.unmount();
  });

  it('shows the empty state when the account has a single session', async () => {
    stubApi([CURRENT_DEVICE]);
    const { wrapper } = await render();
    expect(wrapper.findAll('.device-list li')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('دستگاه دیگری فعال نیست');
    wrapper.unmount();
  });

  it('reports a failed device read through the store instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, requestId: 'req_dev', error: { code: 'INTERNAL', message: 'خطای سرور' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        })
      )
    );
    const { wrapper } = await render();
    const auth = useAuthStore();
    expect(auth.error).toBeTruthy();
    expect(auth.devices).toEqual([]);
    expect(wrapper.findAll('.device-list li')).toHaveLength(0);
    wrapper.unmount();
  });

  it('keeps the store keys identical to the documented payload', async () => {
    stubApi();
    await render();
    const auth = useAuthStore();
    const device = auth.devices[0] as Record<string, unknown>;
    // The screen renders from these keys; a rename on the server must fail here, not in the UI.
    expect(Object.keys(device).sort()).toEqual(Object.keys(CURRENT_DEVICE).sort());
    expect(device.sessionId).toBe(CURRENT_DEVICE.sessionId);
    expect(device.isCurrentDevice).toBe(true);
  });
});

/** One saved place exactly as the server serializes it. */
const PLACE = {
  id: 'plc_1', name: 'خانه', label: 'خانه', latitude: 35.7219, longitude: 51.4047,
  address: 'خیابان انبار ۱۲', icon: 'home-outline', rank: 1
};

describe('saved places', () => {
  it('lists saved places from the store and deletes one', async () => {
    const calls = stubApi([CURRENT_DEVICE]);
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.profile });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const map = useMapStore();
    map.places = [{ ...PLACE }];
    const wrapper = mount(ProfileView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await flushPromises();
    expect(wrapper.text()).toContain('خیابان انبار ۱۲');

    await wrapper.find('[data-testid="delete-place-plc_1"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/_user/places/plc_1')).toBe(true);
    expect(useMapStore().places).toHaveLength(0);
    wrapper.unmount();
  });

  it('edits a saved place inline and PATCHes the full payload', async () => {
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const data = path === '/_user/devices' && method === 'GET'
        ? { items: [CURRENT_DEVICE], total: 1 }
        : path === '/_user/places/plc_1' && method === 'PATCH' ? { ok: true, placeId: 'plc_1' }
        : { items: [PLACE] };
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.profile });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const map = useMapStore();
    map.places = [{ ...PLACE }];
    const wrapper = mount(ProfileView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await flushPromises();

    await wrapper.find('[data-testid="edit-place-plc_1"]').trigger('click');
    await flushPromises();
    const nameInput = wrapper.find('.place-edit input');
    await nameInput.setValue('خانه مادر');
    await wrapper.find('.place-edit').trigger('submit');
    await flushPromises();

    const patchCall = calls.find((call) => call.path === '/_user/places/plc_1' && call.method === 'PATCH');
    expect(patchCall?.body).toMatchObject({ name: 'خانه مادر', label: 'خانه', address: 'خیابان انبار ۱۲', latitude: 35.7219, longitude: 51.4047, rank: 1 });
    expect(useMapStore().places[0]?.name).toBe('خانه مادر');
    wrapper.unmount();
  });
});

describe('responder readiness toggle', () => {
  it('posts readiness for a responder and reflects it in the switch', async () => {
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const data = path === '/_user/me' && method === 'GET' ? { id: 'usr_self', username: 'reza.m', role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 4.5, createdAt: 1794000000000 }
        : path === '/_user/devices' && method === 'GET' ? { items: [], total: 0 }
        : path === '/_user/ready' && method === 'POST' ? { ok: true, readyForMission: true }
        : { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.profile });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().$patch({
      user: { id: 'usr_self', username: 'reza.m', role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 4.5, createdAt: 1794000000000 }
    });
    const wrapper = mount(ProfileView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await flushPromises();

    const toggle = wrapper.find('[data-testid="ready-toggle"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.attributes('aria-checked')).toBe('false');
    await toggle.trigger('click');
    await flushPromises();
    const call = calls.find((entry) => entry.path === '/_user/ready' && entry.method === 'POST');
    expect(call?.body).toEqual({ ready: true });
    expect(useAuthStore().user?.readyForMission).toBe(true);
    wrapper.unmount();
  });

  it('hides the readiness switch from plain users', async () => {
    stubApi([CURRENT_DEVICE]);
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.profile });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().$patch({
      user: { id: 'usr_self', username: 'saeed.k', role: 'user', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 0, createdAt: 1794000000000 }
    });
    const wrapper = mount(ProfileView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ready-toggle"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('username editing', () => {
  it('validates, PATCHes and refreshes the account', async () => {
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const data = path === '/_user/me' && method === 'GET' ? { id: 'usr_self', username: 'new.name', role: 'user', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 0, createdAt: 1794000000000 }
        : path === '/_user/me' && method === 'PATCH' ? { ok: true }
        : path === '/_user/devices' && method === 'GET' ? { items: [], total: 0 }
        : { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.profile });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().$patch({
      user: { id: 'usr_self', username: 'saeed.k', role: 'user', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 0, createdAt: 1794000000000 }
    });
    const wrapper = mount(ProfileView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await flushPromises();

    await wrapper.find('[data-testid="edit-username"]').trigger('click');
    const input = wrapper.find('[data-testid="username-input"]');
    await input.setValue('INVALID UPPER!!');
    expect(wrapper.find('[data-testid="save-username"]').attributes('disabled')).toBeDefined();
    await input.setValue('new.name');
    await wrapper.find('[data-testid="save-username"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.path === '/_user/me' && call.method === 'PATCH' && call.body?.username === 'new.name')).toBe(true);
    expect(useAuthStore().user?.username).toBe('new.name');
    wrapper.unmount();
  });
});

describe('login history', () => {
  it('renders recent login attempts with success and failure state', async () => {
    const calls: Array<{ method: string; path: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path });
      const data = path === '/_user/me' && method === 'GET'
        ? { id: 'usr_self', username: 'saeed.k', role: 'user', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 0, createdAt: 1794000000000 }
        : path === '/_user/devices' && method === 'GET' ? { items: [], total: 0 }
        : path === '/_user/logins' && method === 'GET'
          ? { items: [
              { id: 2, ip: '10.0.0.5', deviceName: 'این مرورگر', success: true, loginAt: 1794136200000 },
              { id: 1, ip: '10.0.0.9', deviceName: null, success: false, loginAt: 1794130000000 }
            ], total: 2 }
        : { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.profile });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ProfileView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await flushPromises();
    expect(calls.some((call) => call.path === '/_user/logins')).toBe(true);
    expect(wrapper.text()).toContain('این مرورگر');
    expect(wrapper.text()).toContain('ناموفق');
    expect(wrapper.findAll('.login-row')).toHaveLength(2);
    wrapper.unmount();
  });
});
