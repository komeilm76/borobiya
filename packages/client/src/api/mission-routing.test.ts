import { afterEach, describe, expect, it, vi } from "vitest";
import { getMissionNavigationTarget, getMissionRouteChoices } from "./mission-routing";

const missionId = "50000000-0000-4000-8000-000000000005";
const from = { lat: 35.68, lon: 51.38 };
const to = { lat: 35.7, lon: 51.4 };
const reply = { profile: "bicycle", routes: [{ distance_m: 1420, duration_s: 300,
  polyline: "_p~iF~ps|U_ulLnnqC", legs: [] }], waypoints: [] };
afterEach(() => vi.unstubAllGlobals());

describe("mission navigation APIs", () => {
  it("fetches the exact rescuer-scoped target with bearer and validates coordinates", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ missionId, incident: to }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getMissionNavigationTarget("secret-token", missionId)).toEqual({ missionId, incident: to });
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/_user/sos/missions/${missionId}/navigation`);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer secret-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ missionId, incident: { lat: 200, lon: 51 } }))));
    await expect(getMissionNavigationTarget("secret-token", missionId)).rejects.toThrow();
  });
  it("POSTs to same-origin /route for up to three viable alternatives, never a remote origin", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(reply), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getMissionRouteChoices(from, to, "bicycle")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/route", expect.objectContaining({
      method: "POST", credentials: "same-origin",
      body: JSON.stringify({ from, to, profile: "bicycle", alternatives: 2 })
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...reply, profile: "car" }))));
    await expect(getMissionRouteChoices(from, to, "bicycle")).rejects.toThrow();
  });
  it("validates the optional offline gain/loss summary without inventing values", async () => {
    const elevation = { gain_m: 120, loss_m: 31, start_m: 1140, end_m: 1229, source: "mapzen-skadi" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...reply,
      routes: [{ ...reply.routes[0], elevation }] }), { status: 200 })));
    expect((await getMissionRouteChoices(from, to, "bicycle"))[0]?.elevation).toEqual(elevation);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...reply,
      routes: [{ ...reply.routes[0], elevation: null }] }), { status: 200 })));
    expect((await getMissionRouteChoices(from, to, "bicycle"))[0]?.elevation).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...reply,
      routes: [{ ...reply.routes[0], elevation: { ...elevation, gain_m: -10 } }] }), { status: 200 })));
    await expect(getMissionRouteChoices(from, to, "bicycle")).rejects.toThrow();
  });
  it("reports no route separately from an unavailable gateway", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    await expect(getMissionRouteChoices(from, to, "car")).rejects.toThrow("NO_ROUTE");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await expect(getMissionRouteChoices(from, to, "car")).rejects.toThrow("ROUTING_UNAVAILABLE");
  });
});
