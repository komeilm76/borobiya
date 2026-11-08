
/**
 * Runtime environment of the Bun process. The `NODE_ENV` variable name is retained
 * because every hosting provider, container image and reverse proxy already sets it;
 * the process itself is Bun.
 */
export type RuntimeEnvironment = 'development' | 'production' | 'test';

/** Fully resolved, validated runtime configuration. */
export interface Config {
  root: string;
  environment: RuntimeEnvironment;
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
  frameAncestors: string[];
  locationRetentionHours: number;
  wsHeartbeatMs: number;
  wsMaxFrameBytes: number;
  seedDemoUsers: boolean;
  startJobs: boolean;
  dataVersion: string;
}

/** Overrides accepted by {@link loadConfig}; used by tests and scripts. */
export type ConfigOverrides = Partial<Omit<Config, 'root'>> & { databasePath?: string };

/** True when a directory is the repository root (package manifest plus server sources). */
function isRepositoryRoot(directory: string): boolean {
  return Bun.file(`${directory}/package.json`).size > 0 && Bun.file(`${directory}/src/server/app.ts`).size > 0;
}

/**
 * Resolves the repository root without Node-specific path helpers.
 *
 * The module location is preferred so the server works from any working directory. Test
 * runners and bundlers may rewrite `import.meta.dir`, so the working directory and its
 * ancestors are used as a fallback instead of silently resolving to the filesystem root.
 *
 * @returns An absolute repository root path.
 */
function resolveRoot(): string {
  const moduleRoot = typeof import.meta.dir === 'string' ? pathResolve(import.meta.dir, '../../..') : '';
  if (moduleRoot && isRepositoryRoot(moduleRoot)) return moduleRoot;
  let directory = pathResolve(process.cwd());
  for (;;) {
    if (isRepositoryRoot(directory)) return directory;
    const parent = directory.slice(0, directory.lastIndexOf('/'));
    if (!parent || parent === directory) break;
    directory = parent;
  }
  throw new Error('Unable to locate the Borobiya repository root.');
}

/** Repository root, resolved from this module location without Node-specific helpers. */
export const ROOT = resolveRoot();

/**
 * Small POSIX path resolver so the server never depends on a Node compatibility module.
 * Borobiya deploys on Linux containers; every usage here is a repository-relative path.
 *
 * @param base Absolute base directory.
 * @param segments Path segments to append, which may include `..`.
 * @returns A normalised absolute path.
 */
export function pathResolve(base: string, ...segments: string[]): string {
  const joined = [base, ...segments].join('/');
  const absolute = joined.startsWith('/');
  const parts: string[] = [];
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${absolute ? '/' : ''}${parts.join('/')}`;
}

/** Reads a small UTF-8 text file synchronously without a Node compatibility module. */
function readFileSync(file: string): string {
  if (!file) return '';
  const result = Bun.spawnSync(['cat', file], { stdout: 'pipe', stderr: 'ignore' });
  return result.success ? result.stdout.toString() : '';
}

/**
 * Parses the text of a `.env` file.
 *
 * Kept separate from the file read so the format rules can be tested without depending on the
 * repository's own `.env`: blank lines, `#` comments, lines without `=`, and one layer of matching
 * single or double quotes around a value.
 *
 * @param text Raw file contents.
 * @returns The settings the file declares.
 */
export function parseDotEnv(text: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    output[line.slice(0, index).trim()] = value;
  }
  return output;
}

