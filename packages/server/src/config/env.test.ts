import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173, http://localhost:3000"
};

describe("server environment validation", () => {
  it("applies safe defaults and normalizes the CORS allowlist", () => {
    expect(parseServerEnv(validEnv)).toEqual({
      nodeEnv: "test",
      host: "0.0.0.0",
      port: 3000,
      databaseUrl: validEnv.DATABASE_URL,
      jwtSecret: validEnv.JWT_SECRET,
      jwtRefreshSecret: validEnv.JWT_REFRESH_SECRET,
      openApiServerPath: "/",
      corsOrigins: ["http://localhost:5173", "http://localhost:3000"],
      trustedProxyIps: [],
      rateLimitWindowMs: 60_000,
      rateLimitMax: 100
    });
  });

  it("rejects weak or reused JWT secrets without echoing their values", () => {
    expect(() => parseServerEnv({
      ...validEnv,
      JWT_SECRET: "short-secret",
      JWT_REFRESH_SECRET: "short-secret"
    })).toThrow(/JWT_SECRET: Must contain at least 32 characters/);

    expect(() => parseServerEnv({
      ...validEnv,
      JWT_SECRET: "same-secret-value-01234567890123456789",
      JWT_REFRESH_SECRET: "same-secret-value-01234567890123456789"
    })).toThrow(/JWT_REFRESH_SECRET: Must differ from JWT_SECRET/);

    let errorMessage = "";
    try {
      parseServerEnv({ ...validEnv, JWT_SECRET: "short-sensitive-value" });
    } catch (error) {
      errorMessage = String(error);
    }
    expect(errorMessage).toMatch(/JWT_SECRET/);
    expect(errorMessage).not.toContain("short-sensitive-value");
  });

  it("rejects wildcard and non-origin CORS entries", () => {
    expect(() => parseServerEnv({ ...validEnv, CORS_ORIGINS: "*" })).toThrow(/CORS_ORIGINS/);
    expect(() => parseServerEnv({ ...validEnv, CORS_ORIGINS: "http://localhost:5173/app" })).toThrow(/CORS_ORIGINS/);
    expect(() => parseServerEnv({ ...validEnv, CORS_ORIGINS: "file:///tmp" })).toThrow(/CORS_ORIGINS/);
  });

  it("validates an OpenAPI base path for direct and gateway deployments", () => {
    expect(parseServerEnv({ ...validEnv, OPENAPI_SERVER_PATH: "/api" }).openApiServerPath).toBe("/api");
    expect(() => parseServerEnv({ ...validEnv, OPENAPI_SERVER_PATH: "//attacker.example" })).toThrow(/OPENAPI_SERVER_PATH/);
    expect(() => parseServerEnv({ ...validEnv, OPENAPI_SERVER_PATH: "api" })).toThrow(/OPENAPI_SERVER_PATH/);
  });

  it("validates an explicit trusted-proxy IP/CIDR allowlist", () => {
    const config = parseServerEnv({
      ...validEnv,
      TRUSTED_PROXY_IPS: "127.0.0.1, 10.20.0.0/16,127.0.0.1"
    });
    expect(config.trustedProxyIps).toEqual(["127.0.0.1", "10.20.0.0/16"]);

    expect(() => parseServerEnv({ ...validEnv, TRUSTED_PROXY_IPS: "proxy.internal" })).toThrow(/TRUSTED_PROXY_IPS/);
    expect(() => parseServerEnv({ ...validEnv, TRUSTED_PROXY_IPS: "0.0.0.0/0" })).toThrow(/TRUSTED_PROXY_IPS/);
    expect(() => parseServerEnv({ ...validEnv, TRUSTED_PROXY_IPS: "192.168.0.1/33" })).toThrow(/TRUSTED_PROXY_IPS/);
  });

  it("rejects invalid ports and non-Postgres database URLs", () => {
    expect(() => parseServerEnv({ ...validEnv, PORT: "70000" })).toThrow(/PORT/);
    expect(() => parseServerEnv({ ...validEnv, DATABASE_URL: "https://db.example.test" })).toThrow(/DATABASE_URL/);
  });
});
