// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import App from '../src/client/App.vue';
import { authGuard, routes as ROUTES } from '../src/client/router/index.ts';
import { PREVIEW_PAGES, type PreviewPage } from '../src/client/preview/registry.ts';
import { installDemoFetch, resetPreviewState, setPreviewPersona, setPreviewSession } from '../src/client/preview/demo-fetch.ts';
import { demoAuditCsv, demoUsersCsv, tryDownloadPreviewCsv } from '../src/client/preview/demo-downloads.ts';

/**
 * Smoke-renders every page in the preview registry through the real client bundle wiring
 * (same App, layouts, views, stores, router table) with the deterministic demo fetch mock,
 * and fails when any request a page makes is not covered by a fixture.
 */

const MARKERS: Record<string, string> = {
  login: 'login-submit',
  register: 'ساخت حساب',
  recovery: 'دریافت پرسش‌ها',
  onboarding: 'تکمیل حساب',
  map: 'بیمارستان امید',
  sos: 'شدت حادثه',
  mission: 'mission-offer',
  talk: 'گفت‌وگوی یک‌به‌یک',
  sharing: 'share-create-toggle',
  history: 'history-tab-missions',
  trips: 'trips-inbox',
  profile: 'ready-toggle',
  adminOverview: 'admin-overview',
  adminDispatch: 'admin-dispatch',
  adminSupportRequests: 'admin-support-requests',
  adminReports: 'admin-reports',
  adminUsers: 'admin-users',
  adminGroups: 'admin-groups',
  adminIncidents: 'admin-incidents',
  adminJobTypes: 'admin-job-types',
  adminAudit: 'admin-audit',
  adminAlerts: 'admin-alerts',
  adminSettings: 'admin-settings'
};

const unmocked: string[] = [];
let warnSpy: ReturnType<typeof vi.spyOn>;

function installMock(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.startsWith('/_')) throw new Error(`mock did not intercept ${url}`);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  installDemoFetch();
}

beforeEach(() => {
  vi.stubEnv('VITE_PREVIEW_DEMO', 'true');
  const fix = { coords: { latitude: 35.7242, longitude: 51.3312, accuracy: 12, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() };
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: vi.fn((success: PositionCallback) => { success(fix as unknown as GeolocationPosition); return 1; }),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn((success: PositionCallback) => success(fix as unknown as GeolocationPosition))
    }
  });
  resetPreviewState();
  unmocked.length = 0;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const first = String(args[0] ?? '');
    if (first.includes('[preview] unmocked')) unmocked.push(first);
  });
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

afterEach(() => {
  warnSpy?.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function renderPage(page: PreviewPage) {
  installMock();
  resetPreviewState();
  if (page.persona === 'anon') setPreviewSession(false);
  else setPreviewPersona(page.persona);
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  // Mirror production: the exported navigation guard enforces role/onboarding rules.
  router.beforeEach(authGuard);
  await router.push(page.route);
  await router.isReady();
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('preview registry renders against the deterministic mock', () => {
  it('every registry page has a marker assertion', () => {
    for (const page of PREVIEW_PAGES) {
      expect(MARKERS[page.id], `marker for ${page.id}`).toBeTruthy();
    }
  });

  it('generates deterministic in-browser CSV exports for the two admin downloads', () => {
    expect(tryDownloadPreviewCsv('/_admin/users.csv')).toBe(true);
    expect(tryDownloadPreviewCsv('/_admin/audit.csv')).toBe(true);
    expect(tryDownloadPreviewCsv('/_admin/other.csv')).toBe(false);
    expect(demoUsersCsv().split('\r\n')).toHaveLength(1 + 8);
    expect(demoUsersCsv()).toContain('saeed.k');
    expect(demoAuditCsv()).toContain('mission_offer_accept');
  });

  for (const page of PREVIEW_PAGES) {
    it(`renders ${page.id} (${page.route})`, async () => {
      const wrapper = await renderPage(page);
      const marker = MARKERS[page.id];
      const isTestId = /^[a-z0-9-]+$/.test(marker);
      const found = isTestId ? wrapper.find(`[data-testid="${marker}"]`).exists() : wrapper.text().includes(marker);
      expect(found, `expected marker "${marker}" in ${page.route}`).toBe(true);
      expect(unmocked, `unmocked requests while rendering ${page.route}`).toEqual([]);
      wrapper.unmount();
    });
  }
});
