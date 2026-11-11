import * as sqlite from 'bun:sqlite';
import type { Config } from '../core/config.ts';
import { hashPassword } from '../core/crypto.ts';
import { CANCELLATION_REASONS, DEFAULT_GROUPS, DEMO_USERS, INCIDENT_TYPES, JOB_TYPES, SECURITY_QUESTIONS } from '../domain/catalog.ts';

/** Durable schema version written to the `meta` table. */
export const SCHEMA_VERSION = 8;

/** A Bun SQLite database handle. */
type SqliteDatabase = sqlite.Database;

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
  scope TEXT,
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
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_id, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS trip_stops (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  label TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  place_id TEXT REFERENCES saved_places(id) ON DELETE SET NULL,
  UNIQUE (trip_id, rank)
);
CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON trip_stops(trip_id, rank);
CREATE TABLE IF NOT EXISTS group_trips (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leader','member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_trips_one_leader ON group_trips(trip_id) WHERE role = 'leader';
CREATE INDEX IF NOT EXISTS idx_group_trips_user ON group_trips(user_id, joined_at DESC);
CREATE TABLE IF NOT EXISTS trip_invitations (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  UNIQUE (trip_id, invitee_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_invitations_invitee ON trip_invitations(invitee_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS saved_trips (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
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
CREATE TABLE IF NOT EXISTS job_types (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  offer_policy TEXT NOT NULL DEFAULT 'ready_only' CHECK (offer_policy IN ('all','ready_only')),
  rank INTEGER NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mission_offers (
  id TEXT PRIMARY KEY,
  sos_id TEXT NOT NULL REFERENCES sos_requests(id) ON DELETE CASCADE,
  responder_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy TEXT NOT NULL CHECK (policy IN ('all','ready_only')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  expired_at INTEGER,
  UNIQUE (sos_id, responder_id)
);
CREATE INDEX IF NOT EXISTS idx_offers_responder ON mission_offers(responder_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_sos ON mission_offers(sos_id, status);
CREATE INDEX IF NOT EXISTS idx_offers_pending_expiry ON mission_offers(status, created_at);
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
CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partially_approved','approved','rejected','cancelled')),
  admin_note TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_mission ON support_requests(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_requester ON support_requests(requested_by, created_at DESC);
CREATE TABLE IF NOT EXISTS support_request_items (
  request_id TEXT NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  job_type_id TEXT NOT NULL REFERENCES job_types(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  approved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (approved_quantity >= 0),
  PRIMARY KEY (request_id, job_type_id)
);
CREATE TABLE IF NOT EXISTS support_request_decisions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','partially_approved','rejected')),
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_request_decisions_request ON support_request_decisions(request_id, created_at);
CREATE TABLE IF NOT EXISTS mission_requirements (
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  job_type_id TEXT NOT NULL REFERENCES job_types(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (mission_id, job_type_id)
);
CREATE TABLE IF NOT EXISTS mission_members (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leader','member')),
  assignment_source TEXT NOT NULL CHECK (assignment_source IN ('legacy_backfill','offer_accept','immediate_dispatch','admin_assignment','support_request','team_dispatch')),
  assignment_status TEXT NOT NULL DEFAULT 'active' CHECK (assignment_status IN ('active','removed')),
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  support_request_id TEXT REFERENCES support_requests(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  removed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  removal_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_members_active_unique ON mission_members(mission_id, user_id) WHERE assignment_status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_members_one_leader ON mission_members(mission_id) WHERE role = 'leader' AND assignment_status = 'active';
CREATE INDEX IF NOT EXISTS idx_mission_members_mission ON mission_members(mission_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_mission_members_user ON mission_members(user_id, assignment_status);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  audience_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_id ON events(id);
`;

function ensureColumn(database: SqliteDatabase, table: string, column: string, definition: string): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Opens (and if necessary migrates) the SQLite database.
 * Additive, idempotent migrations only; no row is ever rewritten destructively.
 *   v1 -> v2: sos_requests.photo_data_url, users.job_type_id
 *   v3: job_types catalog, mission_offers table (with pre-offer pending backfill)
 *   v4: mission_offers.expired_at (offers expire; exact expiry moment recorded)
 *   v5: mission teams - support_requests, support_request_items, support_request_decisions,
 *       mission_requirements and mission_members (leader/members, unique active membership,
 *       at most one active leader per mission); existing missions are backfilled with a
 *       leader membership for their assigned responder. Genuine acceptance history is kept.
 *   v6: reconcile the operational owner references with the active leader. Leader replacement
 *       now moves missions.responder_id and sos_requests.assigned_responder_id atomically; this
 *       one-off pass realigns rows written before the fix. Finished missions are untouched.
 *   v7: location_shares.scope — grants carry the explicitly selected detail set as a JSON array
 *       ('route' | 'motion' | 'accuracy'). NULL keeps the pre-v7 behaviour (every detail).
 *   v8: trips, trip_stops, group_trips, trip_invitations and saved_trips — the trip domain
 *       (Stage 5). Additive tables only; no existing row is touched.
 *
 * @param config Runtime configuration.
 * @returns A ready Bun SQLite handle with WAL, foreign keys and a busy timeout.
 */
export function openDatabase(config: Config): SqliteDatabase {
  if (config.databasePath !== ':memory:') {
    // A path with no parent component ("bare.sqlite") means the current directory; slicing to
    // lastIndexOf === -1 would otherwise chop the last character and mkdir a bogus one.
    const slash = config.databasePath.lastIndexOf('/');
    const directory = slash > 0 ? config.databasePath.slice(0, slash) : '';
    if (directory) {
      Bun.spawnSync(['mkdir', '-p', directory], { stdout: 'ignore', stderr: 'ignore' });
    }
  }
  // `bun:sqlite` is imported as a namespace and the constructor is read once so the same
  // module works under Bun's native loader and under Vitest's module graph.
  const DatabaseConstructor = sqlite.Database;
  const database = new DatabaseConstructor(config.databasePath, { create: true, strict: true });
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA busy_timeout = 5000;');
  database.exec('PRAGMA temp_store = MEMORY;');
  database.exec('PRAGMA cache_size = -16000;');
  if (config.databasePath !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
  }
  database.exec(SCHEMA);
  ensureColumn(database, 'sos_requests', 'photo_data_url', 'TEXT');
  ensureColumn(database, 'users', 'job_type_id', 'TEXT REFERENCES job_types(id)');
  // v4: offers gain an exact expired_at; pre-existing terminal rows keep NULL (unknown expiry moment).
  ensureColumn(database, 'mission_offers', 'expired_at', 'INTEGER');
  // v5: backfill a leader membership for pre-team missions. The acceptor becomes the leader;
  // an accepted offer proves the acceptance path, otherwise treat the assignment as legacy.
  database.exec(`
    INSERT INTO mission_members(id, mission_id, user_id, role, assignment_source, assignment_status, created_at, updated_at)
    SELECT 'mm_' || m.id || '_' || m.responder_id, m.id, m.responder_id, 'leader',
           CASE WHEN EXISTS (SELECT 1 FROM mission_offers o WHERE o.sos_id = m.sos_id AND o.responder_id = m.responder_id AND o.status = 'accepted')
                THEN 'offer_accept' ELSE 'legacy_backfill' END,
           'active', m.created_at, m.updated_at
    FROM missions m
    WHERE NOT EXISTS (SELECT 1 FROM mission_members mm WHERE mm.mission_id = m.id AND mm.user_id = m.responder_id AND mm.assignment_status = 'active')
  `);
  // Offer backfill for databases that predate the offers table: a named, dispatched SOS with no
  // offer row would otherwise be unacceptable. Idempotent, never re-creates declined/accepted rows.
  database.exec(`
    INSERT OR IGNORE INTO mission_offers(id, sos_id, responder_id, policy, status, created_at)
    SELECT 'off_' || s.id || '_' || s.assigned_responder_id, s.id, s.assigned_responder_id, 'all', 'pending', s.updated_at
    FROM sos_requests s
    WHERE s.status = 'dispatched' AND s.assigned_responder_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mission_offers o WHERE o.sos_id = s.id)
  `);
  // v7: additive detail scope for historical shares; NULL means the full detail set.
  if (!database.prepare("SELECT 1 FROM pragma_table_info('location_shares') WHERE name='scope'").get()) {
    database.exec('ALTER TABLE location_shares ADD COLUMN scope TEXT');
  }
  // v6: the operational owner references must follow the active leader/membership. Reconcile
  // rows whose designation predates the fix; active leader wins, finished missions stay frozen.
  database.exec(`
    UPDATE missions SET responder_id = (
      SELECT mm.user_id FROM mission_members mm
      WHERE mm.mission_id = missions.id AND mm.role = 'leader' AND mm.assignment_status = 'active'
    )
    WHERE status NOT IN ('completed','cancelled')
      AND EXISTS (SELECT 1 FROM mission_members mm
        WHERE mm.mission_id = missions.id AND mm.role = 'leader' AND mm.assignment_status = 'active'
          AND mm.user_id <> responder_id)
  `);
  database.exec(`
    UPDATE sos_requests SET assigned_responder_id = (SELECT responder_id FROM missions m WHERE m.sos_id = sos_requests.id)
    WHERE EXISTS (SELECT 1 FROM missions m WHERE m.sos_id = sos_requests.id AND m.status NOT IN ('completed','cancelled'))
  `);
  database
    .prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('schema_version', String(SCHEMA_VERSION));
  return database;
}

/** Outcome of the seed routine. */
export interface SeedResult {
  adminUsername: string;
  demoPassword: string | null;
  seededDemoUsers: boolean;
}

/**
 * Seeds catalogs, settings, the bootstrap administrator and (outside production) demo users.
 * The routine is idempotent: running it twice with the same configuration changes nothing.
 *
 * @param database Open database handle.
 * @param config Runtime configuration.
 * @returns A description of what was seeded.
 */
export async function seedDatabase(database: SqliteDatabase, config: Config): Promise<SeedResult> {
  const now = Date.now();
  const insert = (sql: string, ...params: Array<string | number | null>) => database.prepare(sql).run(...params);
  const upsertMeta = database.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');

  SECURITY_QUESTIONS.forEach((question, index) => {
    insert('INSERT OR IGNORE INTO security_questions(id,label,rank) VALUES(?,?,?)', question.id, question.label, index + 1);
  });
  INCIDENT_TYPES.forEach((item, index) => {
    insert('INSERT OR IGNORE INTO incident_types(id,label,icon,color,rank) VALUES(?,?,?,?,?)', item.id, item.label, item.icon ?? 'alert', item.color ?? '#0E6666', index + 1);
  });
  JOB_TYPES.forEach((item, index) => {
    insert('INSERT OR IGNORE INTO job_types(id,label,offer_policy,rank,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)', item.id, item.label, item.offerPolicy, index + 1, now, now);
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
  // The demo responder is a firefighter (policy `all`), so they can accept even while not on standby.
  insert("UPDATE users SET job_type_id='job_fire', updated_at=? WHERE id='usr_responder' AND job_type_id IS NULL", now);
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
    ['sos_demo_pending', 'usr_requester', 'inc_fire', 'high', 'آتش‌سوزی در ساختمان مسکونی', 'pending'],
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
  // Seed the demo mission's leader membership so fresh installs match the v5 backfill.
  insert(`INSERT OR IGNORE INTO mission_members(id,mission_id,user_id,role,assignment_source,assignment_status,created_at,updated_at)
    VALUES('mm_mis_demo_completed_usr_responder','mis_demo_completed','usr_responder','leader','legacy_backfill','active',?,?)`,
    now - 550_000, now - 120_000);
  insert('INSERT OR IGNORE INTO alerts(id,kind,severity,message,meta_json,created_at,resolved_at,resolved_by) VALUES(?,?,?,?,?,?,?,?)',
    'alt_demo_1', 'coverage', 'warning', 'گروه کوهستان پوشش کافی ندارد', '{"group":"کوهستان"}', now - 240_000, null, null);
  insert('INSERT OR IGNORE INTO alerts(id,kind,severity,message,meta_json,created_at,resolved_at,resolved_by) VALUES(?,?,?,?,?,?,?,?)',
    'alt_demo_2', 'sos', 'danger', 'درخواست SOS بدون پاسخ باقی مانده است', '{"sosId":"sos_demo_pending"}', now - 180_000, null, null);
  return { adminUsername: config.adminUsername, demoPassword, seededDemoUsers: true };
}
