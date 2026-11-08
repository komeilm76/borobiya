/** Small same-origin API client. All browser requests use relative URLs. */
export class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message @param {unknown} [details] */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * @typedef {Object} ApiOptions
 * @property {string} [method]
 * @property {unknown} [body]
 * @property {Record<string, string|number|boolean|null|undefined>} [query]
 * @property {AbortSignal} [signal]
 */

/**
 * @param {string} path
 * @param {ApiOptions} [options]
 * @returns {Promise<any>}
 */
export async function api(path, options = {}) {
  const url = new URL(path, window.location.origin);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  const method = options.method || 'GET';
  /** @type {RequestInit} */
  const init = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: options.signal
  };
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await window.fetch(url.pathname + url.search, init);
  } catch (error) {
    throw new ApiError(0, 'NETWORK', 'ارتباط با سرور برقرار نشد.');
  }
  /** @type {any} */
  let payload = null;
  const text = await response.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }
  if (!response.ok || payload?.ok === false) {
    const code = payload?.error?.code || payload?.code || 'REQUEST_FAILED';
    const message = payload?.error?.message || payload?.message || 'درخواست انجام نشد.';
    throw new ApiError(response.status, String(code), String(message), payload?.error?.details || payload?.details);
  }
  return payload?.data ?? payload;
}

/** @param {string} path @param {Record<string, string|number|boolean|null|undefined>} [query] */
export const get = (path, query) => api(path, { query });
/** @param {string} path @param {unknown} [body] */
export const post = (path, body) => api(path, { method: 'POST', body: body ?? {} });
/** @param {string} path @param {unknown} [body] */
export const patch = (path, body) => api(path, { method: 'PATCH', body: body ?? {} });
/** @param {string} path @param {unknown} [body] */
export const put = (path, body) => api(path, { method: 'PUT', body: body ?? {} });
/** @param {string} path */
export const del = (path) => api(path, { method: 'DELETE' });

/** @param {unknown} error */
export function errorMessage(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'خطای غیرمنتظره رخ داد.';
}
