import { afterEach, describe, expect, it, vi } from "vitest";
import { getNearestSosResponders } from "./admin-sos";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin responder search API", () => {
  it("encodes the term and preserves the existing replacement flag", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ responders: [] }), {
      status: 200, headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNearestSosResponders(requestId, "admin-jwt", undefined, false, "rescue+far"))
      .resolves.toEqual({ responders: [] });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe(`/api/_admin/sos/requests/${requestId}/nearest?search=rescue%2Bfar`);
    await getNearestSosResponders(requestId, "admin-jwt", undefined, true);
    expect(calls[1]?.[0]).toBe(`/api/_admin/sos/requests/${requestId}/nearest?excludeAssigned=true`);
  });
});
