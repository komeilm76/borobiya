import type { AuthUser } from "@shared/index";
import type { LocationQuery, RouteLocationRaw, RouteLocationNormalized } from "vue-router";

const LOGIN_PATH = "/_auth/login";
const DASHBOARD_PATH = "/_user/dashboard";
const ONBOARDING_PATH = "/_user/complete-security-questions";

export interface AuthGuardState {
  ensureSession(): Promise<void>;
  isAuthenticated: boolean;
  mustCompleteSecurityQuestions: boolean;
  user: Pick<AuthUser, "role"> | null;
}

export type AuthGuardLocation = Pick<RouteLocationNormalized, "path" | "fullPath" | "query">;

function isGuestOnlyPath(path: string): boolean {
  return path === "/_auth" || path.startsWith("/_auth/");
}

function isAdminPath(path: string): boolean {
  return path === "/_admin" || path.startsWith("/_admin/");
}

function isProtectedPath(path: string): boolean {
  return path === "/_user" || path.startsWith("/_user/") || isAdminPath(path);
}

function safeRedirect(query: LocationQuery): string | null {
  const candidate = query.redirect;
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate === "/_auth" ||
    candidate.startsWith("/_auth/")
  ) {
    return null;
  }
  return candidate;
}

export function resolveAuthNavigation(
  to: AuthGuardLocation,
  auth: AuthGuardState
): RouteLocationRaw | true {
  if (auth.isAuthenticated && auth.mustCompleteSecurityQuestions && to.path !== ONBOARDING_PATH) {
    return ONBOARDING_PATH;
  }

  if (isGuestOnlyPath(to.path) && auth.isAuthenticated) {
    if (auth.mustCompleteSecurityQuestions) return ONBOARDING_PATH;
    return safeRedirect(to.query) ?? DASHBOARD_PATH;
  }

  if (!isProtectedPath(to.path)) return true;
  if (!auth.isAuthenticated) {
    return { path: LOGIN_PATH, query: { redirect: to.fullPath } };
  }
  if (auth.mustCompleteSecurityQuestions && to.path !== ONBOARDING_PATH) {
    return ONBOARDING_PATH;
  }
  if (!auth.mustCompleteSecurityQuestions && to.path === ONBOARDING_PATH) {
    return DASHBOARD_PATH;
  }
  if (isAdminPath(to.path) && auth.user?.role !== "admin") {
    return DASHBOARD_PATH;
  }
  return true;
}

export function createAuthGuard(auth: AuthGuardState) {
  return async (to: RouteLocationNormalized): Promise<RouteLocationRaw | true> => {
    if (isGuestOnlyPath(to.path) || isProtectedPath(to.path)) {
      await auth.ensureSession();
    }
    return resolveAuthNavigation(to, auth);
  };
}
