import { z } from "zod";
import { errorSchema, idSchema, timestampSchema } from "../schemas/common";

export const noContentResponseSchema = z.void();

export const uuidPathParamsSchema = z.strictObject({ id: idSchema });
export const sharePathParamsSchema = z.strictObject({ shareId: idSchema });

export const locationHistoryQuerySchema = z.strictObject({
  from: timestampSchema,
  to: timestampSchema
}).superRefine((query, context) => {
  if (Date.parse(query.to) <= Date.parse(query.from)) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "The end of the requested time range must be after its start."
    });
  }
});

export const apiErrorResponses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  429: errorSchema
} as const;
