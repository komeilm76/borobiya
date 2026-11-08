// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as sqlite from 'bun:sqlite';
import { loadConfig } from '../src/server/core/config.ts';
import { openDatabase, seedDatabase, SCHEMA_VERSION } from '../src/server/db/database.ts';

/** Temporary directories created by a test, removed afterwards. */
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('SQLite persistence and production safety', () => {
  it('an older SQLite database gains the SOS photo column without losing rows', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-migration-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'legacy.sqlite');
    const legacy = new (sqlite as any).Database(databasePath);
    legacy.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta(key,value) VALUES('schema_version','1');
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        security_ready INTEGER NOT NULL DEFAULT 0,
        must_complete_security_questions INTEGER NOT NULL DEFAULT 1,
        ready_for_mission INTEGER NOT NULL DEFAULT 0,
        failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER,
        average_rating REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE incident_types (id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, rank INTEGER NOT NULL UNIQUE);
      INSERT INTO incident_types(id,label,icon,color,rank) VALUES('inc_medical','Medical','medical','#0E6666',1);
      INSERT INTO users(id,username,password_hash,role,active,security_ready,must_complete_security_questions,ready_for_mission,created_at,updated_at)
        VALUES('usr_legacy','legacy.user','unused','user',1,1,0,0,1,1);
      CREATE TABLE sos_requests (
        id TEXT PRIMARY KEY, requester_id TEXT NOT NULL REFERENCES users(id),
        incident_type_id TEXT NOT NULL REFERENCES incident_types(id),
        severity TEXT NOT NULL, description TEXT NOT NULL,
        latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy REAL NOT NULL,
        is_manual INTEGER NOT NULL, status TEXT NOT NULL,
        cancellation_reason_id TEXT, cancellation_detail TEXT,
        assigned_group_id TEXT, assigned_responder_id TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        completed_at INTEGER, expires_at INTEGER NOT NULL
      );
      INSERT INTO sos_requests(id,requester_id,incident_type_id,severity,description,latitude,longitude,accuracy,is_manual,status,created_at,updated_at,expires_at)
        VALUES('sos_legacy','usr_legacy','inc_medical','low','Preserved legacy row',35.7,51.3,10,0,'pending',1,1,9999999999999);
    `);
    legacy.close();

    const config = loadConfig({
      environment: 'test',
      databasePath,
      dataDir: directory,
      adminPassword: 'MigrationPass!2026',
      seedDemoUsers: false,
      startJobs: false
    });
    const database = openDatabase(config);
    try {
      const columns = database.prepare('PRAGMA table_info(sos_requests)').all() as Array<{ name: string }>;
      expect(columns.some((column) => column.name === 'photo_data_url')).toBe(true);
      const row = database
        .prepare('SELECT id, description, photo_data_url FROM sos_requests WHERE id = ?')
        .get('sos_legacy') as { id: string; description: string; photo_data_url: string | null };
      expect(row.description).toBe('Preserved legacy row');
      expect(row.photo_data_url).toBe(null);
      const version = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
      expect(version.value).toBe(String(SCHEMA_VERSION));
      const result = await seedDatabase(database, config);
      expect(result.seededDemoUsers).toBe(false);
    } finally {
      database.close();
    }
  });

  it('opening an already migrated database is idempotent', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-idempotent-'));
    temporaryDirectories.push(directory);
    const config = loadConfig({
      environment: 'test',
      databasePath: path.join(directory, 'twice.sqlite'),
      dataDir: directory,
      adminPassword: 'IdempotentPass!2026',
      seedDemoUsers: true,
      startJobs: false
    });
    const first = openDatabase(config);
    const seeded = await seedDatabase(first, config);
    first.close();
    expect(seeded.seededDemoUsers).toBe(true);
    const second = openDatabase(config);
    try {
      const users = second.prepare('SELECT COUNT(*) AS total FROM users').get() as { total: number };
      expect(users.total).toBeGreaterThanOrEqual(4);
      const meta = second.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
      expect(meta.value).toBe(String(SCHEMA_VERSION));
    } finally {
      second.close();
    }
  });

  it('production configuration rejects demo seeding and known bootstrap passwords', () => {
    for (const adminPassword of [
      'change-me-before-production',
      'DemoPass!2026',
      'PreviewPass!2026',
      'CIReleasePass!2026',
      'short'
    ]) {
      expect(() => loadConfig({ environment: 'production', adminPassword, seedDemoUsers: false })).toThrow(
        /ADMIN_PASSWORD/
      );
    }
    expect(() =>
      loadConfig({ environment: 'production', adminPassword: 'UniqueProductionPass!2026', seedDemoUsers: true })
    ).toThrow(/SEED_DEMO_USERS/);
    const config = loadConfig({
      environment: 'production',
      adminPassword: 'UniqueProductionPass!2026',
      seedDemoUsers: false,
      allowedOrigins: ['https://borobiya.example.test']
    });
    expect(config.seedDemoUsers).toBe(false);
    expect(config.cookieSecure).toBe(true);
    expect(config.trustProxy).toBe(false);
  });
});
