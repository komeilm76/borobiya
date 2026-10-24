import { z } from "zod";
import {
  errorSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
  timestampSchema
} from "../schemas/common";
import {
  cancellationSchema,
  missionParamsSchema,
  missionProposalParamsSchema,
  missionProposalSchema,
  missionRatingSchema,
  missionSchema,
  missionDetailSchema,
  missionTimelineSchema,
  missionNavigationTargetSchema,
  missionStatusUpdateSchema,
  nearestResponderSchema,
  nearestRespondersResponseSchema,
  proposalAcceptResponseSchema,
  proposalDeclineSchema,
  proposalInboxItemSchema,
  sosRequestCreatedSchema,
  sosRequestParamsSchema,
  sosRequestRecordSchema,
  sosRequestDetailSchema,
  createSosRequestSchema
} from "../schemas/sos";
import { cancellationReasonSchema } from "../schemas/admin";
import { noContentResponseSchema } from "./common";
import { defineRoute } from "./define-route";

export { nearestResponderSchema, nearestRespondersResponseSchema };

const sosRequestListQuerySchema = z.strictObject({
  role: z.enum(["requester", "rescuer"]).optional(),
  sosRequestId: missionParamsSchema.shape.id.optional(),
  ...paginationQuerySchema.shape
});

const missionListQuerySchema = z.strictObject({
  role: z.enum(["requester", "rescuer"]).optional(),
  sosRequestId: missionParamsSchema.shape.id.optional(),
  ...paginationQuerySchema.shape
});

const proposalListQuerySchema = z.strictObject(paginationQuerySchema.shape);

const syncQuerySchema = z.strictObject({ since: timestampSchema });
const syncResponseSchema = z.strictObject({
  events: z.array(z.unknown()),
  location: z.unknown().nullable(),
  missions: z.array(missionSchema)
});
const photoUploadResponseSchema = z.strictObject({ photoUrl: z.string().trim().min(1) });
export const photoAccessResponseSchema = z.strictObject({
  url: z.string().startsWith("/uploads/"),
  expiresAt: timestampSchema
});

