import { afterEach, describe, expect, it, vi } from "vitest";
import { getMissionLocationTrace, MISSION_TRACE_DEADLINE_MS, saveSuggestedMissionRoute } from "./mission";

const id = "30000000-0000-4000-8000-000000000003";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("completed mission route comparison API", () => {
  it("fetches cursor pages without a browser cache and preserves every returned GPS point", async () => {
    const stamp = "2026-10-23T12:00:00.000Z";
    const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      points: [{ lat: 35.7, lon: 51.4, accuracy: 12, observedAt: stamp, role: "rescuer" }],
      nextCursor: String(url).includes("cursor=") ? null : 5, suggestedRoute: null
    })));
    vi.stubGlobal("fetch", fetcher);
    const result = await getMissionLocationTrace("token", id);
    expect(result.points).toHaveLength(2);
    expect(result.incomplete).toBe(false);
    expect(fetcher.mock.calls[0]![0]).toBe(`/api/_user/missions/${id}/location-trace`);
    expect(fetcher.mock.calls[1]![0]).toBe(`/api/_user/missions/${id}/location-trace?cursor=5`);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  });
  it("rejects a backwards trace cursor instead of repeating private GPS pages", async () => {
    const stamp = "2026-10-23T12:00:00.000Z";
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      points: [{ lat: 35.7, lon: 51.4, accuracy: 12, observedAt: stamp, role: "rescuer" }],
      nextCursor: [5, 6, 5][fetcher.mock.calls.length - 1] ?? null,
      suggestedRoute: null
    })));
    vi.stubGlobal("fetch", fetcher);
    await expect(getMissionLocationTrace("token", id)).rejects.toThrow("INVALID_MISSION_TRACE_CURSOR");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("times out a stalled completed-mission trace instead of leaving the comparison spinner stuck", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const rejected = expect(getMissionLocationTrace("token", id)).rejects.toThrow("MISSION_TRACE_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(MISSION_TRACE_DEADLINE_MS);
    await rejected;
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not fetch another private GPS page after a timed-out read responds late", async () => {
    vi.useFakeTimers();
    const stamp = "2026-10-23T12:00:00.000Z";
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const rejected = expect(getMissionLocationTrace("token", id)).rejects.toThrow("MISSION_TRACE_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(MISSION_TRACE_DEADLINE_MS);
    await rejected;
    release(new Response(JSON.stringify({ points: [{ lat: 35.7, lon: 51.4, accuracy: 12,
      observedAt: stamp, role: "rescuer" }], nextCursor: 5, suggestedRoute: null })));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("ends a cancelled trace read even if its transport ignores abort", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const rejected = expect(getMissionLocationTrace("token", id, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends only the selected route snapshot to a same-origin member endpoint", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await saveSuggestedMissionRoute("token", id, { profile: "foot", distanceM: 1000, polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" });
    expect(fetcher.mock.calls[0]![0]).toBe(`/api/_user/missions/${id}/suggested-route`);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "same-origin" });
  });
});
