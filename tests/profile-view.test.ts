import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import ProfileView from '../src/client/views/map/ProfileView.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { useMapStore } from '../src/client/stores/map.ts';
import { useSettingsStore } from '../src/client/stores/settings.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The profile screen's interactive half: the logout confirmation contract, the readiness and
 * track-recording switches (including their failure paths), username editing, inline saved-place
 * editing/deletion, the collapsed login history and the theme cycle. Device-list payloads are
 * covered separately in tests/profile-devices.test.ts.
 */

const SELF = {
  id: 'usr_self', username: 'saeed.k', role: 'user' as const, isActive: true,
  securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false,
  averageRating: 4.5, createdAt: 1794000000000
};

const RESPONDER = { ...SELF, id: 'usr_resp', username: 'reza.m', role: 'responder' as const };

const PLACE = {
  id: 'plc_1', name: 'خانه', label: 'خانه مادر', latitude: 35.7192, longitude: 51.3314,
  address: 'بلوار ولیعصر', icon: 'home-outline', rank: 1
};

const CURRENT_DEVICE = {
  sessionId: 'ses_current', deviceId: 'dev_1', deviceName: 'این مرورگر', ip: '10.0.0.5',
  lastActiveAt: 1794136200653, createdAt: 1794036200653, expiresAt: 1794222600653,
  isCurrentDevice: true, isOnline: true
};

const FAIL = (message: string) => ({ __fail: { status: 500, message } });

type Handler = (path: string, method: string, body: any) => unknown;

/** Stubs fetch; a handler result of FAIL(message) becomes a 500 error envelope. */
function stubApi(handler: Handler): { calls: Array<{ method: string; path: string; body: any }> } {
  const calls: Array<{ method: string; path: string; body: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.split('?')[0];
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const data = await handler(path, method, body);
    if (data && typeof data === 'object' && '__fail' in (data as Record<string, unknown>)) {
      const fail = (data as { __fail: { status: number; message: string } }).__fail;
      return new Response(
        JSON.stringify({ ok: false, requestId: 'r', error: { code: 'TEST_FAIL', message: fail.message } }),
        { status: fail.status, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }));
  return { calls };
}

/** The quiet default API: devices and logins resolve, the map bootstrap finds nothing saved. */
function defaultHandler(overrides: Handler): Handler {
  return (path, method, body) => {
    const custom = overrides(path, method, body);
    if (custom !== undefined) return custom;
    if (path === '/_user/devices') return { items: [CURRENT_DEVICE], total: 1 };
    if (path === '/_user/logins') return { items: [] };
    if (path === '/_public/map/config') return { dataVersion: 'v-test', center: { latitude: 35.72, longitude: 51.33 }, zoom: 14 };
    if (path === '/_user/places') return { items: [] };
    if (path === '/_user/location/shares') return { items: [] };
    if (path === '/_user/me' && method === 'GET') return { ...SELF };
    return {};
  };
}

async function render(user: Record<string, unknown> = SELF, places: unknown[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().$patch({ user: { ...user } });
  if (places.length) useMapStore().places = places as never;
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.profile });
  await router.isReady();
  const wrapper = mount(ProfileView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router, pinia };
}

