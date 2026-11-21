import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSosStore } from '../src/client/stores/sos.ts';
import { MISSION_STATUS, SOS_STATUS } from '../src/shared/protocol.ts';

/**
 * The SOS composer is the one screen a user reaches in an emergency, and the store is the only
 * thing standing between that screen and the API. These tests pin the draft lifecycle, the shape
 * of the submit payload and what survives a failed request.
 */

const INCIDENT_TYPES = [
  { id: 'inc_1', name: 'آتش‌سوزی', icon: 'fire' },
  { id: 'inc_2', name: 'تصادف', icon: 'car' }
];
const REASONS = [{ id: 'rea_1', label: 'اشتباه ثبت شد' }];
const MISSIONS = [{ id: 'mis_1', status: MISSION_STATUS.ON_THE_WAY }];

type Handler = (url: string, init: RequestInit | undefined) => Response;

/** Installs a fetch double and returns the list of `METHOD path` calls it saw. */
function stubApi(handler?: Handler): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (handler) return handler(path, init);
      return json(route(path));
    })
  );
  return calls;
}

/** Builds a success envelope. */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, requestId: 'req_sos', data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** Builds an error envelope. */
function fail(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_sos', error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** Default payload for each endpoint the SOS store touches. */
function route(path: string): unknown {
  if (path === '/_public/incident-types') return { items: INCIDENT_TYPES };
  if (path === '/_public/cancellation-reasons') return { items: REASONS };
  if (path === '/_user/sos') return { items: [] };
  if (path === '/_user/missions') return { items: MISSIONS };
  if (path === '/_user/mission-offers') return { items: [] };
  return {};
}

/** Parses the JSON body of the last request that actually carried one (reloads are bodyless). */
function lastBody(): Record<string, unknown> {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const call = fetchMock.mock.calls.findLast((entry: unknown[]) => (entry[1] as RequestInit | undefined)?.body);
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SOS store loading', () => {
  it('loads both catalogs and both lists in one pass and seeds the first incident type', async () => {
    const sos = useSosStore();
    const calls = stubApi();
    await sos.load();

    expect(calls).toEqual([
      'GET /_public/incident-types',
      'GET /_public/cancellation-reasons',
      'GET /_user/sos',
      'GET /_user/missions',
      'GET /_user/mission-offers'
    ]);
    expect(sos.incidentTypes).toHaveLength(2);
    expect(sos.cancellationReasons).toHaveLength(1);
    expect(sos.missions).toHaveLength(1);
    expect(sos.draft.incidentTypeId).toBe('inc_1');
    expect(sos.loading).toBe(false);
    expect(sos.error).toBe(null);
  });

  it('keeps a chosen incident type when the catalogs reload', async () => {
    const sos = useSosStore();
    stubApi();
    await sos.load();
    sos.draft.incidentTypeId = 'inc_2';
    await sos.load();
    expect(sos.draft.incidentTypeId).toBe('inc_2');
  });

  it('surfaces a read failure once and always clears the loading flag', async () => {
    const sos = useSosStore();
    stubApi((path) => (path === '/_user/sos' ? fail(500, 'INTERNAL', 'boom') : json(route(path))));
    await sos.load();
    expect(sos.loading).toBe(false);
    expect(sos.error).toBeTruthy();
    expect(sos.requests).toEqual([]);
  });

  it('treats a missing items key as an empty list rather than throwing', async () => {
    const sos = useSosStore();
    stubApi(() => json({}));
    await sos.load();
    expect(sos.incidentTypes).toEqual([]);
    expect(sos.requests).toEqual([]);
    expect(sos.missions).toEqual([]);
    expect(sos.error).toBe(null);
  });
});

describe('SOS store draft lifecycle', () => {
  it('clamps the step cursor at both ends', () => {
    const sos = useSosStore();
    expect(sos.draft.step).toBe(1);
    sos.previousStep();
    expect(sos.draft.step).toBe(1);
    for (let i = 0; i < 10; i += 1) sos.nextStep();
    expect(sos.draft.step).toBe(sos.stepTotal);
    expect(sos.stepTotal).toBe(4);
  });

  it('resets to the seeded incident type and keeps a supplied fix', async () => {
    const sos = useSosStore();
    stubApi();
    await sos.load();
    sos.draft.severity = 'high';
    sos.draft.description = 'دود از پنجره';
    sos.draft.step = 3;
    sos.resetDraft();
    expect(sos.draft.severity).toBe('medium');
    expect(sos.draft.description).toBe('');
    expect(sos.draft.step).toBe(1);
    expect(sos.draft.incidentTypeId).toBe('inc_1');

    sos.resetDraft({ latitude: 35.7, longitude: 51.4, accuracy: 5 });
    expect(sos.draft.latitude).toBe(35.7);
    expect(sos.draft.longitude).toBe(51.4);
    expect(sos.draft.accuracy).toBe(5);
    expect(sos.draft.isManual).toBe(false);
  });

  it('clears the seeded incident type when the catalog is empty', async () => {
    const sos = useSosStore();
    stubApi(() => json({ items: [] }));
    await sos.load();
    sos.resetDraft();
    expect(sos.draft.incidentTypeId).toBe('');
  });
});

