import { z } from "zod";
import { idSchema, timestampSchema, usernameSchema } from "./common";
import { userRoleSchema } from "../types/enums";

export const authUserSchema = z.strictObject({
  id: idSchema,
  username: usernameSchema,
  role: userRoleSchema,
  mustCompleteSecurityQuestions: z.boolean()
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const registeredUserSchema = z.strictObject({
  id: idSchema,
  username: usernameSchema,
  createdAt: timestampSchema
});
export type RegisteredUser = z.infer<typeof registeredUserSchema>;

export const userCategorySummarySchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1)
});
export type UserCategorySummary = z.infer<typeof userCategorySummarySchema>;

export const userProfileSchema = authUserSchema.extend({
  isActive: z.boolean(),
  avgRating: z.number().finite().min(0).max(5).nullable(),
  categories: z.array(userCategorySummarySchema).default([]),
  createdAt: timestampSchema
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateUserProfileSchema = z.strictObject({
  username: usernameSchema.optional()
}).refine((input) => Object.keys(input).length > 0, "At least one profile field must be provided.");
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

/** Caps `GET /_user/devices` so one account can never force an unbounded list (spec §7.3). */
export const MAX_USER_DEVICE_LIST_ITEMS = 50;
/** A device label is user-visible text; bound it so no client can push large payloads into `user_sessions`. */
export const MAX_USER_DEVICE_NAME_LENGTH = 100;

export const deviceSchema = z.strictObject({
  /** `user_sessions.id` — the session row this device entry describes. */
  id: idSchema,
  /**
   * `user_sessions.device_id`, i.e. the value the priority-device rule stores in
   * `location_shares.priorityDeviceId` (spec §7.3). It is a UUID because the server mints it at
   * login and every access token carries the same claim.
   */
  deviceId: idSchema,
  deviceName: z.string().nullable(),
  ip: z.string().nullable(),
  isCurrentDevice: z.boolean(),
  lastActiveAt: timestampSchema,
  isOnline: z.boolean()
});
export type UserDevice = z.infer<typeof deviceSchema>;

export const devicesSchema = z.array(deviceSchema);
export type UserDevices = z.infer<typeof devicesSchema>;
