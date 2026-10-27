import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBasePath, registerAccessTokenRefresher, requestJson } from "./http";
import { sameOriginPrefix } from "./same-origin-prefix";

afterEach(() => {
  registerAccessTokenRefresher(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("same-origin API client", () => {
  it("never resolves a configured API prefix to a foreign origin with a bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const prefix of ["//foreign.example", "/\\foreign.example", "/\n/foreign.example",
      "/api?redirect=//foreign.example", "https://foreign.example/api"]) {
      vi.stubEnv("VITE_API_URL", prefix);
      expect(apiBasePath()).toBe("/api");
      expect(sameOriginPrefix(prefix, "/map")).toBe("/map"); // Vite's map proxy shares the rule
      await requestJson("/_user/profile", { accessToken: "private-access-token" });
      const [url, init] = fetchMock.mock.lastCall as unknown as [string, RequestInit];
      expect(url).toBe("/api/_user/profile");
      expect(new URL(url, "https://app.example").origin).toBe("https://app.example");
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer private-access-token");
    }
    vi.stubEnv("VITE_API_URL", "/gateway/api/");
    expect(apiBasePath()).toBe("/gateway/api");
  });

  it("uses the configured same-origin API path, credentials, JSON body, and bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestJson<{ ok: boolean }>("/_user/complete-security-questions", {
      method: "POST",
      body: { securityQuestions: [] },
      accessToken: "access-token"
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_user/complete-security-questions");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-token");
    expect(init.body).toBe(JSON.stringify({ securityQuestions: [] }));
  });

  it("turns structured API failures into typed errors without losing their codes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: true,
      code: "WRONG_ANSWERS",
      message: "Incorrect answers",
      issues: []
    }), {
      status: 400,
      headers: { "content-type": "application/json" }
    })));

    await expect(requestJson("/_auth/forgot-password/verify", { method: "POST", body: {} }))
      .rejects.toMatchObject({
        name: "ApiError",
        status: 400,
        code: "WRONG_ANSWERS",
        message: "Incorrect answers"
      });
    expect(new ApiError(400, "BAD_REQUEST", "Rejected")).toBeInstanceOf(Error);
  });

  it("refreshes once and retries authenticated requests when an expired/clock-skewed token returns 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "INVALID_ACCESS_TOKEN", message: "Expired" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: ["ok"] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const refresher = vi.fn(async () => "rotated-access-token");
    registerAccessTokenRefresher(refresher);

    const result = await requestJson<{ items: string[] }>("/_admin/categories", {
      accessToken: "stale-access-token"
    });

    expect(result).toEqual({ items: ["ok"] });
    expect(refresher).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe(
      "Bearer rotated-access-token"
    );
  });
});
