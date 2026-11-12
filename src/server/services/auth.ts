import type { AuthIdentity } from '../core/router.ts';
import { LruTtlCache } from '../core/cache.ts';
import {
  clearSessionCookie, hashPassword, newId, randomInt, randomToken, safeHexEqual, sessionCookie,
  splitSessionToken, tokenHash, verifyPassword
} from '../core/crypto.ts';
import { badRequest, conflict, forbidden, HttpError, tooMany, unauthorized } from '../core/errors.ts';
import { SECURITY_QUESTIONS } from '../domain/catalog.ts';
import { HTTP_EVENTS, ROLES } from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

interface RegisterQuestion { questionId: string; answer: string }
interface RegisterInput { username: string; password: string; securityQuestions: RegisterQuestion[] }
interface LoginInput { username: string; password: string; deviceId?: string; deviceName?: string }
interface RecoveryAnswer { questionId: string; answer: string }

export interface SessionView extends AuthIdentity {
  tokenHash: string;
  deviceName: string;
  expiresAt: number;
  lastSeenAt: number;
  active: number;
  securityReady: number;
  mustCompleteSecurityQuestions: number;
}

interface SessionCreation {
  token: string;
  cookie: string;
  expiresAt: number;
  identity: AuthIdentity;
}

const SESSION_CACHE_MS = 5_000;
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fa-IR');
}

function deviceName(userAgent: string): string {
  const value = userAgent.slice(0, 200);
  if (/android/i.test(value)) return 'Android device';
  if (/iphone|ipad/i.test(value)) return 'iOS device';
  if (/windows/i.test(value)) return 'Windows device';
  if (/macintosh|mac os/i.test(value)) return 'macOS device';
  if (/linux/i.test(value)) return 'Linux device';
  return 'Browser device';
}

function uniqueQuestionIds(questions: RegisterQuestion[]): boolean {
  const known = new Set(SECURITY_QUESTIONS.map((question) => question.id));
  const ids = questions.map((question) => question.questionId);
  return ids.length === SECURITY_QUESTIONS.length && new Set(ids).size === ids.length && ids.every((id) => known.has(id));
}