export const sosRoutes = {
  createRequest: defineRoute({
    method: "POST",
    url: "/_user/sos/requests",
    schema: {
      body: createSosRequestSchema,
      responses: { 201: sosRequestCreatedSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "sosCreateRequest",
      summary: "Create a new SOS request",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  listRequests: defineRoute({
    method: "GET",
    url: "/_user/sos/requests",
    schema: {
      query: sosRequestListQuerySchema,
      responses: {
        200: paginatedResponseSchema(sosRequestRecordSchema),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        503: errorSchema
      }
    },
    meta: {
      operationId: "sosListRequests",
      summary: "List SOS requests visible to the authenticated user",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  getRequest: defineRoute({
    method: "GET",
    url: "/_user/sos/requests/:id",
    schema: {
      params: sosRequestParamsSchema,
      responses: { 200: sosRequestDetailSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 503: errorSchema }
    },
    meta: {
      operationId: "sosGetRequest",
      summary: "Get an SOS request",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  listCancellationReasons: defineRoute({
    method: "GET",
    url: "/_user/sos/cancellation-reasons",
    schema: {
      querystring: z.strictObject({ type: z.enum(["requester", "rescuer"]) }),
      responses: { 200: z.array(cancellationReasonSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "sosListCancellationReasons",
      summary: "List active cancellation reasons for a requester or rescuer",
      tags: ["sos", "user"], access: "authenticated"
    }
  }),
  cancelRequest: defineRoute({
    method: "POST",
    url: "/_user/sos/requests/:id/cancel",
    schema: {
      params: sosRequestParamsSchema,
      body: cancellationSchema,
      responses: { 200: noContentResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "sosCancelRequest",
      summary: "Cancel an SOS request as its requester",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  uploadRequestPhoto: defineRoute({
    method: "POST",
    url: "/_user/sos/requests/:id/photo",
    schema: {
      params: sosRequestParamsSchema,
      body: z.unknown(),
      responses: { 200: photoUploadResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 413: errorSchema }
    },
    meta: {
      operationId: "sosUploadRequestPhoto",
      summary: "Upload an SOS request photo",
      description: "Multipart upload, limited to 5 MB by the server.",
      tags: ["sos", "user"],
      access: "authenticated",
      requestContentType: "multipart/form-data"
    }
  }),
  getPhotoAccess: defineRoute({
    method: "GET",
    url: "/_user/sos/requests/:id/photo-access",
    schema: {
      params: sosRequestParamsSchema,
      responses: { 200: photoAccessResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "sosGetPhotoAccess",
      summary: "Issue a short-lived SOS photo URL for a participant or admin",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  listProposals: defineRoute({
    method: "GET",
    url: "/_user/sos/proposals",
    schema: {
      query: proposalListQuerySchema,
      responses: { 200: paginatedResponseSchema(proposalInboxItemSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "sosListProposals",
      summary: "List pending rescue proposals for the authenticated user",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  acceptProposal: defineRoute({
    method: "POST",
    url: "/_user/sos/proposals/:id/accept",
    schema: {
      params: missionProposalParamsSchema,
      responses: { 200: proposalAcceptResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "sosAcceptProposal",
      summary: "Accept a rescue proposal and create a mission",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  declineProposal: defineRoute({
    method: "POST",
    url: "/_user/sos/proposals/:id/decline",
    schema: {
      params: missionProposalParamsSchema,
      body: proposalDeclineSchema,
      responses: { 200: noContentResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "sosDeclineProposal",
      summary: "Decline a rescue proposal",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  listMissions: defineRoute({
    method: "GET",
    url: "/_user/sos/missions",
    schema: {
      query: missionListQuerySchema,
      responses: { 200: paginatedResponseSchema(missionSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "sosListMissions",
      summary: "List missions for the authenticated user",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  getMission: defineRoute({
    method: "GET",
    url: "/_user/sos/missions/:id",
    schema: {
      params: missionParamsSchema,
      responses: { 200: missionDetailSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "sosGetMission",
      summary: "Get a mission",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  getMissionTimeline: defineRoute({
    method: "GET",
    url: "/_user/sos/missions/:id/timeline",
    schema: {
      params: missionParamsSchema,
      responses: { 200: missionTimelineSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "sosGetMissionTimeline",
      summary: "Read committed mission steps as a participant",
      tags: ["sos", "user"], access: "authenticated"
    }
  }),
  getMissionNavigationTarget: defineRoute({
    method: "GET",
    url: "/_user/sos/missions/:id/navigation",
    schema: {
      params: missionParamsSchema,
      responses: { 200: missionNavigationTargetSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "sosGetMissionNavigationTarget",
      summary: "Get incident coordinates for the assigned active rescuer",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  updateMissionStatus: defineRoute({
    method: "PATCH",
    url: "/_user/missions/:id/status",
    schema: {
      params: missionParamsSchema,
      body: missionStatusUpdateSchema,
      responses: { 200: missionSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "sosUpdateMissionStatus",
      summary: "Advance a mission through its allowed progress states",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  cancelMission: defineRoute({
    method: "POST",
    url: "/_user/missions/:id/cancel",
    schema: {
      params: missionParamsSchema,
      body: cancellationSchema,
      responses: { 200: noContentResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "sosCancelMission",
      summary: "Cancel a mission with a recorded reason",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  rateMission: defineRoute({
    method: "POST",
    url: "/_user/missions/:id/rate",
    schema: {
      params: missionParamsSchema,
      body: missionRatingSchema,
      responses: { 200: noContentResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "sosRateMission",
      summary: "Rate a completed mission",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  nearestResponders: defineRoute({
    method: "GET",
    url: "/_user/sos/requests/:id/nearest",
    schema: {
      params: sosRequestParamsSchema,
      responses: { 200: nearestRespondersResponseSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema }
    },
    meta: {
      operationId: "sosGetNearestResponders",
      summary: "Get the nearest responders for an SOS request",
      tags: ["sos", "user"],
      access: "authenticated"
    }
  }),
  sync: defineRoute({
    method: "GET",
    url: "/_user/sync",
    schema: {
      query: syncQuerySchema,
      responses: { 200: syncResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "userSync",
      summary: "Synchronize recent events and current mission state",
      tags: ["user", "sync"],
      access: "authenticated"
    }
  })
} as const;
