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

export const incidentTypeCreateSchema = z.strictObject({
  name: nonEmptyNameSchema,
  icon: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  description: z.string().trim().optional()
});
export type IncidentTypeCreateInput = z.infer<typeof incidentTypeCreateSchema>;

export const incidentTypeUpdateSchema = incidentTypeCreateSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one incident type field must be provided."
);
export type IncidentTypeUpdateInput = z.infer<typeof incidentTypeUpdateSchema>;

export const incidentTypeSchema = z.strictObject({
  id: idSchema,
  name: nonEmptyNameSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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
