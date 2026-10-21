import { describe, expect, it } from "vitest";
import {
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_TARGETS,
  historyShareSchema,
  locationShareCreatedSchema,
  locationSharesResponseSchema,
  locationUpdateSchema,
  shareSchema
} from "./location";

const targetId = "00000000-0000-4000-8000-000000000010";
const otherTargetId = "00000000-0000-4000-8000-000000000011";
const from = "2026-10-17T12:00:00.000Z";
const to = "2026-10-18T12:00:00.000Z";

describe("location schemas", () => {
  it("requires a positive duration for timed sharing", () => {
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "timed" }).success).toBe(false);
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "timed", durationMinutes: 60 }).success).toBe(true);
  });

  it("allows permanent sharing without an expiry and rejects a duration", () => {
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "permanent" }).success).toBe(true);
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "permanent", durationMinutes: 60 }).success).toBe(false);
  });

  it("takes an optional priority device as a device id only", () => {
    const deviceId = "00000000-0000-4000-8000-000000000030";
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "permanent", priorityDeviceId: deviceId }).success).toBe(true);
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "permanent", priorityDeviceId: "laptop-1" }).success).toBe(false);
    // A share must always name a real device or none at all; clearing a pin is not part of this payload.
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "permanent", priorityDeviceId: null }).success).toBe(false);
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "timed", durationMinutes: 60, priorityDeviceId: deviceId }).success).toBe(true);
  });

  it("requires unique recipients and increasing history-share dates", () => {
    expect(shareSchema.safeParse({ targetUserIds: [targetId, targetId], mode: "permanent" }).success).toBe(false);
    const valid = { targetUserIds: [targetId, otherTargetId], from, to, maxPoints: 500 };
    expect(historyShareSchema.safeParse(valid).success).toBe(true);
    expect(historyShareSchema.safeParse({ ...valid, from: to, to: from }).success).toBe(false);
  });

  it("bounds the timed duration, note length, and recipient count", () => {
    const validTimed = { targetUserIds: [targetId], mode: "timed", durationMinutes: 60 };
    expect(shareSchema.safeParse(validTimed).success).toBe(true);
    expect(shareSchema.safeParse({ ...validTimed, durationMinutes: 0 }).success).toBe(false);
    expect(shareSchema.safeParse({ ...validTimed, durationMinutes: MAX_LOCATION_SHARE_MINUTES }).success).toBe(true);
    expect(shareSchema.safeParse({ ...validTimed, durationMinutes: MAX_LOCATION_SHARE_MINUTES + 1 }).success).toBe(false);
    expect(shareSchema.safeParse({ targetUserIds: [targetId], mode: "permanent", note: "x".repeat(501) }).success).toBe(false);
    expect(
      shareSchema.safeParse({
        targetUserIds: Array.from({ length: MAX_LOCATION_SHARE_TARGETS + 1 }, (_, index) =>
          `00000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`
        ),
        mode: "permanent"
      }).success
    ).toBe(false);
  });

  it("reports every created share and defaults the id lists to empty", () => {
    const share = {
      id: targetId,
      ownerId: otherTargetId,
      targetUserId: targetId,
      mode: "permanent" as const,
      expiresAt: null,
      isRevoked: false,
      priorityDeviceId: null,
      note: null,
      createdAt: from
    };
    expect(locationShareCreatedSchema.parse({ shares: [share] })).toEqual({
      shares: [share],
      createdShareIds: [],
      reusedShareIds: []
    });
    expect(locationShareCreatedSchema.safeParse({ shares: [] }).success).toBe(false);
  });

  it("lists active shares and annotates received rows with the owner", () => {
    const share = {
      id: targetId,
      ownerId: otherTargetId,
      targetUserId: targetId,
      mode: "timed" as const,
      expiresAt: to,
      isRevoked: false,
      priorityDeviceId: null,
      note: null,
      createdAt: from
    };
    expect(locationSharesResponseSchema.safeParse({ owned: [share], sharedWithMe: [] }).success).toBe(true);
    expect(
      locationSharesResponseSchema.safeParse({
        owned: [],
        sharedWithMe: [{ ...share, owner: { id: otherTargetId, username: "dispatch_lead", lastLocation: { lat: 35.7, lon: 51.4 } } }]
      }).success
    ).toBe(true);
    // Received rows must carry an owner; a bare share row is not enough to render a marker.
    expect(locationSharesResponseSchema.safeParse({ owned: [], sharedWithMe: [share] }).success).toBe(false);
    expect(locationSharesResponseSchema.safeParse({ owned: [share], sharedWithMe: [], extra: 1 }).success).toBe(false);
  });

  it("validates geographic bounds and location update metadata", () => {
    const valid = {
      lat: 35.7,
      lon: 51.4,
      accuracy: 5,
      timestamp: to,
      priorityDeviceId: "browser-device-1"
    };
    expect(locationUpdateSchema.safeParse(valid).success).toBe(true);
    expect(locationUpdateSchema.safeParse({ ...valid, lat: 91 }).success).toBe(false);
    expect(locationUpdateSchema.safeParse({ ...valid, priorityDeviceId: " " }).success).toBe(false);
  });
});
