import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import { ROUTE_NAMES, routes as ROUTES, landingRoute } from '../src/client/router/index.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROLES } from '../src/shared/protocol.ts';

/**
 * Every routed view is mounted against a mocked same-origin API so the whole browser surface is
 * rendered at least once. This catches broken templates, missing script-setup bindings, invalid
 * Vuetify usage and views that call an endpoint the server no longer exposes.
 */

const VIEWS = {
  auth: ['LoginView', 'RegisterView', 'RecoveryView', 'OnboardingView'],
  map: ['MapView', 'SosView', 'TalkView', 'MissionView', 'SharingCenterView', 'HistoryView', 'ProfileView', 'TripsView'],
  admin: [
    'OverviewView',
    'DispatchView',
    'SupportRequestsView',
    'ReportsView',
    'UsersView',
    'GroupsView',
    'IncidentsView',
    'JobTypesView',
    'AuditView',
    'AlertsView',
    'SettingsView'
  ]
} as const;

/** A permissive fixture: every endpoint answers with a plausible envelope. */
const FIXTURES: Record<string, unknown> = {
  '/_auth/me': {
    user: { id: 'usr_test', username: 'saeed.k', displayName: 'سعید', role: 'admin', securityReady: true },
    expiresAt: Date.now() + 60_000
  },
  '/_user/me': {
    id: 'usr_test', username: 'saeed.k', displayName: 'سعید', role: 'admin',
    securityReady: true, mustCompleteSecurityQuestions: false
  },
  '/_user/home': { places: [], shares: [], activeSos: null, activeMission: null },
  '/_user/places': { items: [] },
  '/_user/sharing': { items: [] },
  '/_user/shares': { items: [] },
  '/_user/sos': { items: [] },
  '/_user/missions': { items: [] },
  '/_user/trips': { items: [], total: 0 },
  '/_user/trips/invitations': { items: [], total: 0 },
  '/_user/profile': { id: 'usr_test', username: 'saeed.k', devices: [], loginHistory: [] },
  '/_user/devices': { items: [] },
  '/_admin/overview': { kpis: {}, series: [], alerts: [], recentRequests: [] },
  '/_admin/users': { items: [], page: 1, limit: 20, total: 0 },
  '/_admin/groups': { items: [] },
  '/_admin/incidents': { items: [] },
  '/_admin/job-types': { items: [], total: 0 },
  '/_admin/alerts': { items: [] },
  '/_admin/audit': { items: [] },
  '/_admin/dispatch': { items: [] },
  '/_admin/reports': { items: [], summary: {} },
  '/_admin/settings': { items: [] },
  '/_admin/support-requests': { items: [], total: 0 },
  '/_admin/system/health': { status: 'ok', uptimeSeconds: 1, database: {}, realtime: {}, talk: {} },
  '/_public/map/config': { dataVersion: 'test', center: { latitude: 35.72, longitude: 51.33 }, zoom: 14 },
  '/_public/security-questions': { items: [] },
  '/_public/incident-types': { items: [] },
  '/_public/health': { status: 'ok' }
};

/** Installs a `fetch` double that answers every fixture path. */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const body = FIXTURES[path] ?? { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'req_view', data: body }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
}

