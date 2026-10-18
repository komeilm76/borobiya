import { randomUUID } from "node:crypto";
import { apiRoutes } from "@borobiya/shared/api";
import { loginSchema } from "@borobiya/shared";
import type { FastifyInstance } from "fastify";
import { REFRESH_TOKEN_TTL_SECONDS, hashRefreshToken, signAccessToken, signRefreshToken } from "../security/tokens";
import { verifyPassword as argon2VerifyPassword } from "../security/password";
import type { UserLoginStore } from "../db/login-store";

export type PasswordVerifier = (hash: string, password: string) => Promise<boolean>;

export interface LoginRouteDependencies {
  store: UserLoginStore;
  jwtSecret: string;
  jwtRefreshSecret: string;
  verifyPassword?: PasswordVerifier;
}

/** Argon2id dummy hash keeps unknown-user and wrong-password failures on the same verification path. */
export const DUMMY_LOGIN_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$AHApo5m5DGT6zKjrS09uXw$lGqa37zJwlxc7HkKTOkZT+Tkm+oVpzvjP3WhvX3uoQE";

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function isLoginInput(value: unknown): value is { username?: unknown } {
  return typeof value === "object" && value !== null;
}

function refreshCookie(token: string): string {
  return [
    `refreshToken=${token}`,
    `Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

export async function registerLoginRoute(
  app: FastifyInstance,
  dependencies: LoginRouteDependencies
): Promise<void> {
  const route = apiRoutes.auth.login;
  const verifyPassword = dependencies.verifyPassword ?? argon2VerifyPassword;

  app.post(route.url, {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 15 * 60 * 1000,
        hook: "preHandler",
        keyGenerator: (request) => {
          const body = isLoginInput(request.body)
            ? request.body as { username?: unknown }
            : undefined;
          const username = typeof body?.username === "string" ? body.username.toLowerCase() : "<invalid>";
          return `${request.ip}:${username}`;
        }
      }
    }
  }, async (request, reply) => {
    // Match the guest-only prefix rule after rate limiting, so authenticated attempts count too.
    if (request.headers.authorization !== undefined) {
      return reply.code(403).send(errorResponse("ALREADY_AUTHENTICATED", "Log out before signing in again."));
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      ));
    }

    const user = await dependencies.store.findUserByUsername(parsed.data.username);
    const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_LOGIN_PASSWORD_HASH, parsed.data.password);
    if (!user || !passwordMatches) {
      return reply.code(401).send(errorResponse("INVALID_CREDENTIALS", "Invalid username or password."));
    }

    if (!user.isActive) {
      return reply.code(403).send(errorResponse("ACCOUNT_INACTIVE", "This account is inactive. Contact an administrator."));
    }
    if (user.isSuspended) {
      return reply.code(403).send(errorResponse("ACCOUNT_SUSPENDED", "This account is suspended. Contact an administrator."));
    }

    // The user flag is returned to the client; T1.2.6 will allow only question completion until it is cleared.
    const sessionId = randomUUID();
    const deviceId = randomUUID();
    const identity = { userId: user.id, role: user.role, deviceId, sessionId };
    const accessToken = await signAccessToken(identity, dependencies.jwtSecret);
    const refreshToken = await signRefreshToken(identity, dependencies.jwtRefreshSecret);

    await dependencies.store.createSession({
      id: sessionId,
      userId: user.id,
      deviceId,
      deviceName: request.headers["user-agent"]?.slice(0, 255) ?? null,
      refreshTokenHash: hashRefreshToken(refreshToken),
      ip: request.ip,
      lastActiveAt: new Date(),
      isOnline: true
    });

    const responseBody = {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        mustCompleteSecurityQuestions: user.mustCompleteSecurityQuestions
      }
    };
    const response = reply.code(200).header("cache-control", "no-store").header("vary", "Origin");

    // Browser requests carry Origin and keep the refresh JWT exclusively in an HttpOnly cookie.
    // Native clients omit Origin and receive it in the body for secure platform storage.
    if (request.headers.origin !== undefined) {
      return response.header("set-cookie", refreshCookie(refreshToken)).send(responseBody);
    }
    return response.send({ ...responseBody, refreshToken });
  });
}
