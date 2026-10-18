import type { FastifyRequest } from "fastify";

const MAX_USERNAME_LENGTH = 30;

/** Keep per-username rate-limit keys bounded before route validation runs. */
export function usernameRateLimitKey(request: FastifyRequest): string {
  const body = typeof request.body === "object" && request.body !== null
    ? request.body as { username?: unknown }
    : undefined;
  const suppliedUsername = body?.username;
  const username = typeof suppliedUsername === "string" &&
    suppliedUsername.length >= 3 &&
    suppliedUsername.length <= MAX_USERNAME_LENGTH &&
    /^[a-z0-9_]+$/.test(suppliedUsername)
    ? suppliedUsername
    : "<invalid>";
  return `${request.ip}:${username}`;
}
