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

export const userProfileSchema = authUserSchema.extend({
  isActive: z.boolean(),
  avgRating: z.number().finite().min(0).max(5).nullable(),
  createdAt: timestampSchema
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateUserProfileSchema = z.strictObject({
  username: usernameSchema.optional()
}).refine((input) => Object.keys(input).length > 0, "At least one profile field must be provided.");
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

export const deviceSchema = z.strictObject({
  id: idSchema,
  deviceName: z.string().nullable(),
  ip: z.string().nullable(),
  isCurrentDevice: z.boolean(),
  lastActiveAt: timestampSchema,
  isOnline: z.boolean()
});
export type UserDevice = z.infer<typeof deviceSchema>;

export const devicesSchema = z.array(deviceSchema);
export type UserDevices = z.infer<typeof devicesSchema>;
