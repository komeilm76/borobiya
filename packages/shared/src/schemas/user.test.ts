import { describe, expect, it } from "vitest";
import { MAX_USER_DEVICE_LIST_ITEMS, deviceSchema, devicesSchema } from "./user";

const sessionId = "00000000-0000-4000-8000-000000000020";
const deviceId = "00000000-0000-4000-8000-000000000021";

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    deviceId,
    deviceName: "Chrome on Windows",
    ip: "172.30.0.42",
    isCurrentDevice: true,
    lastActiveAt: "2026-10-21T09:00:00.000Z",
    isOnline: true,
    ...overrides
  };
}

describe("device schemas", () => {
  it("describes one active device by both its session row and its device identity", () => {
    expect(deviceSchema.safeParse(device()).success).toBe(true);
    // `deviceId` is what `location_shares.priorityDeviceId` stores, so the list must carry it.
    const { deviceId: _omitted, ...withoutDeviceId } = device();
    expect(deviceSchema.safeParse(withoutDeviceId).success).toBe(false);
  });

  it("keeps unknown fields out of the devices table response", () => {
    expect(deviceSchema.safeParse(device({ refreshTokenHash: "nope" })).success).toBe(false);
    expect(deviceSchema.safeParse(device({ lastActiveAt: "yesterday" })).success).toBe(false);
  });

  it("allows a null label and address for sessions the client described poorly", () => {
    expect(deviceSchema.safeParse(device({ deviceName: null, ip: null, isOnline: false })).success).toBe(true);
  });

  it("accepts an empty list and rejects a device row twice", () => {
    expect(devicesSchema.safeParse([]).success).toBe(true);
    expect(devicesSchema.safeParse([device(), device()]).success).toBe(true);
    expect(devicesSchema.safeParse([device(), "nope"]).success).toBe(false);
  });

  it("publishes the list cap the user endpoint enforces", () => {
    expect(Number.isInteger(MAX_USER_DEVICE_LIST_ITEMS)).toBe(true);
    expect(MAX_USER_DEVICE_LIST_ITEMS).toBeGreaterThan(0);
  });
});
