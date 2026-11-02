import type { useAuthStore } from "../stores/auth";

type AuthStore = ReturnType<typeof useAuthStore>;

/**
 * The one place an admin screen asks for a usable access token.
 *
 * A 15-minute access token is shorter than an admin's attention span: a screen that reads the token once on
 * mount and reuses it for every later write works in development and returns 401 on the fourth edit of a long
 * session. Every request therefore goes through `ensureSession()` first, and the caller decides what a missing
 * session means (usually the forbidden panel).
 */
export async function adminSessionToken(auth: AuthStore): Promise<string | null> {
  try {
    await auth.ensureSession();
  } catch {
    /* the caller reports the missing token */
  }
  return auth.accessToken ?? null;
}
