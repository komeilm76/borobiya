import { readonly, ref } from 'vue';

/** Visual tone of a toast message. */
type ToastTone = 'info' | 'success' | 'warning' | 'error';

/** A single toast notification. */
interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  timeout: number;
}

const messages = ref<ToastMessage[]>([]);
let sequence = 0;

/**
 * Global toast queue shared by every screen. Kept outside Pinia because it is a pure
 * presentation concern with no persistence and no server interaction.
 *
 * @returns Push/dismiss helpers and the readonly queue.
 */
export function useToast() {
  /**
   * Shows a toast.
   *
   * @param message Persian message text.
   * @param tone Visual tone; defaults to `info`.
   * @param timeout Auto-dismiss delay in milliseconds.
   * @returns The toast identifier.
   */
  function push(message: string, tone: ToastTone = 'info', timeout = 3600): number {
    const id = ++sequence;
    messages.value = [...messages.value, { id, message, tone, timeout }];
    if (timeout > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => dismiss(id), timeout);
    }
    return id;
  }

  /**
   * Dismisses one toast.
   *
   * @param id Identifier returned by {@link push}.
   */
  function dismiss(id: number): void {
    messages.value = messages.value.filter((item) => item.id !== id);
  }

  return { messages: readonly(messages), push, dismiss };
}