describe('SOS store submission', () => {
  it('posts the draft, prepends the created request and resets the composer', async () => {
    const sos = useSosStore();
    const created = { id: 'sos_9', status: SOS_STATUS.PENDING, trackingCode: 'TRK-9' };
    const calls = stubApi((path, init) => {
      if (path === '/_user/sos' && init?.method === 'POST') return json({ sos: created });
      return json(route(path));
    });
    await sos.load();

    sos.draft.severity = 'high';
    sos.draft.description = 'ساختمان در حال سوختن است';
    sos.draft.latitude = 35.68;
    sos.draft.longitude = 51.39;
    sos.draft.accuracy = 8;
    sos.draft.isManual = true;

    const result = await sos.submit();

    expect(calls).toContain('POST /_user/sos');
    expect(lastBody()).toEqual({
      incidentTypeId: 'inc_1',
      severity: 'high',
      description: 'ساختمان در حال سوختن است',
      latitude: 35.68,
      longitude: 51.39,
      accuracy: 8,
      isManual: true
    });
    // The response is re-serialized, so compare by value: what matters is that the new request
    // lands at the head of the list without a reload.
    expect(result).toEqual(created);
    expect(sos.requests[0]).toEqual(created);
    expect(sos.submitting).toBe(false);
    // A second request must never resend the first one by accident.
    expect(sos.draft.description).toBe('');
    expect(sos.draft.step).toBe(1);
  });

  it('includes the photo only when one was attached', async () => {
    const sos = useSosStore();
    stubApi((path, init) => {
      if (path === '/_user/sos' && init?.method === 'POST') return json({ sos: { id: 'sos_1' } });
      return json(route(path));
    });
    await sos.load();

    await sos.submit();
    expect(lastBody()).not.toHaveProperty('photoDataUrl');

    sos.draft.photoDataUrl = 'data:image/png;base64,AAAA';
    await sos.submit();
    expect(lastBody().photoDataUrl).toBe('data:image/png;base64,AAAA');
  });

  it('keeps the draft and clears the submitting flag when the post fails', async () => {
    const sos = useSosStore();
    stubApi((path, init) => {
      if (path === '/_user/sos' && init?.method === 'POST') return fail(422, 'VALIDATION', 'incident type required');
      return json(route(path));
    });
    await sos.load();
    sos.draft.description = 'متن حفظ شود';

    await expect(sos.submit()).rejects.toMatchObject({ status: 422 });
    expect(sos.submitting).toBe(false);
    // Nothing is wiped: the user fixes the form and presses again.
    expect(sos.draft.description).toBe('متن حفظ شود');
    expect(sos.requests).toEqual([]);
  });

  it('does not clear an earlier read error just because a submit started', async () => {
    const sos = useSosStore();
    stubApi((path, init) => {
      if (path === '/_user/sos' && init?.method === 'POST') return json({ sos: { id: 'sos_2' } });
      return json(route(path));
    });
    await sos.load();
    sos.error = 'هشدار قبلی';
    await sos.submit();
    expect(sos.error).toBe(null);
  });
});

