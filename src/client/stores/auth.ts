import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { del, get, post, ApiError } from '@/api/client.ts';
import type { SecurityQuestionView, SessionView, UserView } from '@/api/types.ts';
import { ROLES } from '@shared/protocol.ts';

/**
 * Authentication and session state.
 * The server owns the session cookie; this store only mirrors the resolved identity.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserView | null>(null);
  const securityQuestions = ref<SecurityQuestionView[]>([]);
  const devices = ref<SessionView[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);
  const isAdmin = computed(() => user.value?.role === ROLES.ADMIN);
  const isResponder = computed(() => user.value?.role === ROLES.RESPONDER);
  const needsOnboarding = computed(() => Boolean(user.value?.mustCompleteSecurityQuestions));

  /**
   * Refreshes the signed-in user, returning null for anonymous visitors instead of throwing.
   *
   * @returns The current user or null.
   */
  async function refresh(): Promise<UserView | null> {
    loading.value = true;
    try {
      user.value = await get<UserView>('/_user/me');
      return user.value;
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        user.value = null;
        return null;
      }
      error.value = caught instanceof Error ? caught.message : 'وضعیت نشست خوانده نشد.';
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** Loads the five-question catalog used by registration, onboarding and recovery. */
  async function loadSecurityQuestions(): Promise<SecurityQuestionView[]> {
    if (securityQuestions.value.length) return securityQuestions.value;
    const response = await get<{ items: SecurityQuestionView[] }>('/_public/security-questions');
    securityQuestions.value = response.items ?? [];
    return securityQuestions.value;
  }

  /**
   * Signs a user in and resolves their profile.
   *
   * @param username Lower-case user name.
   * @param password Plain-text password.
   * @param deviceName Friendly device label shown in the profile screen.
   * @returns The authenticated user.
   */
  async function login(username: string, password: string, deviceName: string): Promise<UserView> {
    await post('/_auth/login', { username, password, deviceId: 'web-client', deviceName });
    const current = await refresh();
    if (!current) throw new ApiError(401, 'UNAUTHORIZED', 'ورود انجام نشد.');
    return current;
  }

  /** Registers a new account with five distinct security answers. */
  async function register(
    username: string,
    password: string,
    securityQuestionsInput: Array<{ questionId: string; answer: string }>
  ): Promise<UserView> {
    await post('/_auth/register', { username, password, securityQuestions: securityQuestionsInput });
    const current = await refresh();
    if (!current) throw new ApiError(401, 'UNAUTHORIZED', 'ثبت‌نام انجام نشد.');
    return current;
  }

  /** Completes forced onboarding for administrator-created accounts. */
  async function completeSecurityQuestions(answers: Array<{ questionId: string; answer: string }>): Promise<void> {
    await post('/_user/security-questions', { securityQuestions: answers });
    user.value = await get<UserView>('/_user/me');
  }

  /** Starts the five-question recovery flow. */
  async function startRecovery(username: string): Promise<{ recoveryId: string; questions: SecurityQuestionView[]; expiresAt: number }> {
    return post('/_auth/recovery/start', { username });
  }

  /** Answers three selected recovery questions and receives a one-use reset token. */
  async function answerRecovery(
    recoveryId: string,
    answers: Array<{ questionId: string; answer: string }>
  ): Promise<{ recoveryId: string; resetToken: string; expiresAt: number }> {
    return post('/_auth/recovery/answers', { recoveryId, answers });
  }

  /** Resets the password with the one-use recovery token. */
  async function resetPassword(recoveryId: string, resetToken: string, newPassword: string): Promise<void> {
    await post('/_auth/recovery/reset', { recoveryId, resetToken, newPassword });
  }

  /**
   * Loads the active device list for the profile screen.
   *
   * A failed read must not reject into the view's `void` call: an expired session would become an
   * unhandled rejection with no feedback, so an unauthorized response clears the local user (the
   * router guard then redirects) and any other failure is reported through `error`.
   */
  async function loadDevices(): Promise<SessionView[]> {
    try {
      const response = await get<{ items: SessionView[] }>('/_user/devices');
      devices.value = response.items ?? [];
      error.value = null;
      return devices.value;
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        user.value = null;
        devices.value = [];
        return [];
      }
      error.value = caught instanceof Error ? caught.message : 'فهرست دستگاه‌ها خوانده نشد.';
      return devices.value;
    }
  }

  /** Revokes a single device session; the endpoint is `DELETE /_user/devices/:sessionId`. */
  async function revokeDevice(sessionId: string): Promise<void> {
    await del(`/_user/devices/${encodeURIComponent(sessionId)}`);
    await loadDevices();
  }

  /** Clears the local session and signs out on the server. */
  async function logout(): Promise<void> {
    try {
      await post('/_auth/logout');
    } catch {
      // Local sign-out must succeed even when the network is unavailable.
    }
    user.value = null;
    devices.value = [];
  }

  return {
    user,
    securityQuestions,
    devices,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    isResponder,
    needsOnboarding,
    refresh,
    loadSecurityQuestions,
    login,
    register,
    completeSecurityQuestions,
    startRecovery,
    answerRecovery,
    resetPassword,
    loadDevices,
    revokeDevice,
    logout
  };
});
