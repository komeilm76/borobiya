import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp } from 'vue';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { useOfflineStore } from '../src/client/stores/offline.ts';
import { useMapStore } from '../src/client/stores/map.ts';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useRealtimeStore } from '../src/client/stores/realtime.ts';
import { useAdminStore } from '../src/client/stores/admin.ts';
import { useSettingsStore } from '../src/client/stores/settings.ts';
import { ApiError } from '../src/client/api/client.ts';

/** Builds an API envelope response for the mocked `fetch`. */
function envelope<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, requestId: 'req_test', data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** Builds an error envelope response for the mocked `fetch`. */
function failure(status: number, code: string, message = 'failed'): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_test', error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

beforeAll(() => {
  // Vuetify is installed so components created by stores can resolve its plugins.
  const app = createApp({});
  app.use(vuetify);
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('auth store', () => {
  it('mirrors the signed-in identity and role flags', async () => {
    const auth = useAuthStore();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        envelope({
          id: 'usr_requester',
          username: 'saeed.k',
          role: 'user',
          securityReady: true,
          mustCompleteSecurityQuestions: false
        })
      )
    );
    const user = await auth.refresh();
    expect(user?.username).toBe('saeed.k');
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.isAdmin).toBe(false);
    expect(auth.isResponder).toBe(false);
    expect(auth.needsOnboarding).toBe(false);
  });

  it('treats 401 as an anonymous visitor instead of an error', async () => {
    const auth = useAuthStore();
    vi.stubGlobal('fetch', vi.fn(async () => failure(401, 'UNAUTHORIZED')));
    expect(await auth.refresh()).toBe(null);
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.error).toBe(null);
  });

  it('surfaces transport failures and rejects a login without a session', async () => {
    const auth = useAuthStore();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    expect(await auth.refresh()).toBe(null);
    expect(auth.error).toBeTruthy();

    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/_auth/login') ? envelope({ ok: true }) : failure(401, 'UNAUTHORIZED')
    ));
    await expect(auth.login('saeed.k', 'DemoPass!2026', 'Vitest')).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses a register whose follow-up refresh cannot establish a session', async () => {
    const auth = useAuthStore();
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/_auth/register') ? envelope({ userId: 'usr_new' }) : failure(401, 'UNAUTHORIZED')
    ));
    await expect(auth.register('new.user', 'NewUser!2026', [])).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('caches the security-question catalog between calls', async () => {
    const auth = useAuthStore();
    const fetchMock = vi.fn(async () => envelope({ items: [{ id: 'q1', label: 'پرسش' }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await auth.loadSecurityQuestions()).length).toBe(1);
    expect((await auth.loadSecurityQuestions()).length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('offline store', () => {
  it('reports connectivity from the VueUse online signal', () => {
    const offline = useOfflineStore();
    expect(offline.offline).toBe(false);
    expect(offline.statusLabel).toBe('متصل');
    expect(typeof offline.effectiveType).toBe('string');
  });

  it('fails service-worker registration safely and never throws', async () => {
    const offline = useOfflineStore();
    expect(await offline.registerServiceWorker()).toBe(false);
    expect(offline.serviceWorkerReady).toBe(false);
  });

  it('marks the document while offline so the stylesheet can react', async () => {
    // VueUse reads `navigator.onLine` on the window's offline event, so drive both.
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const offline = useOfflineStore();
    window.dispatchEvent(new Event('offline'));
    await vi.waitFor(() => expect(offline.offline).toBe(true));

    // The offline banner keys off `[data-offline]` on the document element; without this
    // attribute the offline state is invisible to CSS (the connection-badge rules were removed).
    await vi.waitFor(() => expect(document.documentElement.getAttribute('data-offline')).toBe('true'));

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(document.documentElement.hasAttribute('data-offline')).toBe(false));
  });

  it('records when connectivity was last lost', async () => {
    const offline = useOfflineStore();
    const before = Date.now();
    window.dispatchEvent(new Event('offline'));
    expect(offline.lastOfflineAt).toBeGreaterThanOrEqual(before - 5);
  });

  it('treats a failed manifest fetch as an unknown version rather than throwing', async () => {
    const offline = useOfflineStore();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    expect(await offline.loadCacheVersion()).toBe(null);
    expect(offline.cachedVersion).toBe(null);
  });

  it('survives a network error while reading the manifest', async () => {
    const offline = useOfflineStore();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    // The offline screen shows "در حال خواندن…" forever if this rejects instead of returning null.
    expect(await offline.loadCacheVersion()).toBe(null);
  });

  it('reads the generated cache manifest version via relative URLs', async () => {
    const offline = useOfflineStore();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: 'abc1234567890def' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const version = await offline.loadCacheVersion();
    expect(version).toBe('abc1234567890def');
    expect(offline.cachedVersion).toBe('abc1234567890def');
    expect(String(fetchMock.mock.calls[0][0])).toBe('/assets/cache-manifest.json');
  });
});

describe('map, SOS, realtime and admin stores', () => {
  it('map store keeps the canonical center and sheet detents', () => {
    const map = useMapStore();
    expect(map.center.latitude).toBeCloseTo(35.7219, 4);
    expect(map.center.longitude).toBeCloseTo(51.3347, 4);
    expect(map.zoom).toBe(14);
    expect(map.detent).toBe('half');
    map.setDetent('open');
    expect(map.detent).toBe('open');
    map.applyLiveFix({
      userId: 'usr_companion',
      latitude: 35.7222,
      longitude: 51.3351,
      accuracy: 9,
      heading: 42,
      speed: 1.2,
      recordedAt: Date.now()
    });
    expect(map.peers.length).toBe(1);
    expect(map.liveFixes.usr_companion.latitude).toBeCloseTo(35.7222, 4);
    map.removeLiveFix('usr_companion');
    expect(map.peers.length).toBe(0);
  });

  it('map store loads configuration, places and shares from relative URLs', async () => {
    const map = useMapStore();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes('/_public/map/config')) {
          // The real payload names this `defaultZoom`; the fixture used to say `zoom`, which the
          // server has never sent, so the store was silently ignoring it and keeping zoom 14.
          return envelope({
            offline: true,
            tileTemplate: '/_public/map/tiles/{z}/{x}/{y}.svg',
            center: { latitude: 35.72, longitude: 51.33 },
            defaultZoom: 15
          });
        }
        return envelope({ items: [] });
      })
    );
    await map.load();
    expect(map.loading).toBe(false);
    expect(map.zoom).toBe(15);
    expect(calls.every((url) => url.startsWith('/'))).toBe(true);
  });

  it('SOS store starts in a calm, non-submitting state and resets cleanly', () => {
    const sos = useSosStore();
    expect(sos.activeRequest).toBe(null);
    expect(sos.activeMission).toBe(null);
    expect(sos.submitting).toBe(false);
    expect(Array.isArray(sos.requests)).toBe(true);
    expect(Array.isArray(sos.missions)).toBe(true);
    sos.resetDraft();
    expect(sos.error).toBe(null);
  });

  it('realtime store tracks status, cursor and recent events', () => {
    const realtime = useRealtimeStore();
    expect(realtime.status).toBe('idle');
    expect(realtime.cursor).toBe(0);
    expect(realtime.recentEvents.length).toBe(0);
    realtime.reset();
    expect(realtime.status).toBe('idle');
    expect(typeof realtime.on('event', () => undefined)).toBe('function');
    expect(typeof realtime.send).toBe('function');
    expect(typeof realtime.sendBinary).toBe('function');
  });

  it('admin store exposes typed filter state and the canonical chart series', () => {
    const admin = useAdminStore();
    const settings = useSettingsStore();
    expect(admin.userFilters).toEqual({ page: 1, limit: 20 });
    expect(admin.loading).toBe(false);
    expect(admin.alerts).toEqual([]);
    expect([...settings.tokens.adminSeries]).toEqual(['#0E6666', '#B57A12', '#316D86', '#8A4B0F', '#2C7A57']);
    for (const loader of ['loadOverview', 'loadDispatch', 'loadUsers', 'loadGroups', 'loadAlerts', 'loadAudit', 'loadSettings']) {
      expect(typeof (admin as unknown as Record<string, unknown>)[loader], loader).toBe('function');
    }
  });
});

