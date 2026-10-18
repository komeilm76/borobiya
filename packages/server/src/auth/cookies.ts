import { REFRESH_TOKEN_TTL_SECONDS } from "../security/tokens";

/** Leave Path unset so browsers derive a path that includes the direct/gateway API prefix. */
export function refreshTokenCookie(token: string): string {
  return [
    `refreshToken=${token}`,
    `Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

export function expiredRefreshTokenCookie(): string {
  return [
    "refreshToken=",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}
