import { onScopeDispose, ref } from "vue";
import type { ReverseGeocodeResult } from "@shared/index";
import { reversePlace } from "@/api/geocoding";

/** One selected point at a time: closing/changing it revokes old requests and clipboard feedback. */
export function useReversePlace(options: { reverse?: typeof reversePlace; copy?: (text: string) => Promise<void> } = {}) {
  const open = ref(false);
  const point = ref<{ lat: number; lon: number } | null>(null);
  const address = ref<ReverseGeocodeResult | null>(null);
  const loading = ref(false);
  const failed = ref(false);
  const copied = ref(false);
  const copyFailed = ref(false);
  let controller: AbortController | null = null;
  let generation = 0;
  let disposed = false;

  function cancel(): void {
    generation++;
    controller?.abort();
    controller = null;
    loading.value = false;
  }

  function close(): void {
    cancel();
    open.value = false;
    point.value = null;
    address.value = null;
    failed.value = false;
    copied.value = false;
    copyFailed.value = false;
  }

  async function load(): Promise<void> {
    if (disposed || !point.value) return;
    cancel();
    const current = generation;
    const coords = point.value;
    controller = new AbortController();
    loading.value = true;
    address.value = null;
    failed.value = false;
    copied.value = false;
    copyFailed.value = false;
    try {
      const result = await (options.reverse ?? reversePlace)(coords, controller.signal);
      if (disposed || current !== generation) return;
      address.value = result;
    } catch (error) {
      if (disposed || current !== generation) return;
      if ((error as { name?: unknown } | null)?.name !== "AbortError") failed.value = true;
    } finally {
      if (!disposed && current === generation) {
        loading.value = false;
        controller = null;
      }
    }
  }

  function select(lat: number, lon: number): void {
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) return;
    point.value = { lat, lon };
    open.value = true;
    void load();
  }

  async function copy(): Promise<void> {
    const text = address.value?.formattedAddress;
    if (!open.value || !text || disposed) return;
    const current = generation;
    copied.value = false;
    copyFailed.value = false;
    try {
      await (options.copy ?? ((value: string) => navigator.clipboard.writeText(value)))(text);
      if (!disposed && current === generation) copied.value = true;
    } catch {
      if (!disposed && current === generation) copyFailed.value = true;
    }
  }

  onScopeDispose(() => { disposed = true; close(); });
  return { open, point, address, loading, failed, copied, copyFailed, select, load, close, copy };
}
