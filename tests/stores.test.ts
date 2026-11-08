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
          return envelope({
            offline: true,
            tileTemplate: '/_public/map/tiles/{z}/{x}/{y}.svg',
            center: { latitude: 35.72, longitude: 51.33 },
            zoom: 15
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
