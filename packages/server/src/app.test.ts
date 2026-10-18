import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createFastifyApp } from "./app";
import { parseServerEnv } from "./config/env";

const serverConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173,http://localhost:3000"
});

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(overrides: Partial<typeof serverConfig> = {}) {
  const app = await createFastifyApp({ ...serverConfig, ...overrides });
  apps.push(app);
  return app;
}

describe("Fastify server skeleton", () => {
  it("serves the public health endpoint with security headers", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/_public/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", version: expect.any(String) });
    expect(response.json().uptime).toEqual(expect.any(Number));
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("allows only configured browser origins and supports credentials", async () => {
    const app = await makeApp();
    const allowed = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { origin: "http://localhost:5173" }
    });
    const denied = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { origin: "https://untrusted.example" }
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("enforces the configured global per-IP rate limit", async () => {
    const app = await makeApp({ rateLimitMax: 1 });
    const first = await app.inject({ method: "GET", url: "/_public/health" });
    const second = await app.inject({ method: "GET", url: "/_public/health" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });
});
