import { z } from "zod";
import {
  dispatchResponseSchema,
  nearestRespondersResponseSchema,
  paginatedResponseSchema,
  sosRequestRecordSchema,
  type DispatchResponse,
  type NearestRespondersResponse,
  type SosRequestRecord,
  type SosRequestStatus
} from "@shared/index";
import { apiRoutes } from "@shared/api";
import { apiBasePath, requestJson } from "./http";

const paginatedSosRequestsSchema = paginatedResponseSchema(sosRequestRecordSchema);

/** Issue a 60-second same-origin URL after the live bearer/session and participant checks. */
export async function getSosPhotoSrc(requestId: string, accessToken: string): Promise<string> {
  const path = apiRoutes.sos.getPhotoAccess.url.replace(":id", encodeURIComponent(requestId));
  const response = await requestJson<unknown>(path, { accessToken });
  const access = apiRoutes.sos.getPhotoAccess.schema.responses[200].parse(response);
  // The server-chosen URL is app-relative; never turn an untrusted photoUrl into a browser origin.
  return `${apiBasePath()}${access.url}`;
}

export type PaginatedSosRequests = z.infer<typeof paginatedSosRequestsSchema>;

export interface ListAdminSosRequestsParams {
  status?: SosRequestStatus;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

/** Reads the paginated SOS request queue (`GET /_admin/sos/requests`). */
export async function listAdminSosRequests(
  accessToken: string,
  params: ListAdminSosRequestsParams = {}
): Promise<PaginatedSosRequests> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.limit !== undefined) search.set("limit", String(params.limit));

  const query = search.toString();
  const path = query ? `${apiRoutes.admin.listSosRequests.url}?${query}` : apiRoutes.admin.listSosRequests.url;
  const response = await requestJson<unknown>(path, {
    method: "GET",
    accessToken,
    signal: params.signal
  });
  return paginatedSosRequestsSchema.parse(response);
}

/** Reads a single SOS request record (`GET /_admin/sos/requests/:id`). */
export async function getAdminSosRequest(
  id: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<SosRequestRecord> {
  const path = apiRoutes.admin.getSosRequest.url.replace(":id", encodeURIComponent(id));
  const response = await requestJson<unknown>(path, {
    method: "GET",
    accessToken,
    signal
  });
  return sosRequestRecordSchema.parse(response);
}

/** Fetches the top 10 nearest qualified, active, non-busy responders (`GET /_admin/sos/requests/:id/nearest`). */
export async function getNearestSosResponders(
  id: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<NearestRespondersResponse> {
  const path = apiRoutes.admin.getNearestResponders.url.replace(":id", encodeURIComponent(id));
  const response = await requestJson<unknown>(path, {
    method: "GET",
    accessToken,
    signal
  });
  return nearestRespondersResponseSchema.parse(response);
}

/** Dispatches one or more selected responders to an SOS request (`POST /_admin/sos/requests/:id/dispatch`). */
export async function dispatchSosResponders(
  id: string,
  rescuerIds: string[],
  accessToken: string
): Promise<DispatchResponse> {
  const path = apiRoutes.admin.dispatchSosRequest.url.replace(":id", encodeURIComponent(id));
  const response = await requestJson<unknown>(path, {
    method: "POST",
    accessToken,
    body: { rescuerIds }
  });
  return dispatchResponseSchema.parse(response);
}
