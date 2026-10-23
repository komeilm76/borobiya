import { apiRoutes } from "@shared/api";

export interface JsonRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
  /** Disables automatic 401 refresh retry for internal session-hydration calls inside `refreshFromCookie`. */
  skipAuthRefresh?: boolean;
}

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  issues?: unknown;
}

export type AccessTokenRefresher = (failedToken: string) => Promise<string | null>;

let registeredRefresher: AccessTokenRefresher | null = null;

/**
 * Registers the active session's token refresher so any authenticated REST or multipart request
 * that hits an expired/clock-skewed `401` rotates once through `POST /_auth/refresh` and retries.
 */
export function registerAccessTokenRefresher(refresher: AccessTokenRefresher | null): void {
  registeredRefresher = refresher;
}

export async function refreshAccessTokenAfterUnauthorized(failedToken: string): Promise<string | null> {
  if (!registeredRefresher) return null;
  try {
    const refreshed = await registeredRefresher(failedToken);
    return refreshed && refreshed !== failedToken ? refreshed : null;
  } catch {
    return null;
  }
}

/**
 * Same-origin prefix the browser uses for API traffic. A relative `VITE_API_URL` becomes the
 * proxy prefix (nginx and Vite both strip it before the API sees the request); an absolute URL
 * means the client talks to the API directly and no prefix is prepended.
 */
export function apiBasePath(): string {
  const configured = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");
  return configured?.startsWith("/") && configured !== "/" ? configured : "/api";
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: unknown[];

  constructor(status: number, code: string, message: string, issues: unknown[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

function buildJsonInit(options: JsonRequestOptions, token: string | null): RequestInit {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  return {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
    signal: options.signal
  };
}

export async function requestJson<T>(
  path: string,
  options: JsonRequestOptions = {}
): Promise<T> {
  const url = `${apiBasePath()}${path}`;
  const initialToken = options.accessToken ?? null;
  let response = await fetch(url, buildJsonInit(options, initialToken));

  if (response.status === 401 && initialToken && !options.skipAuthRefresh && registeredRefresher) {
    const refreshedToken = await refreshAccessTokenAfterUnauthorized(initialToken);
    if (refreshedToken) {
      response = await fetch(url, buildJsonInit(options, refreshedToken));
    }
  }

  let payload: unknown;
  try {
    payload = response.status === 204 ? undefined : await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const errorPayload = payload && typeof payload === "object" ? payload as ErrorPayload : {};
    throw new ApiError(
      response.status,
      typeof errorPayload.code === "string" ? errorPayload.code : "REQUEST_FAILED",
      typeof errorPayload.message === "string" ? errorPayload.message : "The request could not be completed.",
      Array.isArray(errorPayload.issues) ? errorPayload.issues : []
    );
  }

  return payload as T;
}

export const authApiRoutes = apiRoutes.auth;
export const publicApiRoutes = apiRoutes.public;
export const userApiRoutes = apiRoutes.user;
