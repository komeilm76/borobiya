import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { reactive } from "vue";
import { createPinia } from "pinia";
import { useAuthStore } from "../stores/auth";
import { createAppRouter } from "./index";
import { resolvePostLoginDestination, type AuthGuardState } from "./guards";

// Resolve lazy route components without evaluating their Vuetify/CSS dependencies or mounting .vue files.
vi.mock("@client/views/_auth/LoginView.vue", () => ({ default: {} }));
vi.mock("@client/views/_auth/RegisterView.vue", () => ({ default: {} }));
vi.mock("@client/views/_auth/ForgotPasswordView.vue", () => ({ default: {} }));
vi.mock("@client/views/_public/PublicLandingView.vue", () => ({ default: {} }));
vi.mock("@client/views/_public/PublicHealthView.vue", () => ({ default: {} }));
vi.mock("@client/views/_public/PublicNotFoundView.vue", () => ({ default: {} }));
vi.mock("@client/views/_user/CompleteSecurityQuestionsView.vue", () => ({ default: {} }));
vi.mock("@client/views/_user/UserMapView.vue", () => ({ default: {} }));
vi.mock("@client/views/_user/UserDevicesView.vue", () => ({ default: {} }));
vi.mock("@client/views/_admin/AdminUsersView.vue", () => ({ default: {} }));
vi.mock("@client/views/_admin/AdminDispatchView.vue", () => ({ default: {} }));

function authState(overrides: Partial<AuthGuardState> = {}): AuthGuardState {
  return {
    ensureSession: vi.fn(async () => undefined),
    isAuthenticated: false,
    mustCompleteSecurityQuestions: false,
    user: null,
    ...overrides
  };
}

function setup(auth: AuthGuardState) {
  return createAppRouter(createMemoryHistory(), auth);
}

