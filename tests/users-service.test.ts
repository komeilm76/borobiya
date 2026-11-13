// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Saved places and mission readiness, from the outside in.
 *
 * The happy path was already covered; what was not is every way these endpoints can be reached with
 * an id that belongs to someone else. A saved place is private, so a parent that answers a foreign
 * id with a partial success — reordering some rows before failing on the rest — leaks which ids
 * exist and leaves the caller's own list half-rewritten.
 */

let server: TestServer;
let userCookie: string;
let otherCookie: string;
let responderCookie: string;
let adminCookie: string;

const PLACE = {
  name: 'انبار مرکزی',
  label: 'انبار',
  latitude: 35.7219,
  longitude: 51.4047,
  address: 'خیابان انبار ۱۲',
  icon: 'warehouse'
};

/** Creates a saved place and returns its id. */
async function createPlace(cookie: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await apiFetch(server, '/_user/places', {
    method: 'POST',
    cookie,
    body: { ...PLACE, ...overrides }
  });
  expect(response.status, response.text).toBe(201);
  return response.json.data.id;
}

beforeAll(async () => {
  server = await createTestServer();
  userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  // `maryam.a` is a seeded non-responder, so a second identity exists without creating accounts.
  otherCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => {
  await server?.close();
});

describe('saved place ownership', () => {
  it('keeps each account to its own places', async () => {
    const mine = await createPlace(userCookie);
    const theirs = await createPlace(otherCookie, { name: 'انبار دیگر' });

    const mineListed = await apiFetch(server, '/_user/places', { cookie: userCookie });
    const ids = mineListed.json.data.items.map((item: any) => item.id);
    expect(ids).toContain(mine);
    // Another account's saved place must never appear in this list.
    expect(ids).not.toContain(theirs);
  });

  it('refuses to update a place owned by someone else', async () => {
    const theirs = await createPlace(otherCookie);
    const response = await apiFetch(server, `/_user/places/${theirs}`, {
      method: 'PATCH',
      cookie: userCookie,
      body: { ...PLACE, name: 'ربوده‌شده' }
    });
    // Answering 404 rather than 403 avoids confirming that the id exists.
    expect(response.status).toBe(404);

    const ownerView = await apiFetch(server, '/_user/places', { cookie: otherCookie });
    const still = ownerView.json.data.items.find((item: any) => item.id === theirs);
    expect(still.name).toBe(PLACE.name);
  });

  it('refuses to delete a place owned by someone else', async () => {
    const theirs = await createPlace(otherCookie);
    const response = await apiFetch(server, `/_user/places/${theirs}`, { method: 'DELETE', cookie: userCookie });
    expect(response.status).toBe(404);

    const ownerView = await apiFetch(server, '/_user/places', { cookie: otherCookie });
    expect(ownerView.json.data.items.some((item: any) => item.id === theirs)).toBe(true);
  });

  it('reports a missing place as not found rather than succeeding quietly', async () => {
    const response = await apiFetch(server, '/_user/places/plc_does_not_exist', { method: 'DELETE', cookie: userCookie });
    // A silent 200 here would tell a caller their place was removed when nothing happened.
    expect(response.status).toBe(404);
  });
});

describe('reordering saved places', () => {
  it('applies the given order to the caller\'s own ranks', async () => {
    const first = await createPlace(userCookie, { name: 'اول' });
    const second = await createPlace(userCookie, { name: 'دوم' });

    const response = await apiFetch(server, '/_user/places/reorder', {
      method: 'POST',
      cookie: userCookie,
      body: { ids: [second, first] }
    });
    expect(response.status).toBe(200);

    const listed = await apiFetch(server, '/_user/places', { cookie: userCookie });
    const order = listed.json.data.items.map((item: any) => item.id);
    expect(order.indexOf(second)).toBeLessThan(order.indexOf(first));
  });

  it('rejects a duplicated id instead of rewriting ranks twice', async () => {
    const place = await createPlace(userCookie);
    const response = await apiFetch(server, '/_user/places/reorder', {
      method: 'POST',
      cookie: userCookie,
      body: { ids: [place, place] }
    });
    // Duplicates would leave the second write deciding the rank, which is not what the caller meant.
    expect(response.status).toBe(400);
  });

  it('leaves the order untouched when one id in the batch is not the caller\'s', async () => {
    const mineFirst = await createPlace(userCookie, { name: 'مال من ۱' });
    const mineSecond = await createPlace(userCookie, { name: 'مال من ۲' });
    const theirs = await createPlace(otherCookie, { name: 'مال دیگری' });

    const before = await apiFetch(server, '/_user/places', { cookie: userCookie });
    const beforeOrder = before.json.data.items.map((item: any) => item.id);

    const response = await apiFetch(server, '/_user/places/reorder', {
      method: 'POST',
      cookie: userCookie,
      body: { ids: [mineSecond, theirs, mineFirst] }
    });
    expect(response.status).toBe(404);

    // The batch must be all-or-nothing: a partial reorder would leave the list in an order the
    // caller never asked for and cannot reproduce.
    const after = await apiFetch(server, '/_user/places', { cookie: userCookie });
    expect(after.json.data.items.map((item: any) => item.id)).toEqual(beforeOrder);
  });
});

describe('saved place shape', () => {
  it('returns every field the client renders', async () => {
    const placeId = await createPlace(userCookie);
    const listed = await apiFetch(server, '/_user/places', { cookie: userCookie });
    const place = listed.json.data.items.find((item: any) => item.id === placeId);

    expect(place).toMatchObject({
      id: placeId,
      name: PLACE.name,
      label: PLACE.label,
      address: PLACE.address,
      icon: PLACE.icon
    });
    expect(typeof place.latitude).toBe('number');
    expect(typeof place.longitude).toBe('number');
    expect(typeof place.rank).toBe('number');
    // Internal columns must not leak through the payload.
    expect(place.user_id).toBeUndefined();
    expect(place.userId).toBeUndefined();
  });

  it('rejects a coordinate outside the map bounds', async () => {
    const response = await apiFetch(server, '/_user/places', {
      method: 'POST',
      cookie: userCookie,
      body: { ...PLACE, latitude: 91 }
    });
    expect(response.status).toBe(400);
  });

  it('rejects an icon that is not a plain slug', async () => {
    const response = await apiFetch(server, '/_user/places', {
      method: 'POST',
      cookie: userCookie,
      body: { ...PLACE, icon: 'Icon With Spaces' }
    });
    expect(response.status).toBe(400);
  });
});

describe('mission readiness', () => {
  it('lets a responder change their own readiness', async () => {
    const ready = await apiFetch(server, '/_user/ready', { method: 'POST', cookie: responderCookie, body: { ready: true } });
    expect(ready.status).toBe(200);
    expect(ready.json.data.readyForMission).toBe(true);

    const notReady = await apiFetch(server, '/_user/ready', { method: 'POST', cookie: responderCookie, body: { ready: false } });
    expect(notReady.json.data.readyForMission).toBe(false);
  });

  it('shows the change on the responder\'s own profile', async () => {
    await apiFetch(server, '/_user/ready', { method: 'POST', cookie: responderCookie, body: { ready: true } });
    const me = await apiFetch(server, '/_user/me', { cookie: responderCookie });
    expect(me.json.data.readyForMission).toBe(true);
  });

  it('refuses a non-responder, because readiness would be meaningless', async () => {
    const response = await apiFetch(server, '/_user/ready', { method: 'POST', cookie: userCookie, body: { ready: true } });
    // A requester who could set readiness would appear available for missions they cannot accept.
    expect(response.status).toBe(403);
  });

  it('refuses an administrator too, who is not dispatched', async () => {
    const response = await apiFetch(server, '/_user/ready', { method: 'POST', cookie: adminCookie, body: { ready: true } });
    expect(response.status).toBe(403);
  });

  it('requires an explicit boolean rather than treating truthy text as ready', async () => {
    const response = await apiFetch(server, '/_user/ready', { method: 'POST', cookie: responderCookie, body: { ready: 'yes' } });
    expect(response.status).toBe(400);
  });
});

describe('explicit and defaulted place ranks', () => {
  it('honors an explicit rank and defaults the update rank to 1', async () => {
    const withRank = await createPlace(userCookie, { rank: 7 });
    const listed = await apiFetch(server, '/_user/places', { cookie: userCookie });
    expect(listed.json.data.items.find((item: any) => item.id === withRank).rank).toBe(7);

    const updated = await apiFetch(server, `/_user/places/${withRank}`, {
      method: 'PATCH',
      cookie: userCookie,
      body: { ...PLACE }
    });
    expect(updated.status, updated.text).toBe(200);

    const after = await apiFetch(server, '/_user/places', { cookie: userCookie });
    expect(after.json.data.items.find((item: any) => item.id === withRank).rank).toBe(1);
  });
});

describe('place rank defaults', () => {
  it('assigns the next rank after the current maximum when none is supplied', async () => {
    const first = await apiFetch(server, '/_user/places', { method: 'POST', cookie: otherCookie, body: PLACE });
    expect(first.status, first.text).toBe(201);
    const second = await apiFetch(server, '/_user/places', { method: 'POST', cookie: otherCookie, body: PLACE });
    expect(second.status, second.text).toBe(201);
    expect(second.json.data.rank).toBe(first.json.data.rank + 1);
  });
});
