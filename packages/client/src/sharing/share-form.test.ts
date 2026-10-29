import { readFileSync } from "node:fs";
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
  DURATION_PRESET_MINUTES,
  formatDuration,
  buildHistorySharePayload,
  buildLiveSharePayload,
  buildShareNameMap,
  canSubmitShareDraft,
  choiceDeviceOptionLabel,
  describeHistoryShareRow,
  describeLiveShareRow,
  historyPresetWindow,
  isHistoryRangeTooLarge,
  MINUTES_PER_HOUR,
  isAbortError,
  isLatestSearch,
  nameShareRejections,
  needsPriorityDevice,
  recipientLabels,
  shareRejections,
  priorityDeviceIds,
  removeRecipient,
  shareDraftIssues,
  shareRowLabel,
  shouldSearch,
  splitDuration,
  uniqueRecipientIds,
  type DurationUnits,
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

  it("prefers the name the server read over what this session guessed", () => {
    // The order is the whole rule of P2-Q1: the server joined the target and knows; a name picked up
    // from the picker is a guess about the same person and must not win when both exist.
    const id = "dddddddd-0000-4000-8000-000000000004";
    const names = buildShareNameMap([{ id, username: "rescue_dog" }]);
    expect(shareRowLabel(id, names, "satellite")).toBe("satellite");
    expect(shareRowLabel(id, names, null)).toBe("rescue_dog");
    expect(shareRowLabel(id, names, "   ")).toBe("rescue_dog");
    expect(shareRowLabel(id, buildShareNameMap([]), "")).toBe("dddddddd…");
  });

  it("labels owned rows in both lists from the server's field", () => {
    const source = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");
    // Two lists, one rule — a fixed live row and a still-guessed history row is the kind of half-fix
    // that leaves the same id truncated a few pixels below the one that was repaired.
    expect(source.match(/shareRowLabel\(share\.targetUserId, names\.value, share\.targetUsername\)/g)).toHaveLength(2);
    expect(source).toContain("ref<OwnedLocationShare[]>");
    expect(source).toContain("ref<OwnedLocationHistoryShare[]>");
  });
});

