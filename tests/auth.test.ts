// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, sessionCookie, type TestServer } from './helpers.ts';
import { SECURITY_QUESTIONS } from '../src/server/domain/catalog.ts';

let server: TestServer;
let adminCookie: string;
const suffix = Date.now().toString(36);
const answers = SECURITY_QUESTIONS.map((question) => ({ questionId: question.id, answer: `Answer-${question.id}-2026` }));

beforeAll(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});
afterAll(async () => { if (server) await server.close(); });

it('login accepts any provisioned secret while registration keeps the strength policy', async () => {
  // The documented bootstrap administrator password is long but contains no digits. Login must
  // accept it, otherwise a fresh install can never sign in; registration must still reject it.
  const weak = await apiFetch(server, '/_auth/register', {
    method: 'POST',
    body: { username: `weak.${suffix}`, password: 'change-me-before-production', securityQuestions: answers }
  });
  expect(weak.status).toBe(400);
  expect(String(weak.json.error.details.field)).toContain('password');
  const signedIn = await apiFetch(server, '/_auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'AdminPass!2026' }
  });
  expect(signedIn.status, signedIn.text).toBe(200);

  const bootstrap = await createTestServer({ adminPassword: 'change-me-before-production' });
  try {
    const cookie = await login(bootstrap, 'admin', 'change-me-before-production');
    expect(cookie).toMatch(/=/);
  } finally {
    await bootstrap.close();
  }
});

it('registration requires five distinct security questions and creates a ready account', async () => {
  const username = `reg.${suffix}`;
  const registered = await apiFetch(server, '/_auth/register', {
    method: 'POST',
    body: { username, password: 'RegisterPass!2026', securityQuestions: answers }
  });
  expect(registered.status, 201, registered.text);
  expect(registered.json.data.role, 'user');
  expect(registered.json.data.mustCompleteSecurityQuestions, false);
  const cookie = await login(server, username, 'RegisterPass!2026');
  const me = await apiFetch(server, '/_user/me', { cookie });
  expect(me.json.data.username, username);
  expect(me.json.data.securityReady, true);

  const duplicate = await apiFetch(server, '/_auth/register', {
    method: 'POST', body: { username, password: 'AnotherPass!2026', securityQuestions: answers }
  });
  expect(duplicate.status, 409);
  expect(duplicate.json.error.details.code, 'USERNAME_TAKEN');
  const weak = await apiFetch(server, '/_auth/register', {
    method: 'POST', body: { username: `weak.${suffix}`, password: 'short', securityQuestions: answers }
  });
  expect(weak.status, 400);
  const duplicateQuestions = [...answers];
  duplicateQuestions[1] = duplicateQuestions[0];
  const invalidQuestions = await apiFetch(server, '/_auth/register', {
    method: 'POST', body: { username: `questions.${suffix}`, password: 'QuestionPass!2026', securityQuestions: duplicateQuestions }
  });
  expect(invalidQuestions.status, 400);
});

it('administrator-created accounts complete onboarding before normal use', async () => {
  const username = `onboard.${suffix}`;
  const created = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username, password: 'TemporaryPass!2026', role: 'responder' }
  });
  expect(created.status, 201);
  const cookie = await login(server, username, 'TemporaryPass!2026');
  const beforeCompletion = await apiFetch(server, '/_user/me', { cookie });
  expect(beforeCompletion.json.data.mustCompleteSecurityQuestions, true);
  const completed = await apiFetch(server, '/_user/security-questions', {
    method: 'POST', cookie, body: { securityQuestions: answers }
  });
  expect(completed.status, 200);
  expect(completed.json.data.mustCompleteSecurityQuestions, false);
  const afterCompletion = await apiFetch(server, '/_user/me', { cookie });
  expect(afterCompletion.json.data.securityReady, true);
});

it('recovery challenges verify three answers, issue one-use reset tokens and revoke old passwords', async () => {
  const username = 'maryam.a';
  const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username } });
  expect(started.status, 200);
  expect(started.json.data.questions.length, 3);
  expect(started.json.data.attemptsRemaining, 3);
  const recoveryAnswers = started.json.data.questions.map((question: any) => ({ questionId: question.id, answer: 'Tehran1968!' }));
  const verified = await apiFetch(server, '/_auth/recovery/answers', {
    method: 'POST', body: { recoveryId: started.json.data.recoveryId, answers: recoveryAnswers }
  });
  expect(verified.status, 200, verified.text);
  expect(verified.json.data.resetToken.length >= 20).toBeTruthy();
  const reset = await apiFetch(server, '/_auth/recovery/reset', {
    method: 'POST', body: {
      recoveryId: verified.json.data.recoveryId,
      resetToken: verified.json.data.resetToken,
      newPassword: 'RecoveredPass!2026'
    }
  });
  expect(reset.status, 200);
  const replay = await apiFetch(server, '/_auth/recovery/reset', {
    method: 'POST', body: {
      recoveryId: verified.json.data.recoveryId,
      resetToken: verified.json.data.resetToken,
      newPassword: 'AnotherPass!2026'
    }
  });
  expect(replay.status, 400);
  const oldPassword = await apiFetch(server, '/_auth/login', {
    method: 'POST', body: { username, password: 'DemoPass!2026' }
  });
  expect(oldPassword.status, 401);
  const newCookie = await login(server, username, 'RecoveredPass!2026');
  expect(newCookie).toMatch(/^bb_session=/);
});

it('unknown usernames receive a decoy recovery challenge that cannot be reset', async () => {
  const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username: `ghost.${suffix}` } });
  expect(started.status, 200);
  expect(started.json.data.questions.length, 3);
  const attempted = await apiFetch(server, '/_auth/recovery/answers', {
    method: 'POST',
    body: {
      recoveryId: started.json.data.recoveryId,
      answers: started.json.data.questions.map((question: any) => ({ questionId: question.id, answer: 'Tehran1968!' }))
    }
  });
  expect(attempted.status, 400);
  expect(attempted.json.error.details.code, 'INVALID_SECURITY_ANSWERS');
});

it('logout revokes a session and refresh rotates its cookie', async () => {
  const cookie = await login(server, 'saeed.k', 'DemoPass!2026');
  const refreshed = await apiFetch(server, '/_auth/refresh', { method: 'POST', cookie });
  expect(refreshed.status, 200);
  const rotated = sessionCookie(refreshed);
  expect(rotated).not.toBe(cookie);
  expect((await apiFetch(server, '/_user/me', { cookie })).status, 401);
  expect((await apiFetch(server, '/_user/me', { cookie: rotated })).status, 200);
  const logout = await apiFetch(server, '/_auth/logout', { method: 'POST', cookie: rotated });
  expect(logout.status, 200);
  expect((await apiFetch(server, '/_user/me', { cookie: rotated })).status, 401);
});
