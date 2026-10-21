import { afterEach, describe, expect, it, vi } from "vitest";
import { realtimeConnectionOptions, socketPath } from "./socket-options";

const originalEnv = { ...import.meta.env };

afterEach(() => {
  vi.unstubAllEnvs();
  Object.assign(import.meta.env, originalEnv);
});

describe("realtime connection options", () => {
  it("uses the proxied /api/socket.io path by default", () => {
    expect(socketPath()).toBe("/api/socket.io");
  });

  it("follows a relative API prefix so one origin serves REST and sockets", () => {
    vi.stubEnv("VITE_API_URL", "/gateway/api");
    expect(socketPath()).toBe("/gateway/api/socket.io");
  });

  it("passes the access token through the handshake auth payload, not the query string", () => {
    const options = realtimeConnectionOptions("jwt-access-token");

    expect(options.auth).toEqual({ token: "jwt-access-token" });
    expect(options.path).toBe("/api/socket.io");
    expect(options.transports).toEqual(["websocket", "polling"]);
    expect(options.withCredentials).toBe(true);
    expect(options.reconnection).toBe(true);
    expect(options.autoConnect).toBe(false);
    expect(options.timeout).toBe(10_000);
  });
});
