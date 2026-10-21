import { describe, expect, it } from "vitest";
import {
  buildLocationUpdate,
  describeAck,
  LOCATION_UPDATE_INTERVAL_MS,
  MAX_ACCEPTED_SAMPLE_AGE_MS,
  shouldSendUpdate
} from "./location-broadcast";
import { ownDeviceId } from "./device-identity";

const now = Date.parse("2026-10-21T09:00:00.000Z");

function sample(overrides: Record<string, unknown> = {}) {
  return {
    coords: { latitude: 35.6997, longitude: 51.3379, accuracy: 12 },
    timestamp: now,
    ...overrides
  };
}

describe("buildLocationUpdate", () => {
  it("maps a fresh geolocation sample onto the socket payload", () => {
    expect(buildLocationUpdate(sample() as never, { deviceId: "device-1", now })).toEqual({
      lat: 35.6997,
      lon: 51.3379,
      accuracy: 12,
      timestamp: "2026-10-21T09:00:00.000Z",
      priorityDeviceId: "device-1"
    });
  });

  it("drops unusable fixes instead of broadcasting a placeholder position", () => {
    const invalid = [
      undefined,
      sample({ coords: null }),
      sample({ coords: { latitude: null, longitude: 51.3, accuracy: 5 } }),
      sample({ coords: { latitude: 95, longitude: 51.3, accuracy: 5 } }),
      sample({ coords: { latitude: Number.NaN, longitude: 51.3, accuracy: 5 } }),
      sample({ coords: { latitude: 35.7, longitude: 51.3, accuracy: 5 }, timestamp: now - MAX_ACCEPTED_SAMPLE_AGE_MS - 1 }),
      sample({ coords: { latitude: 35.7, longitude: 51.3, accuracy: 5 }, timestamp: now + 60_000 })
    ];

    for (const candidate of invalid) {
      expect(buildLocationUpdate(candidate as never, { deviceId: "device-1", now })).toBeNull();
    }
  });

  it("omits an unusable accuracy but keeps the fix", () => {
    const update = buildLocationUpdate(
      sample({ coords: { latitude: 35.7, longitude: 51.3, accuracy: -1 } }) as never,
      { deviceId: "device-1", now }
    );

    expect(update).not.toHaveProperty("accuracy");
    expect(update).toMatchObject({ lat: 35.7, lon: 51.3 });
  });
});

describe("broadcast pacing and acks", () => {
  it("sends immediately, then no faster than the interval", () => {
    expect(shouldSendUpdate({ lastSentAt: null, now })).toBe(true);
    expect(shouldSendUpdate({ lastSentAt: now - 1_000, now })).toBe(false);
    expect(shouldSendUpdate({ lastSentAt: now - LOCATION_UPDATE_INTERVAL_MS, now })).toBe(true);
    expect(shouldSendUpdate({ lastSentAt: now - 2_000, now, intervalMs: 2_000 })).toBe(true);
  });

  it("recognises a rejected ack so the caller can stop broadcasting", () => {
    expect(describeAck({ ok: true, status: "accepted", peers: ["u"] })).toEqual({ ok: true, code: null });
    expect(describeAck({ ok: false, status: "rejected", code: "WRONG_DEVICE" })).toEqual({
      ok: false,
      code: "WRONG_DEVICE"
    });
    expect(describeAck(undefined)).toEqual({ ok: false, code: null });
  });

  it("reads this session's device id from its own access token", () => {
    const claims = { sub: "user-1", deviceId: "device-42", role: "user", exp: 1_700_000_000 };
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify(claims)).toString("base64url"),
      "signature"
    ].join(".");

    expect(ownDeviceId(token)).toBe("device-42");
    expect(ownDeviceId(null)).toBeNull();
    expect(ownDeviceId("opaque-session-token")).toBeNull();
    expect(ownDeviceId("eyJhbGciOiJIUzI1NiJ9.not-base64-json")).toBeNull();
  });
});
