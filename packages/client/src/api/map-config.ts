import { mapConfigSchema, type MapConfig } from "@shared/schemas/map";

export class MapConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapConfigError";
  }
}

export const MAP_CONFIG_TIMEOUT_MS = 8_000;

async function loadMapConfig(signal: AbortSignal): Promise<MapConfig> {
  let response: Response;
  try {
    response = await fetch("/map-config", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
      signal
    });
  } catch {
    throw new MapConfigError("Map configuration is unavailable.");
  }

  if (!response.ok) throw new MapConfigError("Map configuration is unavailable.");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MapConfigError("Map server returned invalid configuration.");
  }

  const result = mapConfigSchema.safeParse(payload);
  if (!result.success) throw new MapConfigError("Map server returned invalid configuration.");
  return result.data;
}

/** Load non-secret settings without letting a stalled transport block fallback or retry. */
export async function getMapConfig(signal?: AbortSignal): Promise<MapConfig> {
  if (signal?.aborted) throw new DOMException("Map configuration cancelled.", "AbortError");

  const request = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    // Reject first: even a fetch that rejects synchronously on abort must not
    // replace the timeout/cancellation reason with a generic transport error.
    onAbort = () => {
      reject(new DOMException("Map configuration cancelled.", "AbortError"));
      request.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => {
      reject(new MapConfigError("Map configuration timed out."));
      request.abort();
    }, MAP_CONFIG_TIMEOUT_MS);
  });

  try {
    // Abort is advisory (including when reading the body). Race the whole
    // request so even a service worker ignoring abort cannot keep it pending.
    return await Promise.race([loadMapConfig(request.signal), cancelled]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}
