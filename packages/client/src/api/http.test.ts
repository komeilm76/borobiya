import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, requestJson } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("same-origin API client", () => {
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
});
