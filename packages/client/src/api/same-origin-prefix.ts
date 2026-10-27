/**
 * Only a root-relative URL path may prefix authenticated browser requests. In URL parsing,
 * `//host` and `/\\host` are both network-path references, not paths on this origin; a
 * configured prefix must never turn an Authorization header into a cross-origin request.
 * Keep this rule shared with Vite's proxy so an invalid setting falls back on both sides.
 */
const SAFE_PREFIX = /^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/;

export function sameOriginPrefix(value: string | undefined, fallback: string): string {
  const path = value?.trim().replace(/\/+$/, "");
  return path && SAFE_PREFIX.test(path) ? path : fallback;
}
