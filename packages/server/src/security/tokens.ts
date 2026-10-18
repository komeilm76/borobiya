import { createHash, randomUUID } from "node:crypto";
import { idSchema } from "@borobiya/shared";
import type { UserRole } from "@borobiya/shared";
import { jwtVerify, SignJWT } from "jose";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionTokenIdentity {
  userId: string;
  role: UserRole;
  deviceId: string;
  sessionId: string;
}

const textEncoder = new TextEncoder();

async function signSessionToken(
  tokenUse: "access" | "refresh",
  identity: SessionTokenIdentity,
  secret: string,
  lifetimeSeconds: number
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: identity.role,
    deviceId: identity.deviceId,
    sessionId: identity.sessionId,
    tokenUse
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(identity.userId)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + lifetimeSeconds)
    .sign(textEncoder.encode(secret));
}

export function signAccessToken(identity: SessionTokenIdentity, secret: string): Promise<string> {
  return signSessionToken("access", identity, secret, ACCESS_TOKEN_TTL_SECONDS);
}

export function signRefreshToken(identity: SessionTokenIdentity, secret: string): Promise<string> {
  return signSessionToken("refresh", identity, secret, REFRESH_TOKEN_TTL_SECONDS);
}

async function verifySessionToken(
  token: string,
  secret: string,
  expectedUse: "access" | "refresh"
): Promise<SessionTokenIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, textEncoder.encode(secret), {
      algorithms: ["HS256"],
      requiredClaims: ["exp"]
    });
    const sessionId = typeof payload.sessionId === "string"
      ? payload.sessionId
      : typeof payload.jti === "string"
        ? payload.jti
        : undefined;
    if (
      payload.tokenUse !== expectedUse ||
      typeof payload.sub !== "string" ||
      !idSchema.safeParse(payload.sub).success ||
      typeof payload.deviceId !== "string" ||
      (payload.role !== "user" && payload.role !== "admin") ||
      !sessionId ||
      !idSchema.safeParse(sessionId).success
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      role: payload.role,
      deviceId: payload.deviceId,
      sessionId
    };
  } catch {
    return null;
  }
}

/** Verify an access-token signature, expiry, and claims; accept T1.2.2 jti session IDs during rollout. */
export function verifyAccessToken(token: string, secret: string): Promise<SessionTokenIdentity | null> {
  return verifySessionToken(token, secret, "access");
}

/** Verify a refresh-token signature, expiry, and claims; accept T1.2.2 jti session IDs during rollout. */
export function verifyRefreshToken(token: string, secret: string): Promise<SessionTokenIdentity | null> {
  return verifySessionToken(token, secret, "refresh");
}

/** SHA-256 is appropriate for high-entropy, randomly signed refresh tokens. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
