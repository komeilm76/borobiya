import { apiRoutes, uuidPathParamsSchema } from "@borobiya/shared/api";
import {
  adminAlertQuerySchema,
  adminAuditQuerySchema,
  adminSettingKeySchema,
  adminSettingUpdateSchema
} from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminAlertStore } from "../db/admin-alert-store";
import type { AdminAuditStore } from "../db/admin-audit-store";
import type { AdminStatsStore } from "../db/admin-stats-store";
import type { AppSettingsStore } from "../db/app-settings-store";
import type { AdminAuthorizerDependencies } from "./authorize";
import { authorizeAdmin, errorResponse } from "./authorize";
import { validationIssues } from "./normalize";

/**
 * The administrative surfaces that are not about a single record: the audit trail, the alert queue, the
 * operational settings, and the aggregate counters. Kept in one module because they share a property the
 * CRUD modules do not — every one of them is read-mostly and must stay answerable while the emergency side
 * of the app is under load.
 */
export interface AdminGovernanceRouteDependencies {
  auditStore: AdminAuditStore;
  alertStore: AdminAlertStore;
  settingsStore: AppSettingsStore;
  statsStore: AdminStatsStore;
  adminStore: AdminAuthorizerDependencies["store"];
  jwtSecret: string;
}

export async function registerAdminGovernanceRoutes(
  app: FastifyInstance,
  dependencies: AdminGovernanceRouteDependencies
): Promise<void> {
  const auditRoute = apiRoutes.admin.listAudit;
  const alertsRoute = apiRoutes.admin.listAlerts;
  const resolveAlertRoute = apiRoutes.admin.resolveAlert;
  const settingsRoute = apiRoutes.admin.getSettings;
  const updateSettingRoute = apiRoutes.admin.updateSetting;
  const statsRoute = apiRoutes.admin.stats;

  const authorize = (request: FastifyRequest, reply: FastifyReply) =>
    authorizeAdmin(request, reply, { store: dependencies.adminStore, jwtSecret: dependencies.jwtSecret });

  app.get(auditRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;
    const parsed = adminAuditQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).header("cache-control", "no-store")
        .send(errorResponse("VALIDATION_ERROR", "Query parameter validation failed.", validationIssues(parsed.error)));
    }
    const result = await dependencies.auditStore.listEntries(parsed.data);
    return reply.code(200).header("cache-control", "no-store").send({
      items: result.items,
      total: result.total,
      page: parsed.data.page,
      limit: parsed.data.limit,
      totalPages: Math.ceil(result.total / parsed.data.limit)
    });
  });

  app.get(alertsRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;
    const parsed = adminAlertQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).header("cache-control", "no-store")
        .send(errorResponse("VALIDATION_ERROR", "Query parameter validation failed.", validationIssues(parsed.error)));
    }
    const result = await dependencies.alertStore.listAlerts(parsed.data);
    return reply.code(200).header("cache-control", "no-store").send({
      items: result.items,
      total: result.total,
      page: parsed.data.page,
      limit: parsed.data.limit,
      totalPages: Math.ceil(result.total / parsed.data.limit)
    });
  });

  app.post(resolveAlertRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;
    const parsed = uuidPathParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).header("cache-control", "no-store")
        .send(errorResponse("VALIDATION_ERROR", "Path parameter validation failed.", validationIssues(parsed.error)));
    }
    const result = await dependencies.alertStore.resolveAlert({ id: parsed.data.id, adminId: identity.userId });
    if (result.status === "not_found") {
      return reply.code(404).header("cache-control", "no-store")
        .send(errorResponse("ALERT_NOT_FOUND", "That alert does not exist."));
    }
    return reply.code(200).header("cache-control", "no-store").send(result.alert);
  });

  app.get(settingsRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;
    const items = await dependencies.settingsStore.readAll();
    return reply.code(200).header("cache-control", "no-store").send({ items });
  });

  app.put(updateSettingRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;
    // An unknown key is a 404, not a 400: the URL names a resource this server does not have.
    const key = adminSettingKeySchema.safeParse((request.params as { key?: unknown }).key);
    if (!key.success) {
      return reply.code(404).header("cache-control", "no-store")
        .send(errorResponse("SETTING_NOT_FOUND", "That setting is not recognised by this server."));
    }
    const body = adminSettingUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).header("cache-control", "no-store")
        .send(errorResponse("VALIDATION_ERROR", "Request body validation failed.", validationIssues(body.error)));
    }
    const result = await dependencies.settingsStore.write({
      key: key.data,
      value: body.data.value,
      adminId: identity.userId
    });
    if (result.status === "unknown_key") {
      return reply.code(404).header("cache-control", "no-store")
        .send(errorResponse("SETTING_NOT_FOUND", "That setting is not recognised by this server."));
    }
    if (result.status === "invalid") {
      return reply.code(400).header("cache-control", "no-store")
        .send(errorResponse("SETTING_OUT_OF_RANGE", result.message));
    }
    return reply.code(200).header("cache-control", "no-store").send(result.setting);
  });

  app.get(statsRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;
    const stats = await dependencies.statsStore.readStats();
    return reply.code(200).header("cache-control", "no-store").send(stats);
  });
}
