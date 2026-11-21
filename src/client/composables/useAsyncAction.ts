import { readonly, ref } from 'vue';
import { errorMessage } from '@/api/client.ts';
import { useToast } from './useToast.ts';

/**
 * Runs an async action with a busy flag and uniform error reporting.
 * Used by every form button so double submits and silent failures are impossible.
 *
 * @param action Work to run.
 * @param options Optional success message and tone.
 * @returns A wrapped runner plus reactive `busy` and `error` state.
 */
export function useAsyncAction<T>(
  action: () => Promise<T>,
  options: { successMessage?: string; errorPrefix?: string } = {}
) {
  const busy = ref(false);
  const error = ref<string | null>(null);
  const toast = useToast();

  const run = async (): Promise<T | null> => {
    if (busy.value) return null;
    busy.value = true;
    error.value = null;
    try {
      const result = await action();
      if (options.successMessage) toast.push(options.successMessage, 'success', 2400);
      return result;
    } catch (caught) {
      const message = errorMessage(caught);
      error.value = options.errorPrefix ? `${options.errorPrefix} ${message}` : message;
      toast.push(error.value, 'error', 4200);
      return null;
    } finally {
      busy.value = false;
    }
  };

  return { run, busy: readonly(busy), error: readonly(error) };
}
