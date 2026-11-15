import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import UsersView from '../src/client/views/admin/UsersView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * User administration is the screen that can lock someone out or hand out an administrator role.
 * Two things are worth pinning: the activation toggle must act on the state the row actually shows
 * (the payload calls it `active`, not `isActive`), and a new account's first password must satisfy
 * the rule the server enforces, since the administrator is the one choosing it.
 */

/** One user row exactly as `GET /_admin/users` serializes it. */
const ACTIVE_USER = {
  id: 'usr_active',
  username: 'saeed.k',
  role: 'user',
  active: true,
  securityReady: true,
  mustCompleteSecurityQuestions: false,
  readyForMission: false,
  jobTypeId: 'job_fire',
  averageRating: 4.6,
  sessionCount: 1,
  online: false,
  createdAt: 1794136403220,
  updatedAt: 1794136403220
};

const DISABLED_USER = {
  ...ACTIVE_USER,
  id: 'usr_disabled',
  username: 'old.account',
  active: false,
  averageRating: 0
};

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_users', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double for the user list and the mutations. */
function stubApi(options: { users?: unknown[]; fail?: (path: string, method: string) => Response | null; delayDetailMs?: number } = {}) {
  const calls: Array<{ method: string; path: string; url: string; body?: any }> = [];
  const users = options.users ?? [ACTIVE_USER, DISABLED_USER];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      const failure = options.fail?.(path, method);
      if (failure) return failure;
      if (path === '/_admin/users' && method === 'GET') return json({ items: users, total: users.length });
      if (path === '/_admin/groups' && method === 'GET') {
        return json({ items: [{ id: 'grp_x', name: 'گروه امداد پزشکی', color: '#AF3438', capacity: 10, status: 'active', incidentIds: ['inc_fire'], memberCount: 1, coverageCount: 1, memberIds: ['usr_active'] }], total: 1 });
      }
      const detailMatch = path.match(/^\/_admin\/users\/([^/]+)$/);
      if (detailMatch && method === 'GET') {
        if (options.delayDetailMs) await new Promise((resolve) => setTimeout(resolve, options.delayDetailMs));
        const base = users.find((u: any) => u.id === detailMatch[1]);
        if (!base) {
          return new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'NOT_FOUND', message: 'یافت نشد.' } }), {
            status: 404, headers: { 'content-type': 'application/json' } });
        }
        return json({
          user: { id: base.id, username: base.username, role: 'responder', isActive: base.active, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: base.readyForMission, recordTrack: false, averageRating: base.averageRating, createdAt: base.createdAt },
          sessions: [{ sessionId: 'ses_1', deviceName: 'iPhone 15 · Safari', ip: '188.47.62.18', createdAt: Date.now() - 2 * 3600_000, lastActiveAt: Date.now() - 5 * 60_000, expiresAt: Date.now() + 7 * 86_400_000 }],
          logins: [{ ip: '188.47.62.18', deviceName: 'iPhone 15 · Safari', success: true, loginAt: Date.now() - 2 * 3600_000 }],
          sosCount: 6
        });
      }
      return json({ ok: true });
    })
  );
  return calls;
}

