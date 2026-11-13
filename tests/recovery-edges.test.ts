// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, type TestServer } from './helpers.ts';

/**
 * Recovery challenges are one-use, time-boxed and attempt-limited. Each refusal arm of
 * `answerRecovery` is pinned here against a real challenge, with database surgery to age it.
 */

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server?.close();
});

const bogusAnswers = [
  { questionId: 'sec_a', answer: 'aa' },
  { questionId: 'sec_b', answer: 'bb' },
  { questionId: 'sec_c', answer: 'cc' }
];

describe('recovery challenge refusals', () => {
  it('refuses answers for a challenge that does not exist', async () => {
    const response = await apiFetch(server, '/_auth/recovery/answers', {
      method: 'POST',
      body: { recoveryId: 'rec_missing_missing', answers: bogusAnswers }
    });
    expect(response.status).toBe(400);
    expect(response.json.error.message).toBe('Invalid recovery challenge.');
  });

  it('refuses answers for a challenge that was already completed', async () => {
    const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username: 'maryam.a' } });
    expect(started.status, started.text).toBe(200);
    const recoveryId = started.json.data.recoveryId;
    const answers = started.json.data.questions.map((question: any) => ({ questionId: question.id, answer: 'Tehran1968!' }));

    const verified = await apiFetch(server, '/_auth/recovery/answers', { method: 'POST', body: { recoveryId, answers } });
    expect(verified.status, verified.text).toBe(200);

    const replay = await apiFetch(server, '/_auth/recovery/answers', { method: 'POST', body: { recoveryId, answers } });
    expect(replay.status).toBe(400);
    expect(replay.json.error.message).toBe('Recovery challenge is no longer active.');
  });

  it('refuses answers for a challenge whose expiry passed', async () => {
    const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username: 'maryam.a' } });
    const recoveryId = started.json.data.recoveryId;
    server.app.context.repo.run('UPDATE recovery_challenges SET expires_at = ? WHERE id = ?', Date.now() - 1000, recoveryId);
    const response = await apiFetch(server, '/_auth/recovery/answers', {
      method: 'POST',
      body: { recoveryId, answers: bogusAnswers }
    });
    expect(response.status).toBe(400);
    expect(response.json.error.message).toBe('Recovery challenge is no longer active.');
  });

  it('refuses answers for a challenge that was already used to reset a password', async () => {
    const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username: 'maryam.a' } });
    const recoveryId = started.json.data.recoveryId;
    server.app.context.repo.run('UPDATE recovery_challenges SET used_at = ? WHERE id = ?', Date.now(), recoveryId);
    const response = await apiFetch(server, '/_auth/recovery/answers', {
      method: 'POST',
      body: { recoveryId, answers: bogusAnswers }
    });
    expect(response.status).toBe(400);
    expect(response.json.error.message).toBe('Recovery challenge is no longer active.');
  });
});

