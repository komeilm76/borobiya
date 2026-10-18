import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { usernameRateLimitKey } from "./rate-limit";

function request(body: unknown): FastifyRequest {
  return { ip: "203.0.113.1", body } as unknown as FastifyRequest;
}

describe("username rate-limit key", () => {
  it("uses lowercase usernames as exact per-IP buckets without aliasing invalid variants", () => {
    expect(usernameRateLimitKey(request({ username: "rescue_user1" }))).toBe("203.0.113.1:rescue_user1");
    expect(usernameRateLimitKey(request({ username: "RESCUE_USER1" }))).toBe("203.0.113.1:<invalid>");
    expect(usernameRateLimitKey(request({ username: "rescue-user1" }))).toBe("203.0.113.1:<invalid>");
  });

  it("uses one bounded bucket for oversized usernames before schema validation", () => {
    const first = "a".repeat(31);
    const second = "b".repeat(1_000_000);

    expect(usernameRateLimitKey(request({ username: first }))).toBe("203.0.113.1:<invalid>");
    expect(usernameRateLimitKey(request({ username: second }))).toBe("203.0.113.1:<invalid>");
  });

  it("uses a bounded fallback key for malformed request bodies", () => {
    expect(usernameRateLimitKey(request(null))).toBe("203.0.113.1:<invalid>");
    expect(usernameRateLimitKey(request({ username: 7 }))).toBe("203.0.113.1:<invalid>");
  });
});
