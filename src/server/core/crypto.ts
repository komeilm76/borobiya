/**
 * Cryptographic helpers built on Bun primitives only: `Bun.CryptoHasher`,
 * `Bun.password` (Argon2id) and the Web Crypto random source.
 */

const KEY_BYTES = 32;

/**
 * Generates a URL-safe random token.
 *
 * @param bytes Entropy in bytes before base64url encoding.
 * @returns A base64url token.
 */
export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Buffer.from(buffer).toString('base64url');
}

/**
 * Creates a prefixed, collision-resistant identifier such as `req_1f3c…`.
 *
 * @param prefix Short resource prefix.
 * @returns A stable identifier string.
 */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

/**
 * Hashes a value with SHA-256.
 *
 * @param value Text or bytes to hash.
 * @returns Lowercase hexadecimal digest.
 */
export function sha256(value: string | Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex');
}

/**
 * Hashes a bearer token before it is stored, so a database leak cannot mint sessions.
 *
 * @param token Raw session, ticket or reset token.
 * @returns A salted SHA-256 digest.
 */
export function tokenHash(token: string): string {
  return sha256(`borobiya.token.v1:${token}`);
}

/**
 * Constant-time comparison of two hexadecimal-safe strings.
 *
 * @param left First value.
 * @param right Second value.
 * @returns True when both values are byte-identical.
 */
export function safeHexEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

/**
 * Hashes a password with `Bun.password` (Argon2id) using the configured memory cost.
 *
 * @param password Plain-text password.
 * @returns A self-describing Argon2id hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 19, timeCost: 2 });
}

/**
 * Verifies a password against a stored Argon2id hash.
 * Unknown formats still perform a dummy hash so timing stays flat.
 *
 * @param password Candidate plain-text password.
 * @param stored Stored hash string.
 * @returns True when the password matches.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!/^\$argon2(?:id|i|d)\$/.test(stored)) {
    await hashPassword(password);
    return false;
  }
  try {
    return await Bun.password.verify(password, stored);
  } catch {
    await hashPassword(password);
    return false;
  }
}

/**
 * Parses a `Cookie` header into a plain object.
 *
 * @param header Raw cookie header.
 * @returns Cookie name/value pairs; malformed pairs are skipped.
 */
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  const output: Record<string, string> = {};
  if (!header) return output;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      output[key] = decodeURIComponent(value);
    } catch {
      // Malformed cookies are ignored; the session lookup simply fails.
    }
  }
  return output;
}

/**
 * Serialises the session cookie.
 *
 * @param value Session token (`sessionId.secret`).
 * @param maxAgeSeconds Cookie lifetime.
 * @param secure Whether to add the `Secure` attribute.
 * @returns A `Set-Cookie` value.
 */
export function sessionCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  const attributes = [
    `bb_session=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    ...(secure ? ['Secure'] : [])
  ];
  return attributes.join('; ');
}

/** Builds the expiring session cookie used on logout. */
export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}

/**
 * Splits and validates a session cookie value.
 *
 * @param value Raw cookie value.
 * @returns The session identifier and secret, or null when malformed.
 */
export function splitSessionToken(value: string | undefined): { sessionId: string; secret: string } | null {
  if (!value) return null;
  const [sessionId, secret, ...rest] = value.split('.');
  if (!sessionId || !secret || rest.length) return null;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId) || !/^[A-Za-z0-9_-]{16,128}$/.test(secret)) return null;
  return { sessionId, secret };
}

/**
 * Produces a bounded random integer below `max` for shuffling catalogs.
 *
 * @param max Exclusive upper bound.
 * @returns A random integer in `[0, max)`.
 */
export function randomInt(max: number): number {
  if (max <= 0) return 0;
  return Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * max);
}

