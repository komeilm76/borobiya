// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Incident-type management end to end: the creation path must assign the next rank, persist a
 * catalog row the public SOS form can consume immediately and leave an audit trail, and every
 * refusal must keep the catalog untouched. Incident types are referenced by groups and SOS
 * requests with no cascade path, so deletion is deliberately not offered.
 */

const ADMIN_IDENTITY = {
  userId: 'usr_admin',
  sessionId: 'sess_test',
  username: 'admin',
  role: 'admin',
  deviceId: 'test-device',
  ip: '127.0.0.1'
};

let server: TestServer;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => {
  await server?.close();
});

describe('incident type creation', () => {
  it('creates the next-ranked type, audits it and serves it publicly', async () => {
    const before = await apiFetch(server, '/_admin/incident-types', { cookie: adminCookie });
    expect(before.status).toBe(200);
    const maxRank = Math.max(...before.json.data.items.map((item: any) => item.rank ?? 0));

    const created = await apiFetch(server, '/_admin/incident-types', {
      method: 'POST', cookie: adminCookie,
      body: { label: 'حادثهٔ تست', icon: 'fire', color: '#c2410c' }
    });
    expect(created.status, created.text).toBe(201);
    expect(created.json.data.incidentType).toMatchObject({ label: 'حادثهٔ تست', icon: 'fire', color: '#C2410C', rank: maxRank + 1 });
    const id = created.json.data.incidentType.id;

    const audit = server.app.context.repo.one<{ action: string; target: string }>(
      'SELECT action, target FROM audit_log WHERE target = ? ORDER BY created_at DESC', id);
    expect(audit?.action).toBe('incident-type.create');

    const publicCatalog = await apiFetch(server, '/_public/incident-types', { cookie: adminCookie });
    expect(publicCatalog.json.data.items.some((item: any) => item.id === id)).toBe(true);
  });

  it('rejects an icon the client cannot render', async () => {
    const response = await apiFetch(server, '/_admin/incident-types', {
      method: 'POST', cookie: adminCookie,
      body: { label: 'خراب', icon: 'definitely-not-an-icon', color: '#0E6666' }
    });
    expect(response.status).toBe(400);
  });

  it('rejects a malformed color', async () => {
    const response = await apiFetch(server, '/_admin/incident-types', {
      method: 'POST', cookie: adminCookie,
      body: { label: 'رنگ بد', icon: 'fire', color: 'red' }
    });
    expect(response.status).toBe(400);
  });
});

describe('incident type service guards', () => {
  // The route validators already refuse these payloads; these are the service-layer second lines
  // of defense, exercised directly because they cannot be reached over HTTP.
  it('refuses an empty label, a malformed color and an unknown icon on create', () => {
    expect(() => server.app.context.services.admin.createIncidentType(ADMIN_IDENTITY, { label: '   ', icon: 'fire', color: '#0E6666' }))
      .toThrow('Incident type label is required.');
    expect(() => server.app.context.services.admin.createIncidentType(ADMIN_IDENTITY, { label: 'x', icon: 'fire', color: 'red' }))
      .toThrow('Incident type color must be a #RRGGBB hex value.');
    expect(() => server.app.context.services.admin.createIncidentType(ADMIN_IDENTITY, { label: 'x', icon: 'not-an-icon', color: '#0E6666' }))
      .toThrow('Unknown incident type icon.');
  });

  it('refuses an empty label, a malformed color and an unknown icon on update', () => {
    expect(() => server.app.context.services.admin.updateIncidentType(ADMIN_IDENTITY, 'inc_fire', { label: '   ' }))
      .toThrow('Incident type label is required.');
    expect(() => server.app.context.services.admin.updateIncidentType(ADMIN_IDENTITY, 'inc_fire', { color: 'red' }))
      .toThrow('Incident type color must be a #RRGGBB hex value.');
    expect(() => server.app.context.services.admin.updateIncidentType(ADMIN_IDENTITY, 'inc_fire', { icon: 'not-an-icon' }))
      .toThrow('Unknown incident type icon.');
  });
});

describe('incident type update', () => {
  it('renames, re-glyphs and recolors with normalization', async () => {
    const before = await apiFetch(server, '/_admin/incident-types', { cookie: adminCookie });
    const target = before.json.data.items.find((item: any) => item.id === 'inc_fire') ?? before.json.data.items[0];

    const updated = await apiFetch(server, `/_admin/incident-types/${target.id}`, {
      method: 'PATCH', cookie: adminCookie,
      body: { label: 'آتش‌سوزی (تست)', icon: 'alarm-light', color: '#b35a18' }
    });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.json.data.incidentType).toMatchObject({ label: 'آتش‌سوزی (تست)', icon: 'alarm-light', color: '#B35A18' });

    const reloaded = await apiFetch(server, '/_admin/incident-types', { cookie: adminCookie });
    const persisted = reloaded.json.data.items.find((item: any) => item.id === target.id);
    expect(persisted).toMatchObject({ label: 'آتش‌سوزی (تست)', icon: 'alarm-light', color: '#B35A18' });
  });

  it('keeps untouched fields when only one is patched', async () => {
    const before = await apiFetch(server, '/_admin/incident-types', { cookie: adminCookie });
    const target = before.json.data.items.find((item: any) => item.id === 'inc_fire') ?? before.json.data.items[0];
    const original = { label: target.label, icon: target.icon, color: target.color };

    const updated = await apiFetch(server, `/_admin/incident-types/${target.id}`, {
      method: 'PATCH', cookie: adminCookie, body: { color: '#8C5609' }
    });
    expect(updated.status, updated.text).toBe(200);

    const reloaded = await apiFetch(server, '/_admin/incident-types', { cookie: adminCookie });
    const persisted = reloaded.json.data.items.find((item: any) => item.id === target.id);
    expect(persisted.label).toBe(original.label);
    expect(persisted.icon).toBe(original.icon);
    // Restore the seed label/icon so other suites keep their fixtures stable.
    await apiFetch(server, `/_admin/incident-types/${target.id}`, {
      method: 'PATCH', cookie: adminCookie, body: { label: original.label, icon: original.icon, color: original.color }
    });
  });

  it('404s on an unknown id', async () => {
    const response = await apiFetch(server, '/_admin/incident-types/inc_nope', {
      method: 'PATCH', cookie: adminCookie, body: { label: 'هیچ' }
    });
    expect(response.status).toBe(404);
  });

  it('rejects a malformed color on update', async () => {
    const response = await apiFetch(server, '/_admin/incident-types/inc_fire', {
      method: 'PATCH', cookie: adminCookie, body: { color: '#zzzzzz' }
    });
    expect(response.status).toBe(400);
  });
});
