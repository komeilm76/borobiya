import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/core/config.ts';
import { openDatabase, seedDatabase } from '../src/db/database.ts';

test('an older SQLite database gains the SOS photo column without losing rows', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-migration-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  try {
    const legacy = new DatabaseSync(databasePath);
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
      nodeEnv: 'test', databasePath, dataDir: directory,
      adminPassword: 'MigrationPass!2026', seedDemoUsers: false, startJobs: false
    });
    const database = openDatabase(config);
    try {
      const columns = database.prepare('PRAGMA table_info(sos_requests)').all() as Array<{ name: string }>;
      assert.ok(columns.some((column) => column.name === 'photo_data_url'));
      const row = database.prepare('SELECT id, description, photo_data_url FROM sos_requests WHERE id = ?').get('sos_legacy') as {
        id: string; description: string; photo_data_url: string | null;
      };
      assert.equal(row.description, 'Preserved legacy row');
      assert.equal(row.photo_data_url, null);
      const version = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
      assert.equal(version.value, '2');
      const result = await seedDatabase(database, config);
      assert.equal(result.seededDemoUsers, false);
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production configuration rejects demo seeding and known bootstrap passwords', () => {
  for (const adminPassword of ['change-me-before-production', 'DemoPass!2026', 'PreviewPass!2026', 'CIReleasePass!2026', 'short']) {
    assert.throws(() => loadConfig({ nodeEnv: 'production', adminPassword, seedDemoUsers: false }), /ADMIN_PASSWORD/);
  }
  assert.throws(() => loadConfig({
    nodeEnv: 'production', adminPassword: 'UniqueProductionPass!2026', seedDemoUsers: true
  }), /SEED_DEMO_USERS/);
  const config = loadConfig({
    nodeEnv: 'production', adminPassword: 'UniqueProductionPass!2026', seedDemoUsers: false,
    allowedOrigins: ['https://borobiya.example.test']
  });
  assert.equal(config.seedDemoUsers, false);
  assert.equal(config.cookieSecure, true);
});
