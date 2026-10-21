import { describe, expect, it } from "vitest";
import {
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_NOTE_LENGTH,
  MAX_LOCATION_SHARE_TARGETS,
  type LocationShare,
  type ReceivedLocationHistoryShare,
  type ReceivedLocationShare,
  type UserSearchResult
} from "@shared/index";
import { ApiError } from "../api/http";
import {
  addRecipient,
  buildHistorySharePayload,
  buildLiveSharePayload,
  buildShareNameMap,
  canSubmitShareDraft,
  describeHistoryShareRow,
  describeLiveShareRow,
  isAbortError,
  isLatestSearch,
  needsPriorityDevice,
  priorityDeviceIds,
  removeRecipient,
  shareDraftIssues,
  shareRowLabel,
  shouldSearch,
  splitDuration,
  uniqueRecipientIds,
  type ShareDraft
} from "./share-form";

function candidate(id: string, username = `user_${id.slice(0, 8)}`): UserSearchResult {
  return { id, username, category: null, avgRating: null, isOnline: true, distance: null };
}

function draft(overrides: Partial<ShareDraft> = {}): ShareDraft {
  return {
    mode: "timed",
    recipients: [candidate("11111111-1111-4111-8111-111111111111")],
    durationMinutes: 60,
    note: "",
    ...overrides
  };
}

function liveShare(overrides: Partial<LocationShare> = {}): LocationShare {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    ownerId: "aaaaaaaa-0000-4000-8000-000000000002",
    targetUserId: "aaaaaaaa-0000-4000-8000-000000000003",
    mode: "timed",
    expiresAt: "2026-10-22T12:00:00.000Z",
    isRevoked: false,
    priorityDeviceId: null,
    note: null,
    createdAt: "2026-10-22T10:00:00.000Z",
    ...overrides
  };
}

describe("share draft validation", () => {
  it("accepts a plain timed share", () => {
    expect(shareDraftIssues(draft())).toEqual([]);
    expect(canSubmitShareDraft(draft())).toBe(true);
  });

  it("refuses an empty recipient list before a round trip", () => {
    expect(shareDraftIssues(draft({ recipients: [] }))).toEqual([{ code: "no_recipients" }]);
  });

  it("refuses more recipients than the contract allows", () => {
    const recipients = Array.from({ length: MAX_LOCATION_SHARE_TARGETS + 1 }, (_unused, index) =>
      candidate(`22222222-0000-4000-8000-${String(index).padStart(12, "0")}`)
    );
    expect(shareDraftIssues(draft({ recipients }))).toEqual([
      { code: "too_many_recipients", params: { max: MAX_LOCATION_SHARE_TARGETS } }
    ]);
  });

  it("requires an integer duration inside the contract window for timed shares", () => {
    expect(shareDraftIssues(draft({ durationMinutes: Number.NaN }))).toEqual([
      { code: "duration_required" }
    ]);
    expect(shareDraftIssues(draft({ durationMinutes: 0 }))).toEqual([
      { code: "duration_out_of_range", params: { min: 1, max: MAX_LOCATION_SHARE_MINUTES } }
    ]);
    expect(shareDraftIssues(draft({ durationMinutes: MAX_LOCATION_SHARE_MINUTES + 1 }))).toEqual([
      { code: "duration_out_of_range", params: { min: 1, max: MAX_LOCATION_SHARE_MINUTES } }
    ]);
    expect(shareDraftIssues(draft({ durationMinutes: 90.5 }))).toEqual([
      { code: "duration_out_of_range", params: { min: 1, max: MAX_LOCATION_SHARE_MINUTES } }
    ]);
  });

  it("ignores the duration widget entirely in permanent mode", () => {
    // The slider keeps its last value when the user switches to permanent; sending it would be a
    // 400 (`shareSchema` rejects durationMinutes with mode=permanent), so validation ignores it.
    expect(shareDraftIssues(draft({ mode: "permanent", durationMinutes: 0 }))).toEqual([]);
    expect(shareDraftIssues(draft({ mode: "permanent", durationMinutes: Number.NaN }))).toEqual([]);
  });

  it("counts the note after trimming, like the server does", () => {
    const tooLong = "x".repeat(MAX_LOCATION_SHARE_NOTE_LENGTH + 1);
    expect(shareDraftIssues(draft({ note: tooLong }))).toEqual([
      { code: "note_too_long", params: { max: MAX_LOCATION_SHARE_NOTE_LENGTH } }
    ]);
    expect(
      shareDraftIssues(draft({ note: `${"x".repeat(MAX_LOCATION_SHARE_NOTE_LENGTH)}   ` }))
    ).toEqual([]);
  });

  it("reports every problem at once so the form does not play whack-a-mole", () => {
    expect(shareDraftIssues(draft({ recipients: [], durationMinutes: -1, note: "y".repeat(600) }))).toEqual(
      [
        { code: "no_recipients" },
        { code: "duration_out_of_range", params: { min: 1, max: MAX_LOCATION_SHARE_MINUTES } },
        { code: "note_too_long", params: { max: MAX_LOCATION_SHARE_NOTE_LENGTH } }
      ]
    );
  });
});

