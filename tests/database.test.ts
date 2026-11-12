// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

  it('a pre-team database with a designated leader keeps exactly one leader and reconciles owners', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-preteam-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'preteam.sqlite');
    const legacy = new (sqlite as any).Database(databasePath);
    legacy.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta(key,value) VALUES('schema_version','3');
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        security_ready INTEGER NOT NULL DEFAULT 1,
        must_complete_security_questions INTEGER NOT NULL DEFAULT 0,
        ready_for_mission INTEGER NOT NULL DEFAULT 0,
        failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER,
        average_rating REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      INSERT INTO users(id,username,password_hash,role,active,created_at,updated_at)
        VALUES('usr_responder','old.responder','x','responder',1,1,1),
               ('usr_leader','new.leader','x','responder',1,1,1);
      CREATE TABLE incident_types (id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, rank INTEGER NOT NULL UNIQUE);
      INSERT INTO incident_types(id,label,icon,color,rank) VALUES('inc_medical','Medical','medical','#0E6666',1);
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
      INSERT INTO sos_requests(id,requester_id,incident_type_id,severity,description,latitude,longitude,accuracy,is_manual,status,assigned_responder_id,created_at,updated_at,expires_at)
        VALUES('sos_x','usr_responder','inc_medical','medium','Team mission before the fix',35.7,51.3,10,0,'dispatched','usr_responder',1,1,9999999999999);
      CREATE TABLE missions (
        id TEXT PRIMARY KEY, sos_id TEXT NOT NULL UNIQUE REFERENCES sos_requests(id),
        responder_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL,
        rating INTEGER, rating_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        completed_at INTEGER, cancelled_at INTEGER
      );
      -- Stale operational owner (usr_responder) while the designated leader is usr_leader and the
      -- stale owner's membership was removed. The v5 backfill must NOT mint a second active leader.
      INSERT INTO missions(id,sos_id,responder_id,status,created_at,updated_at)
        VALUES('mis_x','sos_x','usr_responder','on_the_way',1,1);
      CREATE TABLE mission_members (
        id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('leader','member')),
        assignment_source TEXT NOT NULL,
        assignment_status TEXT NOT NULL DEFAULT 'active' CHECK (assignment_status IN ('active','removed')),
        assigned_by TEXT, support_request_id TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        removed_at INTEGER, removed_by TEXT, removal_reason TEXT
      );
      CREATE UNIQUE INDEX idx_mission_members_active_unique ON mission_members(mission_id, user_id) WHERE assignment_status = 'active';
      CREATE UNIQUE INDEX idx_mission_members_one_leader ON mission_members(mission_id) WHERE role = 'leader' AND assignment_status = 'active';
      INSERT INTO mission_members(id,mission_id,user_id,role,assignment_source,assignment_status,created_at,updated_at,removed_at)
        VALUES('mm_lead','mis_x','usr_leader','leader','team_dispatch','active',1,1,NULL),
               ('mm_old','mis_x','usr_responder','member','team_dispatch','removed',1,1,1);
    `);
    legacy.close();

    const config = loadConfig({
      environment: 'test',
      databasePath,
      dataDir: directory,
      adminPassword: 'PreTeamPass!2026',
      seedDemoUsers: false,
      startJobs: false
    });
    // The migration must boot cleanly — before the hardening this threw at idx_mission_members_one_leader.
    const database = openDatabase(config);
    try {
      const leaders = database.prepare(
        "SELECT user_id FROM mission_members WHERE mission_id='mis_x' AND role='leader' AND assignment_status='active'"
      ).all() as Array<{ user_id: string }>;
      expect(leaders).toEqual([{ user_id: 'usr_leader' }]);
      // v6: the operational owner follows the active leader.
      const mission = database.prepare("SELECT responder_id FROM missions WHERE id='mis_x'").get() as { responder_id: string };
      expect(mission.responder_id).toBe('usr_leader');
      const sos = database.prepare("SELECT assigned_responder_id FROM sos_requests WHERE id='sos_x'").get() as { assigned_responder_id: string };
      expect(sos.assigned_responder_id).toBe('usr_leader');
      const version = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
      expect(version.value).toBe(String(SCHEMA_VERSION));
    } finally {
      database.close();
    }
  });

  it('a pre-team mission with no memberships is backfilled with an offer_accept leader', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-backfill-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'backfill.sqlite');
    const legacy = new (sqlite as any).Database(databasePath);
    legacy.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta(key,value) VALUES('schema_version','3');
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        security_ready INTEGER NOT NULL DEFAULT 1,
        must_complete_security_questions INTEGER NOT NULL DEFAULT 0,
        ready_for_mission INTEGER NOT NULL DEFAULT 0,
        failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER,
        average_rating REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      INSERT INTO users(id,username,password_hash,role,active,created_at,updated_at)
        VALUES('usr_responder','backfill.responder','x','responder',1,1,1);
      CREATE TABLE incident_types (id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, rank INTEGER NOT NULL UNIQUE);
      INSERT INTO incident_types(id,label,icon,color,rank) VALUES('inc_medical','Medical','medical','#0E6666',1);
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
      INSERT INTO sos_requests(id,requester_id,incident_type_id,severity,description,latitude,longitude,accuracy,is_manual,status,assigned_responder_id,created_at,updated_at,expires_at)
        VALUES('sos_y','usr_responder','inc_medical','low','Offer accepted before teams',35.7,51.3,10,0,'accepted','usr_responder',1,1,9999999999999);
      CREATE TABLE missions (
        id TEXT PRIMARY KEY, sos_id TEXT NOT NULL UNIQUE REFERENCES sos_requests(id),
        responder_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL,
        rating INTEGER, rating_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        completed_at INTEGER, cancelled_at INTEGER
      );
      INSERT INTO missions(id,sos_id,responder_id,status,created_at,updated_at)
        VALUES('mis_y','sos_y','usr_responder','on_the_way',1,1);
      CREATE TABLE mission_offers (
        id TEXT PRIMARY KEY, sos_id TEXT NOT NULL REFERENCES sos_requests(id),
        responder_id TEXT NOT NULL REFERENCES users(id),
        policy TEXT NOT NULL DEFAULT 'all', status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL, responded_at INTEGER, expired_at INTEGER,
        UNIQUE (sos_id, responder_id)
      );
      INSERT INTO mission_offers(id,sos_id,responder_id,policy,status,created_at)
        VALUES('off_y','sos_y','usr_responder','all','accepted',1);
    `);
    legacy.close();

    const config = loadConfig({
      environment: 'test',
      databasePath,
      dataDir: directory,
      adminPassword: 'BackfillPass!2026',
      seedDemoUsers: false,
      startJobs: false
    });
    const database = openDatabase(config);
    try {
      const membership = database.prepare(
        "SELECT user_id, role, assignment_source, assignment_status FROM mission_members WHERE mission_id='mis_y'"
      ).get() as { user_id: string; role: string; assignment_source: string; assignment_status: string };
      expect(membership).toEqual({ user_id: 'usr_responder', role: 'leader', assignment_source: 'offer_accept', assignment_status: 'active' });
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

  it('a fresh database carries the location_shares scope column', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-fresh-scope-'));
    temporaryDirectories.push(directory);
    const config = loadConfig({
      environment: 'test',
      databasePath: path.join(directory, 'fresh.sqlite'),
      dataDir: directory,
      adminPassword: 'FreshScopePass!2026',
      seedDemoUsers: false,
      startJobs: false
    });
    const database = openDatabase(config);
    try {
      const columns = database.prepare('PRAGMA table_info(location_shares)').all() as Array<{ name: string }>;
      expect(columns.some((column) => column.name === 'scope')).toBe(true);
      const version = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
      expect(version.value).toBe(String(SCHEMA_VERSION));
    } finally {
      database.close();
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

describe('bare database filename', () => {
  it('opens a database with no parent directory without running mkdir', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-bare-'));
    const previous = process.cwd();
    process.chdir(directory);
    try {
      const config = loadConfig({
        environment: 'test',
        databasePath: 'bare.sqlite',
        dataDir: directory,
        seedDemoUsers: false
      });
      openDatabase(config);
      expect(existsSync(path.join(directory, 'bare.sqlite'))).toBe(true);
    } finally {
      process.chdir(previous);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
