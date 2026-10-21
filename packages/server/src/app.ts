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
import { DrizzleUserDeviceStore, type UserDeviceStore } from "./db/device-store";
import { registerUserDevicesRoute } from "./auth/devices";
import { registerAdminUserRoutes } from "./admin/users";
import { DrizzleUserSearchStore, type UserSearchStore } from "./db/user-search-store";
import { registerUserSearchRoute } from "./users/search";
import { DrizzleLocationShareStore, type LocationShareStore } from "./db/location-share-store";
import { DrizzleLocationHistoryStore, type LocationHistoryStore } from "./db/location-history-store";
import { createLiveLocationService, registerLocationUpdateRoute } from "./location/live";
import { startLocationJobs } from "./location/jobs";
import { attachRealtime, PEER_UPDATE_EVENT, userRoom } from "./realtime/socket";
import { registerLocationHistoryShareRoutes } from "./location/history";
import { registerLocationShareRoutes } from "./location/shares";
import { registerAuthRoutes, type PasswordHasher } from "./auth/register";
import { registerHttpSecurityPlugins } from "./plugins/security";
import { registerErrorEnvelope } from "./plugins/error-envelope";
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
  /** Override admin user management queries/mutations and current admin-account checks in tests. */
  adminUserStore?: AdminUserStore;
  /** Override user authorization/onboarding persistence in tests. */
  securityQuestionsStore?: UserSecurityQuestionsStore;
  /** Override the Active Devices read path in tests. */
  userDeviceStore?: UserDeviceStore;
  /** Override live-location share persistence in tests. */
  locationShareStore?: LocationShareStore;
  /** Override live-location fix persistence in tests. */
  locationHistoryStore?: LocationHistoryStore;
  /** Override the user-search read path in tests. */
  userSearchStore?: UserSearchStore;
  /** Override registration hashing in tests; production defaults to the Argon2id helper. */
  hashPassword?: PasswordHasher;
  /** Override login password verification in tests; production uses Argon2id. */
  verifyPassword?: PasswordVerifier;
  /** Override recovery-answer verification in tests; production uses Argon2id. */
  verifySecurityAnswer?: SecurityAnswerVerifier;
  /**
   * Start the in-process maintenance timers (share expiry, history retention prune). Only the API
   * entrypoint sets this: `app.inject()` tests build apps that must not own intervals.
   */
  startMaintenanceJobs?: boolean;
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
  // Registered before the routes so a store failure anywhere lands as the documented envelope
  // instead of Fastify's default body, which carried the driver's message to the browser.
  registerErrorEnvelope(app);
  await registerSwagger(app, config.openApiServerPath);

  // A pool is only opened when at least one store still needs the real database; queries
  // run lazily, so inject-test apps never connect.
  const needsDatabase = [
    dependencies.registrationStore,
    dependencies.loginStore,
    dependencies.recoveryStore,
    dependencies.adminUserStore,
    dependencies.securityQuestionsStore,
    dependencies.userDeviceStore,
    dependencies.locationShareStore,
    dependencies.locationHistoryStore,
    dependencies.userSearchStore
  ].some((store) => store === undefined);
  const database = needsDatabase ? createDatabase(config.databaseUrl) : undefined;
  const registrationStore = dependencies.registrationStore ?? new DrizzleUserRegistrationStore(database!.db);
  const loginStore = dependencies.loginStore ?? new DrizzleUserLoginStore(database!.db);
  const recoveryStore = dependencies.recoveryStore ?? new DrizzleUserRecoveryStore(database!.db);
  const adminUserStore = dependencies.adminUserStore ?? new DrizzleAdminUserStore(database!.db);
  const securityQuestionsStore = dependencies.securityQuestionsStore ?? new DrizzleUserSecurityQuestionsStore(database!.db);
  const userDeviceStore = dependencies.userDeviceStore ?? new DrizzleUserDeviceStore(database!.db);
  const locationShareStore = dependencies.locationShareStore ?? new DrizzleLocationShareStore(database!.db);
  const locationHistoryStore = dependencies.locationHistoryStore ?? new DrizzleLocationHistoryStore(database!.db);
  const userSearchStore = dependencies.userSearchStore ?? new DrizzleUserSearchStore(database!.db);
  const liveLocationService = createLiveLocationService({
    shareStore: locationShareStore,
    historyStore: locationHistoryStore
  });
  await registerUserSecurityQuestionsRoute(app, {
    store: securityQuestionsStore,
    jwtSecret: config.jwtSecret,
    hashPassword: dependencies.hashPassword
  });
  // Registered after the `/_user` authorization hook so the device list inherits the access-token,
  // account-state, onboarding, and live-session checks and can trust `request.authenticatedUser`.
  await registerUserDevicesRoute(app, { store: userDeviceStore });
  await registerUserSearchRoute(app, { store: userSearchStore });
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
  // Registered after the `/_user` authorization hook so share routes inherit the
  // access-token, account-state, and onboarding checks.
  await registerLocationShareRoutes(app, { store: locationShareStore, devices: userDeviceStore });
  await registerLocationHistoryShareRoutes(app, {
    store: locationHistoryStore,
    shares: locationShareStore,
    maxShareDays: config.locationHistoryMaxShareDays,
    defaultReadPoints: config.locationHistoryReadPoints
  });

  const realtime = attachRealtime(app.server, {
    jwtSecret: config.jwtSecret,
    users: securityQuestionsStore,
    live: liveLocationService,
    corsOrigins: config.corsOrigins,
    logger: app.log
  });
  await registerLocationUpdateRoute(app, {
    service: liveLocationService,
    broadcast: (peerIds, update) => {
      for (const peerId of peerIds) {
        realtime.io.to(userRoom(peerId)).emit(PEER_UPDATE_EVENT, update);
      }
    }
  });

  app.addHook("onClose", async () => {
    await realtime.close();
  });

  if (dependencies.startMaintenanceJobs) {
    const jobs = startLocationJobs({
      shareStore: locationShareStore,
      historyStore: locationHistoryStore,
      retentionDays: config.locationHistoryRetentionDays,
      logger: app.log
    });
    // One catch-up pass per listener turn: shares whose window closed while the API was down are
    // expired before the first request is served, and nothing is awaited on the hot startup path.
    app.addHook("onReady", async () => {
      void jobs.tick({ runAll: true });
    });
    app.addHook("onClose", async () => {
      jobs.stop();
    });
  }

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
