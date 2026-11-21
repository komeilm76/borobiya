import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import IncidentsView from '../src/client/views/admin/IncidentsView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The incident-type catalog feeds the map, the SOS composer, the groups screen and the reports.
 * These tests pin the two mutations (create and inline edit) and the client-side validation that
 * mirrors the server, because a bad glyph or malformed color here surfaces everywhere else.
 */

const SEEDED = [
  { id: 'inc_medical', label: 'پزشکی', icon: 'medical-bag', color: '#AF3438', rank: 1 },
  { id: 'inc_fire', label: 'آتش‌سوزی', icon: 'fire', color: '#B35A18', rank: 2 },
  { id: 'inc_road', label: 'حادثه رانندگی', icon: 'car-emergency', color: '#8C5609', rank: 3 }
];
const GROUPS = [
  { id: 'grp_med', name: 'گروه امداد پزشکی', color: '#AF3438', capacity: 24, status: 'active', incidentIds: ['inc_medical', 'inc_road'], memberCount: 2, coverageCount: 2, memberIds: [] },
  { id: 'grp_fire', name: 'گروه آتش‌نشانی', color: '#B35A18', capacity: 18, status: 'active', incidentIds: ['inc_fire'], memberCount: 1, coverageCount: 1, memberIds: [] }
];

