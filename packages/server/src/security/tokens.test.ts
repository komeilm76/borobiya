import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from "./tokens";

const secret = "a".repeat(48);
const identity = {
  userId: "00000000-0000-4000-8000-000000000001",
  role: "admin" as const,
  deviceId: "00000000-0000-4000-8000-000000000002",
  sessionId: "00000000-0000-4000-8000-000000000003"
};

async function signedToken(tokenUse: "access" | "refresh", includeExpiration: boolean): Promise<string> {
  const jwt = new SignJWT({
    role: identity.role,
    deviceId: identity.deviceId,
    sessionId: identity.sessionId,
    tokenUse
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(identity.userId)
    .setJti("00000000-0000-4000-8000-000000000004")
    .setIssuedAt();
  if (includeExpiration) jwt.setExpirationTime("15m");
  return jwt.sign(new TextEncoder().encode(secret));
}

describe("session-token verification", () => {
  it("accepts signed, unexpired access and refresh tokens with the expected use", async () => {
    const accessToken = await signAccessToken(identity, secret);
    const refreshToken = await signRefreshToken(identity, secret);

    expect(await verifyAccessToken(accessToken, secret)).toEqual(identity);
    expect(await verifyRefreshToken(refreshToken, secret)).toEqual(identity);
    expect(await verifyAccessToken(refreshToken, secret)).toBeNull();
    expect(await verifyRefreshToken(accessToken, secret)).toBeNull();
  });

  it.each(["access", "refresh"] as const)("rejects a signed %s token with no expiration", async (tokenUse) => {
    const token = await signedToken(tokenUse, false);
    const verified = tokenUse === "access"
      ? await verifyAccessToken(token, secret)
      : await verifyRefreshToken(token, secret);

    expect(verified).toBeNull();
  });

  it("rejects malformed database identifiers before callers use JWT claims in queries", async () => {
    const invalidUserId = await signAccessToken({ ...identity, userId: "not-a-uuid" }, secret);
    const invalidSessionId = await signRefreshToken({ ...identity, sessionId: "not-a-uuid" }, secret);

    expect(await verifyAccessToken(invalidUserId, secret)).toBeNull();
    expect(await verifyRefreshToken(invalidSessionId, secret)).toBeNull();
  });

  it("continues to accept legacy access tokens that used jti as the session ID", async () => {
    const legacyToken = new SignJWT({
      role: identity.role,
      deviceId: identity.deviceId,
      tokenUse: "access"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(identity.userId)
      .setJti(identity.sessionId)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(secret));

    expect(await verifyAccessToken(await legacyToken, secret)).toEqual(identity);
  });
});
