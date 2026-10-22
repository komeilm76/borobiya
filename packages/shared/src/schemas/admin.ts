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

export const categorySchema = z.strictObject({
  id: idSchema,
  name: nonEmptyNameSchema,
  description: z.string().nullable(),
  incidentTypeIds: uniqueIdsSchema,
  createdAt: timestampSchema
});
export type Category = z.infer<typeof categorySchema>;

export const assignCategoryUsersSchema = z.strictObject({
  userIds: uniqueIdsSchema.min(1)
});
export type AssignCategoryUsersInput = z.infer<typeof assignCategoryUsersSchema>;