function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_inc', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function stubApi(items: unknown[] = SEEDED, failCreate = false, failUpdate = false) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/_admin/incident-types' && method === 'GET') return json({ items, total: items.length });
      if (path === '/_admin/groups' && method === 'GET') return json({ items: GROUPS, total: GROUPS.length });
      if (path === '/_admin/incident-types' && method === 'POST') {
        if (failCreate) {
          return new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'BAD_REQUEST', message: 'Unknown incident type icon.' } }), {
            status: 400, headers: { 'content-type': 'application/json' }
          });
        }
        const body = JSON.parse(String(init?.body));
        return json({ ok: true, incidentType: { id: 'inc_new', ...body, rank: 4 } });
      }
      const updateMatch = path.match(/^\/_admin\/incident-types\/([^/]+)$/);
      if (updateMatch && method === 'PATCH') {
        if (failUpdate) {
          return new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'اجازۀ این تغییر را ندارید.' } }), {
            status: 403, headers: { 'content-type': 'application/json' }
          });
        }
        const body = JSON.parse(String(init?.body));
        const source = items.find((item: any) => item.id === updateMatch[1]) as Record<string, unknown>;
        return json({ ok: true, incidentType: { ...source, ...body } });
      }
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminIncidents });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(IncidentsView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
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

describe('incident types', () => {
  it('renders skeleton cards while the catalog is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
    await router.push({ name: ROUTE_NAMES.adminIncidents });
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(IncidentsView, { attachTo: document.body, global: { plugins: [pinia, vuetify, router] } });
    await flushPromises();
    expect(wrapper.find('[data-testid="incidents-loading"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('هنوز نوع حادثه‌ای تعریف نشده است');
    wrapper.unmount();
  });
});

describe('incident types', () => {
  it('lists the catalog in rank order with group coverage', async () => {
    stubApi();
    const { wrapper } = await render();
    const text = wrapper.text();
    expect(text).toContain('پزشکی');
    expect(text).toContain('آتش‌سوزی');
    // inc_road is covered by one group; inc_medical by one; inc_fire by one.
    expect(text).toContain('گروه پوشش می‌دهد');
    expect(wrapper.find('[data-testid="admin-incidents"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the empty state when the catalog is empty', async () => {
    stubApi([]);
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('هنوز نوع حادثه‌ای تعریف نشده است');
    wrapper.unmount();
  });

  it('creates an incident type and reloads the catalog', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-create"] input').setValue('حادثهٔ ریلی');
    await wrapper.find('[data-testid="incident-create"]').trigger('submit');
    await flushPromises();

    const created = calls.find((call) => call.method === 'POST');
    expect(created?.body).toEqual({ label: 'حادثهٔ ریلی', icon: 'alert-outline', color: '#0E6666' });
    expect(calls.filter((call) => call.method === 'GET' && call.path === '/_admin/incident-types').length).toBeGreaterThanOrEqual(2);
    expect(useToast().messages.value.some((message) => message.message === 'نوع حادثه ساخته شد.')).toBe(true);
    wrapper.unmount();
  });

  it('picks the swatch color instead of a typed hex', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-create"] input').setValue('حادثهٔ ریلی');
    const swatches = wrapper.findAll('[data-testid="incident-create"] .incident-swatch');
    await swatches[0].trigger('click'); // قرمز امداد
    await wrapper.find('[data-testid="incident-create"]').trigger('submit');
    await flushPromises();

    const created = calls.find((call) => call.method === 'POST');
    expect(created?.body.color).toBe('#AF3438');
    wrapper.unmount();
  });

  it('blocks a malformed hex with an inline error, not a request', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-create"] input').setValue('خراب');
    const hexInput = wrapper.findAll('[data-testid="incident-create"] input').at(-1)!;
    await hexInput.setValue('red');
    await wrapper.find('[data-testid="incident-create"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="incident-form-error"]').text()).toContain('#RRGGBB');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('surfaces a server-side rejection inside the form', async () => {
    stubApi(SEEDED, true);
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-create"] input').setValue('خراب');
    await wrapper.find('[data-testid="incident-create"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="incident-form-error"]').text()).toContain('Unknown incident type icon.');
    expect(useToast().messages.value.some((message) => message.message === 'نوع حادثه ساخته شد.')).toBe(false);
    wrapper.unmount();
  });

  it('renames and recolors through the inline editor', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-edit-inc_fire"]').trigger('click');
    await flushPromises();

    const form = wrapper.find('[data-testid="incident-edit-form-inc_fire"]');
    const label = form.find('input');
    await label.setValue('آتش‌سوزی شمال');
    await form.trigger('submit');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.path).toBe('/_admin/incident-types/inc_fire');
    expect(patch?.body).toMatchObject({ label: 'آتش‌سوزی شمال', icon: 'fire', color: '#B35A18' });
    expect(useToast().messages.value.some((message) => message.message === 'نوع حادثه به‌روزرسانی شد.')).toBe(true);
    wrapper.unmount();
  });

  it('keeps a refused edit open with the server message', async () => {
    stubApi(SEEDED, false, true);
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-edit-inc_fire"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="incident-edit-form-inc_fire"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="incident-edit-error-inc_fire"]').text()).toContain('اجازۀ این تغییر را ندارید.');
    expect(useToast().messages.value.some((message) => message.message === 'نوع حادثه به‌روزرسانی شد.')).toBe(false);
    wrapper.unmount();
  });

  it('blocks a malformed hex inside the inline editor before any request', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-edit-inc_fire"]').trigger('click');
    await flushPromises();

    const form = wrapper.find('[data-testid="incident-edit-form-inc_fire"]');
    const inputs = form.findAll('input');
    const hexInput = inputs[inputs.length - 1];
    await hexInput.setValue('#xyz123');
    await form.trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="incident-edit-error-inc_fire"]').text()).toContain('#RRGGBB');
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    wrapper.unmount();
  });

  it('requires a label before saving an edit', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-edit-inc_fire"]').trigger('click');
    await flushPromises();

    const form = wrapper.find('[data-testid="incident-edit-form-inc_fire"]');
    await form.find('input').setValue('   ');
    await form.trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="incident-edit-error-inc_fire"]').text()).toContain('برچسب');
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    wrapper.unmount();
  });

  it('recolors through the inline editor swatches', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-edit-inc_fire"]').trigger('click');
    await flushPromises();

    const swatches = wrapper.findAll('[data-testid="incident-edit-form-inc_fire"] .incident-swatch');
    await swatches[0].trigger('click'); // قرمز امداد
    await wrapper.find('[data-testid="incident-edit-form-inc_fire"]').trigger('submit');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body.color).toBe('#AF3438');
    wrapper.unmount();
  });

  it('cancels the inline editor without a request', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-edit-inc_fire"]').trigger('click');
    await flushPromises();

    const cancel = wrapper.findAll('[data-testid="incident-edit-form-inc_fire"] .v-btn').find((button) => button.text().includes('انصراف'))!;
    await cancel.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="incident-edit-form-inc_fire"]').exists()).toBe(false);
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    wrapper.unmount();
  });

  it('requires a label in the create form before any request', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="incident-create"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="incident-form-error"]').text()).toContain('برچسب');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('closes the inline editor with the edit toggle', async () => {
    stubApi();
    const { wrapper } = await render();
    const toggle = wrapper.find('[data-testid="incident-edit-inc_fire"]');
    await toggle.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="incident-edit-form-inc_fire"]').exists()).toBe(true);
    await toggle.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="incident-edit-form-inc_fire"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
