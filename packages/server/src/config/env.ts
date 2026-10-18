import { config as loadDotEnv } from "dotenv";
import { z } from "zod";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");
loadDotEnv({ path: repositoryEnvPath });

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

function splitCorsOrigins(value: string): string[] {
  return [...new Set(value.split(",").map((origin) => origin.trim()).filter(Boolean))];
}

const rawServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: postgresUrlSchema,
  JWT_SECRET: secretSchema,
  JWT_REFRESH_SECRET: secretSchema,
  CORS_ORIGINS: z.string().trim().min(1),
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
});

export const serverEnvSchema = rawServerEnvSchema.transform((env) => ({
  nodeEnv: env.NODE_ENV,
  host: env.HOST,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtRefreshSecret: env.JWT_REFRESH_SECRET,
  corsOrigins: splitCorsOrigins(env.CORS_ORIGINS),
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
