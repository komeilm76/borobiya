import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import LoginView from '../src/client/views/auth/LoginView.vue';
import { landingRoute, ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { ROLES } from '../src/shared/protocol.ts';

/**
 * Sign-in is the door to everything else, and `landingRoute` decides where each role goes next.
 * A wrong landing is not cosmetic: a responder sent to the admin console, or a user with pending
 * security questions sent to the map, meets a guard that bounces them straight back — a loop that
 * looks like a broken login.
 */

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_login', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Builds an error envelope. */
function failure(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_login', error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/**
 * Installs a fetch double.
 *
 * `login()` posts and then re-reads `/_user/me`, so the identity has to come from that second
 * call: answering it with an empty object sends every role to the map.
 */
function stubApi(respond: () => Response, identity: Record<string, unknown> = {}) {
  const calls: Array<{ path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/_auth/login') return respond();
      if (path === '/_user/me') return json(identity);
      return json({});
    })
  );
  return calls;
}

/** Mounts the login view on its route. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.login });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(LoginView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

/** Fills both fields and submits. */
async function signIn(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], username: string, password: string) {
  await wrapper.find('#login-username').setValue(username);
  await wrapper.find('#login-password').setValue(password);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('landing route', () => {
  it('sends each role somewhere it is allowed to be', () => {
    // Onboarding must win over the role: an unboarded account is bounced by the guard otherwise.
    expect(landingRoute(ROLES.USER, true)).toBe(ROUTE_NAMES.onboarding);
    expect(landingRoute(ROLES.RESPONDER, true)).toBe(ROUTE_NAMES.onboarding);
    expect(landingRoute(ROLES.ADMIN, true)).toBe(ROUTE_NAMES.onboarding);
    expect(landingRoute(ROLES.ADMIN, false)).toBe(ROUTE_NAMES.adminOverview);
    expect(landingRoute(ROLES.USER, false)).toBe(ROUTE_NAMES.map);
    expect(landingRoute(ROLES.RESPONDER, false)).toBe(ROUTE_NAMES.map);
    // An unknown role is treated as a user rather than crashing on a missing route name.
    expect(landingRoute(undefined, false)).toBe(ROUTE_NAMES.map);
  });

  it('sends an administrator to the admin console and a user to the map', async () => {
    const admin = { id: 'usr_admin', username: 'admin', role: ROLES.ADMIN, mustCompleteSecurityQuestions: false };
    stubApi(() => json(admin), admin);
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await signIn(wrapper, 'Admin', 'AdminPass!2026');

    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.adminOverview });
    await router.push({ name: ROUTE_NAMES.adminOverview });
    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.adminOverview);
    wrapper.unmount();
  });

  it('sends an account with pending questions to onboarding', async () => {
    const pending = { id: 'usr_new', username: 'new', role: ROLES.USER, mustCompleteSecurityQuestions: true };
    stubApi(() => json(pending), pending);
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await signIn(wrapper, 'new', 'GoodPass!2026');

    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.onboarding });
    wrapper.unmount();
  });
});

describe('sign-in form', () => {
  it('lowercases and trims the username before it leaves the browser', async () => {
    const calls = stubApi(() => json({ id: 'usr_requester', username: 'saeed.k', role: ROLES.USER, mustCompleteSecurityQuestions: false }));
    const { wrapper } = await render();
    await signIn(wrapper, '  Saeed.K  ', 'DemoPass!2026');

    const login = calls.find((call) => call.path === '/_auth/login');
    expect(login?.body.username).toBe('saeed.k');
    // The password must never be normalized: trimming it changes the secret.
    expect(login?.body.password).toBe('DemoPass!2026');
    wrapper.unmount();
  });

  it('sends a device name for the session list', async () => {
    const calls = stubApi(() => json({ id: 'usr_requester', username: 'saeed.k', role: ROLES.USER, mustCompleteSecurityQuestions: false }));
    const { wrapper } = await render();
    await signIn(wrapper, 'saeed.k', 'DemoPass!2026');
    const login = calls.find((call) => call.path === '/_auth/login');
    expect(typeof login?.body.deviceName).toBe('string');
    expect(login?.body.deviceName.length).toBeGreaterThan(0);
    expect(login?.body.deviceName.length).toBeLessThanOrEqual(60);
    wrapper.unmount();
  });

  it('shows the server message for wrong credentials and stays put', async () => {
    stubApi(() => failure(401, 'UNAUTHORIZED', 'نام کاربری یا گذرواژه نادرست است.'));
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await signIn(wrapper, 'saeed.k', 'wrong');

    expect(wrapper.find('.v-alert').text()).toContain('نادرست است');
    expect(navigations).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('surfaces a rate-limited sign-in with the server wording', async () => {
    stubApi(() => failure(429, 'RATE_LIMITED', 'تلاش‌های زیادی انجام شده است.'));
    const { wrapper } = await render();
    await signIn(wrapper, 'saeed.k', 'DemoPass!2026');
    expect(wrapper.find('.v-alert').text()).toContain('تلاش‌های زیادی');
    wrapper.unmount();
  });

  it('re-enables the button after a failed attempt so the user can try again', async () => {
    stubApi(() => failure(401, 'UNAUTHORIZED', 'نادرست'));
    const { wrapper } = await render();
    await signIn(wrapper, 'saeed.k', 'wrong');
    const button = wrapper.find('[data-testid="login-submit"]');
    expect(button.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('#login-password').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('clears the previous error when a new attempt starts', async () => {
    stubApi(() => failure(401, 'UNAUTHORIZED', 'نادرست'));
    const { wrapper } = await render();
    await signIn(wrapper, 'saeed.k', 'wrong');
    expect(wrapper.find('.v-alert').exists()).toBe(true);

    stubApi(() => json({ id: 'usr_requester', username: 'saeed.k', role: ROLES.USER, mustCompleteSecurityQuestions: false }));
    await signIn(wrapper, 'saeed.k', 'DemoPass!2026');
    expect(wrapper.find('.v-alert').exists()).toBe(false);
    wrapper.unmount();
  });

  it('fills the demo credentials so the accounts on the screen actually work', async () => {
    stubApi(() => json({}));
    const { wrapper } = await render();
    const buttons = wrapper.findAll('.auth-card__demo button');
    expect(buttons.length).toBe(3);

    // The administrator password differs from the demo users' one.
    await buttons[0].trigger('click');
    expect((wrapper.find('#login-username').element as HTMLInputElement).value).toBe('saeed.k');
    expect((wrapper.find('#login-password').element as HTMLInputElement).value).toBe('DemoPass!2026');

    await buttons[2].trigger('click');
    expect((wrapper.find('#login-username').element as HTMLInputElement).value).toBe('admin');
    expect((wrapper.find('#login-password').element as HTMLInputElement).value).toBe('AdminPass!2026');
    wrapper.unmount();
  });

  it('keeps the password masked until the user asks to see it', async () => {
    stubApi(() => json({}));
    const { wrapper } = await render();
    const field = wrapper.findAll('input').find((input) => input.attributes('name') === 'password')!;
    expect(field.attributes('type')).toBe('password');
    wrapper.unmount();
  });
});
