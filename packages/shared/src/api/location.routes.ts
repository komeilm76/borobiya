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
      responses: { 201: locationShareCreatedSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "locationCreateShare",
      summary: "Share live location with one or more users",
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
      summary: "Revoke a live location share",
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
