import { z } from "zod";
import {
  adminUserListQuerySchema,
  idParamsSchema,
  paginatedResponseSchema,
  toggleActiveSchema,
  userProfileSchema,
  type AdminUserListQuery,
  type UserProfile
} from "@shared/index";
import { apiRoutes } from "@shared/api";
import { requestJson } from "./http";

const adminUserListResponseSchema = paginatedResponseSchema(userProfileSchema);

export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;
export type AdminUserDetail = z.infer<typeof apiRoutes.admin.getUser.schema.responses[200]>;
export type AdminUserListOptions = Partial<AdminUserListQuery>;

/** Admin-only, exact-ID lookup; never infer a sender from a fuzzy username search. */
export async function getAdminUser(userId: string, accessToken: string, signal?: AbortSignal): Promise<AdminUserDetail> {
  const params = idParamsSchema.parse({ id: userId });
  const path = apiRoutes.admin.getUser.url.replace(":id", encodeURIComponent(params.id));
  const response = await requestJson<unknown>(path, { accessToken, signal, cache: "no-store" });
  const profile = apiRoutes.admin.getUser.schema.responses[200].parse(response);
  if (profile.id !== params.id) throw new Error("User profile does not match the requested account.");
  return profile;
}

export async function listAdminUsers(
  input: AdminUserListOptions,
  accessToken: string,
  signal?: AbortSignal
): Promise<AdminUserListResponse> {
  const query = adminUserListQuerySchema.parse(input);
  const search = new URLSearchParams();

  if (query.q) search.set("q", query.q);
  if (query.isActive !== undefined) search.set("isActive", String(query.isActive));
  if (query.hasCategory !== undefined) search.set("hasCategory", String(query.hasCategory));
  search.set("page", String(query.page));
  search.set("limit", String(query.limit));

  const response = await requestJson<unknown>(`${apiRoutes.admin.listUsers.url}?${search.toString()}`, {
    accessToken,
    signal
  });
  return adminUserListResponseSchema.parse(response);
}

export async function updateAdminUserStatus(
  userId: string,
  isActive: boolean,
  accessToken: string
): Promise<UserProfile> {
  const params = idParamsSchema.parse({ id: userId });
  const body = toggleActiveSchema.parse({ isActive });
  const path = apiRoutes.admin.updateUserStatus.url.replace(":id", encodeURIComponent(params.id));
  const response = await requestJson<unknown>(path, {
    method: "PATCH",
    body,
    accessToken
  });
  return userProfileSchema.parse(response);
}
