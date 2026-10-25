import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  authUserSchema,
  completeSecurityQuestionsResponseSchema,
  completeSecurityQuestionsSchema,
  loginResponseSchema,
  loginSchema,
  logoutResponseSchema,
  refreshResponseSchema,
  userProfileSchema,
  type AuthUser,
  type CompleteSecurityQuestionsInput,
  type LoginInput,
  type UserCategorySummary,
  type UserProfile
} from "@shared/index";
import {
  ApiError,
  authApiRoutes,
  registerAccessTokenRefresher,
  requestJson,
  userApiRoutes
} from "../api/http";

const USER_STORAGE_KEY = "borobiya.auth-user";
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.sessionStorage.getItem(USER_STORAGE_KEY);
    if (!serialized) return null;
    const parsed = authUserSchema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveStoredUser(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else window.sessionStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing; in-memory auth still works for this page.
  }
}

function accessTokenExpiry(token: string): number | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart || typeof atob !== "function") return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function userFromProfile(profile: UserProfile): AuthUser {
  return authUserSchema.parse({
    id: profile.id,
    username: profile.username,
    role: profile.role,
    mustCompleteSecurityQuestions: profile.mustCompleteSecurityQuestions
  });
}

export const useAuthStore = defineStore("auth", () => {
  const accessToken = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  const userCategories = ref<UserCategorySummary[]>([]);
  const onboardingRequired = ref(false);
  const initialized = ref(false);
  const isAuthenticated = computed(() => accessToken.value !== null);
  const mustCompleteSecurityQuestions = computed(() => {
    if (user.value?.role === "admin") return false;
    return onboardingRequired.value || user.value?.mustCompleteSecurityQuestions === true;
  });
  const userRole = computed(() => user.value?.role ?? null);
  let initializationPromise: Promise<void> | null = null;
  let refreshPromise: Promise<void> | null = null;
  let refreshPromiseGeneration = -1;
  // Async refreshes/profile reads must not write into a session that has since signed out or
  // switched accounts. Token equality alone cannot detect a late refresh response.
  let sessionGeneration = 0;
  // Keep tokens issued in this session so staggered 401s can reuse a rotated bearer, but a
  // request from a *previous* account cannot be retried as the account now signed in.
  const sessionTokens = new Set<string>();
  let expiresAt: number | null = null;
  let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  function clearProactiveRefresh(): void {
    if (proactiveRefreshTimer !== null) {
      clearTimeout(proactiveRefreshTimer);
      proactiveRefreshTimer = null;
    }
  }

  function scheduleProactiveRefresh(nextExpiresAt: number | null): void {
    clearProactiveRefresh();
    if (nextExpiresAt === null) return;
    const delayMs = nextExpiresAt - Date.now() - ACCESS_TOKEN_REFRESH_MARGIN_MS;
    if (delayMs <= 0) return;
    proactiveRefreshTimer = setTimeout(() => {
      proactiveRefreshTimer = null;
      void refreshFromCookie().catch(() => {
        // Leave reactive recovery to the next user operation or socket reconnect if offline.
      });
    }, delayMs);
    proactiveRefreshTimer.unref?.();
  }

  function setAccessToken(token: string): void {
    accessToken.value = token;
    sessionTokens.add(token);
    expiresAt = accessTokenExpiry(token);
    scheduleProactiveRefresh(expiresAt);
  }

  function setUser(nextUser: AuthUser | null): void {
    user.value = nextUser;
    onboardingRequired.value = nextUser?.mustCompleteSecurityQuestions ?? false;
    saveStoredUser(nextUser);
  }

  function clearSession(): void {
    ++sessionGeneration;
    sessionTokens.clear();
    clearProactiveRefresh();
    accessToken.value = null;
    expiresAt = null;
    userCategories.value = [];
    setUser(null);
    initialized.value = true;
  }

  async function loadCurrentUser(token: string, generation = sessionGeneration): Promise<void> {
    try {
      const profile = userProfileSchema.parse(await requestJson<UserProfile>(userApiRoutes.me.url, {
        method: "GET",
        accessToken: token,
        skipAuthRefresh: true
      }));
      if (generation !== sessionGeneration || accessToken.value !== token) return;
      userCategories.value = profile.categories;
      setUser(userFromProfile(profile));
    } catch (error) {
      if (generation !== sessionGeneration || accessToken.value !== token) return;
      if (error instanceof ApiError && error.code === "SECURITY_QUESTIONS_REQUIRED") {
        onboardingRequired.value = true;
        if (user.value) setUser({ ...user.value, mustCompleteSecurityQuestions: true });
        return;
      }
      // Keep the cookie-refreshed token and any stored user snapshot on transient profile errors.
    }
  }

  function refreshFromCookie(): Promise<void> {
    if (refreshPromise && refreshPromiseGeneration === sessionGeneration) return refreshPromise;
    const generation = sessionGeneration;
    const pending = (async () => {
      const response = refreshResponseSchema.parse(await requestJson<unknown>(authApiRoutes.refresh.url, {
        method: "POST"
      }));
      if (generation !== sessionGeneration) return;
      setAccessToken(response.accessToken);
      await loadCurrentUser(response.accessToken, generation);
    })();
    refreshPromise = pending;
    refreshPromiseGeneration = generation;
    return pending.finally(() => {
      if (refreshPromise === pending) {
        refreshPromise = null;
        refreshPromiseGeneration = -1;
      }
    });
  }

  async function ensureSession(): Promise<void> {
    if (initializationPromise) return initializationPromise;
    if (!initialized.value) {
      initializationPromise = (async () => {
        const generation = sessionGeneration;
        const storedUser = readStoredUser();
        if (storedUser) {
          user.value = storedUser;
          onboardingRequired.value = storedUser.mustCompleteSecurityQuestions;
        }
        try {
          await refreshFromCookie();
        } catch {
          if (generation === sessionGeneration) clearSession();
        } finally {
          initialized.value = true;
        }
      })();
      try {
        await initializationPromise;
      } finally {
        initializationPromise = null;
      }
      return;
    }

    if (accessToken.value && expiresAt !== null && expiresAt <= Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS) {
      const generation = sessionGeneration;
      try {
        await refreshFromCookie();
      } catch {
        if (generation === sessionGeneration) clearSession();
      }
    }
  }

  async function refreshSession(): Promise<boolean> {
    const generation = sessionGeneration;
    try {
      await refreshFromCookie();
      return generation === sessionGeneration && accessToken.value !== null;
    } catch {
      if (generation === sessionGeneration) clearSession();
      return false;
    }
  }

  registerAccessTokenRefresher(async (failedToken: string) => {
    if (!sessionTokens.has(failedToken)) return null;
    if (accessToken.value && accessToken.value !== failedToken) {
      return accessToken.value;
    }
    const refreshed = await refreshSession();
    return refreshed ? accessToken.value : null;
  });

  function acceptLogin(response: unknown): void {
    const parsed = loginResponseSchema.parse(response);
    ++sessionGeneration;
    sessionTokens.clear();
    userCategories.value = [];
    setAccessToken(parsed.accessToken);
    setUser(parsed.user);
    initialized.value = true;
  }

  async function login(input: LoginInput): Promise<void> {
    const parsedInput = loginSchema.parse(input);
    const generation = sessionGeneration;
    const response = await requestJson<unknown>(authApiRoutes.login.url, {
      method: "POST",
      body: parsedInput
    });
    if (generation !== sessionGeneration) throw new Error("Sign-in cancelled: session changed.");
    acceptLogin(response);
    if (accessToken.value && !mustCompleteSecurityQuestions.value) {
      await loadCurrentUser(accessToken.value);
    }
  }

  async function completeSecurityQuestions(input: CompleteSecurityQuestionsInput): Promise<void> {
    const parsedInput = completeSecurityQuestionsSchema.parse(input);
    const generation = sessionGeneration;
    try {
      const response = await requestJson<unknown>(userApiRoutes.completeSecurityQuestions.url, {
        method: "POST",
        body: parsedInput,
        accessToken: accessToken.value
      });
      completeSecurityQuestionsResponseSchema.parse(response);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "SECURITY_QUESTIONS_ALREADY_COMPLETED")) throw error;
    }

    if (generation !== sessionGeneration) return;
    onboardingRequired.value = false;
    if (user.value) setUser({ ...user.value, mustCompleteSecurityQuestions: false });
    if (accessToken.value) await loadCurrentUser(accessToken.value);
  }

  async function logout(): Promise<void> {
    try {
      const response = await requestJson<unknown>(authApiRoutes.logout.url, { method: "POST", body: {} });
      logoutResponseSchema.parse(response);
    } finally {
      clearSession();
    }
  }

  async function refreshProfile(): Promise<void> {
    await ensureSession();
    if (accessToken.value) {
      await loadCurrentUser(accessToken.value);
    }
  }

  return {
    accessToken,
    user,
    userCategories,
    initialized,
    isAuthenticated,
    mustCompleteSecurityQuestions,
    userRole,
    ensureSession,
    refreshSession,
    refreshProfile,
    login,
    completeSecurityQuestions,
    logout
  };
});
