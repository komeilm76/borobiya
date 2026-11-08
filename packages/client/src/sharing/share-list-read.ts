/** A half-open grant-list fetch must not permanently block the share panel's Refresh action. */
export const SHARE_LIST_READ_DEADLINE_MS = 12_000;

/**
 * Bound each list independently: a successful live list must still be usable if history stalls, and
 * vice versa. A parent signal invalidates both reads when the session or refresh changes. The race
 * also settles if an injected transport ignores abort; callers fence any late results by generation.
 */
export async function readShareListWithinDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal
): Promise<T> {
  if (parentSignal?.aborted) throw new Error("SHARE_LIST_READ_ABORTED");
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let onAbort = () => {};
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("SHARE_LIST_READ_ABORTED"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => {
      reject(new Error("SHARE_LIST_READ_TIMEOUT"));
      controller.abort();
    }, SHARE_LIST_READ_DEADLINE_MS);
  });
  try { return await Promise.race([read(controller.signal), deadline]); }
  finally {
    if (timeout !== null) clearTimeout(timeout);
    controller.signal.removeEventListener("abort", onAbort);
    parentSignal?.removeEventListener("abort", abort);
  }
}
