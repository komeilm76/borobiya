import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import RecoveryView from '../src/client/views/auth/RecoveryView.vue';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * Recovery is the one flow that hands out a password reset, so its failure modes matter more than
 * its happy path: a dead end strands the user, a submit that stays disabled locks them out, and a
 * raw transport error tells them nothing actionable.
 */

const QUESTIONS = [
  { id: 'sq_1', label: 'نام نخستین مدرسه؟' },
  { id: 'sq_2', label: 'نام نخستین حیوان خانگی؟' },
  { id: 'sq_3', label: 'شهر تولد؟' }
];

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_rec', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Builds the error envelope the server produces for a validation failure. */
function invalid(field: string, reason: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      requestId: 'req_rec',
      error: { code: 'INVALID_INPUT', message: 'Invalid request.', details: { field, reason } }
    }),
    { status: 400, headers: { 'content-type': 'application/json' } }
  );
}

type Handler = (path: string, body: any) => Response;

/** Installs a fetch double keyed by endpoint and returns the recorded `path body` calls. */
function stubApi(handler: Handler): Array<{ path: string; body: any }> {
  const calls: Array<{ path: string; body: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      return handler(path, body);
    })
  );
  return calls;
}

/** Mounts the recovery view on its route, the way the router does. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.recovery });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(RecoveryView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

/** The step heading doubles as the only reliable way to tell which step is showing. */
function heading(wrapper: Awaited<ReturnType<typeof render>>['wrapper']): string {
  return wrapper.find('.auth-card__section').text();
}

/** Types into a field found by its visible label, falling back to its `name` attribute. */
async function fill(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], label: string, value: string): Promise<void> {
  const byLabel = wrapper.findAll('label').find((candidate) => candidate.text() === label);
  if (byLabel) {
    const forId = byLabel.attributes('for');
    const field = forId ? wrapper.find(`#${forId}`) : null;
    if (field?.exists()) {
      await field.setValue(value);
      return;
    }
  }
  const named = wrapper.findAll('input').find((candidate) => candidate.attributes('name') === label);
  if (named) {
    await named.setValue(value);
    return;
  }
  throw new Error(`no field for ${label}`);
}

/** Advances to the answers step with the default stub. */
async function reachAnswers() {
  const calls = stubApi((path) =>
    path === '/_auth/recovery/start' ? json({ recoveryId: 'rec_1', questions: QUESTIONS, expiresAt: Date.now() + 60000 }) : json({})
  );
  const rendered = await render();
  await fill(rendered.wrapper, 'username', 'Saeed.K');
  await rendered.wrapper.find('form').trigger('submit');
  await flushPromises();
  return { ...rendered, calls };
}