describe('SOS store mutations', () => {
  it('cancels with a reason, sends the detail only when given and reloads', async () => {
    const sos = useSosStore();
    const calls = stubApi();
    await sos.load();

    await sos.cancel('sos_1', 'rea_1');
    expect(calls).toContain('POST /_user/sos/sos_1/cancel');
    expect(lastBody()).toEqual({ reasonId: 'rea_1' });

    await sos.cancel('sos_1', 'rea_1', 'کاربر درخواست را پس گرفت');
    expect(lastBody()).toEqual({ reasonId: 'rea_1', detail: 'کاربر درخواست را پس گرفت' });
    // One initial load plus one reload per cancel.
    expect(calls.filter((call) => call === 'GET /_user/sos')).toHaveLength(3);
  });

  it('accepts a dispatch and remembers the mission it created', async () => {
    const sos = useSosStore();
    const calls = stubApi((path, init) => {
      if (path === '/_user/sos/sos_1/accept' && init?.method === 'POST') {
        return json({ missionId: 'mis_7', missionStatus: MISSION_STATUS.ON_THE_WAY });
      }
      return json(route(path));
    });
    await sos.load();
    expect(sos.activeMissionId).toBe(null);

    const result = await sos.accept('sos_1');
    expect(calls).toContain('POST /_user/sos/sos_1/accept');
    expect(sos.activeMissionId).toBe('mis_7');
    expect(result.missionId).toBe('mis_7');
  });

  it('advances and rates a mission with a note only when supplied', async () => {
    const sos = useSosStore();
    const calls = stubApi();
    await sos.load();

    await sos.progress('mis_1', 'arrive');
    expect(calls).toContain('POST /_user/missions/mis_1/progress');
    expect(lastBody()).toEqual({ action: 'arrive' });

    await sos.progress('mis_1', 'complete', 'رسیدیم');
    expect(lastBody()).toEqual({ action: 'complete', note: 'رسیدیم' });

    await sos.rate('mis_1', 5);
    expect(lastBody()).toEqual({ rating: 5 });

    await sos.rate('mis_1', 4, 'خوب بود');
    expect(lastBody()).toEqual({ rating: 4, note: 'خوب بود' });
  });
});

describe('SOS store derived state', () => {
  it('picks the newest request that has not finished', () => {
    const sos = useSosStore();
    expect(sos.activeRequest).toBe(null);
    sos.requests = [
      { id: 'sos_new', status: SOS_STATUS.PENDING },
      { id: 'sos_old', status: SOS_STATUS.DISPATCHED }
    ] as never;
    expect(sos.activeRequest?.id).toBe('sos_new');

    sos.requests = [
      { id: 'sos_done', status: SOS_STATUS.COMPLETED },
      { id: 'sos_gone', status: SOS_STATUS.CANCELLED },
      { id: 'sos_late', status: SOS_STATUS.EXPIRED }
    ] as never;
    expect(sos.activeRequest).toBe(null);
  });

  it('picks the mission that is still running', () => {
    const sos = useSosStore();
    expect(sos.activeMission).toBe(null);
    sos.missions = [
      { id: 'mis_done', status: MISSION_STATUS.COMPLETED },
      { id: 'mis_live', status: MISSION_STATUS.IN_PROGRESS }
    ] as never;
    expect(sos.activeMission?.id).toBe('mis_live');

    sos.missions = [{ id: 'mis_x', status: MISSION_STATUS.CANCELLED }] as never;
    expect(sos.activeMission).toBe(null);
  });
});

describe('SOS store realtime updates', () => {
  it('reloads for a payload that names a request and ignores one that does not', async () => {
    const sos = useSosStore();
    const calls = stubApi();
    await sos.load();
    const before = calls.length;

    sos.applyRealtimeUpdate({});
    sos.applyRealtimeUpdate({ status: SOS_STATUS.CANCELLED });
    expect(calls.length).toBe(before);

    sos.applyRealtimeUpdate({ sosId: 'sos_3', status: SOS_STATUS.CANCELLED });
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(before));
    expect(calls.slice(before)).toContain('GET /_user/sos');
  });
});

describe('SOS store detail merging', () => {
  it('merges the timeline payload onto the cached request in place', async () => {
    const sos = useSosStore();
    sos.requests = [{ id: 'sos_9', status: 'pending', timeline: undefined } as never];
    stubApi((path) => {
      if (path === '/_user/sos/sos_9') {
        return json({ id: 'sos_9', status: 'in_progress', timeline: [{ at: 1, label: 'dispatched' }] });
      }
      return json(route(path));
    });

    const detail = await sos.loadDetail('sos_9');
    expect(sos.requests).toHaveLength(1);
    expect((sos.requests as any[])[0].status).toBe('in_progress');
    expect((sos.requests as any[])[0].timeline).toEqual([{ at: 1, label: 'dispatched' }]);
    expect(detail?.id).toBe('sos_9');
    expect(sos.error).toBe(null);
  });

  it('prepends a request that was not in the cached list', async () => {
    const sos = useSosStore();
    sos.requests = [];
    stubApi((path) => {
      if (path === '/_user/sos/sos_10') return json({ id: 'sos_10', status: 'pending' });
      return json(route(path));
    });

    await sos.loadDetail('sos_10');
    expect((sos.requests as any[]).map((item) => item.id)).toEqual(['sos_10']);
  });

  it('surfaces a read failure through the error ref and returns null', async () => {
    const sos = useSosStore();
    sos.requests = [];
    stubApi(() => fail(500, 'INTERNAL', 'خواندن انجام نشد.'));

    const result = await sos.loadDetail('sos_11');
    expect(result).toBe(null);
    expect(sos.error).toBeTruthy();
    expect(sos.requests).toHaveLength(0);
  });
});
