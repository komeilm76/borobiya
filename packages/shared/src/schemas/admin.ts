import { z } from "zod";
import { idSchema, paginationQuerySchema, usernameSchema, optionalBooleanQuerySchema, timestampSchema } from "./common";
import { passwordSchema } from "./auth";
import { cancellationTypeSchema } from "../types/enums";

const uniqueIdsSchema = z.array(idSchema).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "IDs must be unique." });
  }
});

const nonEmptyNameSchema = z.string().trim().min(1);

export const createUserSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  isActive: z.boolean().optional()
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
export const createAdminUserSchema = createUserSchema;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const toggleActiveSchema = z.strictObject({
  isActive: z.boolean()
});
export type ToggleActiveInput = z.infer<typeof toggleActiveSchema>;

export const adminUserListQuerySchema = z.strictObject({
  q: z.string().trim().max(30).optional(),
  isActive: optionalBooleanQuerySchema,
  hasCategory: optionalBooleanQuerySchema,
  ...paginationQuerySchema.shape
});
export type AdminUserListQuery = z.output<typeof adminUserListQuerySchema>;

/** The slug shape the `incident_types` unique index and any URL that embeds it both rely on. */
/**
 * One rule, used by every direction this value moves in: an explicit `slug` on create or rename, the shape the
 * derivation is checked against, and the response payload `incidentTypeSchema` below. That last use is why the
 * bound lives here rather than only in the derivation — before it, a 5,000-character `slug` was storable while
 * the *same* string derived from a name was refused, and a rule that depends on which field you typed the value
 * into is not a rule anyone can predict. The floor stays at one character, because nothing in the ERD or the
 * unique index asks for more, and `"0"` is a legitimate identifier for a type someone named `0`.
 */
export const incidentSlugValueSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * The identifier an admin actually types is the name; the slug is what a client hardcodes and what a
 * seed is idempotent against. Deriving it here rather than in the server keeps the rule next to the
 * schema it feeds, so the admin form (T3.1.5) can preview the same value instead of guessing again.
 *
 * `null` means "cannot be derived", and the caller must then be told rather than handed a placeholder:
 * a name with no Latin letters or digits (a Persian-only label is entirely normal in this app) slugifies
 * to nothing, and inventing `incident-7` would hand out an identifier nobody chose.
 * Names differing only in case, punctuation, or accents do collide on purpose — that is what the unique
 * index on `incident_types.slug` exists to catch.
 */
export function deriveIncidentSlug(name: string): string | null {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // The chain above can only produce `[a-z0-9-]` runs without leading, trailing, or doubled hyphens, so
  // the regex is a guard on the invariant rather than a filter of the result.
  return slug.length > 0 && slug.length <= 64 && incidentSlugValueSchema.safeParse(slug).success ? slug : null;
}

/** An explicit `slug` wins over the derived one: it is the only way to name a type derivation cannot handle. */
export function resolveIncidentSlug(input: { name: string; slug?: string | null }): string | null {
  const explicit = input.slug?.trim();
  if (explicit !== undefined && explicit.length > 0) {
    return incidentSlugValueSchema.safeParse(explicit).success ? explicit : null;
  }
  return deriveIncidentSlug(input.name);
}

export const incidentTypeCreateSchema = z.strictObject({
  name: nonEmptyNameSchema,
  slug: incidentSlugValueSchema.optional(),
  icon: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  description: z.string().trim().optional()
});
export type IncidentTypeCreateInput = z.infer<typeof incidentTypeCreateSchema>;

/**
 * `icon`/`color`/`description` are nullable here even though create only accepts a value: the columns are
 * nullable, and a PATCH that could add a color but never remove one would leave the admin unable to undo
 * their own edit. `null` clears; an absent key means "leave it alone".
 */
export const incidentTypeUpdateSchema = z
  .strictObject({
    name: nonEmptyNameSchema.optional(),
    slug: incidentSlugValueSchema.optional(),
    icon: z.string().trim().min(1).nullable().optional(),
    color: z.string().trim().min(1).nullable().optional(),
    description: z.string().trim().nullable().optional()
  })
  .refine((input) => Object.keys(input).length > 0, "At least one incident type field must be provided.");
export type IncidentTypeUpdateInput = z.infer<typeof incidentTypeUpdateSchema>;

export const incidentTypeSchema = z.strictObject({
  id: idSchema,
  name: nonEmptyNameSchema,
  slug: incidentSlugValueSchema,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: timestampSchema
});
export type IncidentType = z.infer<typeof incidentTypeSchema>;

export const cancellationReasonCreateSchema = z.strictObject({
  type: cancellationTypeSchema,
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: nonEmptyNameSchema,
  labelFa: z.string().trim().min(1),
  requiresCustomText: z.boolean(),
  isActive: z.boolean()
});
export type CancellationReasonCreateInput = z.infer<typeof cancellationReasonCreateSchema>;

export const cancellationReasonSchema = z.strictObject({
  id: idSchema,
  type: cancellationTypeSchema,
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: nonEmptyNameSchema,
  labelFa: z.string().nullable(),
  requiresCustomText: z.boolean(),
  isActive: z.boolean()
});
export type CancellationReason = z.infer<typeof cancellationReasonSchema>;

