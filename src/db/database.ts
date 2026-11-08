import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Config } from '../core/config.ts';
import { hashPassword } from '../core/crypto.ts';
import { CANCELLATION_REASONS, DEFAULT_GROUPS, DEMO_USERS, INCIDENT_TYPES, SECURITY_QUESTIONS } from '../domain/catalog.ts';

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','responder','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  security_ready INTEGER NOT NULL DEFAULT 0,
  must_complete_security_questions INTEGER NOT NULL DEFAULT 1,
  ready_for_mission INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  average_rating REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS security_questions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  rank INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS user_security_answers (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES security_questions(id) ON DELETE CASCADE,
  answer_hash TEXT NOT NULL,
  PRIMARY KEY (user_id, question_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  username_attempt TEXT NOT NULL,
  ip TEXT NOT NULL,
  device_name TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_history_time ON login_history(created_at DESC);
CREATE TABLE IF NOT EXISTS recovery_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  question_ids TEXT NOT NULL,
  answers_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  reset_token_hash TEXT,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  used_at INTEGER,
  decoy INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS incident_types (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  rank INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS cancellation_reasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  requires_text INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS service_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  rank INTEGER NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_incident_types (
  group_id TEXT NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  incident_type_id TEXT NOT NULL REFERENCES incident_types(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, incident_type_id)
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS location_shares (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('live','history')),
  duration_seconds INTEGER,
  expires_at INTEGER,
  history_from INTEGER,
  history_to INTEGER,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (owner_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_owner ON location_shares(owner_id, kind, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_recipient ON location_shares(recipient_id, kind, revoked_at, expires_at);
CREATE TABLE IF NOT EXISTS location_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL NOT NULL,
  heading REAL,
  speed REAL,
  recorded_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_location_points_user_time ON location_points(user_id, recorded_at DESC);
CREATE TABLE IF NOT EXISTS saved_places (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  address TEXT NOT NULL,
  icon TEXT NOT NULL,
  rank INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sos_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_type_id TEXT NOT NULL REFERENCES incident_types(id),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  description TEXT NOT NULL,
  photo_data_url TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL NOT NULL,
  is_manual INTEGER NOT NULL,
  status TEXT NOT NULL,
  cancellation_reason_id TEXT,
  cancellation_detail TEXT,
  assigned_group_id TEXT,
  assigned_responder_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sos_status_time ON sos_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_requester ON sos_requests(requester_id, created_at DESC);
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  sos_id TEXT NOT NULL UNIQUE REFERENCES sos_requests(id) ON DELETE CASCADE,
  responder_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  rating INTEGER,
  rating_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  cancelled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_missions_responder ON missions(responder_id, status);
CREATE TABLE IF NOT EXISTS mission_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','danger')),
  message TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts(resolved_at, created_at DESC);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  ip TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  audience_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_id ON events(id);
`;

export function openDatabase(config: Config): DatabaseSync {
  if (config.databasePath !== ':memory:') mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const database = new DatabaseSync(config.databasePath);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA busy_timeout = 5000;');
  database.exec('PRAGMA temp_store = MEMORY;');
  database.exec('PRAGMA cache_size = -16000;');
  if (config.databasePath !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
  }
  database.exec(SCHEMA);
  database.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('schema_version', String(SCHEMA_VERSION));
  return database;
}

export interface SeedResult {
  adminUsername: string;
  demoPassword: string | null;
  seededDemoUsers: boolean;
}

export async function seedDatabase(database: DatabaseSync, config: Config): Promise<SeedResult> {
  const now = Date.now();
  const insert = (sql: string, ...params: Array<string | number | null>) => database.prepare(sql).run(...params);
  const upsertMeta = database.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

  SECURITY_QUESTIONS.forEach((question, index) => {
    insert('INSERT OR IGNORE INTO security_questions(id,label,rank) VALUES(?,?,?)', question.id, question.label, index + 1);
  });
  INCIDENT_TYPES.forEach((item, index) => {
    insert('INSERT OR IGNORE INTO incident_types(id,label,icon,color,rank) VALUES(?,?,?,?,?)', item.id, item.label, item.icon ?? 'alert', item.color ?? '#0E6666', index + 1);
  });
  CANCELLATION_REASONS.forEach((item, index) => {
    insert('INSERT OR IGNORE INTO cancellation_reasons(id,label,requires_text,rank) VALUES(?,?,?,?)', item.id, item.label, item.requiresText ? 1 : 0, index + 1);
  });
  DEFAULT_GROUPS.forEach((group, index) => {
    insert('INSERT OR IGNORE INTO service_groups(id,name,color,capacity,status,rank,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      group.id, group.name, group.color, group.capacity, 'active', index + 1, now, now);
    group.incidentIds.forEach((incidentId) => {
      insert('INSERT OR IGNORE INTO group_incident_types(group_id,incident_type_id) VALUES(?,?)', group.id, incidentId);
    });
  });
  const defaults: Record<string, string> = {
    sos_auto_dispatch: '0',
    default_dispatch_radius_m: '5000',
    mission_ready_required: '1',
    maintenance_mode: '0'
  };
  for (const [key, value] of Object.entries(defaults)) {
    insert('INSERT OR IGNORE INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)', key, value, now, null);
  }

  const adminHash = await hashPassword(config.adminPassword);
  insert(`INSERT INTO users(id,username,password_hash,role,active,security_ready,must_complete_security_questions,ready_for_mission,created_at,updated_at)
    VALUES(?,?,?,?,1,1,0,0,?,?)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username, password_hash=excluded.password_hash, role='admin', active=1, updated_at=excluded.updated_at`,
    'usr_admin', config.adminUsername, adminHash, 'admin', now, now);
  upsertMeta.run('seeded_at', String(now));

  if (!config.seedDemoUsers) return { adminUsername: config.adminUsername, demoPassword: null, seededDemoUsers: false };

  const demoPassword = 'DemoPass!2026';
  const demoHash = await hashPassword(demoPassword);
  const answerHash = await hashPassword('tehran1968!');
  for (const demo of DEMO_USERS) {
    if (demo.id === 'usr_admin') continue;
    insert(`INSERT OR IGNORE INTO users(id,username,password_hash,role,active,security_ready,must_complete_security_questions,ready_for_mission,average_rating,created_at,updated_at)
      VALUES(?,?,?,?,1,1,0,?,?,?,?)`, demo.id, demo.username, demoHash, demo.role, demo.role === 'responder' ? 1 : 0, demo.role === 'responder' ? 4.8 : 4.6, now, now);
    for (const question of SECURITY_QUESTIONS) {
      insert('INSERT OR IGNORE INTO user_security_answers(user_id,question_id,answer_hash) VALUES(?,?,?)', demo.id, question.id, answerHash);
    }
  }
  insert('INSERT OR IGNORE INTO group_members(group_id,user_id,role) VALUES(?,?,?)', 'grp_medical', 'usr_responder', 'leader');
  insert('INSERT OR IGNORE INTO location_shares(id,owner_id,recipient_id,kind,duration_seconds,expires_at,history_from,history_to,created_at,revoked_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    'shr_demo_live', 'usr_requester', 'usr_companion', 'live', 3600, now + 3600_000, null, null, now, null);
  insert('INSERT OR IGNORE INTO saved_places(id,user_id,name,label,latitude,longitude,address,icon,rank,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    'plc_demo_home', 'usr_requester', 'خانه', 'خانه', 35.7192, 51.3314, 'بلوار ولیعصر، تهران', 'home-outline', 1, now, now);
  insert('INSERT OR IGNORE INTO saved_places(id,user_id,name,label,latitude,longitude,address,icon,rank,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    'plc_demo_work', 'usr_requester', 'محل کار', 'محل کار', 35.7281, 51.3422, 'خیابان شریعتی، تهران', 'briefcase-outline', 2, now, now);
  for (let index = 0; index < 10; index++) {
    insert('INSERT OR IGNORE INTO location_points(id,user_id,latitude,longitude,accuracy,heading,speed,recorded_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      1000 + index, 'usr_companion', 35.718 + index * 0.0007, 51.331 + index * 0.0009, 12, 42, 8, now - (10 - index) * 60_000, now);
  }
  const demoSos: Array<[string, string, string, string, string, string]> = [
    ['sos_demo_pending', 'usr_requester', 'inc_fire', 'high', 'آتشسوزی در ساختمان مسکونی', 'pending'],
    ['sos_demo_dispatched', 'usr_companion', 'inc_medical', 'medium', 'نیاز به کمک پزشکی فوری', 'dispatched'],
    ['sos_demo_completed', 'usr_requester', 'inc_road', 'low', 'حادثه جزئی رانندگی', 'completed']
  ];
  for (const [id, requesterId, incidentId, severity, description, status] of demoSos) {
    insert(`INSERT OR IGNORE INTO sos_requests(id,requester_id,incident_type_id,severity,description,latitude,longitude,accuracy,is_manual,status,created_at,updated_at,completed_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, requesterId, incidentId, severity, description, 35.7219, 51.3347, 12, 0, status,
      now - 600_000, now - 300_000, status === 'completed' ? now - 120_000 : null, now + 3600_000);
  }
  insert('INSERT OR IGNORE INTO missions(id,sos_id,responder_id,status,rating,created_at,updated_at,completed_at,cancelled_at) VALUES(?,?,?,?,?,?,?,?,?)',
    'mis_demo_completed', 'sos_demo_completed', 'usr_responder', 'completed', 5, now - 550_000, now - 120_000, now - 120_000, null);
  insert('INSERT OR IGNORE INTO alerts(id,kind,severity,message,meta_json,created_at,resolved_at,resolved_by) VALUES(?,?,?,?,?,?,?,?)',
    'alt_demo_1', 'coverage', 'warning', 'گروه کوهستان پوشش کافی ندارد', '{"group":"کوهستان"}', now - 240_000, null, null);
  insert('INSERT OR IGNORE INTO alerts(id,kind,severity,message,meta_json,created_at,resolved_at,resolved_by) VALUES(?,?,?,?,?,?,?,?)',
    'alt_demo_2', 'sos', 'danger', 'درخواست SOS بدون پاسخ باقی مانده است', '{"sosId":"sos_demo_pending"}', now - 180_000, null, null);
  return { adminUsername: config.adminUsername, demoPassword, seededDemoUsers: true };
}
