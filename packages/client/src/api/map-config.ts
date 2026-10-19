import { mapConfigSchema, type MapConfig } from "@shared/schemas/map";

export class MapConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapConfigError";
  }
}

/** Load non-secret map settings from the same-origin Map Server config endpoint. */
export async function getMapConfig(signal?: AbortSignal): Promise<MapConfig> {
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