export const categoryCreateSchema = z.strictObject({
  name: nonEmptyNameSchema,
  description: z.string().trim().optional(),
  incidentTypeIds: uniqueIdsSchema
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = categoryCreateSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one category field must be provided."
);
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const categoryMemberSchema = z.strictObject({
  id: idSchema,
  username: usernameSchema
});
export type CategoryMember = z.infer<typeof categoryMemberSchema>;

export const categorySchema = z.strictObject({
  id: idSchema,
  name: nonEmptyNameSchema,
  description: z.string().nullable(),
  incidentTypeIds: uniqueIdsSchema,
  members: z.array(categoryMemberSchema).default([]),
  createdAt: timestampSchema
});
export type Category = z.infer<typeof categorySchema>;

export const assignCategoryUsersSchema = z.strictObject({
  userIds: uniqueIdsSchema.min(1)
});
export type AssignCategoryUsersInput = z.infer<typeof assignCategoryUsersSchema>;

/**
 * The audit trail and the alert queue are the two administrative surfaces that read existing tables rather
 * than invent new ones: `admin_audit_log` is already written by every privileged mutation, and `admin_alerts`
 * by the cancellation workflow. This file only fixes their wire shapes and the settings the server reads.
 */
export const adminAuditEntrySchema = z.strictObject({
  id: idSchema,
  adminId: idSchema,
  /** `null` only if the acting account was deleted; the id is kept either way. */
  adminUsername: z.string().nullable(),
  action: z.string().min(1).max(64),
  targetType: z.string().max(32).nullable(),
  targetId: idSchema.nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  createdAt: timestampSchema
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminAuditQuerySchema = z.strictObject({
  action: z.string().trim().min(1).max(64).optional(),
  targetType: z.string().trim().min(1).max(32).optional(),
  adminId: idSchema.optional(),
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
  ...paginationQuerySchema.shape
});
export type AdminAuditQuery = z.output<typeof adminAuditQuerySchema>;

export const adminAlertSchema = z.strictObject({
  id: idSchema,
  type: z.string().min(1).max(64),
  userId: idSchema,
  username: z.string(),
  missionId: idSchema,
  /** The SOS the mission belongs to, so the queue can open dispatch without a second lookup. */
  sosRequestId: idSchema.nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: timestampSchema,
  resolvedAt: timestampSchema.nullable()
});
export type AdminAlert = z.infer<typeof adminAlertSchema>;

export const adminAlertQuerySchema = z.strictObject({
  type: z.string().trim().min(1).max(64).optional(),
  resolved: optionalBooleanQuerySchema,
  ...paginationQuerySchema.shape
});
export type AdminAlertQuery = z.output<typeof adminAlertQuerySchema>;

/**
 * Settings the server actually reads back. A key that nothing consumes would be a switch that lies, so the
 * registry is short on purpose: each entry names the code path that honours it.
 *
 * - `alerts.cancellation_daily_threshold` — `sos-cancellation-store` raises a review alert once a rescuer
 *   passes this many same-day cancels (it was a hardcoded `> 2`).
 * - `alerts.other_reason_notify` — the same store skips the `rescuer_other_reason_approval` alert when off.
 */
export const adminSettingDefinitions = {
  "alerts.cancellation_daily_threshold": { kind: "number", min: 0, max: 50, defaultValue: 2 },
  "alerts.other_reason_notify": { kind: "boolean", min: 0, max: 0, defaultValue: true }
} as const satisfies Record<string, { kind: "number" | "boolean"; min: number; max: number; defaultValue: boolean | number }>;

export type AdminSettingKey = keyof typeof adminSettingDefinitions;
export const adminSettingKeys = Object.keys(adminSettingDefinitions) as [AdminSettingKey, ...AdminSettingKey[]];
export const adminSettingKeySchema = z.enum(adminSettingKeys);
export type AdminSettingValue = boolean | number;

export const adminSettingValueSchema = z.union([z.boolean(), z.number().int()]);

export const adminSettingSchema = z.strictObject({
  key: adminSettingKeySchema,
  value: adminSettingValueSchema,
  defaultValue: adminSettingValueSchema,
  updatedAt: timestampSchema.nullable(),
  updatedByUsername: z.string().nullable()
});
export type AdminSetting = z.infer<typeof adminSettingSchema>;

export const adminSettingsResponseSchema = z.strictObject({ items: z.array(adminSettingSchema) });
export const adminSettingUpdateSchema = z.strictObject({ value: adminSettingValueSchema });
export type AdminSettingUpdateInput = z.infer<typeof adminSettingUpdateSchema>;

/** `null` when the value is acceptable, otherwise the message to show next to the field. */
export function validateAdminSettingValue(key: AdminSettingKey, value: AdminSettingValue): string | null {
  const definition = adminSettingDefinitions[key];
  if (definition.kind === "boolean") {
    return typeof value === "boolean" ? null : "This setting accepts true or false.";
  }
  if (typeof value !== "number" || !Number.isInteger(value)) return "This setting accepts whole numbers.";
  if (value < definition.min || value > definition.max) {
    return `This setting must be between ${definition.min} and ${definition.max}.`;
  }
  return null;
}

/**
 * A stored value can be older than the registry (a key's kind changed, or a hand-edited row). Reading falls
 * back to the default instead of failing the whole settings page, which is what an admin opens when they
 * suspect exactly this kind of drift.
 */
export function coerceAdminSettingValue(key: AdminSettingKey, raw: unknown): AdminSettingValue {
  const fallback = adminSettingDefinitions[key].defaultValue;
  if (typeof raw === "boolean" || typeof raw === "number") {
    return validateAdminSettingValue(key, raw) === null ? raw : fallback;
  }
  return fallback;
}

/** Typed reads for consumers: a key whose kind does not match falls back to its default instead of throwing. */
export function readAdminSettingNumber(key: AdminSettingKey, raw: unknown): number {
  const value = coerceAdminSettingValue(key, raw);
  return typeof value === "number" ? value : (adminSettingDefinitions[key].defaultValue as number);
}

export function readAdminSettingBoolean(key: AdminSettingKey, raw: unknown): boolean {
  const value = coerceAdminSettingValue(key, raw);
  return typeof value === "boolean" ? value : (adminSettingDefinitions[key].defaultValue as boolean);
}