describe("share payload builders", () => {
  it("sends recipient ids in selection order and without duplicates", () => {
    const first = candidate("33333333-0000-4000-8000-000000000001");
    const second = candidate("33333333-0000-4000-8000-000000000002");
    const payload = buildLiveSharePayload(
      draft({ recipients: [first, second, first], durationMinutes: 120 })
    );
    expect(payload.targetUserIds).toEqual([first.id, second.id]);
    expect(payload.durationMinutes).toBe(120);
    expect(payload.mode).toBe("timed");
  });

  it("omits durationMinutes in permanent mode and an empty note in both modes", () => {
    const permanent = buildLiveSharePayload(draft({ mode: "permanent", durationMinutes: 60 }));
    expect(permanent).not.toHaveProperty("durationMinutes");
    expect(permanent).not.toHaveProperty("note");
    // `note: ""` would be stored as an empty string and render as a blank line for the recipient.
    expect(buildLiveSharePayload(draft({ note: "   " }))).not.toHaveProperty("note");
  });

  it("trims the note and truncates a fractional duration", () => {
    const payload = buildLiveSharePayload(draft({ note: "  مراقب خودت باش  ", durationMinutes: 45.9 }));
    expect(payload.note).toBe("مراقب خودت باش");
    expect(payload.durationMinutes).toBe(45);
  });

  it("builds a history grant with the window and no mode or duration", () => {
    const payload = buildHistorySharePayload(draft({ mode: "timed", durationMinutes: 60 }), {
      from: "2026-10-21T00:00:00.000Z",
      to: "2026-10-22T00:00:00.000Z"
    });
    expect(payload).toEqual({
      targetUserIds: [expect.any(String)],
      from: "2026-10-21T00:00:00.000Z",
      to: "2026-10-22T00:00:00.000Z"
    });
  });

  it("deduplicates the selection list itself", () => {
    const only = candidate("44444444-0000-4000-8000-000000000004");
    expect(uniqueRecipientIds([only, only])).toEqual([only.id]);
    expect(addRecipient([only], only)).toEqual([only]);
    expect(addRecipient([], only)).toEqual([only]);
    expect(removeRecipient([only], only.id)).toEqual([]);
  });
});

describe("priority device conflict", () => {
  it("reads the device ids out of the 409 payload", () => {
    const error = new ApiError(409, "PRIORITY_DEVICE_REQUIRED", "another device is broadcasting", [
      { code: "priority_device_required", deviceIds: ["device-a", "device-b"] }
    ]);
    expect(priorityDeviceIds(error)).toEqual(["device-a", "device-b"]);
  });

  it("returns nothing for any other failure, so the chooser is never shown empty", () => {
    expect(priorityDeviceIds(new ApiError(409, "SHARE_RANGE_TOO_LARGE", "too big", []))).toEqual([]);
    expect(priorityDeviceIds(new Error("boom"))).toEqual([]);
    expect(priorityDeviceIds(undefined)).toEqual([]);
    expect(
      priorityDeviceIds(new ApiError(409, "PRIORITY_DEVICE_REQUIRED", "malformed", [{ deviceIds: "nope" }]))
    ).toEqual([]);
    expect(
      priorityDeviceIds(new ApiError(409, "PRIORITY_DEVICE_REQUIRED", "no issues", []))
    ).toEqual([]);
  });
});

