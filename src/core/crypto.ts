import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function deriveKey(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const KEY_BYTES = 32;

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function tokenHash(token: string): string {
  return sha256(`borobiya.token.v1:${token}`);
}

export function safeHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, KEY_BYTES, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await dummyVerify(password);
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![n, r, p].every((value) => Number.isSafeInteger(value) && value > 0)) {
    await dummyVerify(password);
    return false;
  }
  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const derived = await deriveKey(password, salt, expected.length, {
      N: n, r, p, maxmem: SCRYPT_MAXMEM
    });
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    await dummyVerify(password);
    return false;
  }
}

async function dummyVerify(password: string): Promise<void> {
  const salt = Buffer.alloc(16, 7);
  await deriveKey(password, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  if (!header) return output;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { output[key] = decodeURIComponent(value); } catch { /* ignore malformed cookie */ }
  }
  return output;
}

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

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}

export function splitSessionToken(value: string | undefined): { sessionId: string; secret: string } | null {
  if (!value) return null;
  const [sessionId, secret, ...rest] = value.split('.');
  if (!sessionId || !secret || rest.length) return null;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sessionId) || !/^[A-Za-z0-9_-]{16,128}$/.test(secret)) return null;
  return { sessionId, secret };
}
