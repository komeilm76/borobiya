import { z } from "zod";
import {
  coordinatesSchema,
  idParamsSchema,
  idSchema,
  timestampSchema,
  usernameSchema
} from "./common";
import {
  missionProgressStatusSchema,
  missionProposalStatusSchema,
  missionStatusSchema,
  severitySchema,
  sosRequestStatusSchema
} from "../types/enums";

/**
 * The photo rules spec §11.2 states for an SOS, kept here so the client can pre-check what the server
 * will refuse anyway. The size is the **default**: `SOS_PHOTO_MAX_SIZE_MB` overrides it per deployment
 * (README §14 lists the knob), so a client that wants certainty must read the 413 rather than trust this
 * number. The formats are not configurable: `POST /_user/sos/requests/:id/photo` accepts one of these
 * three, judged by the file's bytes, whatever its name or declared content type says.
 */
export const MAX_SOS_PHOTO_BYTES = 5 * 1024 * 1024;
/** The one form field the upload endpoint reads, named so a client cannot guess at it. */
export const SOS_PHOTO_FIELD_NAME = "photo";
export const ALLOWED_SOS_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SosPhotoMimeType = (typeof ALLOWED_SOS_PHOTO_MIME_TYPES)[number];

export const sosLocationSchema = coordinatesSchema.extend({
  accuracy: z.number().finite().nonnegative().optional(),
  isManual: z.boolean()
});
export type SosLocation = z.infer<typeof sosLocationSchema>;

export const sosRequestSchema = z.strictObject({
  severity: severitySchema,
  description: z.string().trim().min(10).max(500),
  incidentTypeId: idSchema,
  location: sosLocationSchema,
  photoUrl: z.string().trim().min(1).optional()
});
export type SosRequestInput = z.infer<typeof sosRequestSchema>;
export const createSosRequestSchema = sosRequestSchema;
export type CreateSosRequestInput = z.infer<typeof createSosRequestSchema>;

export const sosRequestCreatedSchema = z.strictObject({
  requestId: idSchema,
  status: z.literal("pending")
});
export type SosRequestCreated = z.infer<typeof sosRequestCreatedSchema>;

export const dispatchSchema = z.strictObject({
  rescuerIds: z.array(idSchema).min(1).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Rescuer IDs must be unique."
      });
    }
  })
});
export type DispatchInput = z.infer<typeof dispatchSchema>;
export const dispatchSosRequestSchema = dispatchSchema;
export type DispatchSosRequestInput = z.infer<typeof dispatchSosRequestSchema>;

export const missionProposalSchema = z.strictObject({
  id: idSchema,
  sosRequestId: idSchema,
  rescuerId: idSchema,
  status: missionProposalStatusSchema,
  createdAt: timestampSchema
});
export type MissionProposal = z.infer<typeof missionProposalSchema>;

/** The inbox includes only the incident attached to the caller's own pending offer. */
export const proposalInboxItemSchema = missionProposalSchema.extend({
  details: z.strictObject({
    incidentTypeName: z.string(),
    requesterName: usernameSchema,
    sosRequest: z.strictObject({
      severity: severitySchema,
      description: z.string(),
      location: sosLocationSchema,
      photoUrl: z.string().nullable(),
      createdAt: timestampSchema
    })
  }).optional()
});
export type ProposalInboxItem = z.infer<typeof proposalInboxItemSchema>;

export const sosRequestParamsSchema = idParamsSchema;
export type SosRequestParams = z.infer<typeof sosRequestParamsSchema>;

export const missionProposalParamsSchema = idParamsSchema;
export type MissionProposalParams = z.infer<typeof missionProposalParamsSchema>;

export const missionParamsSchema = idParamsSchema;
export type MissionParams = z.infer<typeof missionParamsSchema>;

export const proposalDeclineSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500).optional()
});
export type ProposalDeclineInput = z.infer<typeof proposalDeclineSchema>;

export const proposalAcceptResponseSchema = z.strictObject({
  missionId: idSchema
});
export type ProposalAcceptResponse = z.infer<typeof proposalAcceptResponseSchema>;

