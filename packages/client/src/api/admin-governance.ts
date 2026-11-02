import { z } from "zod";
import {
  adminAlertSchema,
  adminAuditEntrySchema,
  adminSettingSchema,
  adminSettingsResponseSchema,
  paginatedResponseSchema,
  validateAdminSettingValue,
  type AdminAlert,
  type AdminAuditEntry,
  type AdminSetting,
  type AdminSettingKey,
  type AdminSettingValue
} from "@shared/index";
import { apiRoutes } from "@shared/api";
import { requestJson } from "./http";

const auditPageSchema = paginatedResponseSchema(adminAuditEntrySchema);
const alertPageSchema = paginatedResponseSchema(adminAlertSchema);

export type AdminAuditPage = z.infer<typeof auditPageSchema>;
export type AdminAlertPage = z.infer<typeof alertPageSchema>;

export interface ListAdminAuditParams {
  action?: string;
  targetType?: string;
  adminId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text.length === 0 ? "" : `?${text}`;
}

/**
 * Read-only administrative surfaces. Every response is parsed by the shared schema the server answers
 * with, so a contract change fails a unit test instead of leaving the audit table half-rendered.
 */
export async function listAdminAudit(accessToken: string, params: ListAdminAuditParams = {}): Promise<AdminAuditPage> {
  const { signal, ...filters } = params;
  const response = await requestJson<unknown>(`${apiRoutes.admin.listAudit.url}${queryString(filters)}`, {
    accessToken,
    signal
  });
  return auditPageSchema.parse(response);
}

export interface ListAdminAlertsParams {
  type?: string;
  resolved?: boolean;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export async function listAdminAlerts(accessToken: string, params: ListAdminAlertsParams = {}): Promise<AdminAlertPage> {
  const { signal, ...filters } = params;
  const response = await requestJson<unknown>(`${apiRoutes.admin.listAlerts.url}${queryString(filters)}`, {
    accessToken,
    signal
  });
  return alertPageSchema.parse(response);
}

/** Idempotent on the server: resolving an already-reviewed alert answers `200` with the same row. */
export async function resolveAdminAlert(accessToken: string, id: string): Promise<AdminAlert> {
  const path = apiRoutes.admin.resolveAlert.url.replace(":id", encodeURIComponent(id));
  const response = await requestJson<unknown>(path, { method: "POST", accessToken });
  return adminAlertSchema.parse(response);
}

export async function getAdminSettings(accessToken: string, signal?: AbortSignal): Promise<AdminSetting[]> {
  const response = await requestJson<unknown>(apiRoutes.admin.getSettings.url, { accessToken, signal });
  return adminSettingsResponseSchema.parse(response).items;
}

export async function updateAdminSetting(
  accessToken: string,
  key: AdminSettingKey,
  value: AdminSettingValue
): Promise<AdminSetting> {
  // The registry's bounds are shared, so an out-of-range value is refused here instead of after a round
  // trip the admin has to wait for — the server repeats the check because a client is not a boundary.
  const message = validateAdminSettingValue(key, value);
  if (message !== null) throw new Error(message);
  const path = apiRoutes.admin.updateSetting.url.replace(":key", encodeURIComponent(key));
  const body = apiRoutes.admin.updateSetting.schema.body.parse({ value });
  const response = await requestJson<unknown>(path, { method: "PUT", body, accessToken });
  return adminSettingSchema.parse(response);
}

export interface AdminStats {
  counts: Record<string, number>;
  activeMissions: number;
  onlineUsers: number;
}

export async function getAdminStats(accessToken: string, signal?: AbortSignal): Promise<AdminStats> {
  const response = await requestJson<unknown>(apiRoutes.admin.stats.url, { accessToken, signal });
  return apiRoutes.admin.stats.schema.responses[200].parse(response);
}
