import { z } from "zod";
import {
  adminUserListQuerySchema,
  assignCategoryUsersSchema,
  cancellationReasonCreateSchema,
  cancellationReasonSchema,
  categoryCreateSchema,
  categorySchema,
  categoryUpdateSchema,
  createAdminUserSchema,
  incidentTypeCreateSchema,
  incidentTypeSchema,
  incidentTypeUpdateSchema,
  toggleActiveSchema
} from "../schemas/admin";
import {
  errorSchema,
  paginatedResponseSchema,
  paginationQuerySchema
} from "../schemas/common";
import { devicesSchema, userProfileSchema } from "../schemas/user";
import {
  dispatchResponseSchema,
  dispatchSosRequestSchema,
  missionSchema,
  missionTimelineSchema,
  sosRequestRecordSchema,
  sosRequestDetailSchema
} from "../schemas/sos";
import { sosRequestStatusSchema } from "../types/enums";
import {
  apiErrorResponses,
  categoryUserParamsSchema,
  noContentResponseSchema,
  uuidPathParamsSchema
} from "./common";
import { defineRoute } from "./define-route";
import { nearestRespondersResponseSchema } from "./sos.routes";

const adminUserDetailSchema = userProfileSchema.extend({
  devices: devicesSchema,
  missions: z.array(missionSchema)
});

export const adminSosListQuerySchema = z.strictObject({
  status: sosRequestStatusSchema.optional(),
  ...paginationQuerySchema.shape
});
export type AdminSosListQuery = z.output<typeof adminSosListQuerySchema>;

const adminStatsResponseSchema = z.strictObject({
  counts: z.record(z.string(), z.number().int().nonnegative()),
  activeMissions: z.number().int().nonnegative(),
  onlineUsers: z.number().int().nonnegative()
});

