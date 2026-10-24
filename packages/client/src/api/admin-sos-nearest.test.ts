import { afterEach, describe, expect, it, vi } from "vitest";
import { getNearestSosResponders } from "./admin-sos";

const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllGlobals());

describe("nearest replacement responder request", () => {
  it("asks the server to exclude previous assignees before its nearest-ten limit", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ responders: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getNearestSosResponders(id, "admin-token", undefined, true))
      .resolves.toEqual({ responders: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/_admin/sos/requests/${id}/nearest?excludeAssigned=true`);
    expect(new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers)
      .get("authorization")).toBe("Bearer admin-token");
    await expect(getNearestSosResponders(id, "admin-token")).resolves.toEqual({ responders: [] });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/_admin/sos/requests/${id}/nearest`);
  });
});