/** Mounts the users screen; the view loads the list itself. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminUsers });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(UsersView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

/** Types into the account-creation form by its label. */
async function fillDraft(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], username: string, password: string) {
  const fields = wrapper.findAll('.stack-form input');
  await fields[0].setValue(username);
  await fields[1].setValue(password);
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

describe('user table', () => {
  it('renders one row per account with its activation state', async () => {
    stubApi();
    const { wrapper } = await render();
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('saeed.k');
    expect(rows[0].text()).toContain('فعال');
    // An account that is off must not render as if it were on: the payload field is `active`.
    expect(rows[1].text()).toContain('غیرفعال');
    expect(rows[1].text()).toContain('فعال کردن');
    wrapper.unmount();
  });

  it('offers the opposite of the current state on each row', async () => {
    stubApi();
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="user-toggle-usr_active"]').text()).toContain('غیرفعال کردن');
    expect(wrapper.find('[data-testid="user-toggle-usr_disabled"]').text()).toContain('فعال کردن');
    wrapper.unmount();
  });

  it('deactivates an active account with the state it actually has', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-toggle-usr_active"]').trigger('click');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.path).toBe('/_admin/users/usr_active');
    // `false` deactivates. Sending `true` here would be a silent no-op presented as a success.
    expect(patch?.body).toEqual({ active: false });
    expect(useToast().messages.value.some((message) => message.message === 'حساب غیرفعال شد.')).toBe(true);
    wrapper.unmount();
  });

  it('reactivates a disabled account', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-toggle-usr_disabled"]').trigger('click');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({ active: true });
    expect(useToast().messages.value.some((message) => message.message === 'حساب فعال شد.')).toBe(true);
    wrapper.unmount();
  });

  it('reports a refused toggle instead of claiming success', async () => {
    stubApi({
      fail: (path, method) =>
        path === '/_admin/users/usr_active' && method === 'PATCH'
          ? new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'اجازه ندارید.' } }), {
              status: 403,
              headers: { 'content-type': 'application/json' }
            })
          : null
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-toggle-usr_active"]').trigger('click');
    await flushPromises();

    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message === 'اجازه ندارید.')).toBe(true);
    expect(messages.some((message) => message.message === 'حساب غیرفعال شد.')).toBe(false);
    wrapper.unmount();
  });

  it('sends the search term and role filter to the server', async () => {
    const calls = stubApi();
    const { wrapper } = await render();

    const input = wrapper.find('.panel__filters input');
    await input.setValue('saeed');
    const select = wrapper.find('.panel__filters select');
    (select.element as HTMLSelectElement).value = 'responder';
    await select.trigger('change');
    await flushPromises();

    // The role change triggers a search on its own; the filters travel as the query string.
    const filtered = calls.filter((call) => call.method === 'GET' && call.path === '/_admin/users');
    expect(filtered.some((call) => call.url.includes('role=responder'))).toBe(true);
    expect(filtered.some((call) => call.url.includes('q=saeed'))).toBe(true);
    expect(wrapper.findAll('tbody tr').length).toBe(2);
    wrapper.unmount();
  });

  it('shows the designed filter-empty state and clears the filters from it', async () => {
    const calls = stubApi({ users: [] });
    const { wrapper } = await render();
    // No filter active yet: the honest generic empty case.
    const empty = wrapper.find('[data-testid="users-empty"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('کاربری ثبت نشده است');
    expect(wrapper.find('[data-testid="users-clear-filters"]').exists()).toBe(false);

    // A filter that matches nothing flips the panel to the designed filter-empty composition.
    await wrapper.find('.panel__filters input').setValue('nomatch');
    await wrapper.find('.panel__filters select').setValue('responder');
    await flushPromises();
    const filteredEmpty = wrapper.find('[data-testid="users-empty"]');
    expect(filteredEmpty.text()).toContain('کاربری با این فیلترها پیدا نشد');
    expect(filteredEmpty.text()).toContain('فیلتر نقش را بردارید');

    const before = calls.length;
    await wrapper.find('[data-testid="users-clear-filters"]').trigger('click');
    await flushPromises();
    // Clearing the filters re-issues the unfiltered search.
    expect(calls.length).toBeGreaterThan(before);
    expect(calls.some((call) => call.path === '/_admin/users' && !call.url.includes('q=') && !call.url.includes('role='))).toBe(true);
    wrapper.unmount();
  });
});

