import { ref, watch, type ComputedRef, type Ref } from "vue";

export interface LogoutConfirmationOptions {
  isAuthenticated: ComputedRef<boolean> | Ref<boolean>;
  logout: () => Promise<void>;
  onLoggedOut: () => Promise<unknown>;
}

/** Keep leaving the app behind an explicit choice, including while logout is in flight. */
export function useLogoutConfirmation(options: LogoutConfirmationOptions) {
  const open = ref(false);
  const submitting = ref(false);

  function request(): void {
    if (options.isAuthenticated.value && !submitting.value) open.value = true;
  }

  function cancel(): void {
    if (!submitting.value) open.value = false;
  }

  async function confirm(): Promise<void> {
    if (!open.value || submitting.value || !options.isAuthenticated.value) return;
    submitting.value = true;
    try {
      await options.logout();
    } catch {
      // The auth store clears the local session even when the server cannot be reached.
    } finally {
      open.value = false;
      try {
        await options.onLoggedOut();
      } finally {
        submitting.value = false;
      }
    }
  }

  watch(options.isAuthenticated, (authenticated) => {
    if (!authenticated) open.value = false;
  }, { flush: "sync" });

  return { open, submitting, request, cancel, confirm };
}
