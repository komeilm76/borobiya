import { describe, expect, it, vi } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import {
  createAuthGuard,
  resolveAuthNavigation,
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
    const auth = makeAuth({ isAuthenticated: true, mustCompleteSecurityQuestions: true });

    expect(resolveAuthNavigation(location("/_user/dashboard"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_admin/dashboard"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_public/landing"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_auth/login"), auth)).toBe("/_user/complete-security-questions");
    expect(resolveAuthNavigation(location("/_user/complete-security-questions"), auth)).toBe(true);
  });

  it("redirects accounts that already completed onboarding away from its form", () => {
    const auth = makeAuth({ isAuthenticated: true, user: ordinaryUser });
    expect(resolveAuthNavigation(location("/_user/complete-security-questions"), auth)).toBe("/_user/dashboard");
  });

  it("keeps authenticated users out of guest-only pages and accepts only safe return paths", () => {
    const auth = makeAuth({ isAuthenticated: true, user: ordinaryUser });

    expect(resolveAuthNavigation(location("/_auth/register"), auth)).toBe("/_user/dashboard");
    expect(resolveAuthNavigation(location("/_auth/login", { redirect: "/_user/map?theme=dark" }), auth))
      .toBe("/_user/map?theme=dark");
    expect(resolveAuthNavigation(location("/_auth/login", { redirect: "//attacker.example/path" }), auth))
      .toBe("/_user/dashboard");
    expect(resolveAuthNavigation(location("/_auth/login", { redirect: "/_auth/register" }), auth))
      .toBe("/_user/dashboard");
  });

  it("requires an admin role for admin pages", () => {
    expect(resolveAuthNavigation(location("/_admin/users"), makeAuth({ isAuthenticated: true, user: ordinaryUser })))
      .toBe("/_user/dashboard");
    expect(resolveAuthNavigation(location("/_admin/users"), makeAuth({ isAuthenticated: true, user: admin }))).toBe(true);
  });

  it("restores auth state before navigating to a guest-only or protected page", async () => {
    const auth = makeAuth();
    const guard = createAuthGuard(auth);

    await guard({ path: "/_auth/login" } as RouteLocationNormalized);
    expect(auth.ensureSession).toHaveBeenCalledOnce();

    vi.mocked(auth.ensureSession).mockClear();
    await guard({ path: "/_public/landing" } as RouteLocationNormalized);
    expect(auth.ensureSession).not.toHaveBeenCalled();
  });
});
