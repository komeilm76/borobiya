import { config as loadDotEnv } from "dotenv";
import { z } from "zod";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");
// Quiet: in Docker there is no repository .env file (Compose supplies the
// environment), and dotenv's "injected env" banner is only log noise there.
loadDotEnv({ path: repositoryEnvPath, quiet: true });

const secretSchema = z
  .string()
  .trim()
  .min(32, "Must contain at least 32 characters.")
  .refine((value) => !/replace-this|change-me/i.test(value), "Replace the example placeholder secret.");

const postgresUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "Must use the postgres:// or postgresql:// scheme.");

const openApiServerPathSchema = z
  .string()
  .trim()
  .regex(/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/, "Must be / or a safe absolute API path prefix.");

function splitCorsOrigins(value: string): string[] {
  return [...new Set(value.split(",").map((origin) => origin.trim()).filter(Boolean))];
}

function splitTrustedProxyIps(value: string): string[] {
  return [...new Set(value.split(",").map((ip) => ip.trim()).filter(Boolean))];
}

function isValidTrustedProxyIp(value: string): boolean {
  const [address, prefix, ...extraParts] = value.split("/");
  if (!address || extraParts.length > 0) return false;

  const ipVersion = isIP(address);
  if (ipVersion === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;

  const prefixLength = Number(prefix);
  const maxPrefixLength = ipVersion === 4 ? 32 : 128;
  // A /0 entry would trust every possible peer and defeat the allowlist.
  return prefixLength > 0 && prefixLength <= maxPrefixLength;
}

const rawServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: postgresUrlSchema,
  JWT_SECRET: secretSchema,
  JWT_REFRESH_SECRET: secretSchema,
  OPENAPI_SERVER_PATH: openApiServerPathSchema.default("/"),
  CORS_ORIGINS: z.string().trim().min(1),
  TRUSTED_PROXY_IPS: z.string().default(""),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1).max(2_147_483_647).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000_000).default(100)
}).superRefine((env, context) => {
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["JWT_REFRESH_SECRET"],
      message: "Must differ from JWT_SECRET."
    });
  }

  const origins = splitCorsOrigins(env.CORS_ORIGINS);
  if (origins.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["CORS_ORIGINS"],
      message: "Provide at least one explicit origin; wildcard origins are not allowed."
    });
  }

  origins.forEach((origin, index) => {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: `Entry ${index + 1} must be a valid HTTP(S) origin.`
      });
      return;
    }

    if (
      origin.includes("*") ||
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin ||
      parsedOrigin.username.length > 0 ||
      parsedOrigin.password.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: `Entry ${index + 1} must be an exact HTTP(S) origin without a path, credentials, or wildcard.`
      });
    }
  });

  const trustedProxyIps = splitTrustedProxyIps(env.TRUSTED_PROXY_IPS);
  trustedProxyIps.forEach((ip, index) => {
    if (!isValidTrustedProxyIp(ip)) {
      context.addIssue({
        code: "custom",
        path: ["TRUSTED_PROXY_IPS"],
        message: `Entry ${index + 1} must be an IP address or CIDR with a non-zero prefix.`
      });
    }
  });
});

export const serverEnvSchema = rawServerEnvSchema.transform((env) => ({
  nodeEnv: env.NODE_ENV,
  host: env.HOST,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtRefreshSecret: env.JWT_REFRESH_SECRET,
  openApiServerPath: env.OPENAPI_SERVER_PATH,
  corsOrigins: splitCorsOrigins(env.CORS_ORIGINS),
  trustedProxyIps: splitTrustedProxyIps(env.TRUSTED_PROXY_IPS),
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: env.RATE_LIMIT_MAX
}));

export type ServerConfig = z.output<typeof serverEnvSchema>;

/** Parse configuration without including secret values in validation errors. */
export function parseServerEnv(source: Record<string, string | undefined> = process.env): ServerConfig {
  const result = serverEnvSchema.safeParse(source);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `- ${issue.path.length > 0 ? issue.path.join(".") : "environment"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid server environment:\n${details}`);
}
