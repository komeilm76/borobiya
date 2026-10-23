import { afterEach, describe, expect, it, vi } from "vitest";
import { getSosPhotoSrc } from "./admin-sos";

afterEach(() => vi.unstubAllGlobals());

describe("SOS photo access", () => {
  it("mints a same-origin signed image URL with bearer auth, never loading the raw stored path", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const url = "/uploads/22222222-2222-4222-8222-222222222222.png?requestId=11111111-1111-4111-8111-111111111111&expires=123&signature=example";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      url, expiresAt: "2026-10-23T12:01:00.000Z"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getSosPhotoSrc(requestId, "admin-jwt")).resolves.toBe(`/api${url}`);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/_user/sos/requests/${requestId}/photo-access`);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin-jwt");
    expect(init.credentials).toBe("same-origin");
  });

  it("rejects a malformed or attacker-hosted URL from the response boundary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      url: "https://external.example/image.png", expiresAt: "2026-10-23T12:01:00.000Z"
    }), { status: 200 })));
    await expect(getSosPhotoSrc("11111111-1111-4111-8111-111111111111", "admin-jwt")).rejects.toThrow();
  });
});