function shuffle<T>(items: T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

export class AuthService {
  readonly sessionCache: LruTtlCache<string, SessionView>;

  constructor(private readonly ctx: AppContext) {
    this.sessionCache = new LruTtlCache(4096, SESSION_CACHE_MS, ctx.clock);
  }

  securityCatalog(): Array<{ id: string; label: string }> {
    return this.ctx.repo.all<{ id: string; label: string }>('SELECT id,label FROM security_questions ORDER BY rank');
  }

  resolveSession(cookieValue: string | undefined, ip = 'unknown'): SessionView | null {
    const parts = splitSessionToken(cookieValue);
    if (!parts) return null;
    const hash = tokenHash(parts.secret);
    const cacheKey = `${parts.sessionId}:${hash}`;
    const cached = this.sessionCache.get(cacheKey);
    if (cached && cached.expiresAt > this.ctx.clock()) {
      if (!safeHexEqual(cached.tokenHash, hash)) { this.sessionCache.delete(cacheKey); return null; }
      this.touchLastSeen(cached, ip);
      return cached;
    }
    const row = this.ctx.repo.one<Record<string, any>>(
      `SELECT s.id AS sessionId, s.token_hash AS tokenHash, s.user_id AS userId, s.device_id AS deviceId,
        s.device_name AS deviceName, s.ip AS ip, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt,
        s.revoked_at AS revokedAt, u.username, u.role, u.active, u.security_ready AS securityReady,
        u.must_complete_security_questions AS mustCompleteSecurityQuestions
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.active = 1`,
      parts.sessionId, hash, this.ctx.clock()
    );
    if (!row || !safeHexEqual(String(row.tokenHash), hash)) return null;
    const session: SessionView = {
      userId: String(row.userId),
      sessionId: String(row.sessionId),
      username: String(row.username),
      role: String(row.role),
      deviceId: String(row.deviceId),
      deviceName: String(row.deviceName),
      ip: String(row.ip),
      tokenHash: String(row.tokenHash),
      expiresAt: Number(row.expiresAt),
      lastSeenAt: Number(row.lastSeenAt),
      active: Number(row.active),
      securityReady: Number(row.securityReady),
      mustCompleteSecurityQuestions: Number(row.mustCompleteSecurityQuestions)
    };
    this.sessionCache.set(cacheKey, session);
    this.touchLastSeen(session, ip);
    return session;
  }

  private touchLastSeen(session: SessionView, ip: string): void {
    const now = this.ctx.clock();
    if (now - session.lastSeenAt < 30_000) return;
    session.lastSeenAt = now;
    this.ctx.repo.run('UPDATE sessions SET last_seen_at = ?, ip = ? WHERE id = ?', now, ip, session.sessionId);
  }

  private createSession(user: Record<string, any>, deviceId: string | undefined, label: string, ip: string, userAgent: string): SessionCreation {
    const secret = randomToken(32);
    const hash = tokenHash(secret);
    const sessionId = newId('ses');
    const now = this.ctx.clock();
    const expiresAt = now + this.ctx.config.sessionTtlSeconds * 1000;
    const resolvedDeviceId = deviceId || newId('dev');
    const resolvedName = (label || deviceName(userAgent)).slice(0, 120);
    this.ctx.repo.run(
      `INSERT INTO sessions(id,token_hash,user_id,device_id,device_name,ip,user_agent,expires_at,created_at,last_seen_at,revoked_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,NULL)`,
      sessionId, hash, String(user.id), resolvedDeviceId, resolvedName, ip, userAgent.slice(0, 300), expiresAt, now, now
    );
    const identity: AuthIdentity = {
      userId: String(user.id), sessionId, username: String(user.username), role: String(user.role),
      deviceId: resolvedDeviceId, ip
    };
    const token = `${sessionId}.${secret}`;
    this.sessionCache.set(`${sessionId}:${hash}`, {
      ...identity, tokenHash: hash, deviceName: resolvedName, expiresAt, lastSeenAt: now,
      active: 1, securityReady: Number(user.security_ready), mustCompleteSecurityQuestions: Number(user.must_complete_security_questions)
    });
    return {
      token,
      cookie: sessionCookie(token, this.ctx.config.sessionTtlSeconds, this.ctx.config.cookieSecure),
      expiresAt,
      identity
    };
  }

  async register(input: RegisterInput): Promise<Record<string, unknown>> {
    if (!uniqueQuestionIds(input.securityQuestions)) throw badRequest('Five distinct security questions are required.', { field: 'securityQuestions' });
    const existing = this.ctx.repo.one('SELECT id FROM users WHERE username = ?', input.username);
    if (existing) throw conflict('Username is already taken.', { field: 'username', code: 'USERNAME_TAKEN' });
    const passwordHash = await hashPassword(input.password);
    const answers = await Promise.all(input.securityQuestions.map(async (question) => ({
      questionId: question.questionId,
      answerHash: await hashPassword(normalizeAnswer(question.answer))
    })));
    const userId = newId('usr');
    const now = this.ctx.clock();
    this.ctx.repo.transaction(() => {
      this.ctx.repo.run(
        `INSERT INTO users(id,username,password_hash,role,active,security_ready,must_complete_security_questions,ready_for_mission,created_at,updated_at)
         VALUES(?,?,?,?,1,1,0,0,?,?)`, userId, input.username, passwordHash, ROLES.USER, now, now
      );
      for (const answer of answers) {
        this.ctx.repo.run('INSERT INTO user_security_answers(user_id,question_id,answer_hash) VALUES(?,?,?)', userId, answer.questionId, answer.answerHash);
      }
    });
    return { id: userId, username: input.username, role: ROLES.USER, mustCompleteSecurityQuestions: false };
  }

  async login(input: LoginInput, ip: string, userAgent: string): Promise<{ cookie: string; user: Record<string, unknown>; expiresAt: number }> {
    const user = this.ctx.repo.one<Record<string, any>>('SELECT * FROM users WHERE username = ?', input.username);
    if (!user) {
      await verifyPassword(input.password, DUMMY_HASH);
      this.ctx.repo.run('INSERT INTO login_history(user_id,username_attempt,ip,device_name,success,created_at) VALUES(NULL,?,?,?,0,?)',
        input.username, ip, deviceName(userAgent), this.ctx.clock());
      throw unauthorized('Invalid credentials.');
    }
    const now = this.ctx.clock();
    if (Number(user.locked_until ?? 0) > now) throw tooMany('Account is temporarily locked.', Math.ceil((Number(user.locked_until) - now) / 1000));
    const valid = await verifyPassword(input.password, String(user.password_hash));
    if (!valid) {
      const failures = Number(user.failed_logins) + 1;
      const lockUntil = failures >= 5 ? now + 15 * 60_000 : null;
      this.ctx.repo.transaction(() => {
        this.ctx.repo.run('UPDATE users SET failed_logins = ?, locked_until = ?, updated_at = ? WHERE id = ?', failures, lockUntil, now, user.id);
        this.ctx.repo.run('INSERT INTO login_history(user_id,username_attempt,ip,device_name,success,created_at) VALUES(?,?,?,?,0,?)',
          user.id, input.username, ip, deviceName(userAgent), now);
      });
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
    }
    if (!Number(user.active)) throw forbidden('Account is suspended.');
    let created: SessionCreation | null = null;
    this.ctx.repo.transaction(() => {
      this.ctx.repo.run('UPDATE users SET failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', now, user.id);
      this.ctx.repo.run('INSERT INTO login_history(user_id,username_attempt,ip,device_name,success,created_at) VALUES(?,?,?,?,1,?)',
        user.id, input.username, ip, deviceName(userAgent), now);
      created = this.createSession(user, input.deviceId, input.deviceName ?? '', ip, userAgent);
    });
    if (!created) throw new HttpError(500, 'INTERNAL', 'Session creation failed.');
    const session = created as SessionCreation;
    return {
      cookie: session.cookie,
      expiresAt: session.expiresAt,
      user: this.publicUser(user)
    };
  }

  refresh(cookieValue: string | undefined, ip: string, userAgent: string): { cookie: string; expiresAt: number } {
    const session = this.resolveSession(cookieValue, ip);
    if (!session) throw unauthorized('Session is no longer valid.');
    const user = this.ctx.repo.one<Record<string, any>>('SELECT * FROM users WHERE id = ? AND active = 1', session.userId);
    if (!user) throw unauthorized('Session is no longer valid.');
    const now = this.ctx.clock();
    this.ctx.repo.run('UPDATE sessions SET revoked_at = ? WHERE id = ?', now, session.sessionId);
    this.invalidateSession(session.sessionId);
    this.ctx.hub.disconnectSession(session.sessionId);
    const created = this.createSession(user, session.deviceId, session.deviceName, ip, userAgent);
    return { cookie: created.cookie, expiresAt: created.expiresAt };
  }

  logout(cookieValue: string | undefined): { cookie: string } {
    const session = this.resolveSession(cookieValue);
    if (!session) return { cookie: clearSessionCookie(this.ctx.config.cookieSecure) };
    this.ctx.repo.run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', this.ctx.clock(), session.sessionId);
    this.invalidateSession(session.sessionId);
    this.ctx.hub.disconnectSession(session.sessionId);
    return { cookie: clearSessionCookie(this.ctx.config.cookieSecure) };
  }

  async completeSecurityQuestions(identity: AuthIdentity, questions: RegisterQuestion[]): Promise<Record<string, unknown>> {
    if (!uniqueQuestionIds(questions)) throw badRequest('Five distinct security questions are required.', { field: 'securityQuestions' });
    const answers = await Promise.all(questions.map(async (question) => ({
      questionId: question.questionId,
      answerHash: await hashPassword(normalizeAnswer(question.answer))
    })));
    return this.ctx.uow.commit((tx) => {
      for (const answer of answers) {
        tx.repo.run(`INSERT INTO user_security_answers(user_id,question_id,answer_hash) VALUES(?,?,?)
          ON CONFLICT(user_id,question_id) DO UPDATE SET answer_hash=excluded.answer_hash`, identity.userId, answer.questionId, answer.answerHash);
      }
      tx.repo.run('UPDATE users SET security_ready=1, must_complete_security_questions=0, updated_at=? WHERE id=?', this.ctx.clock(), identity.userId);
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId: identity.userId, securityReady: true }, [`user:${identity.userId}`]);
      this.invalidateUser(identity.userId);
      return { ok: true, mustCompleteSecurityQuestions: false };
    });
  }

  async startRecovery(username: string): Promise<Record<string, unknown>> {
    const user = this.ctx.repo.one<Record<string, any>>('SELECT id FROM users WHERE username = ? AND active = 1', username);
    const pool = user
      ? this.ctx.repo.all<Record<string, any>>(
        `SELECT q.id, q.label, a.answer_hash AS answerHash FROM user_security_answers a
         JOIN security_questions q ON q.id = a.question_id WHERE a.user_id = ? ORDER BY q.rank`, user.id)
      : SECURITY_QUESTIONS.map((question) => ({ id: question.id, label: question.label, answerHash: null }));
    const selected = shuffle(pool).slice(0, 3);
    const answersHash: Record<string, string> = {};
    for (const question of selected) answersHash[String(question.id)] = String(question.answerHash ?? randomToken(24));
    const recoveryId = newId('rec');
    const now = this.ctx.clock();
    const expiresAt = now + 10 * 60_000;
    this.ctx.repo.run(
      `INSERT INTO recovery_challenges(id,user_id,question_ids,answers_hash,attempts,max_attempts,expires_at,decoy,created_at)
       VALUES(?,?,?,?,0,3,?,?,?)`, recoveryId, user?.id ?? null, JSON.stringify(selected.map((item) => item.id)),
      JSON.stringify(answersHash), expiresAt, user ? 0 : 1, now
    );
    return {
      recoveryId,
      expiresAt,
      attemptsRemaining: 3,
      questions: selected.map((question) => ({ id: question.id, label: question.label }))
    };
  }

  async answerRecovery(recoveryId: string, answers: RecoveryAnswer[]): Promise<Record<string, unknown>> {
    const challenge = this.ctx.repo.one<Record<string, any>>('SELECT * FROM recovery_challenges WHERE id = ?', recoveryId);
    if (!challenge) throw badRequest('Invalid recovery challenge.');
    const now = this.ctx.clock();
    if (Number(challenge.used_at ?? 0) || Number(challenge.completed_at ?? 0) || Number(challenge.expires_at) < now || Number(challenge.attempts) >= Number(challenge.max_attempts)) {
      throw badRequest('Recovery challenge is no longer active.');
    }
    const expected = JSON.parse(String(challenge.answers_hash)) as Record<string, string>;
    const questionIds = JSON.parse(String(challenge.question_ids)) as string[];
    const submitted = new Map(answers.map((answer) => [answer.questionId, normalizeAnswer(answer.answer)]));
    const checks = await Promise.all(questionIds.map((id) => verifyPassword(submitted.get(id) ?? '', expected[id])));
    if (!checks.every(Boolean)) {
      const attempts = Number(challenge.attempts) + 1;
      this.ctx.repo.run('UPDATE recovery_challenges SET attempts = ? WHERE id = ?', attempts, recoveryId);
      throw badRequest('Invalid security answers.', { attemptsRemaining: Math.max(0, Number(challenge.max_attempts) - attempts), code: 'INVALID_SECURITY_ANSWERS' });
    }
    const resetToken = randomToken(32);
    this.ctx.repo.run('UPDATE recovery_challenges SET reset_token_hash = ?, completed_at = ? WHERE id = ?', tokenHash(resetToken), now, recoveryId);
    return { recoveryId, resetToken, expiresAt: Number(challenge.expires_at) };
  }

  async resetPassword(recoveryId: string, resetToken: string, newPassword: string): Promise<Record<string, unknown>> {
    const challenge = this.ctx.repo.one<Record<string, any>>('SELECT * FROM recovery_challenges WHERE id = ?', recoveryId);
    const now = this.ctx.clock();
    if (!challenge || Number(challenge.decoy) || !challenge.user_id || !challenge.completed_at || challenge.used_at ||
      Number(challenge.expires_at) < now || !safeHexEqual(String(challenge.reset_token_hash ?? ''), tokenHash(resetToken))) {
      throw badRequest('Invalid or expired password reset.');
    }
    const passwordHash = await hashPassword(newPassword);
    const userId = String(challenge.user_id);
    this.ctx.repo.transaction(() => {
      this.ctx.repo.run('UPDATE users SET password_hash=?, failed_logins=0, locked_until=NULL, updated_at=? WHERE id=?', passwordHash, now, userId);
      this.ctx.repo.run('UPDATE recovery_challenges SET used_at=?, reset_token_hash=NULL WHERE id=?', now, recoveryId);
      this.ctx.repo.run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now, userId);
      this.ctx.repo.run('UPDATE recovery_challenges SET used_at=? WHERE user_id=? AND used_at IS NULL AND id<>?', now, userId, recoveryId);
    });
    this.invalidateUser(userId);
    this.ctx.hub.disconnectUser(userId);
    return { ok: true };
  }

  revokeAllSessions(userId: string): number {
    const result = this.ctx.repo.run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', this.ctx.clock(), userId);
    this.invalidateUser(userId);
    this.ctx.hub.disconnectUser(userId);
    return result.changes;
  }

  invalidateUser(userId: string): void {
    this.sessionCache.deleteWhere((session) => session.userId === userId);
  }

  invalidateSession(sessionId: string): void {
    this.sessionCache.deleteWhere((session) => session.sessionId === sessionId);
  }

  publicUser(row: Record<string, any>): Record<string, unknown> {
    return {
      id: String(row.id),
      username: String(row.username),
      role: String(row.role),
      isActive: Boolean(row.active),
      securityReady: Boolean(row.security_ready),
      mustCompleteSecurityQuestions: Boolean(row.must_complete_security_questions),
      readyForMission: Boolean(row.ready_for_mission),
      recordTrack: Boolean(row.record_track),
      averageRating: Number(row.average_rating),
      createdAt: Number(row.created_at)
    };
  }
}
