// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, del, errorMessage, get, patch, post, put } from '../src/client/api/client.ts';

/**
 * The typed API client is what every screen reaches the server through. Its failure modes are
 * part of the product: a network drop must read as `NETWORK`, a server error envelope must keep
 * its machine-readable code, and an abort must propagate instead of being swallowed into a toast.
 */

/** Installs a fetch double returning one canned response and recording the call. */
function stubFetch(respond: () => Promise<Response> | Response) {
  const calls: Array<{ input: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return respond();
    })
  );
  return calls;
}

function envelope(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, requestId: 'req_api', data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function errorEnvelope(status: number, code: string, message: string, details?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_api', error: { code, message, details } }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('query handling', () => {
  it('drops null and undefined values but keeps zero and false', async () => {
    const calls = stubFetch(() => envelope({ ok: true }));
    await get('/_user/me', { a: undefined, b: null, c: 0, d: false, e: 'x' } as never);
    expect(calls[0]!.input).toBe('/_user/me?c=0&d=false&e=x');
  });

  it('omits the question mark entirely when nothing is left', async () => {
    const calls = stubFetch(() => envelope({ ok: true }));
    await get('/_public/map/config', {} as never);
    expect(calls[0]!.input).toBe('/_public/map/config');
  });
});

describe('method bodies', () => {
  it('never sends a body or JSON content type on GET requests', async () => {
    const calls = stubFetch(() => envelope({ ok: true }));
    await api('/_user/me', { method: 'GET', body: { ignored: true } });
    expect(calls[0]!.init?.body).toBeUndefined();
    expect((calls[0]!.init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('serialises POST, PATCH and PUT bodies as JSON', async () => {
    for (const method of ['POST', 'PATCH', 'PUT'] as const) {
      const calls = stubFetch(() => envelope({ ok: true }));
      await api('/_x', { method, body: { field: 'value' } });
      expect(calls[0]!.init?.body).toBe('{"field":"value"}');
      expect((calls[0]!.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      vi.unstubAllGlobals();
    }
  });

  it('provides the helper methods with sane defaults', async () => {
    const calls = stubFetch(() => envelope({ ok: true }));
    await post('/_a');
    await patch('/_b');
    await put('/_c', { v: 1 });
    await del('/_d');
    expect(calls.map((call) => [call.init?.method, call.init?.body])).toEqual([
      ['POST', '{}'],
      ['PATCH', '{}'],
      ['PUT', '{"v":1}'],
      ['DELETE', undefined]
    ]);
  });
});

describe('failure modes', () => {
  it('maps a transport failure onto ApiError NETWORK with status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('connection refused'); }));
    const caught = await api('/_user/me').catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(0);
    expect((caught as ApiError).code).toBe('NETWORK');
  });

  it('lets an abort propagate untouched instead of wrapping it', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn(async () => { throw abort; }));
    const caught = await api('/_user/me').catch((error: unknown) => error);
    expect(caught).toBe(abort);
  });

  it('keeps the machine-readable code and field details from an error envelope', async () => {
    stubFetch(() => errorEnvelope(422, 'INVALID_INPUT', 'نام کاربری نامعتبر است.', { field: 'username' }));
    const caught = await api('/_auth/login', { method: 'POST', body: {} }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('INVALID_INPUT');
    expect((caught as ApiError).message).toBe('نام کاربری نامعتبر است.');
    expect((caught as ApiError).details).toEqual({ field: 'username' });
  });

  it('treats a non-JSON error body as an opaque failure with the HTTP status', async () => {
    stubFetch(() => new Response('<html>gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    const caught = await api('/_user/me').catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(502);
    expect((caught as ApiError).code).toBe('REQUEST_FAILED');
  });

  it('refuses a 200 response whose envelope says ok:false', async () => {
    stubFetch(() => new Response(JSON.stringify({ ok: false, requestId: 'req_api', error: { code: 'CONFLICT', message: 'تداخل است.' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    const caught = await api('/_user/me').catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('CONFLICT');
  });

  it('returns null for a 200 with an empty body rather than inventing a payload', async () => {
    stubFetch(() => new Response('', { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(api('/_user/ping')).resolves.toBeNull();
  });

  it('unwraps the envelope data payload on success', async () => {
    stubFetch(() => envelope({ id: 'usr_1', username: 'saeed' }));
    await expect(api<{ id: string }>('/_user/me')).resolves.toEqual({ id: 'usr_1', username: 'saeed' });
  });
});

describe('errorMessage', () => {
  it('reads the message from ApiError and plain Error alike', () => {
    expect(errorMessage(new ApiError(400, 'INVALID_INPUT', 'ورودی نامعتبر است.'))).toBe('ورودی نامعتبر است.');
    expect(errorMessage(new Error('خطای داخلی'))).toBe('خطای داخلی');
    expect(errorMessage('plain string')).toBe('خطای غیرمنتظره رخ داد.');
    expect(errorMessage(undefined)).toBe('خطای غیرمنتظره رخ داد.');
  });
});

describe('helper defaults', () => {
  it('sends an empty object body on PUT when none is provided', async () => {
    const calls = stubFetch(() => envelope({ ok: true }));
    await put('/_e');
    expect(calls[0]!.init?.body).toBe('{}');
  });
});