describe("duration wording", () => {
  // Units are injected, so these assertions read as rules rather than as Persian text.
  const en: DurationUnits = { minute: "min", hour: "h", day: "d", week: "wk", separator: " " };

  it("uses Persian digits for default duration labels and ASCII for English units", () => {
    expect(formatDuration(2255)).toBe("۱ روز و ۱۳ ساعت و ۳۵ دقیقه");
    expect(formatDuration(0)).toBe("۰ دقیقه");
    expect(formatDuration(2255, en)).toBe("1 d 13 h 35 min");
  });

  it("says minutes only below an hour", () => {
    expect(formatDuration(1)).toBe("۱ دقیقه");
    expect(formatDuration(15)).toBe("۱۵ دقیقه");
    expect(formatDuration(59)).toBe("۵۹ دقیقه");
  });

  it("switches to hours at an hour and keeps only a real remainder", () => {
    expect(formatDuration(60)).toBe("۱ ساعت");
    expect(formatDuration(360)).toBe("۶ ساعت");
    expect(formatDuration(390)).toBe("۶ ساعت و ۳۰ دقیقه");
    expect(formatDuration(12 * 60)).toBe("۱۲ ساعت");
  });

  it("switches to days at a day and names the leftover hours and minutes", () => {
    expect(formatDuration(1440)).toBe("۱ روز");
    expect(formatDuration(3 * 1440)).toBe("۳ روز");
    expect(formatDuration(1505)).toBe("۱ روز و ۱ ساعت و ۵ دقیقه");
    expect(formatDuration(1445)).toBe("۱ روز و ۵ دقیقه");
    expect(formatDuration(MAX_LOCATION_SHARE_MINUTES)).toBe("۳۰ روز");
  });

  it("prefers weeks for whole weeks", () => {
    expect(formatDuration(7 * 1440)).toBe("۱ هفته");
    expect(formatDuration(14 * 1440)).toBe("۲ هفته");
    expect(formatDuration(10081)).toBe("۷ روز و ۱ دقیقه");
  });

  it("clamps nonsense instead of printing it", () => {
    expect(formatDuration(0)).toBe("۰ دقیقه");
    expect(formatDuration(-10)).toBe("۰ دقیقه");
    expect(formatDuration(Number.NaN)).toBe("۰ دقیقه");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("۰ دقیقه");
    expect(formatDuration(90.7)).toBe("۱ ساعت و ۳۰ دقیقه");
    expect(splitDuration(Number.NaN)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it("takes its units from the caller, because copy belongs to the components", () => {
    expect(formatDuration(1440, en)).toBe("1 d");
    expect(formatDuration(390, en)).toBe("6 h 30 min");
    expect(formatDuration(10080, en)).toBe("1 wk");
    expect(formatDuration(390, { ...en, numberLocale: "fa-IR" })).toBe("۶ h ۳۰ min");
  });

  it("labels every preset chip by the rule rather than as a raw minute count", () => {
    // The reported bug: a chip for 1440 minutes read "1440 دقیقه".
    expect(DURATION_PRESET_MINUTES[0]).toBe(15);
    expect(DURATION_PRESET_MINUTES).toContain(30);
    expect(DURATION_PRESET_MINUTES).toEqual([...DURATION_PRESET_MINUTES].sort((a, b) => a - b));
    expect(new Set(DURATION_PRESET_MINUTES).size).toBe(DURATION_PRESET_MINUTES.length);
    expect(DURATION_PRESET_MINUTES.every((minutes) => minutes >= 1 && minutes <= MAX_LOCATION_SHARE_MINUTES)).toBe(true);

    for (const minutes of DURATION_PRESET_MINUTES) {
      const label = formatDuration(minutes);
      if (minutes < MINUTES_PER_HOUR) {
        // Below an hour a minute count is the clearest wording there is.
        expect(label).toBe(`${minutes.toLocaleString("fa-IR")} دقیقه`);
        continue;
      }
      expect(label).not.toBe(`${minutes.toLocaleString("fa-IR")} دقیقه`);
      expect(label).toMatch(/ساعت|روز|هفته/);
    }
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

describe("server refusals", () => {
  const result = (id: string, username: string): UserSearchResult => ({
    id,
    username,
    category: null,
    distance: null,
    avgRating: null,
    isOnline: false
  });
  const refusal = (code: string, path: unknown) =>
    new ApiError(400, "VALIDATION_ERROR", "Request body validation failed.", [{ code, message: "server text", path }]);

  it("reads the recipient index out of both path shapes the field has had", () => {
    expect(shareRejections(refusal("unavailable_target", ["targetUserIds", 2]))).toEqual([
      { code: "unavailable_target", recipientIndex: 2 }
    ]);
    expect(shareRejections(refusal("unavailable_target", 3))).toEqual([
      { code: "unavailable_target", recipientIndex: 3 }
    ]);
    expect(shareRejections(refusal("self_target", [1]))).toEqual([{ code: "self_target", recipientIndex: 1 }]);
    // An issue about a different field names no recipient, and must not be guessed at.
    expect(shareRejections(refusal("unknown_priority_device", ["priorityDeviceId"]))).toEqual([
      { code: "unknown_priority_device", recipientIndex: null }
    ]);
  });

  it("keeps only issues that actually carry a code, whatever else the envelope holds", () => {
    const error = new ApiError(400, "VALIDATION_ERROR", "Request body validation failed.", [
      null,
      3,
      {},
      { code: 7, path: [0] },
      { code: "unknown_target", path: [0] }
    ]);
    expect(shareRejections(error)).toEqual([{ code: "unknown_target", recipientIndex: 0 }]);
  });

  it("says nothing for an error that is not a structured refusal", () => {
    expect(shareRejections(new Error("network"))).toEqual([]);
    expect(shareRejections(undefined)).toEqual([]);
    expect(shareRejections(new ApiError(429, "RATE_LIMITED", "slow down"))).toEqual([]);
  });

  it("names the person the server refused, and only when the index still resolves", () => {
    const labels = ["sara", "hamid", "nazanin"];
    expect(nameShareRejections(shareRejections(refusal("unknown_target", ["targetUserIds", 1])), labels)).toEqual([
      { code: "unknown_target", recipientIndex: 1, label: "hamid" }
    ]);
    // A list the user edited between the response and the render must not point at the wrong person.
    expect(nameShareRejections(shareRejections(refusal("unknown_target", ["targetUserIds", 9])), labels)).toEqual([
      { code: "unknown_target", recipientIndex: 9, label: null }
    ]);
  });

  it("labels recipients in the order the payload sends their ids", () => {
    const first = "5f0a1c6e-0000-4000-8000-000000000001";
    const second = "5f0a1c6e-0000-4000-8000-000000000002";
    const recipients = [result(first, "sara"), result(second, "hamid"), result(first, "sara-again")];
    expect(recipientLabels(recipients)).toEqual(["sara", "hamid"]);
    // The two orders have to agree, or an index from the server points at the wrong name.
    expect(recipientLabels(recipients).length).toBe(uniqueRecipientIds(recipients).length);
  });

  it("phrases the duration ceiling in the same units as the chips", () => {
    // The dialog is not mounted in tests (repo convention), so this pins its source instead: the
    // ceiling must reach for the shared formatter rather than interpolating a raw minute count again,
    // which is the rule the chips, the slider label, and the share lists already follow.
    const source = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");
    expect(source).toContain("durationWords(maxMinutes)");
    expect(source).not.toContain("${maxMinutes}");
    expect(source).toContain("rejectionText(rejection)");
    expect(source).toContain("createLocationHistoryShare");
    expect(source).toContain("buildHistorySharePayload");
    expect(source).toContain("choiceDeviceOptionLabel");
  });

  it("validates history grants, builds maxPoints, and names priority devices cleanly", () => {
    const window = historyPresetWindow(6, Date.parse("2026-10-23T12:00:00.000Z"));
    expect(window).toEqual({
      from: "2026-10-23T06:00:00.000Z",
      to: "2026-10-23T12:00:00.000Z"
    });

    expect(
      shareDraftIssues(
        draft({
          mode: "history",
          historyFrom: window.from,
          historyTo: window.to,
          historyMaxPoints: 500,
          note: "x".repeat(MAX_LOCATION_SHARE_NOTE_LENGTH + 50)
        })
      )
    ).toEqual([]);

    expect(
      shareDraftIssues(
        draft({
          mode: "history",
          historyFrom: window.to,
          historyTo: window.from,
          historyMaxPoints: 0
        })
      )
    ).toEqual([
      { code: "history_end_not_after_start" },
      { code: "history_points_out_of_range", params: { min: 1, max: 10_000 } }
    ]);

    expect(
      buildHistorySharePayload(draft({ mode: "history" }), {
        from: window.from,
        to: window.to,
        maxPoints: 750
      })
    ).toEqual({
      targetUserIds: ["11111111-1111-4111-8111-111111111111"],
      from: window.from,
      to: window.to,
      maxPoints: 750
    });

    expect(isHistoryRangeTooLarge(new ApiError(400, "SHARE_RANGE_TOO_LARGE", "too large"))).toBe(true);
    expect(isHistoryRangeTooLarge(new ApiError(409, "PRIORITY_DEVICE_REQUIRED", "choose"))).toBe(false);

    expect(
      choiceDeviceOptionLabel(
        "11111111-1111-4111-8111-111111111111",
        [
          {
            id: "11111111-1111-4111-8111-111111111111",
            deviceId: "11111111-1111-4111-8111-111111111111",
            deviceName: "Chrome on Android",
            ip: "10.0.0.1",
            isCurrentDevice: true,
            lastActiveAt: "2026-10-23T11:55:00.000Z",
            isOnline: true
          }
        ],
        0
      )
    ).toBe("Chrome on Android (همین دستگاه)");

    const listsSource = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");
    expect(listsSource).toContain("receivedHistoryRows");
    expect(listsSource).toContain('/_user/map');
  });
});
