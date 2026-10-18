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
  type UserProfile
} from "@shared/index";
import { ApiError, authApiRoutes, requestJson, userApiRoutes } from "../api/http";

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
  const onboardingRequired = ref(false);
  const initialized = ref(false);
  const isAuthenticated = computed(() => accessToken.value !== null);
  const mustCompleteSecurityQuestions = computed(
    () => onboardingRequired.value || user.value?.mustCompleteSecurityQuestions === true
  );
  const userRole = computed(() => user.value?.role ?? null);
  let initializationPromise: Promise<void> | null = null;
  let refreshPromise: Promise<void> | null = null;
  let expiresAt: number | null = null;

  function setAccessToken(token: string): void {
    accessToken.value = token;
    expiresAt = accessTokenExpiry(token);
  }

  function setUser(nextUser: AuthUser | null): void {
    user.value = nextUser;
    onboardingRequired.value = nextUser?.mustCompleteSecurityQuestions ?? false;
    saveStoredUser(nextUser);
  }

  function clearSession(): void {
    accessToken.value = null;
    expiresAt = null;
    setUser(null);
    initialized.value = true;
  }

  async function loadCurrentUser(token: string): Promise<void> {
    try {
      const profile = userProfileSchema.parse(await requestJson<UserProfile>(userApiRoutes.me.url, {
        method: "GET",
        accessToken: token
      }));
      setUser(userFromProfile(profile));
    } catch (error) {
      if (error instanceof ApiError && error.code === "SECURITY_QUESTIONS_REQUIRED") {
        onboardingRequired.value = true;
        if (user.value) setUser({ ...user.value, mustCompleteSecurityQuestions: true });
        return;
      }
      // Keep the cookie-refreshed token and any stored user snapshot on transient profile errors.
    }
  }

  function refreshFromCookie(): Promise<void> {
    if (refreshPromise) return refreshPromise;
    const pending = (async () => {
      const response = refreshResponseSchema.parse(await requestJson<unknown>(authApiRoutes.refresh.url, {
        method: "POST"
      }));
      setAccessToken(response.accessToken);
      await loadCurrentUser(response.accessToken);
    })();
    refreshPromise = pending;
    return pending.finally(() => {
      if (refreshPromise === pending) refreshPromise = null;
    });
  }

  async function ensureSession(): Promise<void> {
    if (initializationPromise) return initializationPromise;
    if (!initialized.value) {
      initializationPromise = (async () => {
        const storedUser = readStoredUser();
        if (storedUser) {
          user.value = storedUser;
          onboardingRequired.value = storedUser.mustCompleteSecurityQuestions;
        }
        try {
          await refreshFromCookie();
        } catch {
          clearSession();
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
      try {
        await refreshFromCookie();
      } catch {
        clearSession();
      }
    }
  }

  function acceptLogin(response: unknown): void {
    const parsed = loginResponseSchema.parse(response);
    setAccessToken(parsed.accessToken);
    setUser(parsed.user);
    initialized.value = true;
  }

  async function login(input: LoginInput): Promise<void> {
    const parsedInput = loginSchema.parse(input);
    const response = await requestJson<unknown>(authApiRoutes.login.url, {
      method: "POST",
      body: parsedInput
    });
    acceptLogin(response);
  }

  async function completeSecurityQuestions(input: CompleteSecurityQuestionsInput): Promise<void> {
    const parsedInput = completeSecurityQuestionsSchema.parse(input);
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

  return {
    accessToken,
    user,
    initialized,
    isAuthenticated,
    mustCompleteSecurityQuestions,
    userRole,
    ensureSession,
    login,
    completeSecurityQuestions,
    logout
  };
});
