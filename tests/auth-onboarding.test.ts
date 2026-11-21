// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Forced onboarding must not be completable with duplicate questions: five distinct challenges
 * are the recovery flow's strength, and a repeated question collapses it to four.
 */

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server?.close();
});

describe('onboarding validation', () => {
  it('refuses five answers with a duplicated question id', async () => {
    const adminCookie = await login(server, 'admin', 'AdminPass!2026');
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'edge.onboard', password: 'EdgePass!2026', role: 'user' }
    });
    expect(created.status, created.text).toBe(201);

    const catalog = await apiFetch(server, '/_public/security-questions', { cookie: adminCookie });
    const questions = catalog.json.data.items.slice(0, 5);
    const answers = questions.map((question: any) => ({ questionId: question.id, answer: 'EdgeAnswer2026!' }));
    answers[4] = answers[3];

    const cookie = await login(server, 'edge.onboard', 'EdgePass!2026');
    const response = await apiFetch(server, '/_user/security-questions', {
      method: 'POST',
      cookie,
      body: { securityQuestions: answers }
    });
    expect(response.status).toBe(400);
    expect(response.json.error.code).toBe('INVALID_INPUT');
  });
});
