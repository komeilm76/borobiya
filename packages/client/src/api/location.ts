import {
  createLocationHistoryShareSchema,
  createLocationShareSchema,
  locationHistoryQuerySchema,
  locationHistoryResponseSchema,
  locationHistoryShareCreatedSchema,
  locationHistorySharesResponseSchema,
  locationShareCreatedSchema,
  locationSharesResponseSchema,
  sharePathParamsSchema,
  userSearchResponseSchema,
  type CreateLocationHistoryShareInput,
  type CreateLocationShareInput,
  type LocationHistoryResponse,
  type LocationHistoryShareCreated,
  type LocationHistorySharesResponse,
  type LocationShareCreated,
  type LocationSharesResponse,
  type UserSearchResponse
} from "@shared/index";
import { apiRoutes } from "@shared/api";
import { requestJson } from "./http";

/**
 * REST boundary for sharing and reading locations. Inputs are parsed with the *shared* schemas
 * before they go out, and responses are parsed on the way in: a contract change then surfaces as
 * one clear error at this boundary instead of an `undefined` three components deeper.
 */

/**
 * Options for the picker's username search.
 *
 * `category` and `incidentType` are deliberately absent. The server answers those with
 * `400 SEARCH_FILTER_UNSUPPORTED` because the responder tables do not exist yet, so a control
 * for them would either do nothing or fail — and a filtered-looking list that is not filtered is
 * the worst option of the three. When T4.1.1 lands the categories, this type gains the fields and
 * `ShareDialog` gains the selects.
 */
export interface UserSearchOptions {
  q?: string;
  minRating?: number;
  online?: boolean;
  page?: number;
  limit?: number;
  sortBy?: "distance";
}

/** Builds the query string, omitting anything the user left untouched. */
export function userSearchQuery(options: UserSearchOptions): string {
  const search = new URLSearchParams();
  const term = options.q?.trim();
  if (term) search.set("q", term);
  if (options.minRating !== undefined) search.set("minRating", String(options.minRating));
  // An untouched `online` control is not sent at all: `online=false` is a real filter ("show the
  // people who are currently *not* connected") and must never be the default of a clearable switch.
  if (options.online !== undefined) search.set("online", String(options.online));
  if (options.page !== undefined) search.set("page", String(options.page));
  if (options.limit !== undefined) search.set("limit", String(options.limit));
  if (options.sortBy) search.set("sortBy", options.sortBy);
  return search.toString();
}

export async function searchUsers(
  options: UserSearchOptions,
  accessToken: string,
  signal?: AbortSignal
): Promise<UserSearchResponse> {
  const query = userSearchQuery(options);
  const path = `${apiRoutes.user.search.url}${query ? `?${query}` : ""}`;
  const response = await requestJson<unknown>(path, { accessToken, signal });
  return userSearchResponseSchema.parse(response);
}

export async function createLocationShare(
  input: CreateLocationShareInput,
  accessToken: string
): Promise<LocationShareCreated> {
  const body = createLocationShareSchema.parse(input);
  const response = await requestJson<unknown>(apiRoutes.location.createShare.url, {
    method: "POST",
    body,
    accessToken
  });
  return locationShareCreatedSchema.parse(response);
}

/** Both directions of the live-share list in one round trip (My Shares and Shared With Me). */
export async function listLocationShares(accessToken: string): Promise<LocationSharesResponse> {
  const response = await requestJson<unknown>(apiRoutes.location.listShares.url, { accessToken });
  return locationSharesResponseSchema.parse(response);
}

export async function revokeLocationShare(shareId: string, accessToken: string): Promise<void> {
  const params = sharePathParamsSchema.parse({ shareId });
  await requestJson<unknown>(
    apiRoutes.location.revokeShare.url.replace(":shareId", encodeURIComponent(params.shareId)),
    { method: "DELETE", accessToken }
  );
}

export async function createLocationHistoryShare(
  input: CreateLocationHistoryShareInput,
  accessToken: string
): Promise<LocationHistoryShareCreated> {
  const body = createLocationHistoryShareSchema.parse(input);
  const response = await requestJson<unknown>(apiRoutes.location.createHistoryShare.url, {
    method: "POST",
    body,
    accessToken
  });
  return locationHistoryShareCreatedSchema.parse(response);
}

export async function listLocationHistoryShares(
  accessToken: string
): Promise<LocationHistorySharesResponse> {
  const response = await requestJson<unknown>(apiRoutes.location.listHistoryShares.url, { accessToken });
  return locationHistorySharesResponseSchema.parse(response);
}

export async function revokeLocationHistoryShare(shareId: string, accessToken: string): Promise<void> {
  const params = sharePathParamsSchema.parse({ shareId });
  await requestJson<unknown>(
    apiRoutes.location.revokeHistoryShare.url.replace(":shareId", encodeURIComponent(params.shareId)),
    { method: "DELETE", accessToken }
  );
}

export interface LocationHistoryWindow {
  from: string;
  to: string;
}

/**
 * The caller's own recorded track for a window, narrowed by the grants they have issued. The
 * server caps the span (1–7 days, configurable) and returns the most recent points when the
 * window holds more than its budget, which is why the response also carries `totalPoints`.
 */
export async function fetchMyLocationHistory(
  window: LocationHistoryWindow,
  accessToken: string
): Promise<LocationHistoryResponse> {
  const query = locationHistoryQuerySchema.parse(window);
  const response = await requestJson<unknown>(
    `${apiRoutes.location.getHistory.url}?${new URLSearchParams(query).toString()}`,
    { accessToken }
  );
  return locationHistoryResponseSchema.parse(response);
}
