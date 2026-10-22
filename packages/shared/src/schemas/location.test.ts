import { describe, expect, it } from "vitest";
import {
  MAX_LOCATION_HISTORY_SHARE_POINTS,
  MAX_LOCATION_SHARE_LIST_ITEMS,
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_TARGETS,
  historyShareSchema,
  locationHistoryResponseSchema,
  locationHistorySharesResponseSchema,
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
    // `maxPoints` is bounded by the contract because it sizes every later read of the grant; the
    // window itself is bounded in the API layer, where LOCATION_HISTORY_MAX_SHARE_DAYS is known.
    expect(historyShareSchema.safeParse({ ...valid, maxPoints: 5_000 }).success).toBe(true);
    expect(historyShareSchema.safeParse({ ...valid, maxPoints: MAX_LOCATION_HISTORY_SHARE_POINTS }).success).toBe(true);
    expect(historyShareSchema.safeParse({ ...valid, maxPoints: 0 }).success).toBe(false);
    expect(historyShareSchema.safeParse({ ...valid, maxPoints: MAX_LOCATION_HISTORY_SHARE_POINTS + 1 }).success).toBe(false);
    expect(historyShareSchema.safeParse({ ...valid, maxPoints: 1.5 }).success).toBe(false);
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
    const ownedRow = { ...share, targetUsername: "satellite" };
    expect(locationSharesResponseSchema.safeParse({ owned: [ownedRow], sharedWithMe: [] }).success).toBe(true);
    expect(
      locationSharesResponseSchema.safeParse({
        owned: [],
        sharedWithMe: [{ ...share, owner: { id: otherTargetId, username: "dispatch_lead", lastLocation: { lat: 35.7, lon: 51.4 } } }]
      }).success
    ).toBe(true);
    // Received rows must carry an owner; a bare share row is not enough to render a marker.
    expect(locationSharesResponseSchema.safeParse({ owned: [], sharedWithMe: [share] }).success).toBe(false);
    expect(locationSharesResponseSchema.safeParse({ owned: [ownedRow], sharedWithMe: [], extra: 1 }).success).toBe(false);
  });

  it("names an owned row's target, and admits when the name could not be read", () => {
    const base = {
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
    expect(locationSharesResponseSchema.safeParse({ owned: [{ ...base, targetUsername: null }], sharedWithMe: [] }).success).toBe(true);
    // Missing is not the same as unknown: an owned row without the field is a server that stopped
    // answering the question, and a strict parse says so here rather than a label silently going blank.
    expect(locationSharesResponseSchema.safeParse({ owned: [base], sharedWithMe: [] }).success).toBe(false);
    // The create response describes rows the caller just wrote: no label, and no room to smuggle one.
    expect(locationShareCreatedSchema.safeParse({ shares: [{ ...base, targetUsername: "satellite" }] }).success).toBe(false);
  });

  it("names an owned history grant the same way", () => {
    const grant = {
      id: targetId,
      ownerId: otherTargetId,
      targetUserId: targetId,
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-04-02T00:00:00.000Z",
      maxPoints: null,
      createdAt: from
    };
    expect(locationHistorySharesResponseSchema.safeParse({ owned: [grant], sharedWithMe: [] }).success).toBe(false);
    expect(locationHistorySharesResponseSchema.safeParse({ owned: [{ ...grant, targetUsername: null }], sharedWithMe: [] }).success).toBe(true);
  });

  it("reads a history window with its sampled total", () => {
    const point = { lat: 35.7, lon: 51.4, timestamp: from };
    const grantPoint = { ...point, accuracy: 12 };

    expect(locationHistoryResponseSchema.safeParse({ points: [point, grantPoint], totalPoints: 8_412 }).success).toBe(true);
    // The total is required: a client that cannot tell a sampled view from the whole record would draw
    // a 30-day trace from 1,000 points and call it complete.
    expect(locationHistoryResponseSchema.safeParse({ points: [point] }).success).toBe(false);
    expect(locationHistoryResponseSchema.safeParse({ points: [point], totalPoints: -1 }).success).toBe(false);
    expect(locationHistoryResponseSchema.safeParse({ points: [point], totalPoints: 1.5 }).success).toBe(false);
    expect(locationHistoryResponseSchema.safeParse({ points: [point], totalPoints: 1, extra: 1 }).success).toBe(false);
    // Accuracy is absent when the device did not report one, never null, so a client does not have to
    // distinguish "no accuracy" from "zero accuracy".
    expect(locationHistoryResponseSchema.safeParse({ points: [{ ...point, accuracy: null }], totalPoints: 1 }).success).toBe(false);
  });

  it("caps a history read at the sampling bound the grant could have asked for", () => {
    const point = { lat: 35.7, lon: 51.4, timestamp: from };
    const atLimit = Array.from({ length: MAX_LOCATION_HISTORY_SHARE_POINTS }, () => point);
    expect(locationHistoryResponseSchema.safeParse({ points: atLimit, totalPoints: 999_999 }).success).toBe(true);
    expect(
      locationHistoryResponseSchema.safeParse({ points: [...atLimit, point], totalPoints: 999_999 }).success
    ).toBe(false);
  });

  it("lists history grants in both directions without a live position", () => {
    const grant = {
      id: targetId,
      ownerId: otherTargetId,
      targetUserId: targetId,
      from,
      to,
      maxPoints: 500,
      createdAt: from
    };
    const received = { ...grant, id: otherTargetId, ownerId: targetId, targetUserId: otherTargetId };
    // An owned grant carries the target's name (P2-Q1); a received one carries `owner` instead.
    const ownedGrant = { ...grant, targetUsername: "satellite" };

    expect(
      locationHistorySharesResponseSchema.safeParse({
        owned: [ownedGrant],
        sharedWithMe: [{ ...received, owner: { id: targetId, username: "dispatcher" } }]
      }).success
    ).toBe(true);
    // A received grant must name who granted it, and it carries no current position: sharing a past
    // window never authorized the receiver to see where the owner is now.
    expect(locationHistorySharesResponseSchema.safeParse({ owned: [], sharedWithMe: [received] }).success).toBe(false);
    expect(
      locationHistorySharesResponseSchema.safeParse({
        owned: [],
        sharedWithMe: [{ ...received, owner: { id: targetId, username: "dispatcher", lastLocation: null } }]
      }).success
    ).toBe(false);

    const capped = Array.from({ length: MAX_LOCATION_SHARE_LIST_ITEMS }, () => ownedGrant);
    expect(locationHistorySharesResponseSchema.safeParse({ owned: capped, sharedWithMe: [] }).success).toBe(true);
    expect(locationHistorySharesResponseSchema.safeParse({ owned: [...capped, grant], sharedWithMe: [] }).success).toBe(false);
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