export const adminRoutes = {
  listUsers: defineRoute({
    method: "GET",
    url: "/_admin/users",
    schema: {
      query: adminUserListQuerySchema,
      responses: { 200: paginatedResponseSchema(userProfileSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "adminListUsers",
      summary: "List users with status, category, search, and pagination filters",
      tags: ["admin", "users"],
      access: "admin"
    }
  }),
  getUser: defineRoute({
    method: "GET",
    url: "/_admin/users/:id",
    schema: {
      params: uuidPathParamsSchema,
      responses: { 200: adminUserDetailSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminGetUser",
      summary: "Get a user with devices and missions",
      tags: ["admin", "users"],
      access: "admin"
    }
  }),
  createUser: defineRoute({
    method: "POST",
    url: "/_admin/users",
    schema: {
      body: createAdminUserSchema,
      responses: { 201: userProfileSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "adminCreateUser",
      summary: "Create a user without security-question answers",
      tags: ["admin", "users"],
      access: "admin"
    }
  }),
  updateUserStatus: defineRoute({
    method: "PATCH",
    url: "/_admin/users/:id/status",
    schema: {
      params: uuidPathParamsSchema,
      body: toggleActiveSchema,
      responses: { 200: userProfileSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminUpdateUserStatus",
      summary: "Activate or deactivate a user account",
      tags: ["admin", "users"],
      access: "admin"
    }
  }),
  unsuspendUser: defineRoute({
    method: "PATCH",
    url: "/_admin/users/:id/unsuspend",
    schema: {
      params: uuidPathParamsSchema,
      responses: { 200: noContentResponseSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminUnsuspendUser",
      summary: "Clear a user's suspension",
      tags: ["admin", "users"],
      access: "admin"
    }
  }),
  createIncidentType: defineRoute({
    method: "POST",
    url: "/_admin/incidents",
    schema: {
      body: incidentTypeCreateSchema,
      responses: { 201: incidentTypeSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "adminCreateIncidentType",
      summary: "Create an incident type (slug derived from the name unless one is given)",
      tags: ["admin", "incidents"],
      access: "admin"
    }
  }),
  listIncidentTypes: defineRoute({
    method: "GET",
    url: "/_admin/incidents",
    schema: { responses: { 200: z.array(incidentTypeSchema), 401: errorSchema, 403: errorSchema } },
    meta: {
      operationId: "adminListIncidentTypes",
      summary: "List incident types",
      tags: ["admin", "incidents"],
      access: "admin"
    }
  }),
  updateIncidentType: defineRoute({
    method: "PATCH",
    url: "/_admin/incidents/:id",
    schema: {
      params: uuidPathParamsSchema,
      body: incidentTypeUpdateSchema,
      // 409 because a rename can collide with another type's slug, and the unique index is the rule.
      responses: { 200: incidentTypeSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "adminUpdateIncidentType",
      summary: "Update an incident type",
      tags: ["admin", "incidents"],
      access: "admin"
    }
  }),
  createCategory: defineRoute({
    method: "POST",
    url: "/_admin/categories",
    schema: {
      body: categoryCreateSchema,
      responses: { 201: categorySchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "adminCreateCategory",
      summary: "Create a responder category",
      tags: ["admin", "categories"],
      access: "admin"
    }
  }),
  listCategories: defineRoute({
    method: "GET",
    url: "/_admin/categories",
    schema: { responses: { 200: z.array(categorySchema), 401: errorSchema, 403: errorSchema } },
    meta: {
      operationId: "adminListCategories",
      summary: "List responder categories",
      tags: ["admin", "categories"],
      access: "admin"
    }
  }),
  updateCategory: defineRoute({
    method: "PATCH",
    url: "/_admin/categories/:id",
    schema: {
      params: uuidPathParamsSchema,
      body: categoryUpdateSchema,
      responses: { 200: categorySchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminUpdateCategory",
      summary: "Update a responder category",
      tags: ["admin", "categories"],
      access: "admin"
    }
  }),
  assignCategoryUsers: defineRoute({
    method: "POST",
    url: "/_admin/categories/:id/users",
    schema: {
      params: uuidPathParamsSchema,
      body: assignCategoryUsersSchema,
      responses: { 200: noContentResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminAssignCategoryUsers",
      summary: "Assign users to a responder category",
      tags: ["admin", "categories"],
      access: "admin"
    }
  }),
  removeCategoryUser: defineRoute({
    method: "DELETE",
    url: "/_admin/categories/:id/users/:userId",
    schema: {
      params: categoryUserParamsSchema,
      responses: { 200: noContentResponseSchema, ...apiErrorResponses }
    },
    meta: {
      operationId: "adminRemoveCategoryUser",
      summary: "Remove a user from a responder category",
      tags: ["admin", "categories"],
      access: "admin"
    }
  }),
  listSosRequests: defineRoute({
    method: "GET",
    url: "/_admin/sos/requests",
    schema: {
      query: adminSosListQuerySchema,
      responses: {
        200: paginatedResponseSchema(sosRequestRecordSchema),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema
      }
    },
    meta: {
      operationId: "adminListSosRequests",
      summary: "List SOS requests for dispatch monitoring",
      tags: ["admin", "sos"],
      access: "admin"
    }
  }),
  getSosRequest: defineRoute({
    method: "GET",
    url: "/_admin/sos/requests/:id",
    schema: {
      params: uuidPathParamsSchema,
      responses: { 200: sosRequestDetailSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminGetSosRequest",
      summary: "Get an SOS request for dispatch review",
      tags: ["admin", "sos"],
      access: "admin"
    }
  }),
  listSosMissions: defineRoute({
    method: "GET",
    url: "/_admin/sos/requests/:id/missions",
    schema: {
      params: uuidPathParamsSchema,
      query: z.strictObject({ includeTerminal: z.enum(["true", "false"]).optional() }),
      responses: { 200: z.array(missionSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminListSosMissions",
      summary: "List active missions for private dispatch monitoring",
      tags: ["admin", "sos"],
      access: "admin"
    }
  }),
  getMissionTimeline: defineRoute({
    method: "GET",
    url: "/_admin/sos/missions/:id/timeline",
    schema: {
      params: uuidPathParamsSchema,
      responses: { 200: missionTimelineSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminGetMissionTimeline",
      summary: "Read committed mission steps as a dispatch admin",
      tags: ["admin", "sos"], access: "admin"
    }
  }),
  getNearestResponders: defineRoute({
    method: "GET",
    url: "/_admin/sos/requests/:id/nearest",
    schema: {
      params: uuidPathParamsSchema,
      responses: { 200: nearestRespondersResponseSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "adminGetNearestResponders",
      summary: "Find nearest eligible responders for an SOS request",
      tags: ["admin", "sos"],
      access: "admin"
    }
  }),
  dispatchSosRequest: defineRoute({
    method: "POST",
    url: "/_admin/sos/requests/:id/dispatch",
    schema: {
      params: uuidPathParamsSchema,
      body: dispatchSosRequestSchema,
      responses: {
        201: dispatchResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema
      }
    },
    meta: {
      operationId: "adminDispatchSosRequest",
      summary: "Dispatch selected rescuers to an SOS request",
      tags: ["admin", "sos"],
      access: "admin"
    }
  }),
  stats: defineRoute({
    method: "GET",
    url: "/_admin/stats",
    schema: { responses: { 200: adminStatsResponseSchema, 401: errorSchema, 403: errorSchema } },
    meta: {
      operationId: "adminGetStats",
      summary: "Get operational SOS, mission, and online-user counts",
      tags: ["admin", "stats"],
      access: "admin"
    }
  }),
  listCancellationReasons: defineRoute({
    method: "GET",
    url: "/_admin/cancellation-reasons",
    schema: { responses: { 200: z.array(cancellationReasonSchema), 401: errorSchema, 403: errorSchema } },
    meta: {
      operationId: "adminListCancellationReasons",
      summary: "List configurable cancellation reasons",
      tags: ["admin", "cancellation-reasons"],
      access: "admin"
    }
  }),
  createCancellationReason: defineRoute({
    method: "POST",
    url: "/_admin/cancellation-reasons",
    schema: {
      body: cancellationReasonCreateSchema,
      responses: { 201: cancellationReasonSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "adminCreateCancellationReason",
      summary: "Create a cancellation reason",
      tags: ["admin", "cancellation-reasons"],
      access: "admin"
    }
  })
} as const;
