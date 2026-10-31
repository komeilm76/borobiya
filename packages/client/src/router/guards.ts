import type { AuthUser } from "@shared/index";
import type { RouteLocationRaw, RouteLocationNormalized } from "vue-router";

const LOGIN_PATH = "/_auth/login";
const USER_HOME_PATH = "/_user/map";
const ADMIN_USERS_PATH = "/_admin/users";
const ONBOARDING_PATH = "/_user/complete-security-questions";

export interface AuthGuardState {
  ensureSession(): Promise<void>;
  isAuthenticated: boolean;
  mustCompleteSecurityQuestions: boolean;
  user: Pick<AuthUser, "role"> | null;
}

export type AuthGuardLocation = Pick<RouteLocationNormalized, "path" | "fullPath" | "query">;

export function isGuestOnlyPath(path: string): boolean {
  // The short /auth/* URLs are aliases for the canonical /_auth/* views.
  return ["/_auth", "/auth"].some((root) => path === root || path.startsWith(`${root}/`));
}

function isAdminPath(path: string): boolean {
  return path === "/_admin" || path.startsWith("/_admin/");
}

function isProtectedPath(path: string): boolean {
  return path === "/_user" || path.startsWith("/_user/") || isAdminPath(path);
}

function safeRedirectPath(candidate: unknown): string | null {
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(candidate) ||
    isGuestOnlyPath(candidate.split(/[?#]/, 1)[0] ?? "")
  ) {
    return null;
  }
  return candidate;
}

export function resolvePostLoginDestination(
  redirect: unknown,
  auth: Pick<AuthGuardState, "mustCompleteSecurityQuestions" | "user">
): string {
  const safeRedirect = safeRedirectPath(redirect);
  if (safeRedirect) return safeRedirect;
  if (auth.mustCompleteSecurityQuestions) return ONBOARDING_PATH;
  return auth.user?.role === "admin" ? ADMIN_USERS_PATH : USER_HOME_PATH;
}

export function resolveAuthNavigation(
  to: AuthGuardLocation,
  auth: AuthGuardState
): RouteLocationRaw | true {
  if (auth.isAuthenticated && auth.mustCompleteSecurityQuestions && to.path !== ONBOARDING_PATH) {
    return ONBOARDING_PATH;
  }

  if (isGuestOnlyPath(to.path) && auth.isAuthenticated) {
    return resolvePostLoginDestination(to.query.redirect, auth);
  }

  if (!isProtectedPath(to.path)) return true;
  if (!auth.isAuthenticated) {
    return { path: LOGIN_PATH, query: { redirect: to.fullPath } };
  }
  if (auth.mustCompleteSecurityQuestions && to.path !== ONBOARDING_PATH) {
    return ONBOARDING_PATH;
  }
  if (!auth.mustCompleteSecurityQuestions && to.path === ONBOARDING_PATH) {
    return auth.user?.role === "admin" ? ADMIN_USERS_PATH : USER_HOME_PATH;
  }
  if (isAdminPath(to.path) && auth.user?.role !== "admin") {
    return USER_HOME_PATH;
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
