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
import { DrizzleIncidentTypeStore, type IncidentTypeStore } from "./db/incident-type-store";
import { registerAdminIncidentRoutes } from "./admin/incidents";
import { DrizzleCategoryStore, type CategoryStore } from "./db/category-store";
import { registerAdminCategoryRoutes } from "./admin/categories";
import { registerAdminSosRoutes } from "./admin/sos";
import { DrizzleUserSearchStore, type UserSearchStore } from "./db/user-search-store";
import { registerUserSearchRoute } from "./users/search";
import { DrizzleSosRequestStore, type SosRequestStore } from "./db/sos-request-store";
import {
  createPlaceholderSosDispatchStore,
  DrizzleSosDispatchStore,
  type SosDispatchStore
} from "./db/sos-dispatch-store";
import { registerSosRequestRoutes } from "./sos/requests";
import { registerSosProposalRoutes } from "./sos/proposals";
import { registerMultipartParser } from "./plugins/multipart";
import { DrizzleSosPhotoStore, type SosPhotoStore } from "./db/sos-photo-store";
import { createPhotoStorage, type PhotoStorage } from "./sos/photo-storage";
import { registerSosPhotoRoutes } from "./sos/photos";
import { registerSosPhotoAccessRoutes } from "./sos/photo-access";
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
  /** Override the incident-type catalog persistence in tests. */
  incidentTypeStore?: IncidentTypeStore;
  /** Override responder-category persistence in tests. */
  categoryStore?: CategoryStore;
  /** Override SOS-request creation persistence in tests. */
  sosRequestStore?: SosRequestStore;
  /** Override SOS nearest-responder & dispatch persistence in tests. */
  sosDispatchStore?: SosDispatchStore;
  /** Override the photo attach write in tests. */
  photoStore?: SosPhotoStore;
  /** Override where uploaded photos are written in tests. */
  photoStorage?: PhotoStorage;
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
    dependencies.userSearchStore,
    dependencies.incidentTypeStore,
    dependencies.categoryStore,
    dependencies.sosRequestStore,
    dependencies.photoStore
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
  const incidentTypeStore = dependencies.incidentTypeStore ?? new DrizzleIncidentTypeStore(database!.db);
  const categoryStore = dependencies.categoryStore ?? new DrizzleCategoryStore(database!.db);
  const sosRequestStore = dependencies.sosRequestStore ?? new DrizzleSosRequestStore(database!.db);
  const sosDispatchStore =
    dependencies.sosDispatchStore ??
    (database ? new DrizzleSosDispatchStore(database.db) : createPlaceholderSosDispatchStore());
  const photoStore = dependencies.photoStore ?? new DrizzleSosPhotoStore(database!.db);
  const photoStorage = dependencies.photoStorage ?? createPhotoStorage(config.uploadDir);
  const liveLocationService = createLiveLocationService({
    shareStore: locationShareStore,
    historyStore: locationHistoryStore
  });
  const realtime = attachRealtime(app.server, {
    jwtSecret: config.jwtSecret,
    users: securityQuestionsStore,
    live: liveLocationService,
    corsOrigins: config.corsOrigins,
    logger: app.log
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
    jwtRefreshSecret: config.jwtRefreshSecret,
    io: realtime.io
  });
  await registerForgotPasswordRoutes(app, {
    store: recoveryStore,
    decoySecret: config.jwtSecret,
    hashPassword: dependencies.hashPassword,
    verifyAnswer: dependencies.verifySecurityAnswer,
    io: realtime.io
  });
  await registerAdminUserRoutes(app, {
    store: adminUserStore,
    jwtSecret: config.jwtSecret,
    hashPassword: dependencies.hashPassword,
    io: realtime.io
  });
  await registerAdminIncidentRoutes(app, {
    store: incidentTypeStore,
    adminStore: adminUserStore,
    jwtSecret: config.jwtSecret
  });
  await registerAdminCategoryRoutes(app, {
    store: categoryStore,
    adminStore: adminUserStore,
    jwtSecret: config.jwtSecret
  });
  await registerAdminSosRoutes(app, {
    store: sosRequestStore,
    dispatchStore: sosDispatchStore,
    adminStore: adminUserStore,
    jwtSecret: config.jwtSecret,
    io: realtime.io
  });

  // Registered after the `/_user` authorization hook so share routes inherit the
  // access-token, account-state, and onboarding checks, and wired to `realtime.io` so revocations
  // notify receivers immediately instead of waiting for their next share-list poll.
  await registerLocationShareRoutes(app, {
    store: locationShareStore,
    devices: userDeviceStore,
    io: realtime.io
  });
  // multipart is only needed by the photo upload, but it must be on the app before that route is
  // created. The limits are the contract's, not a guess: `docs/SECURITY.md` §9 caps a photo at 5 MB,
  // and an SOS carries one — so the parser refuses anything bigger before a byte is buffered, and
  // `throwFileSizeLimit` makes that an error rather than a silently truncated buffer (the route checks
  // `truncated` as well, so turning the flag off cannot start storing half an image).
  await registerMultipartParser(app, { maxBytes: config.sosPhotoMaxBytes });
  // Also behind the `/_user` hook: filing an SOS requires a live session on an active account that
  // has finished onboarding, which is exactly the state dispatch is entitled to trust.
  await registerSosRequestRoutes(app, { store: sosRequestStore, io: realtime.io });
  await registerSosProposalRoutes(app, sosDispatchStore);
  await registerSosPhotoRoutes(app, {
    store: photoStore,
    storage: photoStorage,
    maxBytes: config.sosPhotoMaxBytes,
    sosRequests: sosRequestStore,
    io: realtime.io
  });
  await registerSosPhotoAccessRoutes(app, {
    sosRequests: sosRequestStore,
    photos: photoStore,
    storage: photoStorage,
    jwtSecret: config.jwtSecret,
    maxBytes: config.sosPhotoMaxBytes
  });
  await registerLocationHistoryShareRoutes(app, {
    store: locationHistoryStore,
    shares: locationShareStore,
    maxShareDays: config.locationHistoryMaxShareDays,
    defaultReadPoints: config.locationHistoryReadPoints
  });
  await registerLocationUpdateRoute(app, {
    service: liveLocationService,
    broadcast: (peerIds, update) => {
      for (const roomUserId of new Set([...peerIds, update.userId])) {
        realtime.io.to(userRoom(roomUserId)).emit(PEER_UPDATE_EVENT, update);
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
      io: realtime.io,
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

  // The liveness probe sits deliberately outside the global throttle (see `ApiRouteMeta.rateLimitExempt`).
  // The limiter protects handlers, and a health check is not a handler worth protecting: under
  // `RATE_LIMIT_MAX` pressure an orchestrator would restart a healthy-but-busy API precisely during the
  // load spike that made it look unreachable. The exemption is read from the descriptor rather than
  // written here, so the contract and the runtime cannot disagree about which routes are limited.
  const healthRoute = apiRoutes.public.health;
  app.get(
    healthRoute.url,
    healthRoute.meta.rateLimitExempt === true ? { config: { rateLimit: false } } : {},
    async () => ({
      status: "ok" as const,
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? "0.2.0"
    })
  );
  app.get(apiRoutes.public.securityQuestions.url, async (_request, reply) => {
    const questions = await recoveryStore.listSecurityQuestions();
    return reply
      .header("cache-control", "public, max-age=3600")
      .send(questions.map(({ questionId, text }) => ({ id: questionId, text })));
  });
  app.get(apiRoutes.public.incidentTypes.url, async (_request, reply) => {
    const items = await incidentTypeStore.listIncidentTypes();
    return reply.header("cache-control", "no-store").send(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        icon: item.icon,
        color: item.color,
        description: item.description,
        createdAt: item.createdAt.toISOString()
      }))
    );
  });

  return app;
}
