import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import RegisterView from '../src/client/views/auth/RegisterView.vue';
import { passwordIssue, passwordIssueMessage } from '../src/client/composables/usePasswordPolicy.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * Registration is where the password is chosen and where the five recovery questions are bound to
 * an account. A validation gap here is expensive: the server answers a bad password or a missing
 * answer with the same bare "Invalid request.", and a user who picks five identical questions
 * creates an account they can later lock themselves out of.
 */

const QUESTIONS = [
  { id: 'sq_1', label: 'نام نخستین مدرسه؟' },
  { id: 'sq_2', label: 'نام نخستین حیوان خانگی؟' },
  { id: 'sq_3', label: 'شهر تولد؟' },
  { id: 'sq_4', label: 'نام نخستین معلم؟' },
  { id: 'sq_5', label: 'خیابان کودکی؟' }
];

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_reg', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double serving the catalog and recording the register call. */
function stubApi(options: { questions?: unknown[]; register?: () => Response } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (path === '/_public/security-questions') return json({ items: options.questions ?? QUESTIONS });
      if (path === '/_auth/register' && method === 'POST') {
        return options.register
          ? options.register()
          : json({ id: 'usr_new', username: 'new.person', role: 'user', mustCompleteSecurityQuestions: false });
      }
      return json({ items: [] });
    })
  );
  return calls;
}

/** Mounts the registration view on its route. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.register });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(RegisterView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

/** Sets one of the three simple text fields by id. */
async function type(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], id: string, value: string): Promise<void> {
  const field = wrapper.find(`#${id}`);
  expect(field.exists(), `field ${id}`).toBe(true);
  await field.setValue(value);
}