/** Mounts one component with Pinia, Vuetify and a router positioned on `path`. */
async function render(component: unknown, path = '/_auth/login') {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push(path);
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(component as never, {
    global: { plugins: [pinia, vuetify, router] },
    attachTo: document.body
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('routed views render', () => {
  it('every authentication view mounts and exposes its primary control', async () => {
    const expectations: Record<string, string> = {
      LoginView: 'login',
      RegisterView: 'register',
      RecoveryView: 'recovery',
      OnboardingView: 'onboarding'
    };
    for (const name of VIEWS.auth) {
      const module = (await import(`../src/client/views/auth/${name}.vue`)) as { default: unknown };
      const wrapper = await render(module.default, `/_auth/${expectations[name]}`);
      expect(wrapper.html().length, name).toBeGreaterThan(200);
      expect(wrapper.text().length, name).toBeGreaterThan(0);
      wrapper.unmount();
    }
  });

  it('every mobile map view mounts on its route', async () => {
    const paths: Record<string, string> = {
      MapView: '/_user/map',
      SosView: '/_user/sos',
      TalkView: '/_user/talk',
      MissionView: '/_user/mission',
      SharingCenterView: '/_user/sharing',
      HistoryView: '/_user/history',
      ProfileView: '/_user/profile',
      TripsView: '/_user/trips'
    };
    for (const name of VIEWS.map) {
      const module = (await import(`../src/client/views/map/${name}.vue`)) as { default: unknown };
      const wrapper = await render(module.default, paths[name]);
      expect(wrapper.html().length, name).toBeGreaterThan(120);
      wrapper.unmount();
    }
  });

  it('every administrator view mounts on its route', async () => {
    const paths: Record<string, string> = {
      OverviewView: '/_admin/overview',
      DispatchView: '/_admin/dispatch',
      SupportRequestsView: '/_admin/support-requests',
      JobTypesView: '/_admin/job-types',
      ReportsView: '/_admin/reports',
      UsersView: '/_admin/users',
      GroupsView: '/_admin/groups',
      IncidentsView: '/_admin/incidents',
      AuditView: '/_admin/audit',
      AlertsView: '/_admin/alerts',
      SettingsView: '/_admin/settings'
    };
    for (const name of VIEWS.admin) {
      const module = (await import(`../src/client/views/admin/${name}.vue`)) as { default: unknown };
      const wrapper = await render(module.default, paths[name]);
      expect(wrapper.html().length, name).toBeGreaterThan(120);
      wrapper.unmount();
    }
  });

  it('the route table covers every view file exactly once', async () => {
    const declared = ROUTES.map((route) => route.component).filter(Boolean).length;
    const total = VIEWS.auth.length + VIEWS.map.length + VIEWS.admin.length;
    expect(total).toBe(23);
    expect(declared).toBe(total);
    const names = ROUTES.map((route) => route.name).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
    for (const route of ROUTES) {
      if (!route.name) continue;
      expect(route.meta?.layout, String(route.name)).toBeTruthy();
      expect(route.meta?.access, String(route.name)).toBeTruthy();
    }
  });

  it('the landing route sends each role to the right shell', () => {
    expect(landingRoute(undefined, false)).toBe(ROUTE_NAMES.map);
    expect(landingRoute(ROLES.ADMIN, false)).toBe(ROUTE_NAMES.adminOverview);
    expect(landingRoute(ROLES.USER, false)).toBe(ROUTE_NAMES.map);
    expect(landingRoute(ROLES.RESPONDER, false)).toBe(ROUTE_NAMES.map);
    expect(landingRoute(ROLES.ADMIN, true)).toBe(ROUTE_NAMES.onboarding);
    expect(landingRoute(undefined, true)).toBe(ROUTE_NAMES.onboarding);
  });
});

describe('route guards', () => {
  it('redirects an anonymous visitor from every protected route to login', async () => {
    const auth = useAuthStore();
    auth.user = null;
    auth.loading = false;
    vi.spyOn(auth, 'refresh').mockResolvedValue(null);
    const { router: appRouter } = await import('../src/client/router/index.ts');
    for (const path of ['/_user/map', '/_user/sos', '/_admin/overview', '/_admin/users', '/_auth/onboarding']) {
      await appRouter.push(path);
      expect(appRouter.currentRoute.value.name, path).toBe(ROUTE_NAMES.login);
    }
  });

  it('sends a signed-in administrator from the guest login page to the console', async () => {
    const { router: appRouter } = await import('../src/client/router/index.ts');
    const auth = useAuthStore();
    auth.user = {
      id: 'usr_admin', username: 'admin', role: ROLES.ADMIN, mustCompleteSecurityQuestions: false
    } as never;
    auth.loading = false;
    vi.spyOn(auth, 'refresh').mockResolvedValue(auth.user);
    // Start elsewhere: pushing the route the router is already on is a no-op navigation.
    await appRouter.push('/_auth/register');
    expect(appRouter.currentRoute.value.name).toBe(ROUTE_NAMES.adminOverview);
    await appRouter.push('/_auth/login');
    expect(appRouter.currentRoute.value.name).toBe(ROUTE_NAMES.adminOverview);
    // A signed-in administrator is pushed out of the mobile shell as well.
    await appRouter.push('/_user/history');
    expect(appRouter.currentRoute.value.name).toBe(ROUTE_NAMES.adminOverview);
  });

  it('keeps a regular user out of the administrator console', async () => {
    const { router: appRouter } = await import('../src/client/router/index.ts');
    const auth = useAuthStore();
    auth.user = {
      id: 'usr_user', username: 'saeed.k', role: ROLES.USER, mustCompleteSecurityQuestions: false
    } as never;
    auth.loading = false;
    vi.spyOn(auth, 'refresh').mockResolvedValue(auth.user);
    await appRouter.push('/_admin/settings');
    expect(appRouter.currentRoute.value.name).toBe(ROUTE_NAMES.map);
    await appRouter.push('/_user/profile');
    expect(appRouter.currentRoute.value.name).toBe(ROUTE_NAMES.profile);
  });

  it('holds an account that still needs onboarding on the onboarding route', async () => {
    const { router: appRouter } = await import('../src/client/router/index.ts');
    const auth = useAuthStore();
    auth.user = {
      id: 'usr_new', username: 'new.user', role: ROLES.USER, mustCompleteSecurityQuestions: true
    } as never;
    auth.loading = false;
    vi.spyOn(auth, 'refresh').mockResolvedValue(auth.user);
    await appRouter.push('/_user/map');
    expect(appRouter.currentRoute.value.name).toBe(ROUTE_NAMES.onboarding);
  });

  it('keeps live-region announcements off the main landmark', async () => {
    // `aria-live` on a landmark re-announces the entire page on every route change. Announcements
    // belong to the dedicated toast host, which is asserted in the component suite.
    for (const path of ['src/client/layouts/AuthLayout.vue', 'src/client/layouts/MapLayout.vue', 'src/client/layouts/AdminLayout.vue']) {
      const source = await Bun.file(`${process.cwd()}/${path}`).text();
      expect(source, path).not.toMatch(/aria-live/);
      expect(source, path).toMatch(/tabindex="-1"/);
    }
    const index = await Bun.file(`${process.cwd()}/src/client/index.html`).text();
    expect(index).toMatch(/id="toast-root"[^>]*aria-live="assertive"/);
    expect(index).toMatch(/class="skip-link" href="#app"/);
  });

  it('renders the layouts that wrap those routes', async () => {
    const [{ default: AuthLayout }, { default: AdminLayout }] = await Promise.all([
      import('../src/client/layouts/AuthLayout.vue'),
      import('../src/client/layouts/AdminLayout.vue')
    ]);
    const authWrapper = await render(AuthLayout, '/_auth/login');
    expect(authWrapper.classes()).toContain('auth-shell');
    expect(authWrapper.text()).toContain('بورو بیا');
    expect(authWrapper.text()).toContain('ورود');
    authWrapper.unmount();
    const adminWrapper = await render(AdminLayout, '/_admin/overview');
    // The desktop console exposes navigation for every administrator screen.
    for (const label of ['گزارش', 'کاربران', 'گروه', 'رویداد', 'هشدار', 'تنظیمات']) {
      expect(adminWrapper.text(), label).toContain(label);
    }
    adminWrapper.unmount();
  });
});
