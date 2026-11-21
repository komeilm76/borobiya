export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    headers?: Record<string, string>
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export const badRequest = (message = 'Invalid input', details?: Record<string, unknown>) =>
  new HttpError(400, 'INVALID_INPUT', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Permission denied') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') =>
  new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message = 'Conflict', details?: Record<string, unknown>) =>
  new HttpError(409, 'CONFLICT', message, details);
export const tooMany = (message = 'Too many requests', retryAfterSeconds = 1) =>
  new HttpError(429, 'RATE_LIMITED', message, { retryAfterSeconds }, { 'Retry-After': String(retryAfterSeconds) });
export const payloadTooLarge = (message = 'Payload too large') =>
  new HttpError(413, 'PAYLOAD_TOO_LARGE', message);
export const unsupportedMedia = (message = 'Expected application/json') =>
  new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', message);

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function publicError(error: unknown, requestId: string): {
  status: number;
  body: { ok: false; requestId: string; error: { code: string; message: string; details?: Record<string, unknown> } };
  headers?: Record<string, string>;
} {
  if (isHttpError(error)) {
    return {
      status: error.status,
      body: {
        ok: false,
        requestId,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {})
        }
      },
      headers: error.headers
    };
  }
  console.error(`[${requestId}] internal error`, error);
  return {
    status: 500,
    body: {
      ok: false,
      requestId,
      error: { code: 'INTERNAL', message: 'The request could not be completed.' }
    }
  };
}