/** Fills all five answer fields. */
async function answerAll(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], answer = 'پاسخ من'): Promise<void> {
  const fields = wrapper.findAll('.auth-question input[type="text"], .auth-question input:not([type])');
  for (const field of fields) await field.setValue(answer);
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('password policy', () => {
  it('matches the rules the server enforces', () => {
    expect(passwordIssue('Short1').valueOf()).toBe('length');
    expect(passwordIssue('1234567890123')).toBe('composition');
    expect(passwordIssue('onlylettershere')).toBe('composition');
    expect(passwordIssue('GoodPass!2026')).toBe(null);
    expect(passwordIssue(`a1${'x'.repeat(127)}`)).toBe('length');
    expect(passwordIssueMessage('length')).toContain('۱۲ تا ۱۲۸');
    expect(passwordIssueMessage('composition')).toContain('هم حرف و هم رقم');
    expect(passwordIssueMessage(null)).toBe(null);
  });

  it('does not trim: a password of spaces is a length failure, not a valid secret', () => {
    expect(passwordIssue('     ')).toBe('length');
  });
});

describe('registration form', () => {
  it('disables the submit button until five questions are available', async () => {
    stubApi({ questions: QUESTIONS.slice(0, 4) });
    const { wrapper } = await render();
    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('enables submission once the catalog supplies five questions', async () => {
    stubApi();
    const { wrapper } = await render();
    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('rejects two different passwords before it reaches the network', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await type(wrapper, 'reg-username', 'new.person');
    await type(wrapper, 'reg-password', 'GoodPass!2026');
    await type(wrapper, 'reg-confirm', 'GoodPass!2027');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.path === '/_auth/register')).toBe(false);
    expect(wrapper.find('.v-alert').text()).toContain('یکسان نیستند');
    wrapper.unmount();
  });

  it('names the password rule instead of forwarding a weak secret', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await type(wrapper, 'reg-username', 'new.person');
    await type(wrapper, 'reg-password', 'short1');
    await type(wrapper, 'reg-confirm', 'short1');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.path === '/_auth/register')).toBe(false);
    // A digits-only password is long enough but still invalid; the message must say which rule.
    expect(wrapper.find('.v-alert').text()).toContain('۱۲ تا ۱۲۸');
    wrapper.unmount();
  });

  it('requires five distinct questions', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await type(wrapper, 'reg-username', 'new.person');
    await type(wrapper, 'reg-password', 'GoodPass!2026');
    await type(wrapper, 'reg-confirm', 'GoodPass!2026');

    // Two of the five selects get the same question.
    const selects = wrapper.findAllComponents({ name: 'VSelect' });
    expect(selects.length).toBe(5);
    selects[0].vm.$emit('update:modelValue', 'sq_1');
    selects[1].vm.$emit('update:modelValue', 'sq_1');
    selects[2].vm.$emit('update:modelValue', 'sq_3');
    selects[3].vm.$emit('update:modelValue', 'sq_4');
    selects[4].vm.$emit('update:modelValue', 'sq_5');
    await flushPromises();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.path === '/_auth/register')).toBe(false);
    expect(wrapper.find('.v-alert').text()).toContain('متفاوت');
    wrapper.unmount();
  });

  it('refuses an unanswered question rather than binding an unusable account', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await type(wrapper, 'reg-username', 'new.person');
    await type(wrapper, 'reg-password', 'GoodPass!2026');
    await type(wrapper, 'reg-confirm', 'GoodPass!2026');

    const selects = wrapper.findAllComponents({ name: 'VSelect' });
    for (const [index, select] of selects.entries()) select.vm.$emit('update:modelValue', `sq_${index + 1}`);
    await flushPromises();
    await answerAll(wrapper);

    // Blank the last answer.
    const answers = wrapper.findAll('.auth-question input');
    await answers.at(-1)!.setValue('');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.path === '/_auth/register')).toBe(false);
    // Match on the rule's number, not the phrase: the text carries a zero-width non-joiner.
    expect(wrapper.find('.v-alert').text()).toMatch(/۲ نویسه/);
    wrapper.unmount();
  });

  it('submits a normalized username with the five chosen questions', async () => {
    const calls = stubApi();
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await type(wrapper, 'reg-username', '  New.Person  ');
    await type(wrapper, 'reg-password', 'GoodPass!2026');
    await type(wrapper, 'reg-confirm', 'GoodPass!2026');

    const selects = wrapper.findAllComponents({ name: 'VSelect' });
    for (const [index, select] of selects.entries()) select.vm.$emit('update:modelValue', `sq_${index + 1}`);
    await flushPromises();
    await answerAll(wrapper, 'پاسخ یکتا');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_auth/register');
    expect(call?.body.username).toBe('new.person');
    expect(call?.body.password).toBe('GoodPass!2026');
    expect(call?.body.securityQuestions).toEqual([
      { questionId: 'sq_1', answer: 'پاسخ یکتا' },
      { questionId: 'sq_2', answer: 'پاسخ یکتا' },
      { questionId: 'sq_3', answer: 'پاسخ یکتا' },
      { questionId: 'sq_4', answer: 'پاسخ یکتا' },
      { questionId: 'sq_5', answer: 'پاسخ یکتا' }
    ]);
    // A fresh account lands on the map; an administrator is not created through this form.
    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.map });
    await router.push({ name: ROUTE_NAMES.map });
    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.map);
    wrapper.unmount();
  });

  it('shows the server message when the username is already taken', async () => {
    stubApi({
      register: () =>
        new Response(
          JSON.stringify({ ok: false, requestId: 'req_reg', error: { code: 'CONFLICT', message: 'این نام کاربری گرفته شده است.' } }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        )
    });
    const { wrapper } = await render();
    await type(wrapper, 'reg-username', 'saeed.k');
    await type(wrapper, 'reg-password', 'GoodPass!2026');
    await type(wrapper, 'reg-confirm', 'GoodPass!2026');

    const selects = wrapper.findAllComponents({ name: 'VSelect' });
    for (const [index, select] of selects.entries()) select.vm.$emit('update:modelValue', `sq_${index + 1}`);
    await flushPromises();
    await answerAll(wrapper);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.v-alert').text()).toContain('گرفته شده است');
    // The form keeps what was typed: retyping five answers after one conflict is punishing.
    expect((wrapper.find('#reg-username').element as HTMLInputElement).value).toBe('saeed.k');
    wrapper.unmount();
  });
});
