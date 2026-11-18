import { afterEach, describe, expect, it, vi } from "vitest";
import { getMissionLocationTrace, saveSuggestedMissionRoute } from "./mission";

const id = "30000000-0000-4000-8000-000000000003";
afterEach(() => vi.unstubAllGlobals());

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
  it("sends only the selected route snapshot to a same-origin member endpoint", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await saveSuggestedMissionRoute("token", id, { profile: "foot", distanceM: 1000, polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" });
    expect(fetcher.mock.calls[0]![0]).toBe(`/api/_user/missions/${id}/suggested-route`);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "same-origin" });
  });
});
