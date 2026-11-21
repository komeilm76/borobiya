import { computed, ref } from 'vue';
import { useEventListener } from '@vueuse/core';

/**
 * Press-and-hold gesture for the SOS button.
 * A short press is rejected; holding for the configured duration fills the progress ring
 * and fires the request. Pointer, keyboard and touch all share one code path.
 *
 * @param onTrigger Called once the hold completes.
 * @param durationMs Hold duration in milliseconds.
 * @returns Reactive progress plus `start`/`cancel` handlers.
 */
export function useSosHold(onTrigger: () => void, durationMs = 1200) {
  const holding = ref(false);
  const progress = ref(0);
  let frame: number | null = null;
  let startedAt = 0;

  const label = computed(() => (holding.value ? 'برای ارسال رها نکنید' : 'نگه دارید تا درخواست امداد باز شود'));

  function stop(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    holding.value = false;
    progress.value = 0;
  }

  function tick(): void {
    const elapsed = Date.now() - startedAt;
    progress.value = Math.min(1, elapsed / durationMs);
    if (progress.value >= 1) {
      stop();
      onTrigger();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function start(): void {
    if (holding.value) return;
    holding.value = true;
    startedAt = Date.now();
    progress.value = 0;
    frame = requestAnimationFrame(tick);
  }

  useEventListener(window, 'blur', stop);
  useEventListener(window, 'pointerup', () => {
    if (holding.value) stop();
  });

  return { holding, progress, label, start, stop };
}
