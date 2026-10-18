import { createHash } from "node:crypto";
import type { UserRole } from "@borobiya/shared";
import { SignJWT } from "jose";

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
    tokenUse
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(identity.userId)
    .setJti(identity.sessionId)
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

/** SHA-256 is appropriate for high-entropy, randomly signed refresh tokens. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