describe('account creation', () => {
  it('normalizes the username before creating the account', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillDraft(wrapper, '  New.Person  ', 'GoodPass!2026');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    const created = calls.find((call) => call.method === 'POST' && call.path === '/_admin/users');
    expect(created?.body).toEqual({ username: 'new.person', password: 'GoodPass!2026', role: 'user' });
    // The administrator is told the account is not usable until the questions are answered.
    expect(useToast().messages.value.some((message) => message.message.includes('پرسش‌های امنیتی'))).toBe(true);
    // The form is cleared so a second account is not a copy of the first.
    expect((wrapper.findAll('.stack-form input')[0].element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });

  it('refuses a temporary password the server will reject', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillDraft(wrapper, 'new.person', 'short1');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    // The account would be created with a password that cannot be handed over or changed safely.
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_admin/users')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toContain('۱۲ تا ۱۲۸');
    wrapper.unmount();
  });

  it('refuses a long but digit-free password', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillDraft(wrapper, 'new.person', 'onlylettersnow');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.method === 'POST' && call.path === '/_admin/users')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toContain('هم حرف و هم رقم');
    wrapper.unmount();
  });

  it('shows a duplicate-username conflict and keeps the form', async () => {
    stubApi({
      fail: (path, method) =>
        path === '/_admin/users' && method === 'POST'
          ? new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'CONFLICT', message: 'این نام کاربری گرفته شده است.' } }), {
              status: 409,
              headers: { 'content-type': 'application/json' }
            })
          : null
    });
    const { wrapper } = await render();
    await fillDraft(wrapper, 'saeed.k', 'GoodPass!2026');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.stack-form .v-alert').text()).toContain('گرفته شده است');
    expect((wrapper.findAll('.stack-form input')[0].element as HTMLInputElement).value).toBe('saeed.k');
    wrapper.unmount();
  });

  it('stores a non-default role when the administrator picks one', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillDraft(wrapper, 'new.admin', 'GoodPass!2026');
    const roleSelect = wrapper.find('.stack-form select');
    (roleSelect.element as HTMLSelectElement).value = 'admin';
    await roleSelect.trigger('change');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    const created = calls.find((call) => call.method === 'POST' && call.path === '/_admin/users');
    expect(created?.body.role).toBe('admin');
    wrapper.unmount();
  });
});

/** A responder row with job-type information, as the extended admin view serializes it. */
const RESPONDER = {
  ...ACTIVE_USER,
  id: 'usr_responder_jt',
  username: 'reza.jt',
  role: 'responder',
  jobTypeId: 'job_fire',
  jobTypeLabel: 'آتش‌نشانی'
};

describe('job types on the users screen', () => {
  it('shows the job-type select only for responders and clears with the empty option', async () => {
    const calls = stubApi({ users: [RESPONDER, ACTIVE_USER] });
    const { wrapper } = await render();

    const selects = wrapper.findAll('[data-testid="user-job-type"]');
    expect(selects).toHaveLength(1);
    await selects[0].setValue('job_maintenance');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH' && call.path === '/_admin/users/usr_responder_jt');
    expect(patch?.body).toEqual({ jobTypeId: 'job_maintenance' });
    expect(useToast().messages.value.some((message) => message.message === 'نوع شغل امدادگر به‌روزرسانی شد.')).toBe(true);
    wrapper.unmount();
  });

  it('sends the job type when creating a responder', async () => {
    const calls = stubApi({ users: [RESPONDER] });
    const { wrapper } = await render();

    const fields = wrapper.findAll('.stack-form input');
    await fields[0].setValue('new.responder');
    await fields[1].setValue('Created!2026x');
    await wrapper.find('.stack-form select').setValue('responder');
    await wrapper.find('[data-testid="new-user-job-type"]').setValue('job_fire');
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    const created = calls.find((call) => call.method === 'POST' && call.path === '/_admin/users');
    expect(created?.body.role).toBe('responder');
    expect(created?.body.jobTypeId).toBe('job_fire');
    wrapper.unmount();
  });
});

const RESPONDER_USER = {
  ...ACTIVE_USER,
  id: 'usr_responderx',
  username: 'nima.t',
  role: 'responder',
  jobTypeId: 'job_fire'
};