describe('admin store request paths', () => {
  it('patches a group and reloads the list afterwards', async () => {
    const admin = useAdminStore();
    const calls: Array<{ method: string; path: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
        const path = url.split('?')[0];
        calls.push({ method: init?.method ?? 'GET', path });
        return envelope({ items: [{ id: 'grp_1', name: 'گروه اول', color: '#0E6666', capacity: 8, incidentIds: ['inc_1'], status: 'active' }] });
      })
    );

    await admin.updateGroup('grp_1', { name: 'گروه اول', color: '#0E6666', capacity: 8, incidentIds: ['inc_1'] });
    expect(calls).toEqual([
      { method: 'PATCH', path: '/_admin/groups/grp_1' },
      { method: 'GET', path: '/_admin/groups' }
    ]);
    expect(admin.groups).toHaveLength(1);
  });

  it('posts an alert resolution and reloads the open list', async () => {
    const admin = useAdminStore();
    const calls: Array<{ method: string; path: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
        const path = url.split('?')[0];
        calls.push({ method: init?.method ?? 'GET', path });
        return envelope({ items: [] });
      })
    );

    await admin.resolveAlert('alt_9');
    expect(calls).toEqual([
      { method: 'POST', path: '/_admin/alerts/alt_9/resolve' },
      { method: 'GET', path: '/_admin/alerts' }
    ]);
  });
});

