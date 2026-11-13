import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import SettingsView from '../src/client/views/admin/SettingsView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * These are the switches that govern dispatch behaviour, so a save that silently fails is an
 * operational problem: the administrator believes auto-dispatch is off while it is still on.
 *
 * The PUT sends every row at once and the server validates the payload as a whole, so one malformed
 * value — including one the administrator never touched — rejects the entire save with a bare
 * "Invalid request.". The form must name the offending key instead.
 */

const SETTINGS = [
  { key: 'sos_auto_dispatch', value: '0' },
  { key: 'default_dispatch_radius_m', value: '5000' },
  { key: 'mission_ready_required', value: '1' },
  { key: 'maintenance_mode', value: '0' }
];

const HEALTH = {
  database: { users: 4, missions: 2 },
  realtime: { connections: 3 },
  serverTime: 1_789_257_000_000
};

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_set', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double for settings, health and the save. */
function stubApi(options: { settings?: unknown[]; saveFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (path === '/_admin/settings' && method === 'GET') {
        const items = options.settings ?? SETTINGS;
        return json({ items, total: items.length });
      }
      if (path === '/_admin/settings' && method === 'PUT') {
        if (options.saveFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'اجازه ندارید.' } }),
            { status: 403, headers: { 'content-type': 'application/json' } }
          );
        }
        return json({ ok: true });
      }
      if (path === '/_admin/system/health') return json(HEALTH);
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

/** Mounts the settings screen; it loads values and health itself. */
async function render(options: { settings?: unknown[]; saveFails?: boolean } = {}) {
  const calls = stubApi(options);
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminSettings });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(SettingsView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, calls };
}

/** Types into the field for a given setting key, found by its rendered label. */
async function setField(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], label: string, value: string) {
  const row = wrapper.findAll('.settings-row').find((item) => item.text().includes(label))!;
  await row.find('input').setValue(value);
  return row;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  for (const message of [...useToast().messages.value]) useToast().dismiss(message.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('settings form', () => {
  it('shows a readable label per setting instead of the raw key', async () => {
    const { wrapper } = await render();
    const text = wrapper.text();
    expect(text).toContain('اعزام خودکار');
    expect(text).toContain('شعاع اعزام');
    // A raw key such as `sos_auto_dispatch` is meaningless to an operator.
    expect(text).not.toContain('sos_auto_dispatch');
    wrapper.unmount();
  });

  it('preloads the current values so saving an untouched form changes nothing', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    const save = calls.find((call) => call.method === 'PUT');
    // Sending what was loaded is a no-op; sending blanks would wipe the operational config.
    expect(save?.body).toMatchObject({ sos_auto_dispatch: '0', default_dispatch_radius_m: '5000' });
    wrapper.unmount();
  });

  it('sends edited values and confirms the save', async () => {
    const { wrapper, calls } = await render();
    await setField(wrapper, 'اعزام خودکار', '1');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    const save = calls.find((call) => call.method === 'PUT');
    expect(save?.body.sos_auto_dispatch).toBe('1');
    expect(useToast().messages.value.some((message) => message.message === 'تنظیمات ذخیره شد.')).toBe(true);
    wrapper.unmount();
  });

  it('refuses a switch that is neither zero nor one', async () => {
    const { wrapper, calls } = await render();
    await setField(wrapper, 'اعزام خودکار', 'yes');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    // The server accepts only "0" and "1", and rejects the whole payload otherwise.
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toContain('اعزام خودکار');
    wrapper.unmount();
  });

  it('names an empty switch as the problem rather than the whole form', async () => {
    const { wrapper, calls } = await render();
    await setField(wrapper, 'حالت نگهداری', '');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toContain('حالت نگهداری');
    wrapper.unmount();
  });

  it('refuses a radius that is not a plain number', async () => {
    const { wrapper, calls } = await render();
    await setField(wrapper, 'شعاع اعزام', '5km');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toContain('شعاع اعزام');
    wrapper.unmount();
  });

  it('refuses a radius of only one digit', async () => {
    const { wrapper, calls } = await render();
    await setField(wrapper, 'شعاع اعزام', '5');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();
    // The server floor is two digits; a one-digit radius is a typo, not a setting.
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
    wrapper.unmount();
  });

  it('reports a refused save instead of claiming success', async () => {
    const { wrapper } = await render({ saveFails: true });
    await setField(wrapper, 'اعزام خودکار', '1');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message === 'اجازه ندارید.')).toBe(true);
    expect(messages.some((message) => message.message === 'تنظیمات ذخیره شد.')).toBe(false);
    wrapper.unmount();
  });

  it('clears the previous error when a corrected value is saved', async () => {
    const { wrapper } = await render();
    await setField(wrapper, 'اعزام خودکار', 'yes');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.stack-form .v-alert').exists()).toBe(true);

    await setField(wrapper, 'اعزام خودکار', '1');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.stack-form .v-alert').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('health snapshot', () => {
  it('shows the live counts an operator checks first', async () => {
    const { wrapper } = await render();
    const text = wrapper.text();
    expect(text).toContain('کاربران');
    expect(text).toContain('اتصال‌های زنده');
    expect(text).toContain('زمان سرور');
    wrapper.unmount();
  });

  it('falls back to a dash when the server time is missing rather than rendering undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
        const path = url.split('?')[0];
        if (path === '/_admin/settings') return json({ items: SETTINGS, total: SETTINGS.length });
        if (path === '/_admin/system/health') return json({ database: { users: 1 }, realtime: { connections: 0 } });
        return json({ items: [], total: 0 });
      })
    );
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.adminSettings });
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(SettingsView, {
      attachTo: document.body,
      global: { plugins: [pinia, vuetify, router] }
    });
    await flushPromises();

    expect(wrapper.text()).toContain('—');
    expect(wrapper.text()).not.toContain('undefined');
    wrapper.unmount();
  });
});