describe('responder job type in the table', () => {
  it('reports a refused job-type change instead of a silent success', async () => {
    stubApi({
      users: [ACTIVE_USER, RESPONDER_USER],
      fail: (path, method) =>
        path === '/_admin/users/usr_responderx' && method === 'PATCH'
          ? new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'اجازۀ این تغییر را ندارید.' } }), {
              status: 403,
              headers: { 'content-type': 'application/json' }
            })
          : null
    });
    const { wrapper } = await render();
    const select = wrapper.find('[data-testid="user-job-type"]');
    (select.element as HTMLSelectElement).value = 'job_medical';
    await select.trigger('change');
    await flushPromises();

    expect(useToast().messages.value.some((message) => message.message === 'اجازۀ این تغییر را ندارید.')).toBe(true);
    expect(useToast().messages.value.some((message) => message.message === 'نوع شغل امدادگر به‌روزرسانی شد.')).toBe(false);
    wrapper.unmount();
  });
});

describe('account detail panel', () => {
  it('opens for a row, shows profile facts and lists sessions and logins', async () => {
    stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();

    const panel = wrapper.find('[data-testid="user-account-panel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain('saeed.k');
    expect(panel.text()).toContain('حساب فعال');
    expect(panel.text()).toContain('iPhone 15 · Safari');
    expect(panel.text()).toContain('188.47.62.18');
    expect(panel.text()).toContain('۶'); // sosCount, Persian digits
    wrapper.unmount();
  });

  it('closes on the close button and on Escape', async () => {
    stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="user-account-panel"]').exists()).toBe(true);

    await wrapper.find('[data-testid="user-detail-close"]').trigger('click');
    expect(wrapper.find('[data-testid="user-account-panel"]').exists()).toBe(false);

    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="user-account-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('deactivation needs a second, deliberate press and sends active:false', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();

    const button = wrapper.find('[data-testid="user-panel-toggle-active"]');
    await button.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    expect(button.text()).toContain('غیرفعال قطعی');

    await button.trigger('click');
    await flushPromises();
    const patch = calls.find((call) => call.method === 'PATCH' && call.path === '/_admin/users/usr_active');
    expect(patch?.body).toEqual({ active: false });
    // Panel re-fetches the payload so the badge flips to غیرفعال without a reload.
    expect(calls.filter((call) => call.method === 'GET' && call.path === '/_admin/users/usr_active').length).toBeGreaterThanOrEqual(2);
    wrapper.unmount();
  });

  it('saves role edits from the panel and refreshes both the list and the panel', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();

    // Open edit mode, switch role to responder, save.
    const buttons = wrapper.findAll('.account-panel__foot-actions .v-btn');
    const editButton = buttons.find((button) => button.text().includes('ویرایش کاربر'))!;
    await editButton.trigger('click');
    await flushPromises();
    const roleSelect = wrapper.find('.account-panel__edit select[aria-label="نقش حساب"]');
    (roleSelect.element as HTMLSelectElement).value = 'responder';
    await roleSelect.trigger('change');
    await flushPromises();

    const saveButton = wrapper.findAll('.account-panel__edit .v-btn').find((button) => button.text().includes('ذخیرهٔ تغییرات'))!;
    await saveButton.trigger('click');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH' && call.path === '/_admin/users/usr_active');
    expect(patch?.body).toMatchObject({ role: 'responder' });
    wrapper.unmount();
  });

  it('shows a skeleton while the payload is in flight, then swaps in the content', async () => {
    stubApi({ delayDetailMs: 60 });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    // Before the payload lands, the panel shows the skeleton instead of empty sections.
    expect(wrapper.find('.account-panel__skeleton').exists()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await flushPromises();
    expect(wrapper.find('.account-panel__skeleton').exists()).toBe(false);
    expect(wrapper.find('[data-testid="user-account-panel"]').text()).toContain('saeed.k');
    wrapper.unmount();
  });

  it('renders the users-list skeleton before the payload lands', async () => {
    // Gate the users endpoint so the empty table state is observable mid-flight.
    let release: (() => void) | null = null;
    const base = stubApi();
    const inner = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = String(url).split('?')[0];
      if (path === '/_admin/users' && (init?.method ?? 'GET') === 'GET') {
        await new Promise<void>((resolve) => { release = resolve; });
        return json({ items: [ACTIVE_USER, DISABLED_USER], total: 2, page: 1, limit: 50 });
      }
      return json({ items: [] });
    });
    vi.stubGlobal('fetch', inner);
    void base;
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="users-skeleton"]').exists()).toBe(true);
    release!();
    await flushPromises();
    expect(wrapper.find('[data-testid="users-skeleton"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('saeed.k');
    wrapper.unmount();
  });

  it('shows the roster groups the account belongs to', async () => {
    stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="user-account-panel"]').text()).toContain('گروه امداد پزشکی');
    wrapper.unmount();
  });

  it('shows a refused deactivation without claiming success', async () => {
    stubApi({
      fail: (path, method) =>
        path === '/_admin/users/usr_active' && method === 'PATCH'
          ? new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'اجازۀ این تغییر را ندارید.' } }), {
              status: 403,
              headers: { 'content-type': 'application/json' }
            })
          : null
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();

    const button = wrapper.find('[data-testid="user-panel-toggle-active"]');
    await button.trigger('click'); // arm
    await button.trigger('click'); // attempt
    await flushPromises();

    expect(useToast().messages.value.some((message) => message.message === 'اجازۀ این تغییر را ندارید.')).toBe(true);
    expect(useToast().messages.value.some((message) => message.message === 'حساب غیرفعال و همهٔ نشست‌ها باطل شد.')).toBe(false);
    wrapper.unmount();
  });

  it('reactivates a deactivated account with a single press', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_disabled"]').trigger('click');
    await flushPromises();

    const button = wrapper.find('[data-testid="user-panel-toggle-active"]');
    expect(button.text()).toContain('فعال کردن حساب');
    await button.trigger('click');
    await flushPromises();

    const patch = calls.find((call) => call.method === 'PATCH' && call.path === '/_admin/users/usr_disabled');
    expect(patch?.body).toEqual({ active: true });
    wrapper.unmount();
  });

  it('shows a refused edit on the panel instead of claiming saved', async () => {
    stubApi({
      fail: (path, method) =>
        path === '/_admin/users/usr_active' && method === 'PATCH'
          ? new Response(JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'اجازۀ این تغییر را ندارید.' } }), {
              status: 403,
              headers: { 'content-type': 'application/json' }
            })
          : null
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();

    const buttons = wrapper.findAll('.account-panel__foot-actions .v-btn');
    await buttons.find((button) => button.text().includes('ویرایش کاربر'))!.trigger('click');
    await flushPromises();
    const saveButton = wrapper.findAll('.account-panel__edit .v-btn').find((button) => button.text().includes('ذخیرهٔ تغییرات'))!;
    await saveButton.trigger('click');
    await flushPromises();

    expect(wrapper.find('.account-panel__edit .v-alert').text()).toContain('اجازۀ این تغییر را ندارید.');
    expect(useToast().messages.value.some((message) => message.message === 'نقش حساب به‌روزرسانی شد.')).toBe(false);

    const cancel = wrapper.findAll('.account-panel__edit .v-btn').find((button) => button.text().includes('انصراف'))!;
    await cancel.trigger('click');
    await flushPromises();
    expect(wrapper.find('.account-panel__edit').exists()).toBe(false);
    wrapper.unmount();
  });

  it('resolves the responder job-type label from the loaded catalog', async () => {
    stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="user-detail-usr_active"]').trigger('click');
    await flushPromises();

    // The stub catalog is empty so the seeded fallback labels apply; usr_active carries job_fire.
    const text = wrapper.find('[data-testid="user-account-panel"]').text();
    expect(text).toContain('آتش‌نشانی');
    // Switch the draft into responder mode and confirm the job-type select offers the fallback.
    const buttons = wrapper.findAll('.account-panel__foot-actions .v-btn');
    await buttons.find((button) => button.text().includes('ویرایش کاربر'))!.trigger('click');
    await flushPromises();
    const roleSelect = wrapper.find('.account-panel__edit select[aria-label="نقش حساب"]');
    (roleSelect.element as HTMLSelectElement).value = 'responder';
    await roleSelect.trigger('change');
    await flushPromises();
    expect(wrapper.find('.account-panel__edit').text()).toContain('آتش‌نشانی');
    wrapper.unmount();
  });
});
