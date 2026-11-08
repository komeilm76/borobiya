import { onScopeDispose, ref, watch, type Ref } from "vue";
import type { UserDevice } from "@shared/index";
import { friendlyErrorMessage } from "@/api/error-message";
import type { DeviceRow } from "./priority-device";

export interface DeviceTerminationOptions {
  /** Stable for bearer renewal, different for each account/login session. */
  session: () => string | null;
  accessToken: () => string | null;
  ensureSession: () => Promise<unknown>;
  devices: Ref<UserDevice[]>;
  loading: Ref<boolean>;
  failed: Ref<boolean>;
  refresh: () => Promise<void>;
  revoke: (sessionId: string, accessToken: string) => Promise<void>;
}

/**
 * Confirming a remote logout is a session-scoped write. Its HTTP request cannot be undone once sent,
 * but a replaced login must immediately be able to manage *its own* sessions. A late old reply must
 * neither announce success for the new login nor release the new login's busy lock.
 */
export function useDeviceTermination(options: DeviceTerminationOptions) {
  const confirmOpen = ref(false);
  const pending = ref<DeviceRow | null>(null);
  const terminating = ref(false);
  const message = ref<string | null>(null);
  const error = ref(false);
  let generation = 0;
  let disposed = false;

  function clear(): void {
    ++generation;
    pending.value = null;
    confirmOpen.value = false;
    terminating.value = false;
    message.value = null;
    error.value = false;
  }

  watch(options.session, clear, { flush: "sync" });
  onScopeDispose(() => { disposed = true; clear(); });

  function askTerminate(row: DeviceRow): void {
    if (row.isCurrent || options.failed.value || options.loading.value || terminating.value || disposed) return;
    pending.value = row;
    message.value = null;
    confirmOpen.value = true;
  }

  async function terminate(): Promise<void> {
    const target = pending.value;
    if (!target || target.isCurrent || terminating.value || options.failed.value || options.loading.value || disposed) return;
    const identity = options.session();
    const current = generation;
    const stillCurrent = () => !disposed && current === generation && identity === options.session();
    terminating.value = true;
    try {
      await options.ensureSession();
      if (!identity || !stillCurrent()) return;
      const token = options.accessToken();
      const device = options.devices.value.find(row => row.deviceId === target.deviceId);
      if (!token || !device || device.isCurrentDevice) {
        confirmOpen.value = false;
        pending.value = null;
        message.value = "این نشست دیگر در فهرست نیست؛ فهرست را تازه کنید.";
        error.value = true;
        await options.refresh();
        return;
      }
      await options.revoke(device.id, token);
      if (!stillCurrent()) return;
      confirmOpen.value = false;
      pending.value = null;
      message.value = "نشست پایان یافت. وضعیت دستگاه پخش‌کننده را در اشتراک‌های موقعیت بررسی کنید.";
      error.value = false;
      await options.refresh();
    } catch (cause) {
      if (!stillCurrent()) return;
      message.value = friendlyErrorMessage(cause, "پایان نشست انجام نشد؛ دوباره تلاش کنید.");
      error.value = true;
      confirmOpen.value = false;
      await options.refresh();
    } finally {
      if (stillCurrent()) terminating.value = false;
    }
  }

  return { confirmOpen, pending, terminating, message, error, askTerminate, terminate };
}
