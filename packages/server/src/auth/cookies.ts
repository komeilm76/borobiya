import { REFRESH_TOKEN_TTL_SECONDS } from "../security/tokens";

export interface RefreshCookieOptions {
  /**
   * Emit the `Secure` attribute. Browsers silently drop `Secure` cookies
   * received over plain HTTP on non-localhost origins, which broke session
   * persistence for the LAN dev stack (login succeeded, but the refresh
   * cookie was never stored, so every reload returned 401). Only request
   * `Secure` when the response actually travels over HTTPS.
   */
  secure: boolean;
}

/**
 * Fastify derives `request.protocol` from `X-Forwarded-Proto` when the proxy
 * is in TRUSTED_PROXY_IPS (the Compose nginx), and from the socket otherwise,
 * so this tracks the browser-visible scheme in both topologies.
 */
export function refreshCookieOptionsForRequest(request: { protocol: string }): RefreshCookieOptions {
  return { secure: request.protocol === "https" };
}

/** Leave Path unset so browsers derive a path that includes the direct/gateway API prefix. */
export function refreshTokenCookie(token: string, options: RefreshCookieOptions): string {
  return [
    `refreshToken=${token}`,
    `Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`,
    "HttpOnly",
    ...(options.secure ? ["Secure"] : []),
    "SameSite=Lax"
  ].join("; ");
}

export function expiredRefreshTokenCookie(options: RefreshCookieOptions): string {
  return [
    "refreshToken=",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    ...(options.secure ? ["Secure"] : []),
    "SameSite=Lax"
  ].join("; ");
}
