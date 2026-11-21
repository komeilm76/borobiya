import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SupportRequestPanel from '../src/client/components/mission/SupportRequestPanel.vue';
import { useToast } from '../src/client/composables/useToast.ts';

/**
 * Leader-side composer for mission support requests. These tests cover the paths the
 * review-notice suite does not: opening the composer (catalog load and its failure mode),
 * line add/remove defaults, submit gating on the 10-character reason and unique lines, a
 * server-refused submit surfacing inline, and the two-step withdraw of a pending request.
 */

const TEAM_LEADER = {
  missionId: 'mis_1', sosId: 'sos_1', status: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high',
  createdAt: 1794136000000, viewerRole: 'leader',
  leader: null,
  members: [],
  memberCount: 1,
  requirements: [],
  pendingSupportRequestCount: 1
};

const PENDING = {
  id: 'srq_1', missionId: 'mis_1', requestedBy: 'usr_self', requestedByUsername: 'reza.m',
  reason: 'نیاز به یک امدادگر پزشکی در محل حادثه برای رسیدگی به مصدوم', note: null, status: 'pending',
  items: [{ jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', quantity: 1, approvedQuantity: 0 }],
  adminNote: null, reviewedAt: null, decisions: [],
  createdAt: 1794136100000, updatedAt: 1794136100000, cancelledAt: null,
  missionStatus: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high'
};

const JOB_TYPES = [
  { id: 'job_fire', label: 'آتش‌نشانی' },
  { id: 'job_medical', label: 'پزشکی' }
];

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_comp', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function stubApi(options: { catalogFails?: boolean; submitFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });

      if (path === '/_user/missions/mis_1/team' && method === 'GET') return json(TEAM_LEADER);
      if (path === '/_user/missions/mis_1/support-requests' && method === 'GET') return json({ items: [PENDING] });
      if (path === '/_user/job-types' && method === 'GET') {
        if (options.catalogFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'INTERNAL', message: 'فهرست نوع شغل‌ها در دسترس نیست.' } }),
            { status: 500, headers: { 'content-type': 'application/json' } }
          );
        }
        return json({ items: JOB_TYPES });
      }
      if (path === '/_user/missions/mis_1/support-requests' && method === 'POST') {
        if (options.submitFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'BAD_REQUEST', message: 'Items are not valid.' } }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          );
        }
        return json({ ok: true, supportRequest: { ...PENDING, id: 'srq_new' } });
      }
      if (path === '/_user/missions/mis_1/support-requests/srq_1/cancel' && method === 'POST') return json({ ok: true });
      return json({ ok: true });
    })
  );
  return calls;
}

async function render(options: { catalogFails?: boolean; submitFails?: boolean } = {}) {
  const calls = stubApi(options);
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(SupportRequestPanel, {
    props: { missionId: 'mis_1' },
    attachTo: document.body,
    global: { plugins: [pinia] }
  });
  await flushPromises();
  return { wrapper, calls };
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

describe('support composer', () => {
  it('opens the composer with the catalog loaded and the first line pre-filled', async () => {
    const { wrapper } = await render();
    await wrapper.find('[data-testid="open-support-composer"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="support-composer"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('آتش‌نشانی');
    // Submit stays disabled until the reason carries at least 10 characters.
    expect(wrapper.find('[data-testid="submit-support-request"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('surfaces a catalog failure inline instead of opening an empty composer', async () => {
    const { wrapper } = await render({ catalogFails: true });
    await wrapper.find('[data-testid="open-support-composer"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.team-panel__error').exists()).toBe(true);
    expect(wrapper.text()).toContain('فهرست نوع شغل‌ها');
    wrapper.unmount();
  });

  it('adds and removes lines with the next unused job type as the default', async () => {
    const { wrapper } = await render();
    await wrapper.find('[data-testid="open-support-composer"]').trigger('click');
    await flushPromises();
    await wrapper.find('.support-composer__add').trigger('click');
    await flushPromises();
    const selects = wrapper.findAll('[data-testid="support-line-jobtype"]') as ReturnType<typeof wrapper.findAll>;
    expect(selects).toHaveLength(2);
    expect((selects[0].element as HTMLSelectElement).value).toBe('job_fire');
    expect((selects[1].element as HTMLSelectElement).value).toBe('job_medical');
    // Removing the first line leaves a single, non-removable line.
    await wrapper.find('[aria-label="حذف خط 1"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.team-editor__line')).toHaveLength(1);
    expect(wrapper.find('[aria-label="حذف خط 1"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps submit disabled while two lines target the same job type', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="open-support-composer"]').trigger('click');
    await flushPromises();
    await wrapper.find('.support-composer__add').trigger('click');
    await wrapper.find('[data-testid="support-reason"]').setValue('نیاز به نیروی کمکی برای رسیدگی');
    await flushPromises();
    expect(wrapper.find('[data-testid="submit-support-request"]').attributes('disabled')).toBeUndefined();
    // Point the second line at the same job type as the first.
    const selects = wrapper.findAll('[data-testid="support-line-jobtype"]');
    await selects[1].setValue('job_fire');
    await flushPromises();
    expect(wrapper.find('[data-testid="submit-support-request"]').attributes('disabled')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('submits the request, closes the composer and confirms with a toast', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="open-support-composer"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="support-reason"]').setValue('نیاز به یک امدادگر پزشکی در محل حادثه');
    await flushPromises();
    await wrapper.find('[data-testid="submit-support-request"]').trigger('click');
    await flushPromises();
    const submit = calls.find((call) => call.method === 'POST' && call.path === '/_user/missions/mis_1/support-requests');
    expect(submit?.body).toEqual({
      items: [{ jobTypeId: 'job_fire', quantity: 1 }],
      reason: 'نیاز به یک امدادگر پزشکی در محل حادثه'
    });
    expect(wrapper.find('[data-testid="support-composer"]').exists()).toBe(false);
    expect(useToast().messages.value.some((message) => message.message.includes('درخواست نیرو ثبت شد'))).toBe(true);
    wrapper.unmount();
  });

  it('shows the server refusal inline and keeps the composer open', async () => {
    const { wrapper } = await render({ submitFails: true });
    await wrapper.find('[data-testid="open-support-composer"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="support-reason"]').setValue('نیاز به نیروی کمکی برای رسیدگی میدانی حادثه');
    await flushPromises();
    await wrapper.find('[data-testid="submit-support-request"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.team-panel__error').exists()).toBe(true);
    expect(wrapper.text()).toContain('Items are not valid.');
    expect(wrapper.find('[data-testid="support-composer"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('withdraws a pending request only after an explicit second step', async () => {
    const { wrapper, calls } = await render();
    expect(wrapper.find('[data-testid="cancel-support-srq_1"]').exists()).toBe(true);
    await wrapper.find('[data-testid="cancel-support-srq_1"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.path === '/_user/missions/mis_1/support-requests/srq_1/cancel')).toBe(false);
    expect(wrapper.find('[data-testid="cancel-support-srq_1"]').text()).toContain('تأیید');
    await wrapper.find('[data-testid="cancel-support-srq_1"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.path === '/_user/missions/mis_1/support-requests/srq_1/cancel' && call.method === 'POST')).toBe(true);
    wrapper.unmount();
  });
});
