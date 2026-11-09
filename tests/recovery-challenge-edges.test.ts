// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, type TestServer } from './helpers.ts';

/**
 * Recovery integrity beyond the refusal taxonomy: a completed challenge whose `reset_token_hash`
 * went missing (rotation race, restored backup) must not verify against a bogus token, and an
 * answer set whose keys were never issued must count as a failed attempt, not a crash.
 * A separate server because the recovery endpoints share one tight rate bucket.
 */

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server?.close();
});

describe('answer-set integrity', () => {
  it('refuses a reset when the completed challenge lost its token hash', async () => {
    const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username: 'maryam.a' } });
    expect(started.status, started.text).toBe(200);
    const recoveryId = started.json.data.recoveryId;
    const answers = started.json.data.questions.map((question: any) => ({ questionId: question.id, answer: 'Tehran1968!' }));

    const verified = await apiFetch(server, '/_auth/recovery/answers', { method: 'POST', body: { recoveryId, answers } });
    expect(verified.status, verified.text).toBe(200);
    const resetToken = verified.json.data.resetToken;
    server.app.context.repo.run('UPDATE recovery_challenges SET reset_token_hash = NULL WHERE id = ?', recoveryId);

    const reset = await apiFetch(server, '/_auth/recovery/reset', {
      method: 'POST',
      body: { recoveryId, resetToken, newPassword: 'RecoveryPass!2026' }
    });
    expect(reset.status).toBe(400);
    expect(reset.json.error.message).toBe('Invalid or expired password reset.');
  });

  it('refuses an answer set whose keys were never issued', async () => {
    const started = await apiFetch(server, '/_auth/recovery/start', { method: 'POST', body: { username: 'reza.m' } });
    expect(started.status, started.text).toBe(200);
    const recoveryId = started.json.data.recoveryId;

    const response = await apiFetch(server, '/_auth/recovery/answers', {
      method: 'POST',
      body: {
        recoveryId,
        answers: [
          { questionId: 'sq_bogus_one', answer: 'one!!' },
          { questionId: 'sq_bogus_two', answer: 'two!!' },
          { questionId: 'sq_bogus_three', answer: 'three!' }
        ]
      }
    });
    expect(response.status).toBe(400);
    expect(response.json.error.details?.code).toBe('INVALID_SECURITY_ANSWERS');
    expect(response.json.error.details?.attemptsRemaining).toBe(2);
  });
});
