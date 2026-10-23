import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { apiRoutes } from "@shared/api";
import { requestJson } from "../api/http";
import { useAuthStore } from "./auth";
import { useBroadcastStore } from "./broadcast";

const user = {
  id: "00000000-0000-4000-8000-000000000099",
  username: "rescue_user1",
  role: "user" as const,
  mustCompleteSecurityQuestions: true
};
const accessToken = "access-token";
const profile = {
  ...user,
  mustCompleteSecurityQuestions: false,
  isActive: true,
  avgRating: null,
  createdAt: "2026-10-18T00:00:00.000Z"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function fakeFetch(...responses: Array<Response | (() => Promise<Response>)>) {
  let index = 0;
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const response = responses[index++];
    if (typeof response === "function") return response();
    if (!response) throw new Error("No mocked response was configured.");
    return response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("client auth store", () => {
  it("stores the access token and user returned by login", async () => {
    const fetchMock = fakeFetch(jsonResponse({ accessToken, user }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();

    await auth.login({ username: "rescue_user1", password: "safePass123" });

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user).toEqual(user);
    expect(auth.mustCompleteSecurityQuestions).toBe(true);
    expect(auth.initialized).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api${apiRoutes.auth.login.url}`);
  });

  it("refreshes an expired access token before the next protected operation", async () => {
    const expiredAccessToken = "e30.eyJleHAiOjF9.signature";
    const refreshedAccessToken = "refreshed-access-token";
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: expiredAccessToken, user: { ...user, mustCompleteSecurityQuestions: false } }),
      jsonResponse({
        ...profile,
        categories: [{ id: "20000000-0000-4000-8000-000000000001", name: "امداد کوهستان" }]
      }),
      jsonResponse({ accessToken: refreshedAccessToken }),
      jsonResponse(profile)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();

    await auth.login({ username: "rescue_user1", password: "safePass123" });
    expect(auth.userCategories).toEqual([
      { id: "20000000-0000-4000-8000-000000000001", name: "امداد کوهستان" }
    ]);
    await auth.ensureSession();

    expect(auth.accessToken).toBe(refreshedAccessToken);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api${apiRoutes.auth.login.url}`,
      `/api${apiRoutes.user.me.url}`,
      `/api${apiRoutes.auth.refresh.url}`,
      `/api${apiRoutes.user.me.url}`
    ]);
  });

  it("restores a browser session with the HttpOnly refresh cookie and reloads the current profile", async () => {
    const fetchMock = fakeFetch(jsonResponse({ accessToken }), jsonResponse(profile));
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();

    await auth.ensureSession();

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user).toMatchObject({ id: user.id, role: "user", mustCompleteSecurityQuestions: false });
    expect(auth.mustCompleteSecurityQuestions).toBe(false);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api${apiRoutes.auth.refresh.url}`,
      `/api${apiRoutes.user.me.url}`
    ]);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe("same-origin");
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).has("authorization")).toBe(false);
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get("authorization")).toBe(`Bearer ${accessToken}`);
  });

  it("recognizes the onboarding gate when the profile endpoint returns SECURITY_QUESTIONS_REQUIRED", async () => {
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken }),
      jsonResponse({
        error: true,
        code: "SECURITY_QUESTIONS_REQUIRED",
        message: "Complete security questions",
        issues: []
      }, 403)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();

    await auth.ensureSession();

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.mustCompleteSecurityQuestions).toBe(true);
    expect(auth.user).toBeNull();
  });

  it("completes onboarding, refreshes the user profile, and clears the client gate", async () => {
    const questionIds = Array.from({ length: 5 }, (_, index) =>
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    );
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      jsonResponse({ ok: true }),
      jsonResponse(profile)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });

    await auth.completeSecurityQuestions({
      securityQuestions: questionIds.map((questionId, index) => ({ questionId, answer: `Answer ${index + 1}` }))
    });

    expect(auth.mustCompleteSecurityQuestions).toBe(false);
    expect(auth.user?.mustCompleteSecurityQuestions).toBe(false);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api${apiRoutes.user.completeSecurityQuestions.url}`);
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get("authorization")).toBe(`Bearer ${accessToken}`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api${apiRoutes.user.me.url}`);
  });

  it("clears local auth state even if logout cannot reach the server", async () => {
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      () => Promise.reject(new TypeError("offline"))
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });

    await expect(auth.logout()).rejects.toThrow("offline");
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
  });

  it("proactively rotates an access token 60s before expiry on long-lived tabs", async () => {
    vi.useFakeTimers();
    try {
      const nowSec = 1_760_000_000;
      vi.setSystemTime(nowSec * 1000);
      const makeTokenWithExp = (exp: number) =>
        `e30.${btoa(JSON.stringify({ exp })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}.sig`;
      const initialToken = makeTokenWithExp(nowSec + 900);
      const rotatedToken = makeTokenWithExp(nowSec + 1800);

      const fetchMock = fakeFetch(
        jsonResponse({ accessToken: initialToken, user: { ...user, mustCompleteSecurityQuestions: false } }),
        jsonResponse(profile),
        jsonResponse({ accessToken: rotatedToken }),
        jsonResponse(profile)
      );
      vi.stubGlobal("fetch", fetchMock);
      const auth = useAuthStore();

      await auth.login({ username: "rescue_user1", password: "safePass123" });
      expect(auth.accessToken).toBe(initialToken);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(839_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(auth.accessToken).toBe(rotatedToken);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never deadlocks refreshFromCookie if GET /_user/me answers 401 while hydrating", async () => {
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: "rotated-token" }),
      jsonResponse({ error: true, code: "UNAUTHORIZED", message: "Revoked", issues: [] }, 401)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();

    await auth.ensureSession();

    expect(auth.accessToken).toBe("rotated-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses the already-rotated token without firing a second /_auth/refresh on staggered 401s", async () => {
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: "token-v1", user: { ...user, mustCompleteSecurityQuestions: false } }),
      jsonResponse(profile),
      // Request A gets 401 with token-v1 -> rotates to token-v2
      jsonResponse({ error: true, code: "INVALID_ACCESS_TOKEN", message: "Expired", issues: [] }, 401),
      jsonResponse({ accessToken: "token-v2" }),
      jsonResponse(profile),
      jsonResponse({ items: ["ok-A"] }),
      // Staggered Request B still held token-v1 -> gets 401 -> immediately retries with token-v2 without hitting /_auth/refresh again
      jsonResponse({ error: true, code: "INVALID_ACCESS_TOKEN", message: "Expired", issues: [] }, 401),
      jsonResponse({ items: ["ok-B"] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });

    const first = await requestJson<{ items: string[] }>("/_user/devices", { accessToken: "token-v1" });
    const second = await requestJson<{ items: string[] }>("/_user/devices", { accessToken: "token-v1" });

    expect(first).toEqual({ items: ["ok-A"] });
    expect(second).toEqual({ items: ["ok-B"] });
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === `/api${apiRoutes.auth.refresh.url}`);
    expect(refreshCalls).toHaveLength(1);
  });

  it("does not resurrect a logged-out session via broadcast priority watcher even if /_auth/logout fails offline", async () => {
    const fetchMock = fakeFetch(
      // Initial login + profile + broadcast priority watcher (/devices + /location/shares)
      jsonResponse({ accessToken: "token-live", user: { ...user, mustCompleteSecurityQuestions: false } }),
      jsonResponse(profile),
      jsonResponse([]),
      jsonResponse({ owned: [], sharedWithMe: [] }),
      // Offline logout failure — must NOT be followed by POST /_auth/refresh!
      () => Promise.reject(new TypeError("offline"))
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    const broadcast = useBroadcastStore();

    await auth.login({ username: "rescue_user1", password: "safePass123" });
    await nextTick();
    await expect(auth.logout()).rejects.toThrow("offline");
    await nextTick();

    expect(auth.isAuthenticated).toBe(false);
    expect(broadcast.priority.devices).toEqual([]);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === `/api${apiRoutes.auth.refresh.url}`);
    expect(refreshCalls).toHaveLength(0);
  });

  it("skips broadcast device/share fetches while onboarding security questions are incomplete", async () => {
    const fetchMock = fakeFetch(jsonResponse({ accessToken: "onboarding-token", user }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    useBroadcastStore();

    await auth.login({ username: "rescue_user1", password: "safePass123" });
    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
