import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { apiRoutes } from "@shared/api";
import { useAuthStore } from "./auth";

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
});
