import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, createTestServer, login, sessionCookie, type TestServer } from './helpers.ts';
import { SECURITY_QUESTIONS } from '../src/domain/catalog.ts';

let server: TestServer;
let adminCookie: string;
const suffix = Date.now().toString(36);
const answers = SECURITY_QUESTIONS.map((question) => ({ questionId: question.id, answer: `Answer-${question.id}-2026` }));

before(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});
after(async () => { if (server) await server.close(); });

test('registration requires five distinct security questions and creates a ready account', async () => {
  const username = `reg.${suffix}`;
  const registered = await apiFetch(server, '/_auth/register', {
    method: 'POST',
    body: { username, password: 'RegisterPass!2026', securityQuestions: answers }
  });
  assert.equal(registered.status, 201, registered.text);
  assert.equal(registered.json.data.role, 'user');
  assert.equal(registered.json.data.mustCompleteSecurityQuestions, false);
  const cookie = await login(server, username, 'RegisterPass!2026');
  const me = await apiFetch(server, '/_user/me', { cookie });
  assert.equal(me.json.data.username, username);
  assert.equal(me.json.data.securityReady, true);

  const duplicate = await apiFetch(server, '/_auth/register', {
    method: 'POST', body: { username, password: 'AnotherPass!2026', securityQuestions: answers }
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.error.details.code, 'USERNAME_TAKEN');
  const weak = await apiFetch(server, '/_auth/register', {
    method: 'POST', body: { username: `weak.${suffix}`, password: 'short', securityQuestions: answers }
  });
  assert.equal(weak.status, 400);
  const duplicateQuestions = [...answers];
  duplicateQuestions[1] = duplicateQuestions[0];
  const invalidQuestions = await apiFetch(server, '/_auth/register', {
    method: 'POST', body: { username: `questions.${suffix}`, password: 'QuestionPass!2026', securityQuestions: duplicateQuestions }
  });
  assert.equal(invalidQuestions.status, 400);
});

test('administrator-created accounts complete onboarding before normal use', async () => {
  const username = `onboard.${suffix}`;
  const created = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username, password: 'TemporaryPass!2026', role: 'responder' }
  });
  assert.equal(created.status, 201);
  const cookie = await login(server, username, 'TemporaryPass!2026');
  const beforeCompletion = await apiFetch(server, '/_user/me', { cookie });
  assert.equal(beforeCompletion.json.data.mustCompleteSecurityQuestions, true);
  const completed = await apiFetch(server, '/_user/security-questions', {
    method: 'POST', cookie, body: { securityQuestions: answers }
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.json.data.mustCompleteSecurityQuestions, false);
  const afterCompletion = await apiFetch(server, '/_user/me', { cookie });
  assert.equal(afterCompletion.json.data.securityReady, true);
});

test('recovery challenges verify three answers, issue one-use reset tokens and revoke old passwords', async () => {
  const username = 'maryam.a';
  const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username } });
  assert.equal(started.status, 200);
  assert.equal(started.json.data.questions.length, 3);
  assert.equal(started.json.data.attemptsRemaining, 3);
  const recoveryAnswers = started.json.data.questions.map((question: any) => ({ questionId: question.id, answer: 'Tehran1968!' }));
  const verified = await apiFetch(server, '/_auth/recovery/answers', {
    method: 'POST', body: { recoveryId: started.json.data.recoveryId, answers: recoveryAnswers }
  });
  assert.equal(verified.status, 200, verified.text);
  assert.ok(verified.json.data.resetToken.length >= 20);
  const reset = await apiFetch(server, '/_auth/recovery/reset', {
    method: 'POST', body: {
      recoveryId: verified.json.data.recoveryId,
      resetToken: verified.json.data.resetToken,
      newPassword: 'RecoveredPass!2026'
    }
  });
  assert.equal(reset.status, 200);
  const replay = await apiFetch(server, '/_auth/recovery/reset', {
    method: 'POST', body: {
      recoveryId: verified.json.data.recoveryId,
      resetToken: verified.json.data.resetToken,
      newPassword: 'AnotherPass!2026'
    }
  });
  assert.equal(replay.status, 400);
  const oldPassword = await apiFetch(server, '/_auth/login', {
    method: 'POST', body: { username, password: 'DemoPass!2026' }
  });
  assert.equal(oldPassword.status, 401);
  const newCookie = await login(server, username, 'RecoveredPass!2026');
  assert.match(newCookie, /^bb_session=/);
});

test('unknown usernames receive a decoy recovery challenge that cannot be reset', async () => {
  const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username: `ghost.${suffix}` } });
  assert.equal(started.status, 200);
  assert.equal(started.json.data.questions.length, 3);
  const attempted = await apiFetch(server, '/_auth/recovery/answers', {
    method: 'POST',
    body: {
      recoveryId: started.json.data.recoveryId,
      answers: started.json.data.questions.map((question: any) => ({ questionId: question.id, answer: 'Tehran1968!' }))
    }
  });
  assert.equal(attempted.status, 400);
  assert.equal(attempted.json.error.details.code, 'INVALID_SECURITY_ANSWERS');
});

test('logout revokes a session and refresh rotates its cookie', async () => {
  const cookie = await login(server, 'saeed.k', 'DemoPass!2026');
  const refreshed = await apiFetch(server, '/_auth/refresh', { method: 'POST', cookie });
  assert.equal(refreshed.status, 200);
  const rotated = sessionCookie(refreshed);
  assert.notEqual(rotated, cookie);
  assert.equal((await apiFetch(server, '/_user/me', { cookie })).status, 401);
  assert.equal((await apiFetch(server, '/_user/me', { cookie: rotated })).status, 200);
  const logout = await apiFetch(server, '/_auth/logout', { method: 'POST', cookie: rotated });
  assert.equal(logout.status, 200);
  assert.equal((await apiFetch(server, '/_user/me', { cookie: rotated })).status, 401);
});