describe('admin alert loading', () => {
  it('keeps the previous alerts when the reload fails and reports the error', async () => {
    const admin = useAdminStore();
    admin.alerts = [{ id: 'alt_keep', title: 'همچنان باز', resolved: false } as never];
    vi.stubGlobal('fetch', vi.fn(async () => failure(500, 'INTERNAL', 'بارگذاری هشدارها ناموفق بود.')));

    await admin.loadAlerts();
    expect(admin.alerts).toHaveLength(1);
    expect(admin.alerts[0]!.id).toBe('alt_keep');
    expect(admin.error).toBe('بارگذاری هشدارها ناموفق بود.');
  });

  it('treats a response without an items array as an empty list', async () => {
    const admin = useAdminStore();
    vi.stubGlobal('fetch', vi.fn(async () => envelope({})));

    await admin.loadAlerts();
    expect(admin.alerts).toEqual([]);
  });
});

describe('device list edge', () => {
  it('falls back to an empty list when the response carries no items array', async () => {
    const auth = useAuthStore();
    vi.stubGlobal('fetch', vi.fn(async () => envelope({})));

    await expect(auth.loadDevices()).resolves.toEqual([]);
    expect(auth.devices).toEqual([]);
  });
});

describe('admin store resilience', () => {
  it('keeps the previous state and reports the failure when a loader errors', async () => {
    const admin = useAdminStore();
    admin.groups = [{ id: 'grp_old', name: 'قدیمی', color: '#000', capacity: 4, incidentIds: [], status: 'active' } as never];
    vi.stubGlobal('fetch', vi.fn(async () => failure(500, 'INTERNAL', 'سرور در دسترس نیست.')));

    await admin.loadGroups();
    expect(admin.error).toBe('سرور در دسترس نیست.');
    expect(admin.groups).toHaveLength(1);
    expect(admin.loading).toBe(false);
  });

  it('loads audit, settings, incident types and health without losing the filters', async () => {
    const admin = useAdminStore();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input);
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.startsWith('/_admin/audit')) return envelope({ items: [{ id: 'aud_1' }], total: 1, page: 1, limit: 50 });
        if (url.startsWith('/_admin/settings')) return envelope({ items: [{ key: 'region', value: 'tehran' }] });
        if (url.startsWith('/_admin/incident-types')) return envelope({ items: [{ id: 'inc_1', name: 'آتش‌سوزی' }] });
        if (url.startsWith('/_admin/system/health')) return envelope({ ok: true, db: 'up' });
        if (url.startsWith('/_admin/dispatch')) return envelope({ items: [], total: 0 });
        if (url.startsWith('/_admin/sos/')) return envelope({ ok: true });
        return envelope({});
      })
    );

    await admin.loadAudit({ action: 'LOGIN', limit: 50 });
    const auditUrl = calls.find((entry) => entry.startsWith('GET /_admin/audit'))!;
    expect(auditUrl).toContain('action=LOGIN');
    expect(auditUrl).toContain('limit=50');
    expect((admin.audit as any)?.items?.[0]?.id).toBe('aud_1');

    await admin.loadSettings();
    expect(admin.settings[0]?.key).toBe('region');

    await admin.saveSettings({ region: 'isfahan' });
    expect(calls).toContain('PUT /_admin/settings');
    // Saving reloads the settings so the screen reflects the persisted values.
    expect(calls.filter((entry) => entry.startsWith('GET /_admin/settings'))).toHaveLength(2);

    await admin.loadIncidentTypes();
    expect(admin.incidentTypes[0]?.id).toBe('inc_1');

    await admin.loadHealth();
    expect((admin.health as any)?.db).toBe('up');

    await admin.dispatch('sos_777', 'grp_1', ['usr_responder']);
    expect(calls).toContain('POST /_admin/sos/sos_777/dispatch');
    expect(calls.some((entry) => entry.startsWith('GET /_admin/dispatch'))).toBe(true);
  });
});