function loadDotEnv(): Record<string, string> {
  const file = Bun.file(pathResolve(ROOT, '.env'));
  if (!file.size) return {};
  return parseDotEnv(readFileSync(file.name ?? ''));
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid integer setting: ${value ?? 'undefined'}`);
  }
  return parsed;
}

function environment(): Record<string, string | undefined> {
  // Tests are hermetic: `tests/setup.ts` strips the repository `.env` from the environment, and
  // the file is not re-read here, so a developer's local settings can never change an assertion.
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'test') return { ...process.env } as Record<string, string | undefined>;
  return { ...loadDotEnv(), ...process.env } as Record<string, string | undefined>;
}

const UNSAFE_ADMIN_PASSWORDS = new Set([
  'change-me-before-production',
  'DemoPass!2026',
  'PreviewPass!2026',
  'CIReleasePass!2026'
]);

/**
 * Loads, merges and validates configuration from `.env`, the process environment and explicit overrides.
 *
 * @param overrides Values that win over the environment.
 * @returns An immutable-by-convention configuration object.
 * @throws When production safety rules or numeric bounds are violated.
 */
export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const env = environment();
  const runtimeEnvironment = overrides.environment ?? (env.NODE_ENV as RuntimeEnvironment) ?? 'development';
  if (!['development', 'production', 'test'].includes(runtimeEnvironment)) {
    throw new Error(`Invalid NODE_ENV: ${runtimeEnvironment}`);
  }
  const root = ROOT;
  const dataDir = pathResolve(root, overrides.dataDir ?? env.DATA_DIR ?? './data');
  const adminPassword = overrides.adminPassword ?? env.ADMIN_PASSWORD ?? 'change-me-before-production';
  // A one-way salted hash produced by Bazel-style sandboxes or other tooling is not a password;
  // only the documented banned values and short secrets are rejected here.
  if (runtimeEnvironment === 'production' && (UNSAFE_ADMIN_PASSWORDS.has(adminPassword) || adminPassword.length < 12)) {
    throw new Error('ADMIN_PASSWORD must be a unique password of at least 12 characters before production startup');
  }
  const seedDemoUsers = overrides.seedDemoUsers ?? bool(env.SEED_DEMO_USERS, runtimeEnvironment !== 'production');
  if (runtimeEnvironment === 'production' && seedDemoUsers) {
    throw new Error('SEED_DEMO_USERS must be disabled in production');
  }
  return {
    root,
    environment: runtimeEnvironment,
    host: overrides.host ?? env.HOST ?? '0.0.0.0',
    port: overrides.port ?? int(env.PORT, 3000, 0, 65535),
    dataDir,
    databasePath: overrides.databasePath ?? pathResolve(dataDir, 'borobiya.sqlite'),
    publicDir: overrides.publicDir ?? pathResolve(root, 'public'),
    designDir: overrides.designDir ?? pathResolve(root, 'design'),
    adminUsername: overrides.adminUsername ?? env.ADMIN_USERNAME ?? 'admin',
    adminPassword,
    sessionTtlSeconds: overrides.sessionTtlSeconds ?? int(env.SESSION_TTL_SECONDS, 86400, 60, 2592000),
    ticketTtlSeconds: overrides.ticketTtlSeconds ?? int(env.REALTIME_TICKET_TTL_SECONDS, 20, 5, 120),
    maxBodyBytes: overrides.maxBodyBytes ?? int(env.MAX_BODY_BYTES, 262144, 1024, 8 * 1024 * 1024),
    // A production runtime always issues secure cookies, whatever a stray local value says.
    cookieSecure: overrides.cookieSecure
      ?? (runtimeEnvironment === 'production' || bool(env.COOKIE_SECURE, false)),
    trustProxy: overrides.trustProxy ?? bool(env.TRUST_PROXY, false),
    allowedOrigins: overrides.allowedOrigins ?? (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    frameAncestors: (overrides.frameAncestors ?? frameAncestorSources(env.FRAME_ANCESTORS ?? '')).filter(validFrameAncestor),
    locationRetentionHours: overrides.locationRetentionHours ?? int(env.LOCATION_RETENTION_HOURS, 168, 1, 8760),
    wsHeartbeatMs: overrides.wsHeartbeatMs ?? int(env.WS_HEARTBEAT_MS, 25000, 1000, 120000),
    wsMaxFrameBytes: overrides.wsMaxFrameBytes ?? int(env.WS_MAX_FRAME_BYTES, 65536, 256, 1024 * 1024),
    seedDemoUsers,
    startJobs: overrides.startJobs ?? (runtimeEnvironment !== 'test'),
    dataVersion: overrides.dataVersion ?? '2026-11-08-bun-1'
  };
}

function validFrameAncestor(source: string): boolean {
  return source === "'self'" || source === "'none'"
    || /^https:\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?$/i.test(source)
    || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i.test(source);
}

function frameAncestorSources(value: string): string[] {
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(validFrameAncestor);
}

/** Minimal request shape needed to derive the externally visible origin. */
export interface OriginRequestLike {
  headers: Headers;
}

/**
 * Resolves the externally visible origin, honouring trusted proxy headers.
 *
 * @param request Incoming Bun request (or anything exposing a `Headers` instance).
 * @param config Runtime configuration.
 * @returns The absolute origin, for example `https://3000-example.e2b.app`.
 */
export function requestOrigin(request: OriginRequestLike, config: Config): string {
  const forwardedProto = config.trustProxy ? request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() : undefined;
  const forwardedHost = config.trustProxy ? request.headers.get('x-forwarded-host')?.split(',')[0]?.trim().slice(0, 255) : undefined;
  const host = forwardedHost || request.headers.get('host') || `localhost:${config.port}`;
  const protocol = forwardedProto === 'https' || forwardedProto === 'http' ? forwardedProto : 'http';
  return `${protocol}://${host}`;
}

function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return value === pattern;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (match) => (match === '*' ? '\u0000' : `\\${match}`));
  const regex = new RegExp(`^${escaped.replaceAll('\u0000', '.*')}$`);
  return regex.test(value);
}

/**
 * Decides whether an `Origin` header may talk to this deployment.
 *
 * @param origin Request origin, if sent.
 * @param sameOrigin The origin the request was addressed to.
 * @param config Runtime configuration.
 * @returns True when the origin is same-origin or matched by an explicit pattern.
 */
export function originAllowed(origin: string | undefined | null, sameOrigin: string, config: Config): boolean {
  if (!origin) return true;
  if (origin === sameOrigin) return true;
  return config.allowedOrigins.some((pattern) => wildcardMatch(origin, pattern));
}

/**
 * Resolves the client address used for rate limiting, session binding and audit records.
 * Only trusted proxies may supply `X-Forwarded-For`, matching the origin-trust policy.
 *
 * @param request Incoming request.
 * @param config Runtime configuration.
 * @returns A bounded textual address.
 */
export function clientIpFromRequest(request: Request, config: Config): string {
  if (config.trustProxy) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded && forwarded.trim()) return forwarded.split(',')[0].trim().slice(0, 128);
  }
  const direct = (request as { ip?: string }).ip;
  return (direct ?? 'unknown').replace('::ffff:', '').slice(0, 128);
}

/** Converts an `http(s)` origin to its `ws(s)` equivalent for CSP. */
export function websocketOrigin(sameOrigin: string): string {
  return sameOrigin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}
