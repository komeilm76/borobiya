import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { authGuard, ROUTE_NAMES, routeTable } from '../src/client/router/index.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROLES } from '../src/shared/protocol.ts';

/**
 * The navigation guard is the only thing standing between a session and a screen it is not
 * allowed on. This matrix pins every branch: guest bounces, onboarding bounces, role layouts,
 * the anonymous case (where the guard refreshes the session first) and the route table the
 * admin navigation renders from.
 */

/** Builds a minimal route record for the guard. */
const to = (name: string, access: 'public' | 'guest' | 'user' | 'admin', layout: 'auth' | 'map' | 'admin' = 'map') =>
  ({ name, meta: { access, layout } }) as never;

/** Stubs `/_user/me` the way the auth store reads it during a refresh. */
function stubIdentity(identity: Record<string, unknown> | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (identity
      ? new Response(JSON.stringify({ ok: true, requestId: 'req_guard', data: identity }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      : new Response(JSON.stringify({ ok: false, requestId: 'req_guard', error: { code: 'UNAUTHORIZED', message: 'امضا نامعتبر است.' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })))
  );
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.unstubAllGlobals();
});

describe('auth guard with a resolved session', () => {
  it('bounces a signed-in user away from guest routes, honoring onboarding first', async () => {
    const auth = useAuthStore();
    auth.user = { id: 'usr_1', username: 'u1', role: ROLES.USER, mustCompleteSecurityQuestions: true } as never;
    await expect(authGuard(to(ROUTE_NAMES.login, 'guest', 'auth'))).resolves.toEqual({ name: ROUTE_NAMES.onboarding });

    auth.user = { id: 'usr_2', username: 'u2', role: ROLES.ADMIN, mustCompleteSecurityQuestions: false } as never;
    await expect(authGuard(to(ROUTE_NAMES.login, 'guest', 'auth'))).resolves.toEqual({ name: ROUTE_NAMES.adminOverview });

    auth.user = { id: 'usr_3', username: 'u3', role: ROLES.USER, mustCompleteSecurityQuestions: false } as never;
    await expect(authGuard(to(ROUTE_NAMES.login, 'guest', 'auth'))).resolves.toEqual({ name: ROUTE_NAMES.map });
  });

  it('sends a user without a completed profile to onboarding, except when already there', async () => {
    const auth = useAuthStore();
    auth.user = { id: 'usr_4', username: 'u4', role: ROLES.USER, mustCompleteSecurityQuestions: true } as never;
    await expect(authGuard(to(ROUTE_NAMES.map, 'user'))).resolves.toEqual({ name: ROUTE_NAMES.onboarding });
    // Already on onboarding: continue, otherwise the guard would loop forever.
    await expect(authGuard(to(ROUTE_NAMES.onboarding, 'user', 'auth'))).resolves.toBe(true);
  });

  it('keeps administrators out of the map shell and everyone out of the admin shell', async () => {
    const auth = useAuthStore();
    auth.user = { id: 'usr_5', username: 'admin', role: ROLES.ADMIN, mustCompleteSecurityQuestions: false } as never;
    await expect(authGuard(to(ROUTE_NAMES.map, 'user', 'map'))).resolves.toEqual({ name: ROUTE_NAMES.adminOverview });
    // Admin layout, not the map shell: allowed.
    await expect(authGuard(to(ROUTE_NAMES.adminOverview, 'user', 'admin'))).resolves.toBe(true);
    // Admin access requirement with a real administrator: allowed.
    await expect(authGuard(to(ROUTE_NAMES.adminUsers, 'admin', 'admin'))).resolves.toBe(true);

    auth.user = { id: 'usr_6', username: 'plain', role: ROLES.USER, mustCompleteSecurityQuestions: false } as never;
    await expect(authGuard(to(ROUTE_NAMES.adminUsers, 'admin', 'admin'))).resolves.toEqual({ name: ROUTE_NAMES.map });
  });
});

describe('auth guard with an anonymous session', () => {
  it('refreshes once and lets guests through to public routes only', async () => {
    stubIdentity(null);
    const auth = useAuthStore();
    expect(auth.user).toBe(null);

    await expect(authGuard(to(ROUTE_NAMES.login, 'guest', 'auth'))).resolves.toBe(true);
    await expect(authGuard(to(ROUTE_NAMES.map, 'user'))).resolves.toEqual({ name: ROUTE_NAMES.login });
    await expect(authGuard(to(ROUTE_NAMES.adminUsers, 'admin', 'admin'))).resolves.toEqual({ name: ROUTE_NAMES.login });
  });

  it('honours a live session returned by the refresh', async () => {
    stubIdentity({ id: 'usr_7', username: 'revived', role: ROLES.USER, mustCompleteSecurityQuestions: false });
    await expect(authGuard(to(ROUTE_NAMES.map, 'user'))).resolves.toBe(true);
  });
});

describe('route table', () => {
  it('describes every named route with its guard metadata', () => {
    const table = routeTable();
    expect(table.length).toBeGreaterThan(10);
    const names = table.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
    for (const row of table) {
      expect(row.path).toBeTruthy();
      expect(['public', 'guest', 'user', 'admin']).toContain(row.access);
      expect(['auth', 'map', 'admin']).toContain(row.layout);
    }
    expect(names).toContain(ROUTE_NAMES.map);
    expect(names).toContain(ROUTE_NAMES.adminOverview);
    expect(names).toContain(ROUTE_NAMES.onboarding);
  });
});
