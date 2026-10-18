import { z } from "zod";

export const userRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const severitySchema = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof severitySchema>;

export const locationShareModeSchema = z.enum(["timed", "permanent"]);
export type LocationShareMode = z.infer<typeof locationShareModeSchema>;

export const missionProposalStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "expired"
]);
export type MissionProposalStatus = z.infer<typeof missionProposalStatusSchema>;

export const sosRequestStatusSchema = z.enum([
  "pending",
  "dispatched",
  "accepted",
  "cancelled_by_requester",
  "cancelled_by_rescuer",
  "expired",
  "completed"
]);
export type SosRequestStatus = z.infer<typeof sosRequestStatusSchema>;

export const missionStatusSchema = z.enum([
  "pending",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed",
  "cancelled_by_requester",
  "cancelled_by_rescuer",
  "expired"
]);
export type MissionStatus = z.infer<typeof missionStatusSchema>;

/** Statuses clients may request; transition order is enforced by the server. */
export const missionProgressStatusSchema = z.enum([
  "on_the_way",
  "arrived",
  "in_progress",
  "completed"
]);
export type MissionProgressStatus = z.infer<typeof missionProgressStatusSchema>;

export const cancellationTypeSchema = z.enum(["requester", "rescuer"]);
export type CancellationType = z.infer<typeof cancellationTypeSchema>;

export const transportProfileSchema = z.enum(["car", "bicycle", "foot"]);
export type TransportProfile = z.infer<typeof transportProfileSchema>;

/** Built-in incident slugs; admins may add other valid slugs at runtime. */
export const incidentSlugSchema = z.enum([
  "fire",
  "flood",
  "earthquake",
  "medical",
  "accident",
  "lost",
  "other"
]);
export type IncidentSlug = z.infer<typeof incidentSlugSchema>;
