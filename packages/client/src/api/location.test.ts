import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import {
  createLocationHistoryShare,
  createLocationShare,
  fetchMyLocationHistory,
  listLocationHistoryShares,
  listLocationShares,
  revokeLocationHistoryShare,
  revokeLocationShare,
  searchUsers,
  userSearchQuery
} from "./location";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const token = "access-token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) =>
    handler(String(input), init ?? {})
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function searchResponse(items: unknown[] = [], total = items.length, extra: Record<string, unknown> = {}) {
  return { items, total, page: 1, limit: 20, totalPages: Math.ceil(total / 20), ...extra };
}

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "hamrah_one",
  category: null,
  avgRating: 4.5,
  isOnline: true,
  distance: 12.4
};

describe("user search query", () => {
  it("sends only what the user actually set", () => {
    expect(userSearchQuery({ q: "   " })).toBe("");
    expect(userSearchQuery({})).toBe("");
    expect(userSearchQuery({ q: "  ham  " })).toBe("q=ham");
  });

  it("keeps an explicit false distinct from an untouched control", () => {
    // `online=false` means "only people who are currently offline"; dropping it would silently
    // widen the result set, and sending it by default would hide everyone who is online.
    expect(userSearchQuery({ q: "ham", online: false })).toBe("q=ham&online=false");
    expect(userSearchQuery({ q: "ham", online: true })).toBe("q=ham&online=true");
    expect(userSearchQuery({ q: "ham" })).toBe("q=ham");
  });

  it("passes the paging, filter, and sort controls through using the wire query schema keys", () => {
    expect(userSearchQuery({ q: "ha", minRating: 4, page: 2, limit: 25, sortBy: "distance" })).toBe(
      "q=ha&minRating=4&page=2&limit=25&sort=distance"
    );
  });
});

describe("user search call", () => {
  it("calls the same-origin route with the bearer token and validates the payload", async () => {
    const fetchMock = stubFetch(() => jsonResponse(searchResponse([row])));

    await expect(searchUsers({ q: "ham" }, token)).resolves.toEqual({
      items: [row],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_user/users/search?q=ham");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(init.credentials).toBe("same-origin");
  });

  it("refuses a malformed page instead of rendering half a row", async () => {
    stubFetch(() => jsonResponse({ items: [{ ...row, distance: "far away" }], total: 1, page: 1, limit: 20, totalPages: 1 }));
    await expect(searchUsers({ q: "ham" }, token)).rejects.toThrow();
  });

  it("forwards an abort signal so a superseded keystroke cancels its request", async () => {
    const controller = new AbortController();
    const fetchMock = stubFetch(() => jsonResponse(searchResponse()));
    await searchUsers({ q: "ham" }, token, controller.signal);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("surfaces the server's refusal of unsupported filters as an ApiError", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          code: "SEARCH_FILTER_UNSUPPORTED",
          message: "category is not supported yet.",
          issues: [{ code: "unsupported_filter", filters: ["category"] }]
        },
        400
      )
    );
    const error = await searchUsers({ q: "ham" }, token).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("SEARCH_FILTER_UNSUPPORTED");
  });
});

const created = {
  shares: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      ownerId: "11111111-1111-4111-8111-111111111111",
      targetUserId: row.id,
      mode: "timed",
      expiresAt: "2026-10-22T12:00:00.000Z",
      isRevoked: false,
      priorityDeviceId: null,
      note: null,
      createdAt: "2026-10-22T10:00:00.000Z"
    }
  ],
  createdShareIds: ["22222222-2222-4222-8222-222222222222"],
  reusedShareIds: []
};

describe("live share calls", () => {
  it("posts a validated body and returns the created rows", async () => {
    const fetchMock = stubFetch(() => jsonResponse(created, 201));

    await expect(
      createLocationShare(
        { targetUserIds: [row.id], mode: "timed", durationMinutes: 120, note: " مراقب باش " },
        token
      )
    ).resolves.toEqual(created);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_user/location/share");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      targetUserIds: [row.id],
      mode: "timed",
      durationMinutes: 120,
      note: "مراقب باش"
    });
  });

  it("rejects an impossible payload before the network", async () => {
    const fetchMock = stubFetch(() => jsonResponse(created, 201));
    // mode=permanent must not carry durationMinutes (the shared schema refuses it).
    await expect(
      createLocationShare(
        { targetUserIds: [row.id], mode: "permanent", durationMinutes: 60 } as never,
        token
      )
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists both directions", async () => {
    const payload = { owned: created.shares.map((row) => ({ ...row, targetUsername: "satellite" })), sharedWithMe: [] };
    const fetchMock = stubFetch(() => jsonResponse(payload));
    await expect(listLocationShares(token)).resolves.toEqual(payload);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/_user/location/shares");
  });

  it("revokes one share by id", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    await expect(revokeLocationShare(created.shares[0]!.id, token)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/_user/location/share/${created.shares[0]!.id}`);
    expect(init.method).toBe("DELETE");
  });

  it("refuses to send a non-uuid share id", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    await expect(revokeLocationShare("../../etc/passwd", token)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const historyCreated = {
  shares: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      ownerId: "11111111-1111-4111-8111-111111111111",
      targetUserId: row.id,
      from: "2026-10-21T00:00:00.000Z",
      to: "2026-10-22T00:00:00.000Z",
      maxPoints: 5000,
      createdAt: "2026-10-21T00:00:00.000Z"
    }
  ],
  createdShareIds: ["33333333-3333-4333-8333-333333333333"],
  reusedShareIds: []
};

describe("history share and read calls", () => {
  it("grants a history window", async () => {
    const fetchMock = stubFetch(() => jsonResponse(historyCreated, 201));
    await expect(
      createLocationHistoryShare(
        { targetUserIds: [row.id], from: "2026-10-21T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z" },
        token
      )
    ).resolves.toEqual(historyCreated);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/_user/location/history/share");
  });

  it("lists grants in both directions and revokes one", async () => {
    const payload = { owned: historyCreated.shares.map((row) => ({ ...row, targetUsername: "satellite" })), sharedWithMe: [] };
    const listMock = stubFetch(() => jsonResponse(payload));
    await expect(listLocationHistoryShares(token)).resolves.toEqual(payload);
    expect((listMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/_user/location/history/shares"
    );

    const revokeMock = stubFetch(() => new Response(null, { status: 204 }));
    await revokeLocationHistoryShare(historyCreated.shares[0]!.id, token);
    const [url, init] = revokeMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/_user/location/history/share/${historyCreated.shares[0]!.id}`);
    expect(init.method).toBe("DELETE");
  });

  it("reads the caller's own track for a window", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ points: [], totalPoints: 0 }));
    await expect(
      fetchMyLocationHistory(
        { from: "2026-10-21T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z" },
        token
      )
    ).resolves.toEqual({ points: [], totalPoints: 0 });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "/api/_user/location/history?from=2026-10-21T00%3A00%3A00.000Z&to=2026-10-22T00%3A00%3A00.000Z"
    );
  });
});