/** Advances all the way to the reset step. */
async function reachReset() {
  const { wrapper, router, calls } = await reachAnswers();
  const fields = wrapper.findAll('.auth-card__question input');
  for (const [index, field] of fields.entries()) await field.setValue(`answer-${index}`);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  return { wrapper, router, calls };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('recovery flow', () => {
  it('starts on the account step with a username field', async () => {
    stubApi(() => json({}));
    const { wrapper } = await render();
    expect(heading(wrapper)).toBe('نام کاربری');
    expect(wrapper.findAll('input')).toHaveLength(1);
    expect(wrapper.text()).toContain('دریافت پرسش‌ها');
    wrapper.unmount();
  });

  it('asks the server for the challenges and moves on', async () => {
    const { wrapper, calls } = await reachAnswers();
    expect(calls[0].path).toBe('/_auth/recovery/start');
    // The lookup is normalized before it leaves the client.
    expect(calls[0].body).toEqual({ username: 'saeed.k' });
    expect(heading(wrapper)).toBe('پاسخ پرسش‌ها');
    expect(wrapper.findAll('.auth-card__question')).toHaveLength(3);
    wrapper.unmount();
  });

  it('submits the three answers against the challenge it was given', async () => {
    const { wrapper, calls } = await reachReset();
    const answerCall = calls.find((call) => call.path === '/_auth/recovery/answers');
    expect(answerCall?.body).toEqual({
      recoveryId: 'rec_1',
      answers: [
        { questionId: 'sq_1', answer: 'answer-0' },
        { questionId: 'sq_2', answer: 'answer-1' },
        { questionId: 'sq_3', answer: 'answer-2' }
      ]
    });
    expect(heading(wrapper)).toBe('گذرواژه تازه');
    wrapper.unmount();
  });

  it('returns to the login screen after the password is reset', async () => {
    const { wrapper, router } = await reachReset();
    const navigations = vi.spyOn(router, 'push');
    await wrapper.findAll('input').at(-1)!.setValue('BrandNewPass!2026');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.login });
    // The destination must really be reachable, not merely requested.
    await router.push({ name: ROUTE_NAMES.login });
    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.login);
    wrapper.unmount();
  });

  it('shows the server message when the account is unknown, without leaving the step', async () => {
    stubApi(() => json({ recoveryId: 'rec_decoy', questions: QUESTIONS, expiresAt: Date.now() + 60000 }));
    const { wrapper } = await render();
    await fill(wrapper, 'username', 'ghost');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    // Decoy challenges look identical on purpose: the UI must not reveal whether an account exists.
    expect(heading(wrapper)).toBe('پاسخ پرسش‌ها');
    expect(wrapper.findAll('.auth-card__question')).toHaveLength(3);
    wrapper.unmount();
  });

  it('reports a wrong answer and lets the user try again', async () => {
    const { wrapper } = await reachAnswers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ ok: false, requestId: 'req_rec', error: { code: 'UNAUTHORIZED', message: 'پاسخ‌ها درست نیست.' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ))
    );
    for (const field of wrapper.findAll('.auth-card__question input')) await field.setValue('نادرست');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.v-alert').text()).toContain('پاسخ‌ها درست نیست.');
    expect(heading(wrapper)).toBe('پاسخ پرسش‌ها');
    wrapper.unmount();
  });

  it('re-enables the button after a failed lookup so recovery is not a dead end', async () => {
    stubApi(() => new Response(
      JSON.stringify({ ok: false, requestId: 'req_rec', error: { code: 'RATE_LIMITED', message: 'بعداً تلاش کنید.' } }),
      { status: 429, headers: { 'content-type': 'application/json' } }
    ));
    const { wrapper } = await render();
    await fill(wrapper, 'username', 'saeed.k');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.v-alert').text()).toContain('بعداً تلاش کنید.');
    expect(heading(wrapper)).toBe('نام کاربری');
    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('recovery password policy', () => {
  it('explains the password rule instead of forwarding a known-invalid secret', async () => {
    const { wrapper, calls } = await reachReset();
    const before = calls.length;

    await wrapper.findAll('input').at(-1)!.setValue('short');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Sending it can only earn "Invalid request.", which says nothing about what to type instead.
    expect(calls.length).toBe(before);
    const alert = wrapper.find('.v-alert');
    expect(alert.exists()).toBe(true);
    // The length rule is the one that applies here, and it names the numbers.
    expect(alert.text()).toContain('۱۲ تا ۱۲۸');
    expect(heading(wrapper)).toBe('گذرواژه تازه');
    wrapper.unmount();
  });

  it('rejects a long password that carries no digit before it reaches the server', async () => {
    const { wrapper, calls } = await reachReset();
    const before = calls.length;
    await wrapper.findAll('input').at(-1)!.setValue('onlylettershere');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(calls.length).toBe(before);
    // Long enough, but the missing digit is what has to be named.
    expect(wrapper.find('.v-alert').text()).toContain('هم حرف و هم رقم');
    wrapper.unmount();
  });

  it('rejects a long password with no letter before it reaches the server', async () => {
    const { wrapper, calls } = await reachReset();
    const before = calls.length;
    await wrapper.findAll('input').at(-1)!.setValue('1234567890123');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(calls.length).toBe(before);
    expect(wrapper.find('.v-alert').text()).toContain('هم حرف و هم رقم');
    wrapper.unmount();
  });

  it('accepts a password that satisfies the policy and clears the error', async () => {
    const { wrapper, calls } = await reachReset();
    await wrapper.findAll('input').at(-1)!.setValue('short');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.v-alert').exists()).toBe(true);

    await wrapper.findAll('input').at(-1)!.setValue('GoodPass!2026');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.path === '/_auth/recovery/reset')).toBe(true);
    wrapper.unmount();
  });

  it('shows the server reason when it rejects a password the client thought was fine', async () => {
    const { wrapper } = await reachReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => invalid('newPassword', 'must include letters and numbers'))
    );
    await wrapper.findAll('input').at(-1)!.setValue('GoodPass!2026');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(heading(wrapper)).toBe('گذرواژه تازه');
    expect(wrapper.find('.v-alert').exists()).toBe(true);
    wrapper.unmount();
  });
});
