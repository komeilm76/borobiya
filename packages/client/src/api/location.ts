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
 * Options for the picker's username search (`GET /_user/users/search`).
 *
 * Supports partial username matching alongside responder `category`, `incidentType` specialty,
 * `minRating`, `online` liveness, explicit `lat`/`lon` distance reference, and pagination.
 */
export interface UserSearchOptions {
  q?: string;
  category?: string;
  incidentType?: string;
  minRating?: number;
  online?: boolean;
  lat?: number;
  lon?: number;
  page?: number;
  limit?: number;
  sort?: "distance" | "username";
  radiusKm?: number;
  /** Alias accepted for backwards compatibility; serialized on the wire as `sort`. */
  sortBy?: "distance" | "username";
}

/** Builds the query string matching `userSearchSchema` (`sort`, `category`, `incidentType`, `lat`, `lon`, etc.). */
export function userSearchQuery(options: UserSearchOptions): string {
  const search = new URLSearchParams();
  const term = options.q?.trim();
  if (term) search.set("q", term);
  const category = options.category?.trim();
  if (category) search.set("category", category);
  const incidentType = options.incidentType?.trim();
  if (incidentType) search.set("incidentType", incidentType);
  if (options.minRating !== undefined) search.set("minRating", String(options.minRating));
  if (options.radiusKm !== undefined) search.set("radiusKm", String(options.radiusKm));
  // An untouched `online` control is not sent at all: `online=false` is a real filter ("show the
  // people who are currently *not* connected") and must never be the default of a clearable switch.
  if (options.online !== undefined) search.set("online", String(options.online));
  if (options.lat !== undefined) search.set("lat", String(options.lat));
  if (options.lon !== undefined) search.set("lon", String(options.lon));
  if (options.page !== undefined) search.set("page", String(options.page));
  if (options.limit !== undefined) search.set("limit", String(options.limit));
  const sort = options.sort ?? options.sortBy;
  if (sort) search.set("sort", sort);
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

/**
 * One granted window, as its receiver: no `from`/`to`/`maxPoints` may be sent, because the grant fixes
 * the window and the density and a receiver cannot widen either. An unknown id and somebody else's
 * grant answer identically with `404 SHARE_NOT_FOUND`, so a failed read here cannot tell the user which
 * of the two it was — the panel therefore says "this grant is no longer available" and nothing more.
 */
export async function fetchSharedLocationHistory(
  shareId: string,
  accessToken: string
): Promise<LocationHistoryResponse> {
  const params = sharePathParamsSchema.parse({ shareId });
  const response = await requestJson<unknown>(
    apiRoutes.location.getSharedHistory.url.replace(":shareId", encodeURIComponent(params.shareId)),
    { accessToken }
  );
  return locationHistoryResponseSchema.parse(response);
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
 * The caller's own recorded track for a window, oldest point first.
 *
 * Two properties of the endpoint the picker has to respect, both verified against the route rather
 * than assumed from its shape: there is **no span limit on reading one's own history** (the
 * `LOCATION_HISTORY_MAX_SHARE_DAYS` ceiling applies to *granting* a window, so a range picker that
 * capped itself at it would refuse requests the server answers), and the response is a **sample**
 * whenever the window holds more points than `LOCATION_HISTORY_READ_POINTS` — which is why the payload
 * carries `totalPoints` next to `points` and this client must show the difference rather than label a
 * 1000-dot polyline "the last 30 days".
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
