// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * The client declares view types in `src/client/api/types.ts` by hand, so nothing connected them to
 * what the server actually serializes. A rename on either side compiled cleanly and failed at
 * runtime as `undefined` in the template — that is how the device list quietly lost its rows, its
 * timestamps and its revoke target.
 *
 * This suite parses the interfaces out of that file and checks each one against a real response:
 * every required field must be present and carry the declared primitive shape. It is deliberately
 * structural rather than a schema engine, so it stays readable and needs no maintenance when a new
 * optional field is added.
 */

type Kind = 'string' | 'number' | 'boolean' | 'array' | 'object';

interface Field {
  name: string;
  optional: boolean;
  kind: Kind;
  nullable: boolean;
}

/** Maps a TS type expression onto the runtime shape the JSON must have. */
function classify(type: string): { kind: Kind; nullable: boolean } {
  const nullable = /\bnull\b/.test(type);
  const bare = type.replace(/\s*\|\s*null\b/g, '').trim();
  if (/\[\]$/.test(bare) || /^Array</.test(bare)) return { kind: 'array', nullable };
  if (/^Record</.test(bare) || bare.startsWith('{')) return { kind: 'object', nullable };
  if (bare === 'string') return { kind: 'string', nullable };
  if (bare === 'number') return { kind: 'number', nullable };
  if (bare === 'boolean') return { kind: 'boolean', nullable };
  // Unions of literals (`'low' | 'medium'`) and string aliases (`Role`, `SosStatus`) are strings at
  // runtime; anything else named is an object.
  if (/^['"]/.test(bare) || /^[A-Z][A-Za-z]*$/.test(bare)) return { kind: 'string', nullable };
  return { kind: 'object', nullable };
}

/** Extracts every `export interface` with its fields from the client type file. */
function parseInterfaces(): Map<string, Field[]> {
  const source = readFileSync(resolve(process.cwd(), 'src/client/api/types.ts'), 'utf8');
  const interfaces = new Map<string, Field[]>();
  const blocks = source.matchAll(/export interface (\w+)[\s\S]*?\{\n([\s\S]*?)\n\}/g);
  for (const [, name, body] of blocks) {
    const fields: Field[] = [];
    for (const line of body.split('\n')) {
      const match = /^\s{2}(\w+)(\?)?:\s*(.+);\s*$/.exec(line);
      if (!match) continue;
      const [, field, optional, type] = match;
      fields.push({ name: field, optional: Boolean(optional), ...classify(type) });
    }
    interfaces.set(name, fields);
  }
  return interfaces;
}

/** Checks one live sample against one declared interface. */
function check(label: string, typeName: string, sample: unknown, interfaces: Map<string, Field[]>): string[] {
  const fields = interfaces.get(typeName);
  expect(fields, `${typeName} is missing from types.ts`).toBeTruthy();
  if (!sample || typeof sample !== 'object') return [`${label}: no sample object to check ${typeName}`];

  const record = sample as Record<string, unknown>;
  const problems: string[] = [];
  for (const field of fields!) {
    if (field.optional) continue;
    if (!(field.name in record)) {
      problems.push(`${label}: ${typeName}.${field.name} is declared required but absent`);
      continue;
    }
    const value = record[field.name];
    if (value === null) {
      if (!field.nullable) problems.push(`${label}: ${typeName}.${field.name} is null but the type forbids it`);
      continue;
    }
    const actual = Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value;
    if (actual !== field.kind) {
      problems.push(`${label}: ${typeName}.${field.name} is ${actual} (${JSON.stringify(value)}) but declared ${field.kind}`);
    }
  }
  return problems;
}

let server: TestServer;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => {
  if (server) await server.close();
});

describe('client types match the API payloads', () => {
  it('every view type describes what the endpoint really returns', async () => {
    const interfaces = parseInterfaces();
    const problems: string[] = [];

    /** Fetches `path` and checks its payload (or a picked slice of it) against `typeName`. */
    const verify = async (
      label: string,
      path: string,
      cookie: string,
      typeName: string,
      pick: (data: any) => unknown = (data) => data
    ): Promise<unknown> => {
      const response = await apiFetch(server, path, { cookie });
      expect(response.status, `${label} status`).toBe(200);
      const sample = pick(response.json.data);
      problems.push(...check(label, typeName, sample, interfaces));
      return sample;
    };

    const me = (await verify('me', '/_user/me', userCookie, 'UserView')) as any;
    expect(me.username).toBe('saeed.k');

    const sosList = (await verify('sos list', '/_user/sos', userCookie, 'SosView', (data) => data.items?.[0])) as any;
    await verify('sos detail', `/_user/sos/${sosList.id}`, userCookie, 'SosView', (data) => data.sos ?? data);
    await verify('missions', '/_user/missions', userCookie, 'MissionView', (data) => data.items?.[0]);
    await verify('places', '/_user/places', userCookie, 'SavedPlaceView', (data) => data.items?.[0]);
    await verify('shares', '/_user/location/shares', userCookie, 'ShareView', (data) => data.items?.[0]);
    await verify('incident types', '/_public/incident-types', userCookie, 'IncidentTypeView', (data) => data.items?.[0]);
    await verify('cancellation reasons', '/_public/cancellation-reasons', userCookie, 'CancellationReasonView', (data) => data.items?.[0]);
    await verify('security questions', '/_public/security-questions', userCookie, 'SecurityQuestionView', (data) => data.items?.[0]);
    await verify('map config', '/_public/map/config', userCookie, 'MapConfigView');
    await verify('overview', '/_admin/overview', adminCookie, 'OverviewView');
    await verify('groups', '/_admin/groups', adminCookie, 'GroupView', (data) => data.items?.[0]);
    await verify('alerts', '/_admin/alerts', adminCookie, 'AlertView', (data) => data.items?.[0]);
    await verify('admin users', '/_admin/users', adminCookie, 'AdminUserView', (data) => data.items?.[0]);
    await verify('settings', '/_admin/settings', adminCookie, 'SettingView', (data) => data.items?.[0]);
    await verify('device sessions', '/_user/devices', userCookie, 'SessionView', (data) => data.items?.[0]);

    // Audit rows only exist after a mutation, so make one and then read them back.
    await apiFetch(server, '/_admin/settings', {
      method: 'PATCH',
      cookie: adminCookie,
      body: { key: 'default_dispatch_radius_m', value: '5000' }
    });
    const audit = await apiFetch(server, '/_admin/audit', { cookie: adminCookie });
    if (audit.json.data.items.length) {
      problems.push(...check('audit', 'AuditEntryView', audit.json.data.items[0], interfaces));
    }

    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });
});
