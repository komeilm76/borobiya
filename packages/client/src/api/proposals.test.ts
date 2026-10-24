import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptProposal, declineProposal, listPendingProposals } from "./proposals";

afterEach(() => vi.unstubAllGlobals());

describe("pending proposal inbox API", () => {
  it("posts decisions only to the chosen proposal and sends the optional decline reason", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const missionId = "33333333-3333-4333-8333-333333333333";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ missionId }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await acceptProposal("rescuer-jwt", id)).toBe(missionId);
    await declineProposal("rescuer-jwt", id, "Cannot respond now");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/_user/sos/proposals/${id}/accept`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/_user/sos/proposals/${id}/decline`);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toEqual({ reason: "Cannot respond now" });
    expect(new Headers(fetchMock.mock.calls[1]?.[1].headers).get("authorization")).toBe("Bearer rescuer-jwt");
  });

  it("sends bounded pagination with bearer credentials and parses the response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [], total: 0, page: 2, limit: 5, totalPages: 0
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listPendingProposals("rescuer-jwt", 2, 5)).resolves.toMatchObject({ total: 0, page: 2, limit: 5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_user/sos/proposals?page=2&limit=5");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer rescuer-jwt");
    expect(init.credentials).toBe("same-origin");
    await expect(listPendingProposals("rescuer-jwt", 1, 9999)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
