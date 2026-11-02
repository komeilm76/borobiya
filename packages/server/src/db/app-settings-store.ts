import { eq, inArray } from "drizzle-orm";
import {
  adminSettingDefinitions,
  adminSettingKeys,
  coerceAdminSettingValue,
  validateAdminSettingValue,
  type AdminSetting,
  type AdminSettingKey,
  type AdminSettingValue
} from "@borobiya/shared";
import type { Database } from "./client";
import { adminAuditLog, appSettings, users } from "./schema";

/**
 * The settings the server actually honours, backed by `app_settings`.
 *
 * The registry in `@borobiya/shared` is the contract: a request for a key it does not name is refused, and a
 * stored value that no longer satisfies the registry's bounds falls back to the default rather than failing
 * the page. Rows are never deleted — clearing a setting means writing the default back, which keeps the
 * "who changed this last" question answerable.
 */
export type AdminSettingWriteResult =
  | { status: "updated"; setting: AdminSetting; changed: boolean }
  | { status: "unknown_key" }
  | { status: "invalid"; message: string };

export interface AppSettingsStore {
  readAll(): Promise<AdminSetting[]>;
  readValue(key: AdminSettingKey): Promise<AdminSettingValue>;
  write(input: { key: AdminSettingKey; value: AdminSettingValue; adminId: string }): Promise<AdminSettingWriteResult>;
}

/**
 * The reader the rest of the server depends on (the cancellation workflow reads two keys). Narrow on
 * purpose: a consumer that could write settings would be able to change the threshold it is measured by.
 */
export interface AppSettingsReader {
  readValue(key: AdminSettingKey): Promise<AdminSettingValue>;
}

/** Used when no database is configured — the documented defaults, so callers never branch on `undefined`. */
export const defaultAppSettingsReader: AppSettingsReader = {
  readValue: async (key) => adminSettingDefinitions[key].defaultValue
};

const settingSelection = {
  key: appSettings.key,
  value: appSettings.value,
  updatedAt: appSettings.updatedAt,
  updatedByUsername: users.username
};

function settingPayload(
  key: AdminSettingKey,
  row: { value: unknown; updatedAt: Date | null; updatedByUsername: string | null } | undefined
): AdminSetting {
  return {
    key,
    value: coerceAdminSettingValue(key, row?.value),
    defaultValue: adminSettingDefinitions[key].defaultValue,
    updatedAt: row?.updatedAt === null || row?.updatedAt === undefined ? null : row.updatedAt.toISOString(),
    updatedByUsername: row?.updatedByUsername ?? null
  };
}

export class DrizzleAppSettingsStore implements AppSettingsStore {
  constructor(private readonly db: Database) {}

  async readAll(): Promise<AdminSetting[]> {
    const rows = await this.db
      .select(settingSelection)
      .from(appSettings)
      .leftJoin(users, eq(users.id, appSettings.updatedBy))
      .where(inArray(appSettings.key, [...adminSettingKeys]));
    const byKey = new Map(rows.map((row) => [row.key, row]));
    // Every registry key is present in the answer, stored or not: a settings page that hides unset keys
    // cannot offer the default it would write back.
    return adminSettingKeys.map((key) => settingPayload(key, byKey.get(key)));
  }

  async readValue(key: AdminSettingKey): Promise<AdminSettingValue> {
    const [row] = await this.db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return coerceAdminSettingValue(key, row?.value);
  }

  async write(input: { key: AdminSettingKey; value: AdminSettingValue; adminId: string }): Promise<AdminSettingWriteResult> {
    const definition = adminSettingDefinitions[input.key];
    if (definition === undefined) return { status: "unknown_key" as const };
    const message = validateAdminSettingValue(input.key, input.value);
    if (message !== null) return { status: "invalid" as const, message };

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, input.key))
        .for("update");
      const changed = coerceAdminSettingValue(input.key, existing?.value) !== input.value;
      const now = new Date();
      if (existing === undefined) {
        await tx.insert(appSettings).values({ key: input.key, value: input.value, updatedAt: now, updatedBy: input.adminId });
      } else if (changed) {
        await tx.update(appSettings).set({ value: input.value, updatedAt: now, updatedBy: input.adminId })
          .where(eq(appSettings.key, input.key));
      }
      if (changed) {
        await tx.insert(adminAuditLog).values({
          adminId: input.adminId,
          action: "setting_updated",
          targetType: "setting",
          meta: { key: input.key, value: input.value, previous: coerceAdminSettingValue(input.key, existing?.value) }
        });
      }
      const [stored] = await tx
        .select(settingSelection)
        .from(appSettings)
        .leftJoin(users, eq(users.id, appSettings.updatedBy))
        .where(eq(appSettings.key, input.key));
      return { status: "updated" as const, changed, setting: settingPayload(input.key, stored) };
    });
  }
}

/**
 * A settings store for a database-less process: reads return the registry defaults and writes are refused,
 * so a development boot without Postgres still answers the route instead of throwing.
 */
export const disabledAppSettingsStore: AppSettingsStore = {
  readAll: async () => adminSettingKeys.map((key) => settingPayload(key, undefined)),
  readValue: async (key) => adminSettingDefinitions[key].defaultValue,
  write: async () => ({ status: "unknown_key" })
};

