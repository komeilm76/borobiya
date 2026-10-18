import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { allApiRoutes, apiRoutes } from "@borobiya/shared/api";
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

  it("serves Swagger UI and documents shared contracts without fake runtime routes", async () => {
    const app = await makeApp();
    const ui = await app.inject({ method: "GET", url: "/docs" });
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(ui.statusCode).toBe(200);
    expect(ui.headers["content-type"]).toContain("text/html");
    expect(ui.body).toContain("swagger-ui-bundle.js");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const document = response.json();
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>;
    const operationCount = Object.values(paths).reduce((count, pathItem) => count + Object.keys(pathItem).length, 0);
    const refresh = paths["/_auth/refresh"]?.post;
    const registration = paths["/_auth/register"]?.post;
    const login = paths["/_auth/login"]?.post;
    const logout = paths["/_auth/logout"]?.post;
    const forgotRequest = paths["/_auth/forgot-password/request"]?.post;
    const forgotVerify = paths["/_auth/forgot-password/verify"]?.post;
    const forgotReset = paths["/_auth/forgot-password/reset"]?.post;
    const adminCreateUser = paths["/_admin/users"]?.post;
    const completeSecurityQuestions = paths["/_user/complete-security-questions"]?.post;
    const refreshParameters = refresh?.parameters as Array<Record<string, unknown>>;
    const userProfile = paths["/_user/me"]?.get;
    const revokeShare = paths["/_user/location/share/{shareId}"]?.delete;
    const mapStyle = paths["/_public/map/styles/{theme}.json"]?.get;
    const mapStyleParameters = mapStyle?.parameters as Array<Record<string, unknown>>;
    const uploadPhoto = paths["/_user/sos/requests/{id}/photo"]?.post;

    expect(document.openapi).toBe("3.0.3");
    expect(document.servers).toEqual([{ url: "/" }]);
    expect(operationCount).toBe(allApiRoutes.length);
    expect(document.info.description).toContain("contract-only");
    expect(paths["/_public/health"]?.get?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(paths["/_public/health"]?.get?.responses).toHaveProperty("429");
    expect(registration?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(registration?.responses).toMatchObject({
      201: expect.any(Object),
      400: expect.any(Object),
      403: expect.any(Object),
      409: expect.any(Object),
      429: expect.any(Object)
    });
    expect(login?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(login?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      429: expect.any(Object)
    });
    expect(refresh?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(refresh?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 401: expect.any(Object), 403: expect.any(Object) });
    expect(refresh?.requestBody).toMatchObject({ required: false });
    expect(logout?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(logout?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 401: expect.any(Object), 403: expect.any(Object) });
    expect(forgotRequest?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(forgotRequest?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 403: expect.any(Object), 429: expect.any(Object), 503: expect.any(Object) });
    expect(forgotVerify?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(forgotVerify?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 403: expect.any(Object), 429: expect.any(Object) });
    expect(forgotReset?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(forgotReset?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 403: expect.any(Object), 429: expect.any(Object) });
    expect(adminCreateUser?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(adminCreateUser?.["x-borobiya-access"]).toBe("admin");
    expect(adminCreateUser?.security).toEqual([{ bearerAuth: [] }]);
    expect(adminCreateUser?.responses).toMatchObject({
      201: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      409: expect.any(Object),
      429: expect.any(Object)
    });
    expect(adminCreateUser?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["username", "password"],
            properties: {
              username: expect.any(Object),
              password: expect.any(Object),
              isActive: expect.any(Object)
            }
          }
        }
      }
    });
    expect(adminCreateUser?.requestBody).not.toHaveProperty("content.application/json.schema.properties.securityQuestions");
    const adminCreateSuccessResponse = adminCreateUser?.responses as {
      201?: { content?: { "application/json"?: { schema?: unknown } } };
    };
    expect(adminCreateSuccessResponse?.[201]?.content?.["application/json"]?.schema).toMatchObject({
      type: "object",
      properties: {
        id: expect.any(Object),
        username: expect.any(Object),
        role: expect.any(Object),
        mustCompleteSecurityQuestions: expect.any(Object),
        isActive: expect.any(Object),
        avgRating: expect.any(Object),
        createdAt: expect.any(Object)
      }
    });
    expect(completeSecurityQuestions?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(completeSecurityQuestions?.["x-borobiya-access"]).toBe("authenticated");
    expect(completeSecurityQuestions?.security).toEqual([{ bearerAuth: [] }]);
    expect(completeSecurityQuestions?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      409: expect.any(Object),
      429: expect.any(Object)
    });
    expect(completeSecurityQuestions?.requestBody).toHaveProperty("content.application/json.schema.properties.securityQuestions");
    expect(refreshParameters).toContainEqual({
      name: "refreshToken",
      in: "cookie",
      required: false,
      schema: { type: "string", minLength: 1 }
    });
    expect(userProfile?.security).toEqual([{ bearerAuth: [] }]);
    expect(mapStyleParameters).toContainEqual({
      name: "theme",
      in: "path",
      required: true,
      schema: { type: "string", enum: ["light", "dark"] }
    });
    expect(uploadPhoto?.requestBody).toHaveProperty("content.multipart/form-data");
    expect(revokeShare?.responses).toHaveProperty("200", {
      description: "Successful response with no response body."
    });

    const missingRefreshToken = await app.inject({ method: "POST", url: "/_auth/refresh" });
    expect(missingRefreshToken.statusCode).toBe(401);
    expect(missingRefreshToken.json()).toMatchObject({ code: "INVALID_REFRESH" });

    const missingAdminToken = await app.inject({ method: "POST", url: "/_admin/users", payload: {} });
    expect(missingAdminToken.statusCode).toBe(401);
    expect(missingAdminToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingUserToken = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      payload: {}
    });
    expect(missingUserToken.statusCode).toBe(401);
    expect(missingUserToken.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("advertises the gateway API prefix while retaining the direct API server", async () => {
    const app = await makeApp({ openApiServerPath: "/api" });
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.statusCode).toBe(200);
    expect(response.json().servers).toEqual([{ url: "/api" }, { url: "/" }]);
  });

  it("registers the shared map-style descriptor using Fastify path syntax", async () => {
    const app = await makeApp();
    const route = apiRoutes.public.mapStyle;
    app.get(route.makeExpressPathShape(), async (request) => ({
      theme: (request.params as { theme: string }).theme
    }));

    const response = await app.inject({ method: "GET", url: route.makeFullPath({ theme: "light" }) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ theme: "light" });
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
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/_user/me",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization"
      }
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(preflight.headers["access-control-allow-headers"]).toContain("authorization");
  });

  it("ignores spoofed forwarded IP headers unless the proxy is trusted", async () => {
    const app = await makeApp({ rateLimitMax: 1 });
    const first = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { "x-forwarded-for": "203.0.113.1" }
    });
    const second = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { "x-forwarded-for": "203.0.113.2" }
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ error: true, code: "RATE_LIMITED", issues: [] });
  });

  it("uses the forwarded client IP when the immediate proxy is allowlisted", async () => {
    const app = await makeApp({ rateLimitMax: 1, trustedProxyIps: ["127.0.0.1"] });
    const firstClient = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { "x-forwarded-for": "203.0.113.1" }
    });
    const secondClient = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { "x-forwarded-for": "203.0.113.2" }
    });
    const repeatedClient = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { "x-forwarded-for": "203.0.113.1" }
    });

    expect(firstClient.statusCode).toBe(200);
    expect(secondClient.statusCode).toBe(200);
    expect(repeatedClient.statusCode).toBe(429);
  });
});
