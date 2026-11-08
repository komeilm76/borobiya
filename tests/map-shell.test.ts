import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { useMapStore } from '../src/client/stores/map.ts';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useRealtimeStore } from '../src/client/stores/realtime.ts';
import { useOfflineStore } from '../src/client/stores/offline.ts';
import MapLayout from '../src/client/layouts/MapLayout.vue';
import { HTTP_EVENTS, WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * Functional tests for the mobile shell. `tests/views.test.ts` proves every view renders; this
 * suite covers what the shell *does*: realtime subscriptions, the press-and-hold SOS gesture,
 * geolocation lifecycle, offline state, logout and keyboard navigation.
 */

/** Mounts the shell on a given route with every store stubbed for a controlled scenario. */
async function mountShell(path = '/_user/map', options: { offline?: boolean } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push(path);
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  // Record navigations: with fake timers the router settles its reducers on a timer, so the
  // component's `router.push` never updates `currentRoute`. Asserting on what the shell *asked*
  // for is the honest check — and a manual `await router.push(...)` afterwards confirms the
  // target route really is reachable.
  const navigations = vi.spyOn(router, 'push');

  const auth = useAuthStore(pinia);
  auth.user = {
    id: 'usr_test', username: 'saeed.k', displayName: 'سعید', role: 'user',
    mustCompleteSecurityQuestions: false
  } as never;
  auth.loading = false;

  const map = useMapStore(pinia);
  const sos = useSosStore(pinia);
  const realtime = useRealtimeStore(pinia);
  const offline = useOfflineStore(pinia);

  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const connect = vi.spyOn(realtime, 'connect').mockResolvedValue(undefined as never);
  const disconnect = vi.spyOn(realtime, 'disconnect').mockImplementation(() => undefined);
  vi.spyOn(realtime, 'on').mockImplementation(((type: string, listener: (payload: unknown) => void) => {
    const set = handlers.get(type) ?? new Set();
    set.add(listener);
    handlers.set(type, set);
    return () => set.delete(listener);
  }) as never);

  const mapLoad = vi.spyOn(map, 'load').mockResolvedValue(undefined as never);
  const sosLoad = vi.spyOn(sos, 'load').mockResolvedValue(undefined as never);
  const startLocation = vi.spyOn(map, 'startLocation').mockImplementation(() => undefined);
  const stopLocation = vi.spyOn(map, 'stopLocation').mockImplementation(() => undefined);
  const applyLiveFix = vi.spyOn(map, 'applyLiveFix').mockImplementation(() => undefined);
  vi.spyOn(offline, 'offline', 'get').mockReturnValue(Boolean(options.offline));

  const wrapper = mount(MapLayout, { global: { plugins: [pinia, vuetify, router] }, attachTo: document.body });
  await flushPromises();

  /** Advances fake time and lets pending navigations and renders settle. */
  const advance = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await flushPromises();
  };

  /** Fires a subscribed realtime channel the way the transport would. */
  const emit = async (type: string, payload: unknown = {}) => {
    for (const listener of handlers.get(type) ?? []) listener(payload);
    await flushPromises();
  };

  return {
    wrapper, router, auth, map, sos, realtime, offline, handlers, emit, advance, navigations,
    spies: { connect, disconnect, mapLoad, sosLoad, startLocation, stopLocation, applyLiveFix }
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  // Pin the clock so the hold gesture is deterministic.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('mobile shell', () => {
  it('starts geolocation, loads data and connects realtime once on mount', async () => {
    const shell = await mountShell();
    expect(shell.spies.startLocation).toHaveBeenCalledTimes(1);
    expect(shell.spies.mapLoad).toHaveBeenCalledTimes(1);
    expect(shell.spies.sosLoad).toHaveBeenCalledTimes(1);
    expect(shell.spies.connect).toHaveBeenCalledTimes(1);
    shell.wrapper.unmount();
  });

  it('reloads the affected store when a durable event arrives', async () => {
    const shell = await mountShell();
    const before = shell.spies.sosLoad.mock.calls.length;

    for (const type of [
      HTTP_EVENTS.SOS_CREATED,
      HTTP_EVENTS.SOS_DISPATCHED,
      HTTP_EVENTS.SOS_ACCEPTED,
      HTTP_EVENTS.MISSION_UPDATED
    ]) {
      expect(shell.handlers.has(type), type).toBe(true);
    }
    expect(shell.handlers.has(HTTP_EVENTS.LOCATION_SHARE_CREATED)).toBe(true);
    expect(shell.handlers.has(WS_EVENTS.LOCATION_PEER)).toBe(true);

    await shell.emit(HTTP_EVENTS.SOS_CREATED, { sosId: 'sos_9' });
    expect(shell.spies.sosLoad.mock.calls.length).toBe(before + 1);

    // A new share refreshes the map, not the SOS rail.
    const mapBefore = shell.spies.mapLoad.mock.calls.length;
    await shell.emit(HTTP_EVENTS.LOCATION_SHARE_CREATED, {});
    expect(shell.spies.mapLoad.mock.calls.length).toBe(mapBefore + 1);
    shell.wrapper.unmount();
  });

  it('applies a peer location fix but ignores a malformed one', async () => {
    const shell = await mountShell();
    await shell.emit(WS_EVENTS.LOCATION_PEER, { userId: 'usr_peer', fix: { latitude: 35.7, longitude: 51.3 } });
    expect(shell.spies.applyLiveFix).toHaveBeenCalledTimes(1);
    await shell.emit(WS_EVENTS.LOCATION_PEER, { userId: 'usr_peer' });
    await shell.emit(WS_EVENTS.LOCATION_PEER, {});
    // Incomplete payloads must not reach the map store.
    expect(shell.spies.applyLiveFix).toHaveBeenCalledTimes(1);
    shell.wrapper.unmount();
  });

  it('survives a profile device read that fails with an expired session', async () => {
    // The profile screen calls `void auth.loadDevices()` on mount. A 401 there used to reject into
    // that `void` and surface as an unhandled rejection with no user-visible state change.
    const shell = await mountShell('/_user/profile');
    const devices = vi.spyOn(shell.auth, 'loadDevices');
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, requestId: 'req_x', error: { code: 'UNAUTHORIZED', message: 'A valid session is required.' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    ));
    await expect(shell.auth.loadDevices()).resolves.toEqual([]);
    expect(shell.auth.user).toBeNull();
    expect(shell.auth.devices).toEqual([]);

    // A non-auth failure is reported instead of thrown.
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    await expect(shell.auth.loadDevices()).resolves.toEqual([]);
    // Transport failures reach the user as a localized message, not the raw error text.
    expect(shell.auth.error).toBe('ارتباط با سرور برقرار نشد.');
    devices.mockRestore();
    shell.wrapper.unmount();
  });

  it('tears down every subscription, the geolocation watch and the socket on unmount', async () => {
    const shell = await mountShell();
    const subscribed = [...shell.handlers.values()].reduce((total, set) => total + set.size, 0);
    expect(subscribed).toBe(6);
    shell.wrapper.unmount();
    expect(shell.spies.stopLocation).toHaveBeenCalledTimes(1);
    expect(shell.spies.disconnect).toHaveBeenCalledTimes(1);
    // Every listener was unsubscribed, so no handler can fire into a dead component.
    for (const set of shell.handlers.values()) expect(set.size).toBe(0);
  });

  it('fires SOS only after the full press-and-hold, not on a short tap', async () => {
    const shell = await mountShell();
    const button = shell.wrapper.find('[data-testid="sos-hold"]');
    expect(button.exists()).toBe(true);
    const label = button.attributes('aria-label');
    expect(label).toContain('نگه');

    // A short press is rejected and resets the progress ring.
    await button.trigger('pointerdown');
    expect(button.classes()).toContain('is-holding');
    await shell.advance(300);
    await button.trigger('pointerup');
    await flushPromises();
    expect(shell.router.currentRoute.value.name).toBe(ROUTE_NAMES.map);
    expect(button.classes()).not.toContain('is-holding');

    // Releasing the pointer anywhere cancels too, which is what a drag off the button does.
    await button.trigger('pointerdown');
    await shell.advance(600);
    window.dispatchEvent(new Event('pointerup'));
    await flushPromises();
    expect(shell.router.currentRoute.value.name).toBe(ROUTE_NAMES.map);

    // A complete hold asks the router for the SOS composer.
    await button.trigger('pointerdown');
    for (let step = 0; step < 20; step++) await shell.advance(100);
    expect(shell.navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.sos });
    // And that destination really is reachable from this shell.
    expect(await shell.router.push({ name: ROUTE_NAMES.sos })).toBeUndefined();
    expect(shell.router.currentRoute.value.name).toBe(ROUTE_NAMES.sos);
    shell.wrapper.unmount();
  });

  it('supports the hold gesture from the keyboard', async () => {
    const shell = await mountShell();
    const button = shell.wrapper.find('[data-testid="sos-hold"]');
    await button.trigger('keydown', { key: ' ' });
    for (let step = 0; step < 20; step++) await shell.advance(100);
    expect(shell.navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.sos });
    // A keyup before the hold completes must cancel it.
    shell.navigations.mockClear();
    await button.trigger('keydown', { key: ' ' });
    await shell.advance(200);
    await button.trigger('keyup', { key: ' ' });
    for (let step = 0; step < 20; step++) await shell.advance(100);
    expect(shell.navigations).not.toHaveBeenCalled();
    shell.wrapper.unmount();
  });

  it('shows the offline banner only while the connection is down', async () => {
    const online = await mountShell('/_user/map', { offline: false });
    expect(online.wrapper.find('.offline-banner').exists()).toBe(false);
    online.wrapper.unmount();

    const offline = await mountShell('/_user/map', { offline: true });
    const banner = offline.wrapper.find('.offline-banner');
    expect(banner.exists()).toBe(true);
    expect(banner.attributes('role')).toBe('status');
    expect(banner.text()).toContain('آفلاین');
    offline.wrapper.unmount();
  });

  it('logs out, drops the socket and returns to the login screen', async () => {
    const shell = await mountShell();
    const logout = vi.spyOn(shell.auth, 'logout').mockResolvedValue(undefined as never);
    const button = shell.wrapper.findAll('button').find((item) => item.attributes('aria-label') === 'خروج');
    expect(button).toBeTruthy();
    await button!.trigger('click');
    // The handler awaits `auth.logout()` before navigating, so let those microtasks and the
    // lazy route chunk settle before asserting the new route.
    await flushPromises();
    await shell.advance(0);
    await flushPromises();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(shell.spies.disconnect).toHaveBeenCalled();
    expect(shell.navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.login });
    shell.wrapper.unmount();
  });

  it('returns to the map on Escape and marks the active tab', async () => {
    const shell = await mountShell('/_user/history');
    const active = shell.wrapper.find('.top-pill__item.is-active');
    expect(active.exists()).toBe(true);
    expect(active.attributes('aria-current')).toBe('page');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(shell.navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.map });
    shell.wrapper.unmount();
  });

  it('highlights a parent tab for SOS, talk and profile screens', async () => {
    // These screens live inside the map shell but are not tabs themselves, so one parent tab must
    // stay highlighted; otherwise the pill row shows nothing active on three of seven screens.
    const expectations: Array<[string, string]> = [
      ['/_user/sos', 'مسیریابی'],
      ['/_user/talk', 'مسیریابی'],
      ['/_user/profile', 'تاریخچه']
    ];
    for (const [path, label] of expectations) {
      const shell = await mountShell(path);
      const active = shell.wrapper.find('.top-pill__item.is-active');
      expect(active.exists(), path).toBe(true);
      expect(active.text(), path).toContain(label);
      shell.wrapper.unmount();
    }
  });
});
