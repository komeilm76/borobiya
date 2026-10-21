import { z } from "zod";
import {
  coordinatesSchema,
  idParamsSchema,
  idSchema,
  timestampSchema
} from "./common";
import {
  missionProgressStatusSchema,
  missionProposalStatusSchema,
  missionStatusSchema,
  severitySchema,
  sosRequestStatusSchema
} from "../types/enums";

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

export const sosRequestParamsSchema = idParamsSchema;
export type SosRequestParams = z.infer<typeof sosRequestParamsSchema>;

export const missionProposalParamsSchema = idParamsSchema;
export type MissionProposalParams = z.infer<typeof missionProposalParamsSchema>;

export const missionParamsSchema = idParamsSchema;
export type MissionParams = z.infer<typeof missionParamsSchema>;

export const proposalDeclineSchema = z.strictObject({
  reason: z.string().trim().optional()
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
  comment: z.string().trim().optional()
});
export type MissionRatingInput = z.infer<typeof missionRatingSchema>;

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
