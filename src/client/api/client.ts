/**
 * Typed same-origin API client. Every browser request uses a relative URL so the
 * application works unchanged behind the Arena preview proxy.
 */

/** Error thrown for a failed API call, carrying the machine-readable code. */
export class ApiError extends Error {
  /**
   * @param status HTTP status, or 0 for a transport failure.
   * @param code Stable error code such as `UNAUTHORIZED`.
   * @param message Human-readable Persian message.
   * @param details Optional field-level details from the server.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Options accepted by {@link api}. */
export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

interface Envelope<T> {
  ok: boolean;
  requestId?: string;
  data?: T;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

/**
 * Calls the JSON API and unwraps the response envelope.
 *
 * @param path Absolute API path such as `/_user/me`.
 * @param options Method, body, query and abort signal.
 * @returns The typed `data` payload.
 * @throws {ApiError} When the network fails or the server returns an error envelope.
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const suffix = search.toString();
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;
  if (options.body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`${path}${suffix ? `?${suffix}` : ''}`, {
      method,
      credentials: 'same-origin',
      headers,
      body,
      signal: options.signal
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'ارتباط با سرور برقرار نشد.');
  }
  const text = await response.text();
  let payload: Envelope<T> | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as Envelope<T>;
    } catch {
      payload = null;
    }
  }
  if (!response.ok || payload?.ok === false) {
    throw new ApiError(
      response.status,
      String(payload?.error?.code ?? 'REQUEST_FAILED'),
      String(payload?.error?.message ?? 'درخواست انجام نشد.'),
      payload?.error?.details
    );
  }
  return (payload?.data ?? (payload as unknown)) as T;
}

/** GET helper. */
export const get = <T = unknown>(path: string, query?: ApiOptions['query'], signal?: AbortSignal): Promise<T> =>
  api<T>(path, { query, signal });

/** POST helper. */
export const post = <T = unknown>(path: string, body?: unknown): Promise<T> => api<T>(path, { method: 'POST', body: body ?? {} });

/** PATCH helper. */
export const patch = <T = unknown>(path: string, body?: unknown): Promise<T> => api<T>(path, { method: 'PATCH', body: body ?? {} });

/** PUT helper. */
export const put = <T = unknown>(path: string, body?: unknown): Promise<T> => api<T>(path, { method: 'PUT', body: body ?? {} });

/** DELETE helper. */
export const del = <T = unknown>(path: string): Promise<T> => api<T>(path, { method: 'DELETE' });

/**
 * Extracts a displayable message from any thrown value.
 *
 * @param error Thrown value.
 * @returns A Persian message suitable for a toast or inline error.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'خطای غیرمنتظره رخ داد.';
}
