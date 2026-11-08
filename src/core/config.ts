import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export type NodeEnvironment = 'development' | 'production' | 'test';

export interface Config {
  root: string;
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  publicDir: string;
  designDir: string;
  adminUsername: string;
  adminPassword: string;
  sessionTtlSeconds: number;
  ticketTtlSeconds: number;
  maxBodyBytes: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  allowedOrigins: string[];
  locationRetentionHours: number;
  wsHeartbeatMs: number;
  wsMaxFrameBytes: number;
  seedDemoUsers: boolean;
  startJobs: boolean;
  dataVersion: string;
}

export type ConfigOverrides = Partial<Omit<Config, 'root'>> & { databasePath?: string };

function loadDotEnv(): Record<string, string> {
  const file = path.join(ROOT, '.env');
  const output: Record<string, string> = {};
  if (!existsSync(file)) return output;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[line.slice(0, index).trim()] = value;
  }
  return output;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid integer setting: ${value ?? 'undefined'}`);
  return parsed;
}

function environment(): Record<string, string | undefined> {
  return { ...loadDotEnv(), ...process.env } as Record<string, string | undefined>;
}

export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const env = environment();
  const nodeEnv = (overrides.nodeEnv ?? (env.NODE_ENV as NodeEnvironment) ?? 'development');
  if (!['development', 'production', 'test'].includes(nodeEnv)) throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
  const root = ROOT;
  const dataDir = path.resolve(root, overrides.dataDir ?? env.DATA_DIR ?? './data');
  const adminPassword = overrides.adminPassword ?? env.ADMIN_PASSWORD ?? 'change-me-before-production';
  const unsafeAdminPasswords = new Set([
    'change-me-before-production', 'DemoPass!2026', 'PreviewPass!2026', 'CIReleasePass!2026'
  ]);
  if (nodeEnv === 'production' && (unsafeAdminPasswords.has(adminPassword) || adminPassword.length < 12)) {
    throw new Error('ADMIN_PASSWORD must be a unique password of at least 12 characters before production startup');
  }
  const seedDemoUsers = overrides.seedDemoUsers ?? bool(env.SEED_DEMO_USERS, nodeEnv !== 'production');
  if (nodeEnv === 'production' && seedDemoUsers) {
    throw new Error('SEED_DEMO_USERS must be disabled in production');
  }
  const config: Config = {
    root,
    nodeEnv,
    host: overrides.host ?? env.HOST ?? '0.0.0.0',
    port: overrides.port ?? int(env.PORT, 3000, 0, 65535),
    dataDir,
    databasePath: overrides.databasePath ?? path.join(dataDir, 'borobiya.sqlite'),
    publicDir: overrides.publicDir ?? path.join(root, 'public'),
    designDir: overrides.designDir ?? path.join(root, 'design'),
    adminUsername: overrides.adminUsername ?? env.ADMIN_USERNAME ?? 'admin',
    adminPassword,
    sessionTtlSeconds: overrides.sessionTtlSeconds ?? int(env.SESSION_TTL_SECONDS, 86400, 60, 2592000),
    ticketTtlSeconds: overrides.ticketTtlSeconds ?? int(env.REALTIME_TICKET_TTL_SECONDS, 20, 5, 120),
    maxBodyBytes: overrides.maxBodyBytes ?? int(env.MAX_BODY_BYTES, 262144, 1024, 8 * 1024 * 1024),
    cookieSecure: overrides.cookieSecure ?? bool(env.COOKIE_SECURE, nodeEnv === 'production'),
    trustProxy: overrides.trustProxy ?? bool(env.TRUST_PROXY, false),
    allowedOrigins: overrides.allowedOrigins ?? (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    locationRetentionHours: overrides.locationRetentionHours ?? int(env.LOCATION_RETENTION_HOURS, 168, 1, 8760),
    wsHeartbeatMs: overrides.wsHeartbeatMs ?? int(env.WS_HEARTBEAT_MS, 25000, 1000, 120000),
    wsMaxFrameBytes: overrides.wsMaxFrameBytes ?? int(env.WS_MAX_FRAME_BYTES, 65536, 256, 1024 * 1024),
    seedDemoUsers,
    startJobs: overrides.startJobs ?? (nodeEnv !== 'test'),
    dataVersion: overrides.dataVersion ?? '2026-11-07-clean-1'
  };
  return config;
}

export function requestOrigin(req: IncomingMessage, config: Config): string {
  const forwardedProto = config.trustProxy && typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto'].split(',')[0].trim()
    : undefined;
  const forwardedHost = config.trustProxy && typeof req.headers['x-forwarded-host'] === 'string'
    ? req.headers['x-forwarded-host'].split(',')[0].trim().slice(0, 255)
    : undefined;
  const protocol = forwardedProto || ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
  const host = forwardedHost || req.headers.host || `localhost:${config.port}`;
  return `${protocol}://${host}`;
}

function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return value === pattern;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (match) => match === '*' ? '\u0000' : `\\${match}`);
  const regex = new RegExp(`^${escaped.replaceAll('\u0000', '.*')}$`);
  return regex.test(value);
}

export function originAllowed(origin: string | undefined, sameOrigin: string, config: Config): boolean {
  if (!origin) return true;
  if (origin === sameOrigin) return true;
  return config.allowedOrigins.some((pattern) => wildcardMatch(origin, pattern));
}

export function clientIp(req: IncomingMessage, config: Config): string {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim().slice(0, 128);
  }
  return (req.socket.remoteAddress || 'unknown').replace('::ffff:', '').slice(0, 128);
}

export function websocketOrigin(sameOrigin: string): string {
  return sameOrigin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}
