import { z } from "zod";

export const idSchema = z.string().uuid();
export type Id = z.infer<typeof idSchema>;

export const idParamsSchema = z.strictObject({ id: idSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

export const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only.");
export type Username = z.infer<typeof usernameSchema>;

export const timestampSchema = z.string().datetime({ offset: true });
export type Timestamp = z.infer<typeof timestampSchema>;

export const latitudeSchema = z.number().finite().min(-90).max(90);
export type Latitude = z.infer<typeof latitudeSchema>;

export const longitudeSchema = z.number().finite().min(-180).max(180);
export type Longitude = z.infer<typeof longitudeSchema>;

export const coordinatesSchema = z.strictObject({
  lat: latitudeSchema,
  lon: longitudeSchema
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const paginationQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
export type PaginationQuery = z.output<typeof paginationQuerySchema>;
export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().nonnegative()
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export function paginatedResponseSchema<ItemSchema extends z.ZodType>(itemSchema: ItemSchema) {
  return z.strictObject({
    items: z.array(itemSchema),
    ...paginationMetaSchema.shape
  });
}

export const validationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.array(z.union([z.string(), z.number()])).optional()
}).passthrough();
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const errorSchema = z.object({
  error: z.literal(true),
  code: z.string().min(1),
  message: z.string().min(1),
  issues: z.array(z.unknown()).default([])
}).passthrough();
export type ApiError = z.infer<typeof errorSchema>;

export const optionalBooleanQuerySchema = z.preprocess(
  (value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "") return undefined;
    return value;
  },
  z.boolean().optional()
);
export type OptionalBooleanQuery = z.infer<typeof optionalBooleanQuerySchema>;
