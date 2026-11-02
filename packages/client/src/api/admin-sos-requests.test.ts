import { afterEach, describe, expect, it, vi } from "vitest";
import { listAdminSosRequests } from "./admin-sos";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function record(description: string) {
  return {
    id: requestId,
    requesterId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    severity: "high" as const,
    // The queued record is the compact one: `cancelledBy`/`cancellationReason` belong to the detail read.
    description,
    incidentTypeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    location: { lat: 35.7, lon: 51.4, accuracy: 8, isManual: false },
    photoUrl: null,
    status: "pending" as const,
    cancellationReasonId: null,
    cancellationCustomText: null,
    cancelledAt: null,
    createdAt: "2026-11-02T10:00:00.000Z"
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin request queue search", () => {
  it("sends the term as q and keeps the filters it already had", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [record("آتش‌سوزی در بازار تهران")], total: 1, page: 1, limit: 5, totalPages: 1 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await listAdminSosRequests("admin-jwt", { q: "بازار", status: "pending", limit: 5, page: 2 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_admin/sos/requests?status=pending&q=%D8%A8%D8%A7%D8%B2%D8%A7%D8%B1&page=2&limit=5");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin-jwt");
    expect(page.items[0]?.description).toBe("آتش‌سوزی در بازار تهران");
  });

  it("omits q entirely when the palette has no term to send", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await listAdminSosRequests("admin-jwt", {});

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // An empty `q=` would reach the server as a filter for the empty string and match nothing.
    expect(url).toBe("/api/_admin/sos/requests");
  });
});
