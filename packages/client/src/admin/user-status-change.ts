import { onScopeDispose, ref, watch, type Ref } from "vue";
import type { UserProfile } from "@shared/index";

export interface AdminUserStatusChangeOptions {
  /** Stable across bearer renewal; null without a verified admin login. */
  session: () => string | null;
  accessToken: () => string | null;
  ensureSession: () => Promise<unknown>;
  update: (userId: string, isActive: boolean, token: string) => Promise<unknown>;
  refresh: () => Promise<unknown>;
  listLoading: Ref<boolean>;
  isCurrentAdmin: (userId: string) => boolean;
  errorMessage: (cause: unknown, fallback: string) => string;
}

/** Confirmed admin status changes belong to the login that selected the target.
 * An already-sent PATCH may commit, but its late reply must not change a new login's UI. */
export function useAdminUserStatusChange(options: AdminUserStatusChangeOptions) {
  const statusSavingUserId = ref<string | null>(null);
  const statusError = ref("");
  const statusChange = ref<{ user: UserProfile; nextIsActive: boolean } | null>(null);
  const successVisible = ref(false);
  const successMessage = ref("");
  let generation = 0;
  let disposed = false;

  function clear(): void {
    ++generation;
    statusSavingUserId.value = null;
    statusError.value = "";
    statusChange.value = null;
    successVisible.value = false;
    successMessage.value = "";
  }
  watch(options.session, clear, { flush: "sync" });
  onScopeDispose(() => { disposed = true; clear(); });

  function requestStatusChange(user: UserProfile, value: unknown): void {
    if (disposed || options.listLoading.value || typeof value !== "boolean" || value === user.isActive ||
        statusSavingUserId.value !== null || options.isCurrentAdmin(user.id)) return;
    statusError.value = "";
    statusChange.value = { user, nextIsActive: value };
  }

  function closeStatusDialog(): void {
    if (statusSavingUserId.value !== null) return;
    statusChange.value = null;
    statusError.value = "";
  }

  function updateStatusDialog(open: boolean): void {
    if (!open) closeStatusDialog();
  }

  async function confirmStatusChange(): Promise<void> {
    const pending = statusChange.value;
    if (!pending || statusSavingUserId.value !== null || disposed) return;
    const identity = options.session();
    if (!identity) {
      statusError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    const current = generation;
    const stillCurrent = () => !disposed && current === generation && identity === options.session();
    statusSavingUserId.value = pending.user.id;
    statusError.value = "";
    try {
      await options.ensureSession();
      if (!stillCurrent() || options.isCurrentAdmin(pending.user.id)) return;
      const accessToken = options.accessToken();
      if (!accessToken) {
        statusError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
        return;
      }
      await options.update(pending.user.id, pending.nextIsActive, accessToken);
      if (!stillCurrent()) return;
      statusChange.value = null;
      successMessage.value = pending.nextIsActive
        ? `حساب ${pending.user.username} فعال شد.`
        : `حساب ${pending.user.username} غیرفعال شد و نشست‌های آن لغو شدند.`;
      successVisible.value = true;
      await options.refresh();
    } catch (cause) {
      if (stillCurrent()) statusError.value = options.errorMessage(cause, "تغییر وضعیت حساب انجام نشد. دوباره تلاش کنید.");
    } finally {
      if (stillCurrent()) statusSavingUserId.value = null;
    }
  }

  return { statusSavingUserId, statusError, statusChange, successVisible, successMessage,
    requestStatusChange, closeStatusDialog, updateStatusDialog, confirmStatusChange };
}
