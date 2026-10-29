import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceRescuerMission, getMission, listRescuerMissions, rateMission } from "./mission";

const id = "30000000-0000-4000-8000-000000000003";
afterEach(() => vi.unstubAllGlobals());
describe("mission rating API client", () => {
  it("sends the validated rating to a same-origin requester endpoint", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await rateMission("token", id, { rating: 5, comment: "  Thank you  " });
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/_user/missions/${id}/rate`);
    const init = fetcher.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ rating: 5, comment: "Thank you" });
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token");
    expect(init.credentials).toBe("same-origin");
    await expect(rateMission("token", id, { rating: 6 })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("parses persisted rating from participant-scoped mission detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id, sosRequestId: id, requesterId: id, rescuerId: id, status: "completed", cancelledBy: null,
      cancellationReasonId: null, cancellationCustomText: null, cancelledAt: null,
      createdAt: "2026-10-24T12:00:00Z", updatedAt: "2026-10-24T12:00:00Z",
      cancellationReason: null, rating: 3
    }))));
    expect((await getMission("token", id)).rating).toBe(3);
  });
});

describe("rescuer progression API", () => {
  it("bypasses browser cache when checking the rescuer's server mission status", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })));
    vi.stubGlobal("fetch", fetcher);
    await listRescuerMissions("token");
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toContain("role=rescuer");
    expect(init.cache).toBe("no-store");
  });

  it("sends a validated PATCH and parses only a valid mission response", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id, sosRequestId: id, requesterId: id, rescuerId: id, status: "on_the_way", cancelledBy: null,
      cancellationReasonId: null, cancellationCustomText: null, cancelledAt: null,
      createdAt: "2026-10-24T12:00:00Z", updatedAt: "2026-10-24T12:00:00Z"
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await advanceRescuerMission("token", id, "on_the_way")).status).toBe("on_the_way");
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/_user/missions/${id}/status`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "on_the_way" });
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token");
    expect(init.credentials).toBe("same-origin");
    await expect(advanceRescuerMission("token", id, "pending" as never)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
