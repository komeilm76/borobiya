export interface AccessTokenClaims {
  sub?: unknown;
  deviceId?: unknown;
  role?: unknown;
  exp?: unknown;
}

/**
 * Reads the claims of the account's own access token. The token is a credential the client
 * already holds and never sends to a third party, so decoding it locally is enough to know
 * which session/device this tab is; `GET /_user/devices` (T2.3.2) surfaces the same id as
 * `isCurrentDevice` for the settings UI.
 */
export function decodeAccessTokenClaims(accessToken: string | null | undefined): AccessTokenClaims | null {
  if (!accessToken || typeof atob !== "function") return null;
  const payloadPart = accessToken.split(".")[1];
  if (!payloadPart) return null;

  try {
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const claims = JSON.parse(decoded) as unknown;
    return typeof claims === "object" && claims !== null ? (claims as AccessTokenClaims) : null;
  } catch {
    return null;
  }
}

/** The `deviceId` claim of this session, or `null` for a malformed/non-JWT token. */
export function ownDeviceId(accessToken: string | null | undefined): string | null {
  const claims = decodeAccessTokenClaims(accessToken);
  return typeof claims?.deviceId === "string" && claims.deviceId.length > 0 ? claims.deviceId : null;
}
