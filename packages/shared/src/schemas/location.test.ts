import { describe, expect, it } from "vitest";
import {
  historyShareSchema,
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

  it("requires unique recipients and increasing history-share dates", () => {
    expect(shareSchema.safeParse({ targetUserIds: [targetId, targetId], mode: "permanent" }).success).toBe(false);
    const valid = { targetUserIds: [targetId, otherTargetId], from, to, maxPoints: 500 };
    expect(historyShareSchema.safeParse(valid).success).toBe(true);
    expect(historyShareSchema.safeParse({ ...valid, from: to, to: from }).success).toBe(false);
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
