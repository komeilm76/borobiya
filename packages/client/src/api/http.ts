import { apiRoutes } from "@shared/api";

export interface JsonRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
}

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  issues?: unknown;
}

function apiPrefix(): string {
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

export async function requestJson<T>(
  path: string,
  options: JsonRequestOptions = {}
): Promise<T> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.accessToken) headers.set("authorization", `Bearer ${options.accessToken}`);

  const response = await fetch(`${apiPrefix()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "same-origin",
    signal: options.signal
  });

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
