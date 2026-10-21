import { z } from "zod";
import {
  coordinatesSchema,
  idSchema,
  latitudeSchema,
  longitudeSchema,
  timestampSchema
} from "./common";
import { locationShareModeSchema } from "../types/enums";

/** Upper bounds that keep one share request inside a sane, reviewable payload. */
export const MAX_LOCATION_SHARE_TARGETS = 50;
/** Timed shares must end within 30 days; longer-lived visibility uses `permanent` mode. */
export const MAX_LOCATION_SHARE_MINUTES = 30 * 24 * 60;
export const MAX_LOCATION_SHARE_NOTE_LENGTH = 500;
/** Caps one user's share list so `GET /_user/location/shares` stays a small payload. */
export const MAX_LOCATION_SHARE_LIST_ITEMS = 100;

const uniqueUserIdsSchema = z
  .array(idSchema)
  .min(1)
  .max(MAX_LOCATION_SHARE_TARGETS)
  .superRefine((ids, context) => {
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
  durationMinutes: z
    .number()
    .int()
    .min(1, "A timed share must last at least one minute.")
    .max(MAX_LOCATION_SHARE_MINUTES, `Timed location sharing must not exceed ${MAX_LOCATION_SHARE_MINUTES} minutes. Use permanent mode for longer visibility.`)
    .nullable()
    .optional(),
  note: z.string().trim().max(MAX_LOCATION_SHARE_NOTE_LENGTH).optional(),
  /**
   * Which of the owner's live sessions should broadcast to these recipients (spec §7.3), i.e. the
   * value stored in `location_shares.priority_device_id`. Omitted when the account has exactly one
   * live device, because then there is nothing to choose; with several, the server answers
   * `409 PRIORITY_DEVICE_REQUIRED` until one is named.
   */
  priorityDeviceId: idSchema.optional()
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

/**
 * One `POST /_user/location/share` call can target several users, so the created
 * shares are returned in full (each row carries its own `expiresAt`). A repeated
 * request reuses the caller's existing active share for a target and only extends a
 * timed expiry, so `createdShareIds` and `reusedShareIds` explain what changed.
 */
export const locationShareCreatedSchema = z.strictObject({
  shares: z.array(locationShareSchema).min(1).max(MAX_LOCATION_SHARE_TARGETS),
  createdShareIds: z.array(idSchema).max(MAX_LOCATION_SHARE_TARGETS).default([]),
  reusedShareIds: z.array(idSchema).max(MAX_LOCATION_SHARE_TARGETS).default([])
});
export type LocationShareCreated = z.infer<typeof locationShareCreatedSchema>;

/** One granted history window for one recipient (`location_history_shares`). */
export const locationHistoryShareSchema = z.strictObject({
  id: idSchema,
  ownerId: idSchema,
  targetUserId: idSchema,
  from: timestampSchema,
  to: timestampSchema,
  maxPoints: z.number().int().nullable(),
  createdAt: timestampSchema
});
export type LocationHistoryShare = z.infer<typeof locationHistoryShareSchema>;

/**
 * Like live-share creation, one call can grant the same window to several users and a repeated
 * request for the identical owner/target/window reuses the existing grant instead of duplicating it,
 * so the response lists the rows and says which ones were created.
 */
export const locationHistoryShareCreatedSchema = z.strictObject({
  shares: z.array(locationHistoryShareSchema).min(1).max(MAX_LOCATION_SHARE_TARGETS),
  createdShareIds: z.array(idSchema).max(MAX_LOCATION_SHARE_TARGETS).default([]),
  reusedShareIds: z.array(idSchema).max(MAX_LOCATION_SHARE_TARGETS).default([])
});
export type LocationHistoryShareCreated = z.infer<typeof locationHistoryShareCreatedSchema>;

/** The share owner's identity and last server-side known position, shown to receivers. */
export const locationShareOwnerSchema = z.strictObject({
  id: idSchema,
  username: z.string().min(1),
  lastLocation: coordinatesSchema.nullable()
});
export type LocationShareOwner = z.infer<typeof locationShareOwnerSchema>;

export const receivedLocationShareSchema = locationShareSchema.extend({
  owner: locationShareOwnerSchema
});
export type ReceivedLocationShare = z.infer<typeof receivedLocationShareSchema>;

/**
 * Active shares only: revoked rows and timed rows past `expiresAt` are excluded from both
 * lists. Each list is capped at `MAX_LOCATION_SHARE_LIST_ITEMS` newest rows.
 */
export const locationSharesResponseSchema = z.strictObject({
  owned: z.array(locationShareSchema).max(MAX_LOCATION_SHARE_LIST_ITEMS),
  sharedWithMe: z.array(receivedLocationShareSchema).max(MAX_LOCATION_SHARE_LIST_ITEMS)
});
export type LocationSharesResponse = z.infer<typeof locationSharesResponseSchema>;

/**
 * Upper bound on `maxPoints`, the resolution a history share is meant to be viewed at. It bounds the
 * payload of every later read of the grant (T2.2.4), which is why the ceiling belongs to the contract
 * rather than to the read handler.
 */
export const MAX_LOCATION_HISTORY_SHARE_POINTS = 10_000;

export const historyShareSchema = z.strictObject({
  targetUserIds: uniqueUserIdsSchema,
  from: timestampSchema,
  to: timestampSchema,
  /**
   * Downsample target for receivers. Deliberately not range-bounded here: the largest shareable window
   * is `LOCATION_HISTORY_MAX_SHARE_DAYS`, which is server configuration (spec §7.2), so the API layer
   * owns that check and answers `400 SHARE_RANGE_TOO_LARGE`.
   */
  maxPoints: z
    .number()
    .int()
    .min(1)
    .max(
      MAX_LOCATION_HISTORY_SHARE_POINTS,
      `A shared history window can be sampled to at most ${MAX_LOCATION_HISTORY_SHARE_POINTS} points.`
    )
    .optional()
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
