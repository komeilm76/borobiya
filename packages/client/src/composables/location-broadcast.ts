import type { LocationUpdate } from "@shared/index";

/** Spec §7.1: broadcast every 3-5s. 4s balances map smoothness against phone battery. */
export const LOCATION_UPDATE_INTERVAL_MS = 4_000;
/** A fix this old is stale enough that sending it would move peers backwards. */
export const MAX_ACCEPTED_SAMPLE_AGE_MS = 60_000;

export interface PositionSample {
  coords: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
  } | null;
  timestamp?: number;
}

export function isValidCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

/**
 * Builds the `location:update` payload from a browser geolocation sample, or `null` when the
 * sample is unusable (no fix, out-of-range, or older than the accepted window).
 */
export function buildLocationUpdate(
  sample: PositionSample | undefined,
  input: { deviceId: string; now?: number }
): LocationUpdate | null {
  const coords = sample?.coords;
  if (!coords) return null;
  if (!isValidCoordinate(coords.latitude, -90, 90) || !isValidCoordinate(coords.longitude, -180, 180)) return null;

  const now = input.now ?? Date.now();
  const observedAt = typeof sample.timestamp === "number" && Number.isFinite(sample.timestamp) ? sample.timestamp : now;
  if (observedAt > now + 1_000 || now - observedAt > MAX_ACCEPTED_SAMPLE_AGE_MS) return null;

  return {
    lat: coords.latitude,
    lon: coords.longitude,
    ...(coords.accuracy === null || !Number.isFinite(coords.accuracy) || coords.accuracy < 0
      ? {}
      : { accuracy: coords.accuracy }),
    timestamp: new Date(observedAt).toISOString(),
    priorityDeviceId: input.deviceId
  };
}

/** True when the previous broadcast is old enough for the next one. */
export function shouldSendUpdate(input: { lastSentAt: number | null; now: number; intervalMs?: number }): boolean {
  const intervalMs = input.intervalMs ?? LOCATION_UPDATE_INTERVAL_MS;
  if (input.lastSentAt === null) return true;
  return input.now - input.lastSentAt >= intervalMs;
}

/** Ack shapes the server returns for `location:update`; anything else is treated as unknown. */
export function describeAck(ack: unknown): { ok: boolean; code: string | null } {
  if (typeof ack !== "object" || ack === null) return { ok: false, code: null };
  const response = ack as { ok?: unknown; code?: unknown };
  return {
    ok: response.ok === true,
    code: typeof response.code === "string" ? response.code : null
  };
}
