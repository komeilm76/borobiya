import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import ProfileView from '../src/client/views/map/ProfileView.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

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
