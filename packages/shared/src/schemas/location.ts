import { z } from "zod";
import {
  coordinatesSchema,
  idSchema,
  latitudeSchema,
  longitudeSchema,
  timestampSchema
} from "./common";
import { locationShareModeSchema } from "../types/enums";

const uniqueUserIdsSchema = z.array(idSchema).min(1).superRefine((ids, context) => {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: "Target user IDs must be unique."
      });
    }
    seen.add(id);
  });
});

export const shareSchema = z.strictObject({
  targetUserIds: uniqueUserIdsSchema,
  mode: locationShareModeSchema,
  durationMinutes: z.number().int().positive().nullable().optional(),
  note: z.string().trim().optional()
}).superRefine((share, context) => {
  if (share.mode === "timed" && (share.durationMinutes === undefined || share.durationMinutes === null)) {
    context.addIssue({
      code: "custom",
      path: ["durationMinutes"],
      message: "A positive duration is required for timed location sharing."
    });
  }

  if (share.mode === "permanent" && typeof share.durationMinutes === "number") {
    context.addIssue({
      code: "custom",
      path: ["durationMinutes"],
      message: "Permanent location sharing must not have an expiry duration."
    });
  }
});
export type LocationShareInput = z.infer<typeof shareSchema>;
export const createLocationShareSchema = shareSchema;
export type CreateLocationShareInput = z.infer<typeof createLocationShareSchema>;

export const locationShareSchema = z.strictObject({
  id: idSchema,
  ownerId: idSchema,
  targetUserId: idSchema,
  mode: locationShareModeSchema,
  expiresAt: timestampSchema.nullable(),
  isRevoked: z.boolean(),
  priorityDeviceId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: timestampSchema
});
export type LocationShare = z.infer<typeof locationShareSchema>;

export const locationShareCreatedSchema = z.strictObject({
  shareId: idSchema,
  expiresAt: timestampSchema.nullable().optional()
});
export type LocationShareCreated = z.infer<typeof locationShareCreatedSchema>;

export const locationHistoryShareCreatedSchema = z.strictObject({
  shareId: idSchema
});
export type LocationHistoryShareCreated = z.infer<typeof locationHistoryShareCreatedSchema>;

export const locationSharesResponseSchema = z.strictObject({
  owned: z.array(locationShareSchema),
  sharedWithMe: z.array(locationShareSchema)
});
export type LocationSharesResponse = z.infer<typeof locationSharesResponseSchema>;

export const historyShareSchema = z.strictObject({
  targetUserIds: uniqueUserIdsSchema,
  from: timestampSchema,
  to: timestampSchema,
  maxPoints: z.number().int().positive().optional()
}).superRefine((share, context) => {
  if (Date.parse(share.to) <= Date.parse(share.from)) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "The end of the shared time range must be after its start."
    });
  }
});
export type LocationHistoryShareInput = z.infer<typeof historyShareSchema>;
export const createLocationHistoryShareSchema = historyShareSchema;
export type CreateLocationHistoryShareInput = z.infer<typeof createLocationHistoryShareSchema>;

export const locationHistoryPointSchema = coordinatesSchema.extend({
  accuracy: z.number().finite().nonnegative().optional(),
  timestamp: timestampSchema
});
export type LocationHistoryPoint = z.infer<typeof locationHistoryPointSchema>;

export const locationHistoryResponseSchema = z.strictObject({
  points: z.array(locationHistoryPointSchema)
});
export type LocationHistoryResponse = z.infer<typeof locationHistoryResponseSchema>;

export const locationUpdateSchema = coordinatesSchema.extend({
  accuracy: z.number().finite().nonnegative().optional(),
  timestamp: timestampSchema,
  priorityDeviceId: z.string().trim().min(1).max(128)
});
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

export const optionalCoordinatesSchema = z.strictObject({
  lat: latitudeSchema.optional(),
  lon: longitudeSchema.optional()
}).superRefine((coordinates, context) => {
  if ((coordinates.lat === undefined) !== (coordinates.lon === undefined)) {
    context.addIssue({
      code: "custom",
      path: [coordinates.lat === undefined ? "lat" : "lon"],
      message: "Latitude and longitude must be provided together."
    });
  }
});
export type OptionalCoordinates = z.infer<typeof optionalCoordinatesSchema>;