export const missionStatusUpdateSchema = z.strictObject({
  status: missionProgressStatusSchema
});
export type MissionStatusUpdateInput = z.infer<typeof missionStatusUpdateSchema>;

export const cancellationSchema = z.strictObject({
  cancellationReasonId: idSchema,
  customReason: z.string().trim().min(10).max(200).optional()
});
export type CancellationInput = z.infer<typeof cancellationSchema>;
export const requesterCancellationSchema = cancellationSchema;
export type RequesterCancellationInput = z.infer<typeof requesterCancellationSchema>;
export const rescuerCancellationSchema = cancellationSchema;
export type RescuerCancellationInput = z.infer<typeof rescuerCancellationSchema>;

export const missionRatingSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional()
});
export type MissionRatingInput = z.infer<typeof missionRatingSchema>;

/** Coordinates are only readable for an active mission's assigned rescuer. */
export const missionNavigationTargetSchema = z.strictObject({
  missionId: idSchema,
  incident: coordinatesSchema
});
export type MissionNavigationTarget = z.infer<typeof missionNavigationTargetSchema>;

/** Transport presence only. Neither value implies the person is sharing GPS or physically safe. */
export const missionPresenceSchema = z.strictObject({
  missionId: idSchema,
  requester: z.strictObject({ online: z.boolean(), lastSeenAt: timestampSchema.nullable() }),
  rescuer: z.strictObject({ online: z.boolean(), lastSeenAt: timestampSchema.nullable() })
});
export type MissionPresence = z.infer<typeof missionPresenceSchema>;

/** The immutable committed status steps, including terminal cancellation rows. */
export const missionTimelineEntrySchema = z.strictObject({
  id: idSchema,
  missionId: idSchema,
  fromStatus: missionStatusSchema.nullable(),
  toStatus: missionStatusSchema,
  changedBy: idSchema.nullable(),
  createdAt: timestampSchema
});
export type MissionTimelineEntry = z.infer<typeof missionTimelineEntrySchema>;
export const missionTimelineSchema = z.array(missionTimelineEntrySchema);
export type MissionTimeline = z.infer<typeof missionTimelineSchema>;

export const missionSchema = z.strictObject({
  id: idSchema,
  sosRequestId: idSchema,
  rescuerId: idSchema,
  requesterId: idSchema,
  status: missionStatusSchema,
  cancelledBy: z.enum(["requester", "rescuer", "admin", "system"]).nullable(),
  cancellationReasonId: idSchema.nullable(),
  cancellationCustomText: z.string().nullable(),
  cancelledAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});
export type Mission = z.infer<typeof missionSchema>;

/** Reconnect snapshot: durable mission steps, not a replay of private GPS or ephemeral offers.
 * The cursor pages status events; a truncated mission list must be reloaded via paginated reads. */
export const userSyncResponseSchema = z.strictObject({
  events: z.array(missionTimelineEntrySchema),
  location: z.null(),
  missions: z.array(missionSchema),
  missionsTruncated: z.boolean(),
  nextCursor: idSchema.nullable()
});
export type UserSyncResponse = z.infer<typeof userSyncResponseSchema>;
/** A persisted reason snapshot resolved by its FK, including deactivated catalog entries. */
export const cancellationReasonDetailSchema = z.strictObject({
  id: idSchema, key: z.string(), label: z.string(), labelFa: z.string().nullable(),
  customText: z.string().nullable()
});
export type CancellationReasonDetail = z.infer<typeof cancellationReasonDetailSchema>;
export const missionDetailSchema = missionSchema.extend({
  cancellationReason: cancellationReasonDetailSchema.nullable(),
  rating: z.number().int().min(1).max(5).nullable()
});
export type MissionDetail = z.infer<typeof missionDetailSchema>;


