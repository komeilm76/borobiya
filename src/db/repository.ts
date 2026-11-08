import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { RealtimeEvent } from '../core/websocket.ts';

export type SqlValue = SQLInputValue;
export type Row = Record<string, unknown>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

interface EventRow extends Row {
  id: number;
  type: string;
  payload_json: string;
  audience_json: string;
  created_at: string;
}

export interface SyncIdentity {
  userId: string;
  role: string;
  sessionId: string;
}

function toNumber(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

export class Repository {
  constructor(readonly database: DatabaseSync) {}

  one<T = Row>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.database.prepare(sql).get(...params) as T | undefined;
  }

  all<T = Row>(sql: string, ...params: SqlValue[]): T[] {
    return this.database.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SqlValue[]): RunResult {
    const result = this.database.prepare(sql).run(...params);
    return { changes: toNumber(result.changes), lastInsertRowid: toNumber(result.lastInsertRowid) };
  }

  exec(sql: string): void { this.database.exec(sql); }

  transaction<T>(operation: () => T): T {
    this.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.exec('ROLLBACK'); } catch { /* the outer error is the useful one */ }
      throw error;
    }
  }

  appendEvent(type: string, payload: unknown, audience: string[], createdAt = new Date().toISOString()): RealtimeEvent {
    const normalized = [...new Set(audience.filter((value) => typeof value === 'string' && value.length <= 100))];
    const result = this.run(
      'INSERT INTO events(type,payload_json,audience_json,created_at) VALUES(?,?,?,?)',
      type, JSON.stringify(payload ?? {}), JSON.stringify(normalized), createdAt
    );
    return { id: result.lastInsertRowid, type, payload: payload ?? {}, audience: normalized, createdAt };
  }

  eventsSince(since: number, identity: SyncIdentity, limit = 200): RealtimeEvent[] {
    const safeSince = Number.isSafeInteger(since) && since >= 0 ? since : 0;
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
    const rows = this.all<EventRow>('SELECT id,type,payload_json,audience_json,created_at FROM events WHERE id > ? ORDER BY id ASC LIMIT ?', safeSince, safeLimit);
    const allowed = new Set(['all', `user:${identity.userId}`, `role:${identity.role}`, `session:${identity.sessionId}`]);
    return rows.flatMap((row) => {
      let audience: string[] = [];
      let payload: unknown = {};
      try { audience = JSON.parse(row.audience_json) as string[]; } catch { return []; }
      if (!Array.isArray(audience) || !audience.some((subject) => allowed.has(subject))) return [];
      try { payload = JSON.parse(row.payload_json) as unknown; } catch { payload = {}; }
      return [{ id: Number(row.id), type: row.type, payload, audience, createdAt: row.created_at }];
    });
  }

  purgeEventsBefore(cutoffId: number): number {
    return this.run('DELETE FROM events WHERE id < ?', Math.max(0, Math.floor(cutoffId))).changes;
  }

  purgeEventsOlderThan(isoTimestamp: string): number {
    return this.run('DELETE FROM events WHERE created_at < ?', isoTimestamp).changes;
  }

  purgeLocationPointsBefore(cutoff: number): number {
    return this.run('DELETE FROM location_points WHERE recorded_at < ?', cutoff).changes;
  }

  count(table: string): number {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table name');
    const row = this.one<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
    return Number(row?.c ?? 0);
  }

  stats(): Record<string, number> {
    return {
      users: this.count('users'),
      sessions: this.count('sessions'),
      shares: this.count('location_shares'),
      sosRequests: this.count('sos_requests'),
      missions: this.count('missions'),
      alerts: this.count('alerts'),
      events: this.count('events'),
      locationPoints: this.count('location_points')
    };
  }

  close(): void { this.database.close(); }
}
