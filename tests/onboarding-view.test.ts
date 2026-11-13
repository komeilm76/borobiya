import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { VSelect, VTextField } from 'vuetify/components';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import OnboardingView from '../src/client/views/auth/OnboardingView.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { ROLES } from '../src/shared/protocol.ts';

/**
 * Forced onboarding is a gate, not a form. An administrator-created account cannot reach any other
 * screen until it has bound five distinct questions, so the two ways to get this wrong are both
 * expensive: sending fewer than five answers (the server answers a bare "Invalid request."), or
 * landing the user back on a screen the guard immediately bounces, which looks like a login loop.
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
  return new Response(JSON.stringify({ ok: true, requestId: 'req_onb', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Builds an error envelope. */
function failure(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_onb', error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double for the question catalog, the completion call and the profile re-read. */
function stubApi(options: { questions?: unknown[]; completion?: () => Response; identity?: Record<string, unknown> } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const identity = options.identity ?? {
    id: 'usr_new',
    username: 'new.person',
    role: ROLES.USER,
    mustCompleteSecurityQuestions: false
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (path === '/_public/security-questions') return json({ items: options.questions ?? QUESTIONS });
      if (path === '/_user/security-questions' && method === 'POST') {
        return options.completion ? options.completion() : json({});
      }
      if (path === '/_user/me') return json(identity);
      return json({});
    })
  );
  return { calls, identity };
}

/** Mounts the onboarding view and waits for the catalog to arrive. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.onboarding });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(OnboardingView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router, auth: useAuthStore() };
}

/**
 * The five answer fields, in slot order.
 *
 * `VSelect` renders a `VTextField` of its own, so a bare "all text fields" query returns ten for
 * five slots and pairs every answer with the wrong slot.
 */
function answerFields(wrapper: Awaited<ReturnType<typeof render>>['wrapper']) {
  return wrapper.findAllComponents(VTextField).filter((field) => !field.element.closest('.v-select'));
}

/** Answers a slot by driving the two Vuetify controls the user would touch. */
async function answer(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], index: number, questionId: string, text: string) {
  await wrapper.findAllComponents(VSelect)[index].vm.$emit('update:modelValue', questionId);
  await answerFields(wrapper)[index].vm.$emit('update:modelValue', text);
  await flushPromises();
}

/** Fills all five slots. */
async function answerAll(wrapper: Awaited<ReturnType<typeof render>>['wrapper']) {
  for (const [index, question] of QUESTIONS.entries()) {
    await answer(wrapper, index, question.id, `answer-${index + 1}`);
  }
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('question catalog', () => {
  it('offers every question the server publishes', async () => {
    stubApi();
    const { wrapper, auth } = await render();

    // The gate is unanswerable if the catalog does not load, so this is the first thing to pin.
    expect(auth.securityQuestions).toHaveLength(5);
    expect(wrapper.findAll('.auth-card__question')).toHaveLength(5);
    wrapper.unmount();
  });

  it('renders five answer fields even before the catalog arrives', async () => {
    stubApi({ questions: [] });
    const { wrapper } = await render();
    // Five slots are part of the rule; an empty catalog must not collapse the form.
    expect(wrapper.findAll('.auth-card__question')).toHaveLength(5);
    expect(answerFields(wrapper)).toHaveLength(5);
    wrapper.unmount();
  });

  it('states the rule so the user knows five distinct questions are required', async () => {
    stubApi();
    const { wrapper } = await render();
    expect(wrapper.find('.auth-card__hint').text()).toMatch(/پنج پرسش/);
    wrapper.unmount();
  });
});

describe('submitting the gate', () => {
  it('sends exactly five question and answer pairs', async () => {
    const { calls } = stubApi();
    const { wrapper } = await render();
    await answerAll(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const completion = calls.find((call) => call.path === '/_user/security-questions');
    expect(completion?.body.securityQuestions).toHaveLength(5);
    expect(completion?.body.securityQuestions[0]).toEqual({ questionId: 'sq_1', answer: 'answer-1' });
    expect(completion?.body.securityQuestions[4]).toEqual({ questionId: 'sq_5', answer: 'answer-5' });
    wrapper.unmount();
  });

  it('keeps each answer with the question chosen in the same slot', async () => {
    const { calls } = stubApi();
    const { wrapper } = await render();
    // Deliberately out of order: a positional bug would pair an answer with the wrong question and
    // lock the user out of their own recovery later.
    await answer(wrapper, 0, 'sq_3', 'third');
    await answer(wrapper, 1, 'sq_1', 'first');
    await answer(wrapper, 2, 'sq_5', 'fifth');
    await answer(wrapper, 3, 'sq_2', 'second');
    await answer(wrapper, 4, 'sq_4', 'fourth');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const sent = calls.find((call) => call.path === '/_user/security-questions')?.body.securityQuestions;
    expect(sent).toEqual([
      { questionId: 'sq_3', answer: 'third' },
      { questionId: 'sq_1', answer: 'first' },
      { questionId: 'sq_5', answer: 'fifth' },
      { questionId: 'sq_2', answer: 'second' },
      { questionId: 'sq_4', answer: 'fourth' }
    ]);
    wrapper.unmount();
  });

  it('sends empty slots rather than dropping them, so the server sees five positions', async () => {
    const { calls } = stubApi();
    const { wrapper } = await render();
    await answer(wrapper, 0, 'sq_1', 'only-one');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const sent = calls.find((call) => call.path === '/_user/security-questions')?.body.securityQuestions;
    // A shorter array would silently shift positions; the server must be able to name the gap.
    expect(sent).toHaveLength(5);
    expect(sent[0]).toEqual({ questionId: 'sq_1', answer: 'only-one' });
    expect(sent[1]).toEqual({ questionId: '', answer: '' });
    wrapper.unmount();
  });

  it('leaves the gate for the map once the answers are accepted', async () => {
    const { calls } = stubApi();
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await answerAll(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.path === '/_user/security-questions')).toBe(true);
    // Leaving onboarding is the point of the screen; staying put is an unrecoverable loop.
    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.map });
    wrapper.unmount();
  });

  it('sends an administrator to the admin console after onboarding', async () => {
    const identity = { id: 'usr_admin', username: 'new.admin', role: ROLES.ADMIN, mustCompleteSecurityQuestions: false };
    stubApi({ identity });
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await answerAll(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.adminOverview });
    wrapper.unmount();
  });

  it('shows why the answers were refused and stays on the gate', async () => {
    stubApi({
      completion: () =>
        failure(400, 'INVALID', 'پرسش‌های امنیتی باید یکتا باشند.')
    });
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await answerAll(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.v-alert').text()).toContain('یکتا');
    expect(navigations).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('re-enables the form after a refusal so the user can correct an answer', async () => {
    stubApi({ completion: () => failure(400, 'INVALID', 'پاسخ‌ها کوتاه است.') });
    const { wrapper } = await render();
    await answerAll(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // A form left disabled after an error traps the account permanently.
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.findAll('.v-input--disabled')).toHaveLength(0);
    wrapper.unmount();
  });

  it('clears the previous error when the user submits again', async () => {
    let attempt = 0;
    stubApi({
      completion: () => {
        attempt += 1;
        return attempt === 1 ? failure(400, 'INVALID', 'نادرست') : json({});
      }
    });
    const { wrapper } = await render();
    await answerAll(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.v-alert').exists()).toBe(true);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.v-alert').exists()).toBe(false);
    wrapper.unmount();
  });
});
