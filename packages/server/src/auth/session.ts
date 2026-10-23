import { apiRoutes } from "@borobiya/shared/api";
import { refreshBodySchema } from "@borobiya/shared";
import { decodeJwt } from "jose";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserLoginStore } from "../db/login-store";
import { disconnectSessionSockets, type SocketDisconnector } from "../realtime/socket";
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "../security/tokens";
import { expiredRefreshTokenCookie, refreshCookieOptionsForRequest, refreshTokenCookie } from "./cookies";

export interface SessionRouteDependencies {
  store: UserLoginStore;
  jwtSecret: string;
  jwtRefreshSecret: string;
  io?: SocketDisconnector;
}

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function isAuthenticated(request: FastifyRequest): boolean {
  return request.headers.authorization !== undefined;
}

function isBrowserRequest(request: FastifyRequest): boolean {
  return request.headers.origin !== undefined;
}

function suppliedRefreshToken(request: FastifyRequest, bodyToken: string | undefined): string | undefined {
  // A body token is preferred when both transports are present; browser clients normally send only a cookie.
  return bodyToken ?? request.cookies?.refreshToken;
}

type RefreshRejectionReason = "missing_token" | "token_invalid" | "session_mismatch" | "rotation_conflict";

function invalidRefreshReply(reply: FastifyReply, request: FastifyRequest, reason: RefreshRejectionReason) {
  // The client only ever sees INVALID_REFRESH; the reason exists so operators
  // can tell a missing cookie from a stale/rotated token while debugging.
  request.log.info({ refreshRejectionReason: reason }, "refresh token rejected");
  const base = reply.code(401).header("cache-control", "no-store");
  const target = reason === "token_invalid" ? clearCookieOnBrowserResponse(base, request) : base;
  return target.send(errorResponse("INVALID_REFRESH", "The refresh token is invalid or expired."));
}

function clearCookieOnBrowserResponse(reply: FastifyReply, request: FastifyRequest): FastifyReply {
  return isBrowserRequest(request) ? reply.header("set-cookie", expiredRefreshTokenCookie(refreshCookieOptionsForRequest(request))) : reply;
}

export async function registerSessionRoutes(
  app: FastifyInstance,
  dependencies: SessionRouteDependencies
): Promise<void> {
  app.post(apiRoutes.auth.refresh.url, async (request, reply) => {
    if (isAuthenticated(request)) {
      return reply.code(403).send(errorResponse("ALREADY_AUTHENTICATED", "Use the refresh token without an access token."));
    }

    const parsedBody = refreshBodySchema.optional().safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsedBody.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      ));
    }

    const refreshToken = suppliedRefreshToken(request, parsedBody.data?.refreshToken);
    if (!refreshToken) return invalidRefreshReply(reply, request, "missing_token");

    const tokenIdentity = await verifyRefreshToken(refreshToken, dependencies.jwtRefreshSecret);
    if (!tokenIdentity) return invalidRefreshReply(reply, request, "token_invalid");

    const currentTokenHash = hashRefreshToken(refreshToken);
    const session = await dependencies.store.findSessionByRefreshTokenHash(currentTokenHash);
    if (
      !session ||
      session.id !== tokenIdentity.sessionId ||
      session.userId !== tokenIdentity.userId ||
      session.deviceId !== tokenIdentity.deviceId
    ) {
      return invalidRefreshReply(reply, request, "session_mismatch");
    }

    if (!session.isActive || session.isSuspended) {
      await dependencies.store.revokeSession(session.id, session.userId);
      disconnectSessionSockets(dependencies.io, session.id);
      const code = session.isActive ? "ACCOUNT_SUSPENDED" : "ACCOUNT_INACTIVE";
      const message = session.isActive
        ? "This account is suspended. Contact an administrator."
        : "This account is inactive. Contact an administrator.";
      return clearCookieOnBrowserResponse(
        reply.code(403).header("cache-control", "no-store"),
        request
      ).send(errorResponse(code, message));
    }

    const identity = {
      userId: session.userId,
      role: session.role,
      deviceId: session.deviceId,
      sessionId: session.id
    };
    const accessToken = await signAccessToken(identity, dependencies.jwtSecret);
    const nextRefreshToken = await signRefreshToken(identity, dependencies.jwtRefreshSecret);
    const rotated = await dependencies.store.rotateRefreshToken({
      sessionId: session.id,
      currentTokenHash,
      nextTokenHash: hashRefreshToken(nextRefreshToken),
      lastActiveAt: new Date()
    });
    if (!rotated) return invalidRefreshReply(reply, request, "rotation_conflict");

    const response = reply.code(200).header("cache-control", "no-store").header("vary", "Origin");
    if (isBrowserRequest(request)) {
      return response.header("set-cookie", refreshTokenCookie(nextRefreshToken, refreshCookieOptionsForRequest(request))).send({ accessToken });
    }
    return response.send({ accessToken, refreshToken: nextRefreshToken });
  });

  app.post(apiRoutes.auth.logout.url, async (request, reply) => {
    if (isAuthenticated(request)) {
      return reply.code(403).send(errorResponse("ALREADY_AUTHENTICATED", "Log out using the refresh token."));
    }

    const parsedBody = refreshBodySchema.optional().safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsedBody.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      ));
    }

    const refreshToken = suppliedRefreshToken(request, parsedBody.data?.refreshToken);
    if (refreshToken) {
      const tokenIdentity = await verifyRefreshToken(refreshToken, dependencies.jwtRefreshSecret);
      if (tokenIdentity) {
        // Revoke by session as well as hash so logout racing with token rotation still ends the session.
        await dependencies.store.revokeSession(tokenIdentity.sessionId, tokenIdentity.userId);
        disconnectSessionSockets(dependencies.io, tokenIdentity.sessionId);
      } else {
        // This also revokes an expired token still present in the session row.
        const revoked = await dependencies.store.revokeSessionByRefreshTokenHash(hashRefreshToken(refreshToken));
        if (revoked) {
          try {
            const claims = decodeJwt(refreshToken);
            if (typeof claims.sessionId === "string") {
              disconnectSessionSockets(dependencies.io, claims.sessionId);
            }
          } catch {
            // Malformed tokens have no valid session room to evict.
          }
        }
      }
    }

    return reply
      .code(200)
      .header("cache-control", "no-store")
      .header("set-cookie", expiredRefreshTokenCookie(refreshCookieOptionsForRequest(request)))
      .send({ ok: true });
  });
}
