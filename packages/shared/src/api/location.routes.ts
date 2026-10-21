import { errorSchema } from "../schemas/common";
import {
  createLocationHistoryShareSchema,
  createLocationShareSchema,
  locationHistoryResponseSchema,
  locationShareCreatedSchema,
  locationSharesResponseSchema,
  locationHistoryShareCreatedSchema,
  locationUpdateSchema
} from "../schemas/location";
import {
  apiErrorResponses,
  noContentResponseSchema,
  locationHistoryQuerySchema,
  sharePathParamsSchema
} from "./common";
import { defineRoute } from "./define-route";

export const locationRoutes = {
  createShare: defineRoute({
    method: "POST",
    url: "/_user/location/share",
    schema: {
      body: createLocationShareSchema,
      responses: { 201: locationShareCreatedSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "locationCreateShare",
      summary: "Share live location with one or more users",
      description:
        "Recipients are validated as a batch, so one unusable target rejects the whole request with 400 VALIDATION_ERROR and per-target issue codes. When the account has more than one live device and no priorityDeviceId is supplied, the request is refused with 409 PRIORITY_DEVICE_REQUIRED and issues[0].deviceIds lists the candidates to choose between; an account with a single live device is pinned by the server. The pin decides which device may feed these shares via Socket `location:update`.",
      tags: ["location"],
      access: "authenticated"
    }
  }),
  revokeShare: defineRoute({
    method: "DELETE",
    url: "/_user/location/share/:shareId",
    schema: {
      params: sharePathParamsSchema,
      responses: { 200: noContentResponseSchema, ...apiErrorResponses }
    },
    meta: {
      operationId: "locationRevokeShare",
      summary: "Revoke a live location share immediately",
      description:
        "Only the share owner may revoke. Revoking an unknown id or one owned by another account returns 404 SHARE_NOT_FOUND; an already-revoked id returns 200 so retries stay idempotent.",
      tags: ["location"],
      access: "authenticated"
    }
  }),
  listShares: defineRoute({
    method: "GET",
    url: "/_user/location/shares",
    schema: {
      responses: { 200: locationSharesResponseSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "locationListShares",
      summary: "List location shares owned by or shared with the current user",
      tags: ["location"],
      access: "authenticated"
    }
  }),
  createHistoryShare: defineRoute({
    method: "POST",
    url: "/_user/location/history/share",
    schema: {
      body: createLocationHistoryShareSchema,
      responses: { 201: locationHistoryShareCreatedSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "locationCreateHistoryShare",
      summary: "Share a bounded range of location history",
      description:
        "Grants one fixed window (1-50 recipients per call) from the caller's stored location history. The window must not span more than LOCATION_HISTORY_MAX_SHARE_DAYS, otherwise 400 SHARE_RANGE_TOO_LARGE; recipients are validated as a batch with the same issue codes as live-share creation. A repeated request for the identical owner, target, and window reuses the existing grant and only rewrites maxPoints, so createdShareIds and reusedShareIds explain what changed. No priority device is involved: a history grant replays rows the server already stored, and it lasts until retention prunes them.",
      tags: ["location"],
      access: "authenticated"
    }
  }),
  getHistory: defineRoute({
    method: "GET",
    url: "/_user/location/history",
    schema: {
      query: locationHistoryQuerySchema,
      responses: { 200: locationHistoryResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "locationGetHistory",
      summary: "Get the authenticated user's location history",
      tags: ["location"],
      access: "authenticated"
    }
  }),
  getSharedHistory: defineRoute({
    method: "GET",
    url: "/_user/location/history/shared/:shareId",
    schema: {
      params: sharePathParamsSchema,
      responses: { 200: locationHistoryResponseSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "locationGetSharedHistory",
      summary: "Get history shared with the authenticated user",
      tags: ["location"],
      access: "authenticated"
    }
  }),
  updateLocation: defineRoute({
    method: "POST",
    url: "/_user/location/update",
    schema: {
      body: locationUpdateSchema,
      responses: { 200: noContentResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "locationUpdateRestFallback",
      summary: "Update location using the deprecated REST fallback",
      tags: ["location"],
      access: "authenticated",
      deprecated: true
    }
  })
} as const;
