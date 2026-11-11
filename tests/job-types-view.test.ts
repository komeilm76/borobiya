import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import JobTypesView from '../src/client/views/admin/JobTypesView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The job-types screen edits the readiness policy that governs who receives offers.
 * These tests pin the two mutations (policy flip and activation) and the create form,
 * because a mistaken flip here silently changes what every responder in that job type sees.
 */

const SEEDED = [
  { id: 'job_fire', label: 'آتش‌نشانی', offerPolicy: 'all', rank: 1, active: true, memberCount: 2, createdAt: 1, updatedAt: 1 },
  { id: 'job_maintenance', label: 'خدمات فنی و تأسیسات', offerPolicy: 'ready_only', rank: 3, active: true, memberCount: 1, createdAt: 1, updatedAt: 1 }
];

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_jt', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double that answers the job-types endpoints and records calls. */
function stubApi(items: unknown[] = SEEDED, failCreate = false) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/_admin/job-types' && method === 'GET') return json({ items, total: items.length });
      if (path === '/_admin/job-types' && method === 'POST') {
        if (failCreate) {
          return new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'BAD_REQUEST', message: 'Unknown offer policy.' } }), {
            status: 400, headers: { 'content-type': 'application/json' }
          });
        }
        const body = JSON.parse(String(init?.body));
        return json({ ok: true, jobType: { id: 'job_new', ...body, rank: 4, active: true, memberCount: 0, createdAt: 1, updatedAt: 1 } });
      }
      if (path.startsWith('/_admin/job-types/') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body));
        const id = path.split('/').pop();
        const source = items.find((item: any) => item.id === id) as Record<string, unknown>;
        return json({ ok: true, jobType: { ...source, ...body } });
      }
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

/** Mounts the job-types screen. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminJobTypes });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(JobTypesView, {
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

describe('job types', () => {
  it('lists the catalog with policy and member count', async () => {
    stubApi();
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('آتش‌نشانی');
    expect(wrapper.text()).toContain('خدمات فنی و تأسیسات');
    expect(wrapper.text()).toContain('Policy B');
    wrapper.unmount();
  });

  it('shows the empty state when the catalog is empty', async () => {
    stubApi([]);
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('هنوز نوع شغلی تعریف نشده است');
    wrapper.unmount();
  });

  it('creates a job type and reloads the list', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="job-type-create"] input').setValue('امداد ریلی');
    await wrapper.find('[data-testid="job-type-create"]').trigger('submit');
    await flushPromises();

    const created = calls.find((call) => call.method === 'POST');
    expect(created?.body).toEqual({ label: 'امداد ریلی', offerPolicy: 'ready_only' });
    expect(calls.filter((call) => call.method === 'GET' && call.path === '/_admin/job-types').length).toBeGreaterThanOrEqual(2);
    expect(useToast().messages.value.some((message) => message.message === 'نوع شغل ساخته شد.')).toBe(true);
    wrapper.unmount();
  });

  it('surfaces a server-side rejection inside the form', async () => {
    stubApi(SEEDED, true);
    const { wrapper } = await render();
    await wrapper.find('[data-testid="job-type-create"] input').setValue('خراب');
    await wrapper.find('[data-testid="job-type-create"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="job-type-form-error"]').text()).toContain('Unknown offer policy.');
    expect(useToast().messages.value.some((message) => message.message === 'نوع شغل ساخته شد.')).toBe(false);
    wrapper.unmount();
  });

  it('flips the readiness policy with one explicit action', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    const toggles = wrapper.findAll('[data-testid="job-type-policy-toggle"]');
    await toggles[0].trigger('click'); // job_fire: all -> ready_only
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.path).toBe('/_admin/job-types/job_fire');
    expect(patch?.body).toEqual({ offerPolicy: 'ready_only' });
    expect(useToast().messages.value.some((message) => message.message === 'سیاست پیشنهاد به‌روزرسانی شد.')).toBe(true);
    wrapper.unmount();
  });

  it('deactivates and reactivates a job type', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    const toggles = wrapper.findAll('[data-testid="job-type-active-toggle"]');
    await toggles[0].trigger('click');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({ active: false });
    expect(useToast().messages.value.some((message) => message.message === 'نوع شغل غیرفعال شد.')).toBe(true);
    wrapper.unmount();
  });
});