function toasts() {
  return useToast().messages.value;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  localStorage.removeItem('bb-theme');
  localStorage.removeItem('bb-record-track');
  for (const message of [...toasts()]) useToast().dismiss(message.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('logout confirmation', () => {
  it('opens from the logout button, names the current device, and cancel closes it', async () => {
    stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="logout-confirm"]').exists()).toBe(false);
    await wrapper.find('[data-testid="logout-button"]').trigger('click');
    const dialog = wrapper.find('[data-testid="logout-confirm"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain('این مرورگر');
    await wrapper.find('[data-testid="logout-confirm-cancel"]').trigger('click');
    expect(wrapper.find('[data-testid="logout-confirm"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes on Escape and on a scrim click', async () => {
    stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render();
    await wrapper.find('[data-testid="logout-button"]').trigger('click');
    expect(wrapper.find('[data-testid="logout-confirm"]').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="logout-confirm"]').exists()).toBe(false);
    await wrapper.find('[data-testid="logout-button"]').trigger('click');
    await wrapper.find('.logout-confirm__scrim').trigger('click');
    expect(wrapper.find('[data-testid="logout-confirm"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('confirm ends the session server-side and lands on the sign-in route', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper, router } = await render();
    await wrapper.find('[data-testid="logout-button"]').trigger('click');
    await wrapper.find('[data-testid="logout-confirm-accept"]').trigger('click');
    await vi.waitFor(() => {
      expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.login);
    }, { timeout: 2_000, interval: 20 });
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_auth/logout')).toBe(true);
    expect(useAuthStore().user).toBeNull();
    expect(wrapper.find('[data-testid="logout-confirm"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('responder readiness switch', () => {
  it('reports a failed readiness change and leaves the switch as it was', async () => {
    stubApi(defaultHandler((path, method) => {
      if (path === '/_user/ready' && method === 'POST') return FAIL('آمادگی ثبت نشد');
      return undefined;
    }));
    const { wrapper } = await render(RESPONDER);
    const toggle = wrapper.find('[data-testid="ready-toggle"]');
    expect(toggle.attributes('aria-checked')).toBe('false');
    await toggle.trigger('click');
    await flushPromises();
    expect(toasts().some((item) => item.tone === 'error' && item.message === 'آمادگی ثبت نشد')).toBe(true);
    expect(wrapper.find('[data-testid="ready-toggle"]').attributes('aria-checked')).toBe('false');
    wrapper.unmount();
  });

  it('ignores a second click while the change is in flight', async () => {
    let releaseReady: (() => void) | undefined;
    const { calls } = stubApi(defaultHandler((path, method) => {
      if (path === '/_user/ready' && method === 'POST') {
        return new Promise((resolve) => { releaseReady = () => resolve({}); });
      }
      return undefined;
    }));
    const { wrapper } = await render(RESPONDER);
    const toggle = wrapper.find('[data-testid="ready-toggle"]');
    await toggle.trigger('click');
    await toggle.trigger('click');
    expect(calls.filter((call) => call.path === '/_user/ready')).toHaveLength(1);
    releaseReady?.();
    await flushPromises();
    expect(wrapper.find('[data-testid="ready-toggle"]').attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });
});

describe('track recording switch', () => {
  it('turns recording on through the account payload and confirms it', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render();
    const toggle = wrapper.find('[data-testid="record-track-toggle"]');
    expect(toggle.attributes('aria-checked')).toBe('false');
    await toggle.trigger('click');
    await flushPromises();
    const patch = calls.find((call) => call.method === 'PATCH' && call.path === '/_user/me');
    expect(patch?.body).toEqual({ recordTrack: true });
    expect(toasts().some((item) => item.tone === 'success' && item.message.includes('ثبت مسیر فعال شد'))).toBe(true);
    expect(wrapper.find('[data-testid="record-track-toggle"]').attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });

  it('keeps recording off and reports the error when the account update fails', async () => {
    stubApi(defaultHandler((path, method) => {
      if (path === '/_user/me' && method === 'PATCH') return FAIL('ذخیره تنظیمات ناموفق بود');
      return undefined;
    }));
    const { wrapper } = await render();
    await wrapper.find('[data-testid="record-track-toggle"]').trigger('click');
    await flushPromises();
    expect(toasts().some((item) => item.tone === 'error' && item.message === 'ذخیره تنظیمات ناموفق بود')).toBe(true);
    expect(wrapper.find('[data-testid="record-track-toggle"]').attributes('aria-checked')).toBe('false');
    wrapper.unmount();
  });
});

describe('username editing', () => {
  it('cancel closes the editor without touching the account', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render();
    await wrapper.find('[data-testid="edit-username"]').trigger('click');
    expect(wrapper.find('[data-testid="username-input"]').exists()).toBe(true);
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'انصراف');
    await cancel!.trigger('click');
    expect(wrapper.find('[data-testid="username-input"]').exists()).toBe(false);
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    wrapper.unmount();
  });

  it('submitting an invalid draft sends nothing', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render();
    await wrapper.find('[data-testid="edit-username"]').trigger('click');
    await wrapper.find('[data-testid="username-input"]').setValue('AB');
    await wrapper.find('form.place-edit').trigger('submit');
    await flushPromises();
    expect(calls.some((call) => call.method === 'PATCH' && call.path === '/_user/me')).toBe(false);
    wrapper.unmount();
  });

  it('keeps the editor open and reports the error when the rename is rejected', async () => {
    stubApi(defaultHandler((path, method) => {
      if (path === '/_user/me' && method === 'PATCH') return FAIL('این نام کاربری گرفته شده است');
      return undefined;
    }));
    const { wrapper } = await render();
    await wrapper.find('[data-testid="edit-username"]').trigger('click');
    await wrapper.find('[data-testid="username-input"]').setValue('fresh.name');
    await wrapper.find('[data-testid="save-username"]').trigger('click');
    await flushPromises();
    expect(toasts().some((item) => item.tone === 'error' && item.message === 'این نام کاربری گرفته شده است')).toBe(true);
    expect(wrapper.find('[data-testid="username-input"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('saved place editing', () => {
  it('cancel closes the inline editor without a PATCH', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render(SELF, [PLACE]);
    await wrapper.find('[data-testid="edit-place-plc_1"]').trigger('click');
    expect(wrapper.find('form.place-edit').exists()).toBe(true);
    const cancel = wrapper.findAll('form.place-edit button').find((button) => button.text() === 'انصراف');
    await cancel!.trigger('click');
    expect(wrapper.find('form.place-edit').exists()).toBe(false);
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    wrapper.unmount();
  });

  it('PATCHes name, label, address and icon together and closes the editor', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render(SELF, [PLACE]);
    await wrapper.find('[data-testid="edit-place-plc_1"]').trigger('click');
    const form = wrapper.find('form.place-edit');
    const inputs = form.findAll('input');
    // [name, label, address] text inputs precede the icon radio group.
    await inputs[1].setValue('خانه پدری');
    await inputs[2].setValue('خیابان شریعتی');
    const star = form.findAll('input[type="radio"]').find((radio) => (radio.element as HTMLInputElement).value === 'star');
    await star!.trigger('click');
    await form.trigger('submit');
    await flushPromises();
    const patch = calls.find((call) => call.method === 'PATCH' && call.path === '/_user/places/plc_1');
    expect(patch?.body).toMatchObject({
      name: 'خانه', label: 'خانه پدری', address: 'خیابان شریعتی', icon: 'star',
      latitude: PLACE.latitude, longitude: PLACE.longitude, rank: PLACE.rank
    });
    expect(toasts().some((item) => item.tone === 'success' && item.message.includes('تغییرات مکان ذخیره شد'))).toBe(true);
    expect(wrapper.find('form.place-edit').exists()).toBe(false);
    wrapper.unmount();
  });

  it('blocks the save while a required field is blank', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render(SELF, [PLACE]);
    await wrapper.find('[data-testid="edit-place-plc_1"]').trigger('click');
    const form = wrapper.find('form.place-edit');
    await form.findAll('input')[0].setValue('   ');
    await form.trigger('submit');
    await flushPromises();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    expect(wrapper.find('form.place-edit').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the editor open and reports the error when the update is rejected', async () => {
    stubApi(defaultHandler((path, method) => {
      if (path === '/_user/places/plc_1' && method === 'PATCH') return FAIL('مکان ذخیره نشد');
      return undefined;
    }));
    const { wrapper } = await render(SELF, [PLACE]);
    await wrapper.find('[data-testid="edit-place-plc_1"]').trigger('click');
    await wrapper.find('form.place-edit').trigger('submit');
    await flushPromises();
    expect(toasts().some((item) => item.tone === 'error' && item.message === 'مکان ذخیره نشد')).toBe(true);
    expect(wrapper.find('form.place-edit').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('saved place deletion', () => {
  it('deleting the place being edited removes the row and closes its editor', async () => {
    const { calls } = stubApi(defaultHandler(() => undefined));
    const { wrapper } = await render(SELF, [PLACE]);
    await wrapper.find('[data-testid="edit-place-plc_1"]').trigger('click');
    expect(wrapper.find('form.place-edit').exists()).toBe(true);
    await wrapper.find('[data-testid="delete-place-plc_1"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/_user/places/plc_1')).toBe(true);
    expect(toasts().some((item) => item.tone === 'success' && item.message.includes('مکان حذف شد'))).toBe(true);
    expect(wrapper.find('form.place-edit').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-place-plc_1"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the row and reports the error when the deletion fails', async () => {
    stubApi(defaultHandler((path, method) => {
      if (path === '/_user/places/plc_1' && method === 'DELETE') return FAIL('حذف مکان ناموفق بود');
      return undefined;
    }));
    const { wrapper } = await render(SELF, [PLACE]);
    await wrapper.find('[data-testid="delete-place-plc_1"]').trigger('click');
    await flushPromises();
    expect(toasts().some((item) => item.tone === 'error' && item.message === 'حذف مکان ناموفق بود')).toBe(true);
    expect(wrapper.find('[data-testid="edit-place-plc_1"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('login history', () => {
  it('shows the first eight entries until the list is expanded', async () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1, ip: '10.0.0.2', deviceName: `دستگاه ${index + 1}`, success: index % 3 !== 2,
      loginAt: 1794136200653 - index * 60_000
    }));
    stubApi(defaultHandler((path) => (path === '/_user/logins' ? { items: entries } : undefined)));
    const { wrapper } = await render();
    expect(wrapper.findAll('.login-row')).toHaveLength(8);
    const expand = wrapper.findAll('button').find((button) => button.text().includes('مورد دیگر'));
    expect(expand).toBeDefined();
    await expand!.trigger('click');
    expect(wrapper.findAll('.login-row')).toHaveLength(11);
    const collapse = wrapper.findAll('button').find((button) => button.text() === 'نمایش کمتر');
    await collapse!.trigger('click');
    expect(wrapper.findAll('.login-row')).toHaveLength(8);
    wrapper.unmount();
  });
});

describe('theme cycle', () => {
  it('cycles the theme choice from the header button', async () => {
    stubApi(defaultHandler(() => undefined));
    const { wrapper, pinia } = await render();
    const settings = useSettingsStore(pinia);
    expect(settings.themeChoice).toBe('system');
    await wrapper.find('[aria-label="تغییر پوسته"]').trigger('click');
    expect(settings.themeChoice).toBe('light');
    expect(document.documentElement.getAttribute('data-theme-choice')).toBe('light');
    wrapper.unmount();
  });
});