export const sosRequestRecordSchema = z.strictObject({
  id: idSchema,
  requesterId: idSchema,
  severity: severitySchema,
  description: z.string().trim().min(10).max(500),
  incidentTypeId: idSchema,
  location: sosLocationSchema,
  photoUrl: z.string().nullable(),
  status: sosRequestStatusSchema,
  cancellationReasonId: idSchema.nullable(),
  cancellationCustomText: z.string().nullable(),
  cancelledAt: timestampSchema.nullable(),
  createdAt: timestampSchema
});
export type SosRequest = z.infer<typeof sosRequestRecordSchema>;
export type SosRequestRecord = SosRequest;
/** The SOS row itself stores a requester cancellation; responder cancellations belong to individual missions. */
export const sosRequestDetailSchema = sosRequestRecordSchema.extend({
  cancelledBy: z.enum(["requester", "rescuer"]).nullable(),
  cancellationReason: cancellationReasonDetailSchema.nullable()
});
export type SosRequestDetail = z.infer<typeof sosRequestDetailSchema>;


export const nearestResponderSchema = z.strictObject({
  userId: idSchema,
  username: usernameSchema,
  distance: z.number().finite().nonnegative(),
  avgRating: z.number().finite().min(0).max(5).nullable(),
  categoryName: z.string().nullable(),
  lastActiveAt: timestampSchema
});
export type NearestResponder = z.infer<typeof nearestResponderSchema>;

export const nearestRespondersResponseSchema = z.strictObject({
  responders: z.array(nearestResponderSchema)
});
export type NearestRespondersResponse = z.infer<typeof nearestRespondersResponseSchema>;

export const dispatchResponseSchema = z.strictObject({
  proposals: z.array(missionProposalSchema)
});
export type DispatchResponse = z.infer<typeof dispatchResponseSchema>;

export const sosNewRequestEventSchema = z.strictObject({
  sosRequest: sosRequestRecordSchema
});
export type SosNewRequestEvent = z.infer<typeof sosNewRequestEventSchema>;

export const sosProposalReceivedEventSchema = z.strictObject({
  proposal: missionProposalSchema,
  sosRequest: sosRequestRecordSchema
});
export type SosProposalReceivedEvent = z.infer<typeof sosProposalReceivedEventSchema>;

export const sosProposalAcceptedEventSchema = z.strictObject({
  proposal: missionProposalSchema,
  missionId: idSchema
});
export type SosProposalAcceptedEvent = z.infer<typeof sosProposalAcceptedEventSchema>;

export const missionStatusUpdatedEventSchema = z.strictObject({
  missionId: idSchema,
  status: missionStatusSchema,
  by: idSchema,
  at: timestampSchema
});
export type MissionStatusUpdatedEvent = z.infer<typeof missionStatusUpdatedEventSchema>;

/** Admins receive the location/review fields; requester and rescuer receive only the common fields. */
export const rescuerCancellationEventSchema = z.strictObject({
  missionId: idSchema,
  sosRequestId: idSchema,
  rescuerId: idSchema,
  reason: z.string().min(1),
  at: timestampSchema,
  rescuerLocation: coordinatesSchema.pick({ lat: true, lon: true }).nullable().optional(),
  reviewRequired: z.boolean().optional()
});
export type RescuerCancellationEvent = z.infer<typeof rescuerCancellationEventSchema>;

/** An explicit participant opt-in; never reuse an unrelated location share as consent. */
export const missionLocationPublishSchema = z.strictObject({
  missionId: idSchema,
  location: coordinatesSchema.extend({
    accuracy: z.number().finite().nonnegative().optional(),
    timestamp: timestampSchema,
    priorityDeviceId: z.string().trim().min(1).max(128)
  })
});
export type MissionLocationPublish = z.infer<typeof missionLocationPublishSchema>;

export const missionLocationEventSchema = z.strictObject({
  missionId: idSchema,
  userId: idSchema,
  role: z.enum(["requester", "rescuer", "admin"]),
  lat: coordinatesSchema.shape.lat,
  lon: coordinatesSchema.shape.lon,
  accuracy: z.number().finite().nonnegative().nullable(),
  timestamp: timestampSchema
});
export type MissionLocationEvent = z.infer<typeof missionLocationEventSchema>;

export const requesterCancellationEventSchema = z.strictObject({
  missionId: idSchema,
  sosRequestId: idSchema,
  requesterId: idSchema,
  rescuerId: idSchema,
  reason: z.string().min(1),
  at: timestampSchema
});
export type RequesterCancellationEvent = z.infer<typeof requesterCancellationEventSchema>;
