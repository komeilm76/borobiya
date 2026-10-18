import { apiRoutes } from "@borobiya/shared/api";
import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config/env";
import { createDatabase } from "./db/client";
import { DrizzleUserRegistrationStore, type UserRegistrationStore } from "./db/registration-store";
import { registerAuthRoutes, type PasswordHasher } from "./auth/register";
import { registerHttpSecurityPlugins } from "./plugins/security";
import { registerSwagger } from "./plugins/swagger";

const sensitiveLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.cookies.refreshToken",
  "req.body.password",
  "req.body.confirmPassword",
  "req.body.newPassword",
  "req.body.answer",
  "req.body.securityQuestions[*].answer",
  "req.body.answers[*].answer",
  "req.body.refreshToken",
  "req.body.resetToken"
];

export interface FastifyAppDependencies {
  /** Override persistence in tests; production defaults to the configured PostgreSQL database. */
  registrationStore?: UserRegistrationStore;
  /** Override hashing in tests; production defaults to the Argon2id helper. */
  hashPassword?: PasswordHasher;
}

export async function createFastifyApp(
  config: ServerConfig,
  dependencies: FastifyAppDependencies = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.trustedProxyIps.length > 0 ? config.trustedProxyIps : false,
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info",
      redact: { paths: sensitiveLogPaths, censor: "[REDACTED]" }
    }
  });

  await registerHttpSecurityPlugins(app, config);
  await registerSwagger(app, config.openApiServerPath);

  const database = dependencies.registrationStore ? undefined : createDatabase(config.databaseUrl);
  const registrationStore = dependencies.registrationStore ?? new DrizzleUserRegistrationStore(database!.db);
  await registerAuthRoutes(app, { store: registrationStore, hashPassword: dependencies.hashPassword });

  if (database) {
    app.addHook("onClose", async () => {
      await database.client.end();
    });
  }

  app.get(apiRoutes.public.health.url, async () => ({
    status: "ok" as const,
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? "0.1.0"
  }));

  return app;
}
