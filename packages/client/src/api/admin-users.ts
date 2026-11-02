import { z } from "zod";
import {
  adminUserListQuerySchema,
  devicesSchema,
  idParamsSchema,
  missionSchema,
  paginatedResponseSchema,
  toggleActiveSchema,
  userProfileSchema,
  type AdminUserListQuery,
  type UserProfile
} from "@shared/index";
import { apiRoutes } from "@shared/api";
import { requestJson } from "./http";

const adminUserListResponseSchema = paginatedResponseSchema(userProfileSchema);

/** The detail route answers with the account, its signed-in devices and its missions in one read. */
const adminUserDetailSchema = userProfileSchema.extend({
  devices: devicesSchema,
  missions: z.array(missionSchema)
});

export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;
export type AdminUserListOptions = Partial<AdminUserListQuery>;

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

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** `GET /_admin/users/:id` — the list row cannot answer "which devices, which missions". */
export async function getAdminUser(
  userId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AdminUserDetail> {
  const params = idParamsSchema.parse({ id: userId });
  const path = apiRoutes.admin.getUser.url.replace(":id", encodeURIComponent(params.id));
  const response = await requestJson<unknown>(path, { accessToken, signal });
  return adminUserDetailSchema.parse(response);
}
