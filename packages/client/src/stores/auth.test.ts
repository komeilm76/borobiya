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

  it("drops a cached profile when the restored cookie belongs to another account, even if its profile read fails", async () => {
    const saved = new Map([["borobiya.auth-user", JSON.stringify(user)]]);
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
      removeItem: (key: string) => { saved.delete(key); }
    } });
    const other = "00000000-0000-4000-8000-000000000088";
    const replacement = `e30.${Buffer.from(JSON.stringify({ sub: other, sessionId: "session-b" })).toString("base64url")}.sig`;
    let failProfile!: (reason: Error) => void;
    const profileReply = new Promise<Response>((_resolve, reject) => { failProfile = reject; });
    const fetchMock = fakeFetch(jsonResponse({ accessToken: replacement }), () => profileReply);
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();

    const restoring = auth.ensureSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(auth.accessToken).toBe(replacement);
    expect(auth.user).toBeNull(); // cached A must not accompany B's bearer
    expect(saved.has("borobiya.auth-user")).toBe(false);
    failProfile(new Error("B profile offline"));
    await restoring;
    expect(auth.user).toBeNull();
    expect(auth.initialized).toBe(true);
  });

  it("keeps a matching cached profile when the cookie's profile read is temporarily unavailable", async () => {
    const saved = new Map([["borobiya.auth-user", JSON.stringify(user)]]);
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value); },
      removeItem: (key: string) => { saved.delete(key); }
    } });
    const matching = `e30.${Buffer.from(JSON.stringify({ sub: user.id, sessionId: "session-a" })).toString("base64url")}.sig`;
    vi.stubGlobal("fetch", fakeFetch(
      jsonResponse({ accessToken: matching }),
      () => Promise.reject(new Error("profile offline"))
    ));
    const auth = useAuthStore();
    await auth.ensureSession();
    expect(auth.accessToken).toBe(matching);
    expect(auth.user).toEqual(user);
    expect(saved.get("borobiya.auth-user")).toBe(JSON.stringify(user));
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

  it("does not restore a logged-out session when an earlier refresh finishes late", async () => {
    let finishRefresh!: (response: Response) => void;
    const refreshReply = new Promise<Response>((resolve) => { finishRefresh = resolve; });
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      () => refreshReply,
      jsonResponse({ ok: true })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });

    const refreshing = auth.refreshSession();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api${apiRoutes.auth.refresh.url}`);
    await auth.logout();
    finishRefresh(jsonResponse({ accessToken: "old-session-token" }));
    await refreshing;

    expect(auth.accessToken).toBeNull();
    expect(auth.user).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3); // No profile read for a discarded refresh.
  });

  it("does not restore a logged-out profile when an earlier profile read finishes late", async () => {
    let finishProfile!: (response: Response) => void;
    const profileReply = new Promise<Response>((resolve) => { finishProfile = resolve; });
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      () => profileReply,
      jsonResponse({ ok: true })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });

    const refreshing = auth.refreshProfile();
    await nextTick(); // refreshProfile awaits ensureSession before starting the profile GET.
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api${apiRoutes.user.me.url}`);
    await auth.logout();
    finishProfile(jsonResponse({ ...profile, categories: [{ id: "20000000-0000-4000-8000-000000000001", name: "امداد کوهستان" }] }));
    await refreshing;

    expect(auth.user).toBeNull();
    expect(auth.userCategories).toEqual([]);
  });

  it("does not clear a newer login when an old session refresh fails late", async () => {
    let failRefresh!: (error: Error) => void;
    const refreshReply = new Promise<Response>((_resolve, reject) => { failRefresh = reject; });
    const newerUser = { ...user, id: "00000000-0000-4000-8000-000000000088", username: "rescue_user2" };
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      () => refreshReply,
      jsonResponse({ ok: true }),
      jsonResponse({ accessToken: "new-session-token", user: newerUser })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });
    const oldRefresh = auth.refreshSession();
    await auth.logout();
    await auth.login({ username: "rescue_user2", password: "safePass123" });
    failRefresh(new Error("network unavailable"));

    await expect(oldRefresh).resolves.toBe(false);
    expect(auth.accessToken).toBe("new-session-token");
    expect(auth.user).toEqual(newerUser);
  });

  it("does not sign back in from a login response that finishes after logout", async () => {
    let finishLogin!: (response: Response) => void;
    const loginReply = new Promise<Response>((resolve) => { finishLogin = resolve; });
    const fetchMock = fakeFetch(() => loginReply, jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    const signingIn = auth.login({ username: "rescue_user1", password: "safePass123" });
    await auth.logout();
    finishLogin(jsonResponse({ accessToken, user }));

    await expect(signingIn).rejects.toThrow("session changed");
    expect(auth.accessToken).toBeNull();
    expect(auth.user).toBeNull();
  });

  it("does not unlock a new account with an old account's late onboarding response", async () => {
    const questionIds = Array.from({ length: 5 }, (_, index) =>
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    );
    let finishCompletion!: (response: Response) => void;
    const completionReply = new Promise<Response>((resolve) => { finishCompletion = resolve; });
    const newerUser = { ...user, id: "00000000-0000-4000-8000-000000000088", username: "rescue_user2" };
    vi.stubGlobal("fetch", fakeFetch(
      jsonResponse({ accessToken, user }),
      () => completionReply,
      jsonResponse({ ok: true }),
      jsonResponse({ accessToken: "new-session-token", user: newerUser })
    ));
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });
    const completing = auth.completeSecurityQuestions({
      securityQuestions: questionIds.map((questionId, index) => ({ questionId, answer: `Answer ${index + 1}` }))
    });
    await auth.logout();
    await auth.login({ username: "rescue_user2", password: "safePass123" });
    finishCompletion(jsonResponse({ ok: true }));
    await completing;

    expect(auth.user).toEqual(newerUser);
    expect(auth.mustCompleteSecurityQuestions).toBe(true);
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

  it.each([
    { label: "another account", nextOwner: "00000000-0000-4000-8000-000000000088" },
    { label: "a new session for the same account", nextOwner: user.id }
  ])("does not replay an old write after the refresh cookie switches to $label", async ({ nextOwner }) => {
    const bearer = (sub: string, sessionId: string) =>
      `e30.${Buffer.from(JSON.stringify({ sub, sessionId })).toString("base64url")}.sig`;
    const initial = bearer(user.id, "session-a");
    const replacement = bearer(nextOwner, "session-b");
    const nextProfile = { ...profile, id: nextOwner, username: nextOwner === user.id ? user.username : "rescue_user2" };
    let finishWrite!: (response: Response) => void;
    const oldWriteReply = new Promise<Response>((resolve) => { finishWrite = resolve; });
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: initial, user: { ...user, mustCompleteSecurityQuestions: false } }),
      jsonResponse(profile),
      () => oldWriteReply,
      jsonResponse({ accessToken: replacement }),
      jsonResponse(nextProfile),
      jsonResponse({ ok: true }) // only consumed by an unsafe cross-session replay
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: user.username, password: "safePass123" });
    const oldWrite = requestJson<{ ok: boolean }>("/_user/location/share", {
      method: "POST", accessToken: initial, body: { note: "A's pending choice" }
    });
    await auth.refreshSession(); // cookie was changed by another tab, without logout in this tab
    expect(auth.accessToken).toBe(replacement);
    finishWrite(jsonResponse({ code: "INVALID_ACCESS_TOKEN", message: "Expired" }, 401));

    await expect(oldWrite).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/_user/location/share")).toHaveLength(1);
  });

  it("clears the old profile before a different cookie session's profile read finishes or fails", async () => {
    const other = "00000000-0000-4000-8000-000000000088";
    const bearer = (sub: string, sessionId: string) =>
      `e30.${Buffer.from(JSON.stringify({ sub, sessionId })).toString("base64url")}.sig`;
    const initial = bearer(user.id, "session-a");
    const replacement = bearer(other, "session-b");
    let failProfile!: (reason: Error) => void;
    const profileReply = new Promise<Response>((_resolve, reject) => { failProfile = reject; });
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: initial, user: { ...user, mustCompleteSecurityQuestions: false } }),
      jsonResponse({ ...profile, categories: [{ id: "20000000-0000-4000-8000-000000000001", name: "امداد کوهستان" }] }),
      jsonResponse({ accessToken: replacement }),
      () => profileReply
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: user.username, password: "safePass123" });
    expect(auth.user?.id).toBe(user.id);
    expect(auth.userCategories).toHaveLength(1);

    const refreshing = auth.refreshSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(auth.accessToken).toBe(replacement);
    expect(auth.user).toBeNull(); // never display A alongside B's bearer
    expect(auth.userCategories).toEqual([]);
    failProfile(new Error("new profile temporarily unavailable"));
    await refreshing;
    expect(auth.user).toBeNull(); // do not restore A on a transient B profile error
  });

  it("ignores an old onboarding reply after a cross-tab cookie switch", async () => {
    const other = "00000000-0000-4000-8000-000000000088";
    const bearer = (sub: string, sessionId: string) =>
      `e30.${Buffer.from(JSON.stringify({ sub, sessionId })).toString("base64url")}.sig`;
    let finishCompletion!: (response: Response) => void;
    const pendingCompletion = new Promise<Response>((resolve) => { finishCompletion = resolve; });
    const questionIds = Array.from({ length: 5 }, (_, index) =>
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: bearer(user.id, "session-a"), user }),
      () => pendingCompletion,
      jsonResponse({ accessToken: bearer(other, "session-b") }),
      jsonResponse({ code: "SECURITY_QUESTIONS_REQUIRED", message: "Complete questions" }, 403)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: user.username, password: "safePass123" });
    const completing = auth.completeSecurityQuestions({
      securityQuestions: questionIds.map((questionId, index) => ({ questionId, answer: `Answer ${index + 1}` }))
    });
    await auth.refreshSession();
    expect(auth.user).toBeNull();
    expect(auth.mustCompleteSecurityQuestions).toBe(true);
    finishCompletion(jsonResponse({ ok: true }));
    await completing;
    expect(auth.mustCompleteSecurityQuestions).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4); // no stale account's profile refresh
  });

  it("does not replay a pending write when its own 401 refresh discovers a different cookie session", async () => {
    const nextOwner = "00000000-0000-4000-8000-000000000088";
    const bearer = (sub: string, sessionId: string) =>
      `e30.${Buffer.from(JSON.stringify({ sub, sessionId })).toString("base64url")}.sig`;
    const initial = bearer(user.id, "session-a");
    const replacement = bearer(nextOwner, "session-b");
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: initial, user: { ...user, mustCompleteSecurityQuestions: false } }),
      jsonResponse(profile),
      jsonResponse({ code: "INVALID_ACCESS_TOKEN", message: "Expired" }, 401),
      jsonResponse({ accessToken: replacement }),
      jsonResponse({ ...profile, id: nextOwner, username: "rescue_user2" }),
      jsonResponse({ ok: true }) // must not replay the prior user's POST
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: user.username, password: "safePass123" });
    await expect(requestJson("/_user/location/share", {
      method: "POST", accessToken: initial, body: { note: "A's pending choice" }
    })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(auth.accessToken).toBe(replacement);
    expect(auth.user?.id).toBe(nextOwner);
  });

  it("still retries a delayed 401 after a normal same-session JWT renewal", async () => {
    const bearer = (nonce: number) =>
      `e30.${Buffer.from(JSON.stringify({ sub: user.id, sessionId: "session-a", nonce })).toString("base64url")}.sig`;
    const initial = bearer(0);
    const renewed = bearer(1);
    let finishRead!: (response: Response) => void;
    const oldReadReply = new Promise<Response>((resolve) => { finishRead = resolve; });
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: initial, user: { ...user, mustCompleteSecurityQuestions: false } }),
      jsonResponse(profile),
      () => oldReadReply,
      jsonResponse({ accessToken: renewed }),
      jsonResponse(profile),
      jsonResponse({ items: ["same-session"] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: user.username, password: "safePass123" });
    const oldRead = requestJson<{ items: string[] }>("/_user/devices", { accessToken: initial });
    await auth.refreshSession();
    finishRead(jsonResponse({ code: "INVALID_ACCESS_TOKEN", message: "Expired" }, 401));
    await expect(oldRead).resolves.toEqual({ items: ["same-session"] });
    expect(new Headers((fetchMock.mock.calls[5]?.[1] as RequestInit).headers).get("authorization"))
      .toBe(`Bearer ${renewed}`);
  });

  it("does not retry an old account's 401 request using a newer account's bearer", async () => {
    let finishOldRead!: (response: Response) => void;
    const oldReadReply = new Promise<Response>((resolve) => { finishOldRead = resolve; });
    const newerUser = { ...user, id: "00000000-0000-4000-8000-000000000088", username: "rescue_user2" };
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: "token-account-a", user }),
      () => oldReadReply,
      jsonResponse({ ok: true }),
      jsonResponse({ accessToken: "token-account-b", user: newerUser }),
      jsonResponse({ items: ["account-b-data"] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: "rescue_user1", password: "safePass123" });
    const oldRead = requestJson<{ items: string[] }>("/_user/devices", { accessToken: auth.accessToken });
    await auth.logout();
    await auth.login({ username: "rescue_user2", password: "safePass123" });
    finishOldRead(jsonResponse({ error: true, code: "INVALID_ACCESS_TOKEN", message: "Expired" }, 401));

    await expect(oldRead).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(auth.accessToken).toBe("token-account-b");
  });

  it("does not resurrect a logged-out session via broadcast priority watcher even if /_auth/logout fails offline", async () => {
    const fetchMock = fakeFetch(
      // Initial login + profile + broadcast priority watcher (/devices + /location/shares)
      jsonResponse({
        accessToken: `e30.${Buffer.from(JSON.stringify({ sub: user.id, sessionId: "33333333-3333-4333-8333-333333333333" })).toString("base64url")}.sig`,
        user: { ...user, mustCompleteSecurityQuestions: false }
      }),
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

  it("keeps the current session after a proactive network failure and restores it on reconnect", async () => {
    vi.useFakeTimers();
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const bearer = (exp: number) => `e30.${Buffer.from(JSON.stringify({
      sub: user.id, sessionId: "session-a", exp
    })).toString("base64url")}.sig`;
    const oldToken = bearer(Math.floor(Date.now() / 1000) + 61);
    const nextToken = bearer(Math.floor(Date.now() / 1000) + 900);
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: oldToken, user }),
      () => Promise.reject(new TypeError("Failed to fetch")),
      jsonResponse({ accessToken: nextToken }),
      jsonResponse(profile)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(auth.accessToken).toBe(oldToken);
      expect(auth.user).toEqual(user);
      browser.dispatchEvent(new Event("online"));
      // Join the in-flight refresh if the online handler has not completed yet.
      await auth.refreshSession();
      expect(auth.accessToken).toBe(nextToken);
      expect(auth.user).toMatchObject({ id: user.id, mustCompleteSecurityQuestions: false });
      expect(fetchMock.mock.calls.filter(([url]) => url === `/api${apiRoutes.auth.refresh.url}`)).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(fetchMock).toHaveBeenCalledTimes(4); // cancelled recovery timer
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("rehydrates an initially unavailable profile on reconnect without changing accounts", async () => {
    vi.useFakeTimers();
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken }),
      () => Promise.reject(new TypeError("profile offline")),
      jsonResponse(profile)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.ensureSession();
      expect(auth.accessToken).toBe(accessToken);
      expect(auth.user).toBeNull();
      browser.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
      expect(auth.user).toMatchObject({ id: user.id, role: "user" });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        `/api${apiRoutes.auth.refresh.url}`,
        `/api${apiRoutes.user.me.url}`,
        `/api${apiRoutes.user.me.url}`
      ]);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("verifies the cookie when a restored profile read reports an invalid bearer", async () => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken }),
      jsonResponse({ error: true, code: "INVALID_ACCESS_TOKEN" }, 401),
      jsonResponse({ error: true, code: "INVALID_REFRESH" }, 401)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.ensureSession();
      expect(auth.isAuthenticated).toBe(true); // do not trust the profile's 401 as cookie revocation
      await vi.advanceTimersByTimeAsync(1_000);
      expect(auth.accessToken).toBeNull();
      expect(auth.user).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("drops a pending profile retry if the user logs out before reconnect", async () => {
    vi.useFakeTimers();
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken }),
      () => Promise.reject(new TypeError("profile offline")),
      jsonResponse({ ok: true })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.ensureSession();
      await auth.logout();
      browser.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(auth.user).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("retries a cold cookie restore after an outage even without an online event", async () => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch(
      () => Promise.reject(new TypeError("offline")),
      jsonResponse({ accessToken }),
      jsonResponse(profile)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.ensureSession();
      expect(auth.initialized).toBe(true);
      expect(auth.isAuthenticated).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(auth.accessToken).toBe(accessToken);
      expect(auth.user).toMatchObject({ id: user.id });
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it.each([503, 429])("retains a login after refresh HTTP %i and retries", async (status) => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      jsonResponse({ code: "TEMPORARILY_UNAVAILABLE" }, status),
      jsonResponse({ accessToken: "rotated-token" }),
      jsonResponse(profile)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      expect(await auth.refreshSession()).toBe(false);
      expect(auth.accessToken).toBe(accessToken);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(auth.accessToken).toBe("rotated-token");
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("does not treat an uncoded proxy 401 as proof the refresh cookie was revoked", async () => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      jsonResponse({ message: "proxy unavailable" }, 401),
      jsonResponse({ accessToken: "rotated-token" }),
      jsonResponse(profile)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      expect(await auth.refreshSession()).toBe(false);
      expect(auth.accessToken).toBe(accessToken);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(auth.accessToken).toBe("rotated-token");
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("clears a revoked refresh cookie and never retries it", async () => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      jsonResponse({ error: true, code: "INVALID_REFRESH" }, 401)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      expect(await auth.refreshSession()).toBe(false);
      expect(auth.accessToken).toBeNull();
      expect(auth.user).toBeNull();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("never replays a failed write after a later reconnect switches cookie accounts", async () => {
    vi.useFakeTimers();
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const bearer = (sub: string, sessionId: string) =>
      `e30.${Buffer.from(JSON.stringify({ sub, sessionId })).toString("base64url")}.sig`;
    const oldToken = bearer(user.id, "session-a");
    const other = "00000000-0000-4000-8000-000000000088";
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: oldToken, user }),
      jsonResponse({ error: true, code: "INVALID_ACCESS_TOKEN" }, 401),
      () => Promise.reject(new TypeError("offline")),
      jsonResponse({ accessToken: bearer(other, "session-b") }),
      jsonResponse({ ...profile, id: other, username: "other" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      await expect(requestJson("/_user/location/share", {
        method: "POST", accessToken: oldToken, body: { note: "previous owner's write" }
      })).rejects.toMatchObject({ status: 401 });
      expect(auth.accessToken).toBe(oldToken);
      browser.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
      expect(auth.user?.id).toBe(other);
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/_user/location/share")).toHaveLength(1);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("clears a suspended account instead of retrying its rejected refresh cookie", async () => {
    vi.useFakeTimers();
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      jsonResponse({ error: true, code: "ACCOUNT_SUSPENDED" }, 403)
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      expect(await auth.refreshSession()).toBe(false);
      expect(auth.accessToken).toBeNull();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("cannot resurrect a logged-out account from a pending reconnect", async () => {
    vi.useFakeTimers();
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    let finishRefresh!: (reply: Response) => void;
    const pendingRefresh = new Promise<Response>((resolve) => { finishRefresh = resolve; });
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      () => Promise.reject(new TypeError("offline")),
      () => pendingRefresh,
      jsonResponse({ ok: true })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      expect(await auth.refreshSession()).toBe(false);
      browser.dispatchEvent(new Event("online"));
      await auth.logout();
      finishRefresh(jsonResponse({ accessToken: "late-token" }));
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(auth.accessToken).toBeNull();
      expect(auth.user).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("bounds a hung logout, fences cookie restoration and permits an explicit new login", async () => {
    vi.useFakeTimers();
    const stored = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); }
    } });
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken, user }),
      () => new Promise<Response>(() => {}), // a half-open network connection ignores abort
      jsonResponse({ accessToken: "new-session", user })
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      const pending = auth.logout();
      const failed = expect(pending).rejects.toThrow("timeout");
      await vi.advanceTimersByTimeAsync(8_000);
      await failed;
      expect(auth.isAuthenticated).toBe(false);
      expect(auth.user).toBeNull();
      expect(stored.get("borobiya.local-signout")).toBe("1");
      expect((fetchMock.mock.calls[1]?.[1] as RequestInit).signal?.aborted).toBe(true);

      auth.$dispose();
      setActivePinia(createPinia());
      const reloaded = useAuthStore();
      await reloaded.ensureSession();
      expect(reloaded.isAuthenticated).toBe(false);
      expect(await reloaded.refreshSession()).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2); // never exchange the old cookie
      await reloaded.login({ username: user.username, password: "safePass123" });
      expect(reloaded.accessToken).toBe("new-session");
      expect(stored.has("borobiya.local-signout")).toBe(false);
      reloaded.$dispose();
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

  it("does not clear a newer account when an older logout finishes late", async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); }
    } });
    let failOld!: (reason: Error) => void;
    const oldLogout = new Promise<Response>((_resolve, reject) => { failOld = reject; });
    const newUser = { ...user, id: "00000000-0000-4000-8000-000000000088" };
    vi.stubGlobal("fetch", fakeFetch(
      jsonResponse({ accessToken, user }),
      () => oldLogout,
      jsonResponse({ accessToken: "new-token", user: newUser })
    ));
    const auth = useAuthStore();
    await auth.login({ username: user.username, password: "safePass123" });
    const oldAttempt = auth.logout();
    await auth.login({ username: user.username, password: "safePass123" });
    failOld(new TypeError("offline"));
    await expect(oldAttempt).rejects.toThrow("offline");
    expect(auth.accessToken).toBe("new-token");
    expect(auth.user?.id).toBe(newUser.id);
    expect(stored.has("borobiya.local-signout")).toBe(false);
    auth.$dispose();
  });

  it("keeps an explicitly signed-out tab signed out on reload even after a successful server logout", async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); }
    } });
    const fetchMock = fakeFetch(jsonResponse({ accessToken, user }), jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    await auth.login({ username: user.username, password: "safePass123" });
    await auth.logout();
    auth.$dispose();
    setActivePinia(createPinia());
    const reloaded = useAuthStore();
    await reloaded.ensureSession();
    expect(reloaded.user).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    reloaded.$dispose();
  });

  it("does not show the old profile when a reconnect restores a different cookie account", async () => {
    vi.useFakeTimers();
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const bearer = (sub: string, sessionId: string) =>
      `e30.${Buffer.from(JSON.stringify({ sub, sessionId })).toString("base64url")}.sig`;
    const nextOwner = "00000000-0000-4000-8000-000000000088";
    const fetchMock = fakeFetch(
      jsonResponse({ accessToken: bearer(user.id, "session-a"), user }),
      () => Promise.reject(new TypeError("offline")),
      jsonResponse({ accessToken: bearer(nextOwner, "session-b") }),
      () => Promise.reject(new TypeError("new profile offline"))
    );
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore();
    try {
      await auth.login({ username: user.username, password: "safePass123" });
      expect(await auth.refreshSession()).toBe(false);
      browser.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
      expect(auth.accessToken).toBe(bearer(nextOwner, "session-b"));
      expect(auth.user).toBeNull();
      expect(auth.userCategories).toEqual([]);
    } finally { auth.$dispose(); vi.useRealTimers(); }
  });

});