const user = { role: "user" } as const;
const admin = { role: "admin" } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("real router auth navigation (no Vue components mounted)", () => {
  it.each(["/_auth/login", "/_auth/register", "/_auth/forgot-password", "/auth/login", "/auth/register", "/auth/forgot-password"])(
    "allows a guest to visit %s and redirects a signed-in user away, including on back navigation",
    async (path) => {
      const auth = authState();
      const router = setup(auth);
      await router.push(path);
      expect(router.currentRoute.value.name).toBe(`auth-${path.split("/").at(-1)}`);
      auth.isAuthenticated = true;
      auth.user = user;
      await router.push("/_public/health");
      router.back();
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/_user/map"));
      await router.push(path);
      expect(router.currentRoute.value.path).toBe("/_user/map");
    }
  );

  it("leaves an already-open auth view when a session arrives without navigation", async () => {
    const auth = reactive(authState());
    const router = setup(auth);
    await router.push({ path: "/auth/login", query: { redirect: "/_user/map?mode=follow" } });
    expect(router.currentRoute.value.name).toBe("auth-login");
    auth.user = user;
    auth.isAuthenticated = true;
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/_user/map?mode=follow"));
  });

  it("sends a late onboarding flag to the completion form even after leaving auth", async () => {
    const auth = reactive(authState());
    const router = setup(auth);
    await router.push("/_auth/login");
    auth.user = user;
    auth.isAuthenticated = true;
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/_user/map"));
    auth.mustCompleteSecurityQuestions = true;
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/_user/complete-security-questions"));
  });

  it("restores a real cookie session before resolving a direct auth URL", async () => {
    const profile = {
      id: "00000000-0000-4000-8000-000000000099",
      username: "rescue_user1",
      role: "user",
      mustCompleteSecurityQuestions: false,
      isActive: true,
      avgRating: null,
      createdAt: "2026-10-18T00:00:00.000Z"
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: "restored-token" }))
      .mockResolvedValueOnce(jsonResponse(profile));
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore(createPinia());
    const router = setup(auth);
    await router.push("/_auth/forgot-password");
    expect(router.currentRoute.value.path).toBe("/_user/map");
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user?.role).toBe("user");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("removes an open login page after a later cookie refresh succeeds", async () => {
    const profile = {
      id: "00000000-0000-4000-8000-000000000099",
      username: "rescue_user1",
      role: "user",
      mustCompleteSecurityQuestions: false,
      isActive: true,
      avgRating: null,
      createdAt: "2026-10-18T00:00:00.000Z"
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: "NO_REFRESH_TOKEN" }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: "late-token" }))
      .mockResolvedValueOnce(jsonResponse(profile));
    vi.stubGlobal("fetch", fetchMock);
    const auth = useAuthStore(createPinia());
    const router = setup(auth);
    await router.push("/_auth/login");
    expect(router.currentRoute.value.name).toBe("auth-login");
    await auth.refreshSession();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/_user/map"));
    expect(auth.user?.role).toBe("user");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("waits for cookie restoration before allowing an auth view to render", async () => {
    let restore!: () => void;
    const pending = new Promise<void>((resolve) => { restore = resolve; });
    const auth = authState({ ensureSession: vi.fn(() => pending) });
    const router = setup(auth);
    const navigation = router.push("/_auth/login");
    expect(router.currentRoute.value.name).not.toBe("auth-login");
    auth.isAuthenticated = true;
    auth.user = user;
    restore();
    await navigation;
    expect(router.currentRoute.value.path).toBe("/_user/map");
    expect(auth.ensureSession).toHaveBeenCalled();
  });

  it("preserves internal return paths for guests and uses them on subsequent login", async () => {
    const auth = authState();
    const router = setup(auth);
    await router.push("/_user/map?mode=follow#pin");
    expect(router.currentRoute.value).toMatchObject({
      path: "/_auth/login",
      query: { redirect: "/_user/map?mode=follow#pin" }
    });
    auth.isAuthenticated = true;
    auth.user = user;
    // The login view captures its return path and replaces the auth entry on success.
    await router.replace(resolvePostLoginDestination(router.currentRoute.value.query.redirect, auth));
    expect(router.currentRoute.value.fullPath).toBe("/_user/map?mode=follow#pin");
  });

  it("retains an admin return target for guests, but denies it after an ordinary user signs in", async () => {
    const auth = authState();
    const router = setup(auth);
    await router.push("/_admin/users?filter=active");
    expect(router.currentRoute.value.query.redirect).toBe("/_admin/users?filter=active");
    auth.isAuthenticated = true;
    auth.user = user;
    await router.replace(resolvePostLoginDestination(router.currentRoute.value.query.redirect, auth));
    expect(router.currentRoute.value.path).toBe("/_user/map");
  });

  it("keeps external, auth and malformed return targets out of the auth flow", async () => {
    const auth = authState({ isAuthenticated: true, user });
    const router = setup(auth);
    for (const redirect of ["//example.org/x", "/_auth/register", "/auth/login", "https://example.org", "/_auth?again=1"]) {
      await router.push({ path: "/_auth/login", query: { redirect } });
      expect(router.currentRoute.value.path).toBe("/_user/map");
    }
  });

  it("sends signed-in admins to admin home, but not ordinary users into admin pages", async () => {
    const auth = authState({ isAuthenticated: true, user: admin });
    const router = setup(auth);
    await router.push("/_auth/register");
    expect(router.currentRoute.value.path).toBe("/_admin/users");
    await router.push("/_admin/dispatch");
    expect(router.currentRoute.value.path).toBe("/_admin/dispatch");
    auth.user = user;
    await router.push("/_admin/users");
    expect(router.currentRoute.value.path).toBe("/_user/map");
  });

  it("enforces onboarding from auth, protected, and public routes after session restoration", async () => {
    const auth = authState({ isAuthenticated: true, user, mustCompleteSecurityQuestions: true });
    const router = setup(auth);
    for (const path of ["/_auth/login", "/auth/forgot-password", "/_admin/users", "/_user/map", "/_public/landing"]) {
      await router.push(path);
      expect(router.currentRoute.value.path).toBe("/_user/complete-security-questions");
    }
    auth.mustCompleteSecurityQuestions = false;
    await router.push("/_public/health");
    await router.push("/_user/complete-security-questions");
    expect(router.currentRoute.value.path).toBe("/_user/map");
  });

  it("does not confuse similar public paths with auth or protected paths", async () => {
    const auth = authState();
    const router = setup(auth);
    for (const path of ["/authentic", "/_authentic", "/_users", "/_administer"]) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe("not-found");
    }
  });

  it("allows a logged-out user back to login but not into protected routes", async () => {
    const auth = authState({ isAuthenticated: true, user });
    const router = setup(auth);
    await router.push("/_user/dashboard");
    auth.isAuthenticated = false;
    auth.user = null;
    await router.push("/_auth/login");
    expect(router.currentRoute.value.name).toBe("auth-login");
    await router.push("/_user/devices");
    expect(router.currentRoute.value).toMatchObject({
      path: "/_auth/login",
      query: { redirect: "/_user/devices" }
    });
  });
});