describe("share list rows", () => {
  const now = new Date("2026-10-22T10:00:00.000Z");

  it("marks a share without an expiry as permanent and keeps the remaining time floored", () => {
    expect(describeLiveShareRow(liveShare({ expiresAt: null }), now)).toMatchObject({
      kind: "permanent",
      remainingMinutes: null
    });
    expect(
      describeLiveShareRow(liveShare({ expiresAt: "2026-10-22T10:02:59.000Z" }), now).remainingMinutes
    ).toBe(2);
    expect(
      describeLiveShareRow(liveShare({ expiresAt: "2026-10-22T09:59:59.000Z" }), now)
    ).toMatchObject({ kind: "expired", remainingMinutes: 0 });
  });

  it("carries the note and priority device through untouched", () => {
    const row = describeLiveShareRow(
      liveShare({ note: "برای امروز", priorityDeviceId: "device-a" }),
      now
    );
    expect(row.note).toBe("برای امروز");
    expect(row.priorityDeviceId).toBe("device-a");
  });

  it("labels a received row the same way as an owned one", () => {
    const received: ReceivedLocationShare = {
      ...liveShare({ expiresAt: null }),
      owner: { id: "bbbbbbbb-0000-4000-8000-000000000009", username: "hamrah_one", lastLocation: null }
    };
    expect(describeLiveShareRow(received, now).kind).toBe("permanent");
  });

  it("treats a history grant as open until its window closes", () => {
    const grant: ReceivedLocationHistoryShare = {
      id: "cccccccc-0000-4000-8000-000000000001",
      ownerId: "cccccccc-0000-4000-8000-000000000002",
      targetUserId: "cccccccc-0000-4000-8000-000000000003",
      from: "2026-10-20T00:00:00.000Z",
      to: "2026-10-22T11:30:00.000Z",
      maxPoints: 5000,
      createdAt: "2026-10-20T00:00:00.000Z",
      owner: { id: "cccccccc-0000-4000-8000-000000000002", username: "hamrah_two" }
    };
    expect(describeHistoryShareRow(grant, now)).toEqual({
      id: grant.id,
      isOpen: true,
      minutesUntilClose: 90,
      from: grant.from,
      to: grant.to,
      maxPoints: 5000
    });
    expect(describeHistoryShareRow({ ...grant, to: "2026-10-22T09:00:00.000Z" }, now)).toMatchObject({
      isOpen: false,
      minutesUntilClose: 0
    });
  });

  it("names rows from what the session already knows and shortens the rest", () => {
    const id = "dddddddd-0000-4000-8000-000000000004";
    const names = buildShareNameMap([{ id, username: "rescue_dog" }]);
    expect(shareRowLabel(id, names)).toBe("rescue_dog");
    expect(shareRowLabel(id, buildShareNameMap([]))).toBe("dddddddd…");
  });
});

describe("picker search helpers", () => {
  it("does not ask the server for a term it would reject", () => {
    expect(shouldSearch("")).toBe(false);
    expect(shouldSearch("   ")).toBe(false);
    expect(shouldSearch("a")).toBe(false);
    expect(shouldSearch("ab")).toBe(true);
    expect(shouldSearch("  ham ")).toBe(true);
  });

  it("drops a stale response when a newer one is in flight", () => {
    expect(isLatestSearch(3, 3)).toBe(true);
    expect(isLatestSearch(2, 3)).toBe(false);
  });

  it("tells an aborted request apart from a failed one", () => {
    // Without this the picker flashes an error for every keystroke that superseded a request.
    expect(isAbortError(new DOMException("The user aborted a request.", "AbortError"))).toBe(true);
    expect(isAbortError(Object.assign(new Error("signal is aborted without reason"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError(new Error("network is unreachable"))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  it("recognises the one conflict the form can resolve itself", () => {
    expect(needsPriorityDevice(new ApiError(409, "PRIORITY_DEVICE_REQUIRED", "choose", []))).toBe(true);
    expect(needsPriorityDevice(new ApiError(409, "SHARE_RANGE_TOO_LARGE", "nope", []))).toBe(false);
    expect(needsPriorityDevice(new Error("boom"))).toBe(false);
  });

  it("breaks a duration into parts for the label", () => {
    expect(splitDuration(60)).toEqual({ days: 0, hours: 1, minutes: 0 });
    expect(splitDuration(1505)).toEqual({ days: 1, hours: 1, minutes: 5 });
    expect(splitDuration(-10)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
