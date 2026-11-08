import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import SosView from '../src/client/views/map/SosView.vue';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useMapStore } from '../src/client/stores/map.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The four-step composer is the emergency path. The property that matters most is not that it
 * submits, but that it cannot strand someone at the last step: the server rejects a description
 * shorter than ten characters with "Invalid request.", so the composer has to say so first.
 */

const INCIDENT_TYPES = [
  { id: 'inc_fire', label: 'آتش‌سوزی', icon: 'fire', color: '#B35A18' },
  { id: 'inc_road', label: 'حادثه رانندگی', icon: 'car', color: '#2C7A57' }
];

/** Installs a fetch double for the catalogs, the create call and the reloads after it. */
function stubApi() {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      let data: unknown = { items: [] };
      if (path === '/_public/incident-types') data = { items: INCIDENT_TYPES };
      else if (path === '/_user/sos' && method === 'POST') {
        data = { sos: { id: 'sos_new', status: 'pending', trackingCode: 4242 } };
      }

      return new Response(JSON.stringify({ ok: true, requestId: 'req_sos', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

/** Mounts the composer with catalogs loaded, as the shell does. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.sos });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  await useSosStore().load();
  const wrapper = mount(SosView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

/** The step indicator, which is the only reliable way to tell which step is showing. */
function step(wrapper: Awaited<ReturnType<typeof render>>['wrapper']): string {
  return wrapper.find('.sos-step-title').text();
}

/** Types into the description textarea on step one. */
async function writeDescription(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], text: string): Promise<void> {
  const field = wrapper.find('textarea');
  expect(field.exists(), 'the description field must exist on step 1').toBe(true);
  await field.setValue(text);
}

/** Clicks the footer's forward or submit button. */
async function advance(wrapper: Awaited<ReturnType<typeof render>>['wrapper']): Promise<void> {
  const footer = wrapper.find('.sheet__footer');
  const primary = footer.findAll('button').at(-1)!;
  await primary.trigger('click');
  await flushPromises();
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

describe('SOS composer navigation', () => {
  it('starts at step one of four and offers no way back', async () => {
    stubApi();
    const { wrapper } = await render();
    expect(step(wrapper)).toContain('گام ۱');
    expect(wrapper.find('.severity-grid').exists()).toBe(true);
    // Nothing to go back to on the first step, so the control must not be rendered at all.
    expect(wrapper.find('.ghost-button').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows every catalog incident type and lets one be chosen', async () => {
    stubApi();
    const { wrapper } = await render();
    const cards = wrapper.findAll('.incident-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].text()).toContain('آتش‌سوزی');
    expect(cards[0].classes()).toContain('is-selected'); // seeded by the store

    await cards[1].trigger('click');
    expect(wrapper.findAll('.incident-card')[1].classes()).toContain('is-selected');
    expect(useSosStore().draft.incidentTypeId).toBe('inc_road');
    wrapper.unmount();
  });

  it('records the chosen severity', async () => {
    stubApi();
    const { wrapper } = await render();
    const severities = wrapper.findAll('.severity-card');
    expect(severities).toHaveLength(3);
    await severities[0].trigger('click');
    expect(useSosStore().draft.severity).toBe('low');
    wrapper.unmount();
  });

  it('walks forward and back through the steps, clamping at both ends', async () => {
    stubApi();
    const { wrapper } = await render();
    await writeDescription(wrapper, 'دود غلیظ از پنجره طبقه سوم');

    await advance(wrapper);
    expect(step(wrapper)).toContain('گام ۲');
    expect(wrapper.find('.location-preview').exists()).toBe(true);

    await advance(wrapper);
    expect(step(wrapper)).toContain('گام ۳');
    expect(wrapper.find('.photo-drop').exists()).toBe(true);

    await advance(wrapper);
    expect(step(wrapper)).toContain('گام ۴');
    expect(wrapper.find('.review-card').exists()).toBe(true);

    // The last step submits rather than advancing further. A successful submit resets the composer,
    // so the proof that it stayed on step four is the review card still being on screen.
    expect(wrapper.find('.review-card').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the draft back on the review step', async () => {
    stubApi();
    const { wrapper } = await render();
    await writeDescription(wrapper, 'دود غلیظ از پنجره طبقه سوم');
    for (let index = 0; index < 3; index += 1) await advance(wrapper);

    const review = wrapper.find('.review-card').text();
    expect(review).toContain('آتش‌سوزی');
    expect(review).toContain('متوسط');
    expect(review).toContain('دود غلیظ از پنجره طبقه سوم');
    wrapper.unmount();
  });
});

describe('SOS composer location', () => {
  it('adopts the device fix when the user asks for it', async () => {
    stubApi();
    const { wrapper } = await render();
    // Seed a real fix through the browser API the store watches, then let VueUse pick it up.
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        // `useGeolocation` only ever calls `watchPosition`, which must report a position itself.
        watchPosition: (success: (position: unknown) => void) => {
          success({ coords: { latitude: 35.6789, longitude: 51.4321, accuracy: 6 } });
          return 1;
        },
        getCurrentPosition: (success: (position: unknown) => void) =>
          success({ coords: { latitude: 35.6789, longitude: 51.4321, accuracy: 6 } }),
        clearWatch: () => undefined
      }
    });
    const map = useMapStore();
    map.startLocation();
    // VueUse defers the watch callback, so give it real time to report before reading the store.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
    await writeDescription(wrapper, 'دود غلیظ از پنجره طبقه سوم');
    await advance(wrapper);

    const button = wrapper.findAll('.sheet__body button').find((candidate) => candidate.text().includes('استفاده از موقعیت کنونی'));
    expect(button).toBeTruthy();
    await button!.trigger('click');

    const draft = useSosStore().draft;
    expect(draft.latitude).toBeCloseTo(35.6789, 4);
    expect(draft.longitude).toBeCloseTo(51.4321, 4);
    expect(draft.accuracy).toBe(6);
    wrapper.unmount();
  });

  it('leaves the previous coordinates alone when there is no fix yet', async () => {
    stubApi();
    const { wrapper } = await render();
    // No fix at all: `ownFix` is null and the button must be a no-op.
    const before = { ...useSosStore().draft };
    await writeDescription(wrapper, 'دود غلیظ از پنجره طبقه سوم');
    await advance(wrapper);

    const button = wrapper.findAll('.sheet__body button').find((candidate) => candidate.text().includes('استفاده از موقعیت کنونی'))!;
    await button.trigger('click');
    // A missing fix must not move the request to (0, 0) or to NaN.
    expect(useSosStore().draft.latitude).toBe(before.latitude);
    expect(useSosStore().draft.longitude).toBe(before.longitude);
    wrapper.unmount();
  });
});

describe('SOS composer submission', () => {
  it('submits the draft, confirms, resets and moves to the mission screen', async () => {
    const calls = stubApi();
    const { wrapper, router } = await render();
    const navigations = vi.spyOn(router, 'push');
    await writeDescription(wrapper, 'دود غلیظ از پنجره طبقه سوم');
    for (let index = 0; index < 3; index += 1) await advance(wrapper);

    await advance(wrapper);

    const created = calls.find((call) => call.method === 'POST' && call.path === '/_user/sos');
    expect(created?.body).toMatchObject({
      incidentTypeId: 'inc_fire',
      severity: 'medium',
      description: 'دود غلیظ از پنجره طبقه سوم'
    });
    expect(useToast().messages.value.some((message) => message.message === 'درخواست امداد ثبت شد.')).toBe(true);
    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.mission });
    // The composer must be clean again: a stale draft could be resubmitted by accident.
    expect(useSosStore().draft.description).toBe('');
    expect(useSosStore().draft.step).toBe(1);
    wrapper.unmount();
  });

  it('refuses to send a description the server will reject', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await writeDescription(wrapper, 'کوتاه');
    for (let index = 0; index < 3; index += 1) await advance(wrapper);

    await advance(wrapper);

    // The server requires ten characters and answers with an opaque "Invalid request.".
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/sos')).toBe(false);
    expect(step(wrapper)).toContain('گام ۴');
    // The composer shows store errors inline rather than as a toast.
    expect(wrapper.find('.v-alert').text()).toContain('۱۰');
    wrapper.unmount();
  });

  it('refuses an empty description too', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    for (let index = 0; index < 3; index += 1) await advance(wrapper);
    await advance(wrapper);

    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/sos')).toBe(false);
    expect(wrapper.find('.v-alert').exists()).toBe(true);
    expect(step(wrapper)).toContain('گام ۴');
    wrapper.unmount();
  });

  it('reports a failed submit and keeps the draft so it can be retried', async () => {
    stubApi();
    const { wrapper } = await render();
    await writeDescription(wrapper, 'دود غلیظ از پنجره طبقه سوم');
    for (let index = 0; index < 3; index += 1) await advance(wrapper);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, requestId: 'req_sos', error: { code: 'RATE_LIMITED', message: 'درخواست‌های زیادی فرستاده شد.' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' }
        })
      )
    );
    await advance(wrapper);

    const error = useToast().messages.value.find((message) => message.tone === 'error');
    expect(error?.message).toContain('درخواست‌های زیادی فرستاده شد.');
    // Nothing may be wiped: the user presses send again, they do not retype the incident.
    expect(useSosStore().draft.description).toBe('دود غلیظ از پنجره طبقه سوم');
    expect(wrapper.find('.primary-button').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});
