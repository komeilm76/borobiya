import { describe, expect, it, vi } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import {
  createAuthGuard,
  resolveAuthNavigation,
  resolvePostLoginDestination,
  type AuthGuardLocation,
  type AuthGuardState
} from "./guards";

function makeAuth(overrides: Partial<AuthGuardState> = {}): AuthGuardState {
  return {
    ensureSession: vi.fn(async () => undefined),
    isAuthenticated: false,
    mustCompleteSecurityQuestions: false,
    user: null,
    ...overrides
  };
}

function location(path: string, query: AuthGuardLocation["query"] = {}): AuthGuardLocation {
  return { path, fullPath: path, query };
}

const admin = { role: "admin" } as const;
const ordinaryUser = { role: "user" } as const;

describe("client auth navigation guard", () => {
  it("sends unauthenticated users to login and preserves the requested internal route", () => {
    expect(resolveAuthNavigation(location("/_user/devices"), makeAuth())).toEqual({
      path: "/_auth/login",
      query: { redirect: "/_user/devices" }
    });
  });

  it("forces incomplete accounts to onboarding from user, admin, public, and guest routes", () => {
    const auth = makeAuth({ isAuthenticated: true, user: ordinaryUser, mustCompleteSecurityQuestions: true });

    expect(resolveAuthNavigation(location("/_user/dashboard"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_admin/dashboard"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_public/landing"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_auth/login"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_user/complete-security-questions"), auth)).toBe(true);
  });

  it("redirects accounts that already completed onboarding away from its form", () => {
    const auth = makeAuth({ isAuthenticated: true, user: ordinaryUser });
    expect(resolveAuthNavigation(location("/_user/complete-security-questions"), auth)).toBe("/_user/map");
    expect(resolveAuthNavigation(location("/_user/complete-security-questions"), makeAuth({ isAuthenticated: true, user: admin })))
      .toBe("/_admin/users");
  });

  it("keeps authenticated users out of guest-only pages and accepts only safe return paths", () => {
    const auth = makeAuth({ isAuthenticated: true, user: ordinaryUser });

    expect(resolveAuthNavigation(location("/_auth/register"), auth)).toBe("/_user/map");
    expect(resolveAuthNavigation(location("/_auth/login", { redirect: "/_user/map?theme=dark" }), auth))
      .toBe("/_user/map?theme=dark");
    expect(resolveAuthNavigation(location("/_auth/login", { redirect: "//attacker.example/path" }), auth))
      .toBe("/_user/map");
    expect(resolveAuthNavigation(location("/_auth/login", { redirect: "/_auth/register" }), auth))
      .toBe("/_user/map");
    expect(resolveAuthNavigation(location("/auth/forgot-password"), auth)).toBe("/_user/map");
    expect(resolveAuthNavigation(location("/authentic"), auth)).toBe(true);
  });

  it("does not grant access from a bearer whose profile has not finished loading", () => {
    const unresolved = makeAuth({ isAuthenticated: true, user: null });
    expect(resolveAuthNavigation(location("/_auth/login"), unresolved)).toBe(true);
    expect(resolveAuthNavigation(location("/_admin/users"), unresolved)).toEqual({
      path: "/_auth/login", query: { redirect: "/_admin/users" }
    });
    expect(resolveAuthNavigation(location("/_user/map"), unresolved)).toEqual({
      path: "/_auth/login", query: { redirect: "/_user/map" }
    });
  });

  it("requires an admin role for admin pages", () => {
    expect(resolveAuthNavigation(location("/_admin/users"), makeAuth({ isAuthenticated: true, user: ordinaryUser })))
      .toBe("/_user/map");
    expect(resolveAuthNavigation(location("/_admin/users"), makeAuth({ isAuthenticated: true, user: admin }))).toBe(true);
  });

  it("sends admins to user management after login and keeps user onboarding/default destinations", () => {
    expect(resolvePostLoginDestination(undefined, makeAuth({ user: admin }))).toBe("/_admin/users");
    expect(resolvePostLoginDestination(undefined, makeAuth({ user: ordinaryUser }))).toBe("/_user/map");
    expect(resolvePostLoginDestination(undefined, makeAuth({
      user: admin,
      mustCompleteSecurityQuestions: true
    }))).toBe("/_user/complete-security-questions");
  });

  it("preserves only safe post-login redirects", () => {
    const auth = makeAuth({ user: admin });
    expect(resolvePostLoginDestination("/_admin/dashboard?tab=overview", auth)).toBe("/_admin/dashboard?tab=overview");
    expect(resolvePostLoginDestination("//attacker.example", auth)).toBe("/_admin/users");
    expect(resolvePostLoginDestination("/_auth/register", auth)).toBe("/_admin/users");
    expect(resolvePostLoginDestination("/auth/register", auth)).toBe("/_admin/users");
    expect(resolvePostLoginDestination("/_auth?registered=1", auth)).toBe("/_admin/users");
    expect(resolvePostLoginDestination("/\\\\attacker.example", auth)).toBe("/_admin/users");
    expect(resolvePostLoginDestination(["/_user/map", "//attacker.example"], auth)).toBe("/_admin/users");
  });

  it("does not block guest pages on a slow refresh, but still verifies protected pages", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const auth = makeAuth({ ensureSession: vi.fn(() => pending) });
    const guard = createAuthGuard(auth);

    await expect(guard({ path: "/_auth/login" } as RouteLocationNormalized)).resolves.toBe(true);
    expect(auth.ensureSession).toHaveBeenCalledOnce();

    const protectedPage = guard(location("/_user/map") as RouteLocationNormalized);
    let settled = false;
    void protectedPage.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await expect(protectedPage).resolves.toEqual({ path: "/_auth/login", query: { redirect: "/_user/map" } });

    vi.mocked(auth.ensureSession).mockClear();
    await guard({ path: "/_public/landing" } as RouteLocationNormalized);
    expect(auth.ensureSession).not.toHaveBeenCalled();
  });
});
