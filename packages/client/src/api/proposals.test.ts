import { afterEach, describe, expect, it, vi } from "vitest";
import { listPendingProposals } from "./proposals";

afterEach(() => vi.unstubAllGlobals());

describe("pending proposal inbox API", () => {
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