describe('admin store envelope resilience', () => {
  it('falls back to empty arrays when a list envelope carries no items', async () => {
    const admin = useAdminStore();
    vi.stubGlobal('fetch', vi.fn(async () => envelope({})));

    await admin.loadGroups();
    expect(admin.groups).toEqual([]);
    await admin.loadAlerts();
    expect(admin.alerts).toEqual([]);
    await admin.loadSettings();
    expect(admin.settings).toEqual([]);
    await admin.loadIncidentTypes();
    expect(admin.incidentTypes).toEqual([]);

    // The dispatch board carries three list envelopes; an items-less one must not leak undefined.
    await admin.loadDispatch();
    expect(admin.groups).toEqual([]);
    expect(admin.incidentTypes).toEqual([]);
  });

  const failingLoaders = [
    { name: 'loadOverview', run: (admin: any) => admin.loadOverview(), isUntouched: (admin: any) => admin.overview === null },
    { name: 'loadDispatch', run: (admin: any) => admin.loadDispatch(), isUntouched: (admin: any) => admin.dispatchQueue === null },
    { name: 'loadUsers', run: (admin: any) => admin.loadUsers(), isUntouched: (admin: any) => admin.users === null },
    { name: 'loadAudit', run: (admin: any) => admin.loadAudit(), isUntouched: (admin: any) => admin.audit === null },
    { name: 'loadSettings', run: (admin: any) => admin.loadSettings(), isUntouched: (admin: any) => admin.settings.length === 0 },
    { name: 'loadIncidentTypes', run: (admin: any) => admin.loadIncidentTypes(), isUntouched: (admin: any) => admin.incidentTypes.length === 0 },
    { name: 'loadHealth', run: (admin: any) => admin.loadHealth(), isUntouched: (admin: any) => admin.health === null }
  ];

  for (const { name, run, isUntouched } of failingLoaders) {
    it(`keeps prior state and reports the failure when ${name} cannot reach the server`, async () => {
      const admin = useAdminStore();
      vi.stubGlobal('fetch', vi.fn(async () => failure(503, 'UNAVAILABLE', 'خدمات در دسترس نیست.')));

      await run(admin);
      expect(admin.error).toBe('خدمات در دسترس نیست.');
      expect(admin.loading).toBe(false);
      expect(isUntouched(admin)).toBe(true);
    });
  }
});

describe('security catalog edges', () => {
  it('falls back to an empty list when the response carries no items array', async () => {
    const auth = useAuthStore();
    vi.stubGlobal('fetch', vi.fn(async () => envelope({})));

    await expect(auth.loadSecurityQuestions()).resolves.toEqual([]);
  });
});
