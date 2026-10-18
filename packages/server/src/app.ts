import { apiRoutes } from "@borobiya/shared/api";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config/env";
import { createDatabase } from "./db/client";
import { DrizzleUserLoginStore, type UserLoginStore } from "./db/login-store";
import { DrizzleUserRegistrationStore, type UserRegistrationStore } from "./db/registration-store";
import { registerLoginRoute, type PasswordVerifier } from "./auth/login";
import { registerSessionRoutes } from "./auth/session";
import { registerForgotPasswordRoutes, type SecurityAnswerVerifier } from "./auth/forgot-password";
import { DrizzleUserRecoveryStore, type UserRecoveryStore } from "./db/recovery-store";
import { DrizzleAdminUserStore, type AdminUserStore } from "./db/admin-user-store";
import {
  DrizzleUserSecurityQuestionsStore,
  type UserSecurityQuestionsStore
} from "./db/security-questions-store";
import { registerUserSecurityQuestionsRoute } from "./auth/user-security-questions";
import { registerAdminUserRoutes } from "./admin/users";
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
  /** Override registration persistence in tests; production defaults to the configured PostgreSQL database. */
  registrationStore?: UserRegistrationStore;
  /** Override login/session persistence in tests; production defaults to the configured PostgreSQL database. */
  loginStore?: UserLoginStore;
  /** Override password-recovery persistence in tests; production defaults to the configured PostgreSQL database. */
  recoveryStore?: UserRecoveryStore;
  /** Override admin user creation and current admin-account checks in tests. */
  adminUserStore?: AdminUserStore;
  /** Override user authorization/onboarding persistence in tests. */
  securityQuestionsStore?: UserSecurityQuestionsStore;
  /** Override registration hashing in tests; production defaults to the Argon2id helper. */
  hashPassword?: PasswordHasher;
  /** Override login password verification in tests; production uses Argon2id. */
  verifyPassword?: PasswordVerifier;
  /** Override recovery-answer verification in tests; production uses Argon2id. */
  verifySecurityAnswer?: SecurityAnswerVerifier;
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

  await app.register(cookie);
  await registerHttpSecurityPlugins(app, config);
  await registerSwagger(app, config.openApiServerPath);

  const hasInjectedStores =
    dependencies.registrationStore !== undefined &&
    dependencies.loginStore !== undefined &&
    dependencies.recoveryStore !== undefined &&
    dependencies.adminUserStore !== undefined &&
    dependencies.securityQuestionsStore !== undefined;
  const database = hasInjectedStores ? undefined : createDatabase(config.databaseUrl);
  const registrationStore = dependencies.registrationStore ?? new DrizzleUserRegistrationStore(database!.db);
  const loginStore = dependencies.loginStore ?? new DrizzleUserLoginStore(database!.db);
  const recoveryStore = dependencies.recoveryStore ?? new DrizzleUserRecoveryStore(database!.db);
  const adminUserStore = dependencies.adminUserStore ?? new DrizzleAdminUserStore(database!.db);
  const securityQuestionsStore = dependencies.securityQuestionsStore ?? new DrizzleUserSecurityQuestionsStore(database!.db);
  await registerUserSecurityQuestionsRoute(app, {
    store: securityQuestionsStore,
    jwtSecret: config.jwtSecret,
    hashPassword: dependencies.hashPassword
  });
  await registerAuthRoutes(app, { store: registrationStore, hashPassword: dependencies.hashPassword });
  await registerLoginRoute(app, {
    store: loginStore,
    jwtSecret: config.jwtSecret,
    jwtRefreshSecret: config.jwtRefreshSecret,
    verifyPassword: dependencies.verifyPassword
  });
  await registerSessionRoutes(app, {
    store: loginStore,
    jwtSecret: config.jwtSecret,
    jwtRefreshSecret: config.jwtRefreshSecret
  });
  await registerForgotPasswordRoutes(app, {
    store: recoveryStore,
    decoySecret: config.jwtSecret,
    hashPassword: dependencies.hashPassword,
    verifyAnswer: dependencies.verifySecurityAnswer
  });
  await registerAdminUserRoutes(app, {
    store: adminUserStore,
    jwtSecret: config.jwtSecret,
    hashPassword: dependencies.hashPassword
  });

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
  app.get(apiRoutes.public.securityQuestions.url, async (_request, reply) => {
    const questions = await recoveryStore.listSecurityQuestions();
    return reply
      .header("cache-control", "public, max-age=3600")
      .send(questions.map(({ questionId, text }) => ({ id: questionId, text })));
  });

  return app;
}
