import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LocationShare, UserDevice } from "@shared/index";
import { formatDuration } from "@/sharing/share-form";
import {
  describeDeviceRows,
  deviceChoices,
  deviceLabelFor,
  planReprioritize,
  planReprioritizeAll,
  REPRIORITIZE_REFUSAL_COPY,
  summarizeReprioritize
} from "./priority-device";

/**
 * The settings screen writes through the sharing endpoint, so these cases are the difference between
 * "changed the device" and "silently shared for six more hours".
 */

const NOW = new Date("2026-10-21T12:00:00.000Z");
const PHONE = "11111111-1111-4111-8111-111111111111";
const LAPTOP = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";

function share(overrides: Partial<LocationShare> = {}): LocationShare {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    ownerId: "55555555-5555-4555-8555-555555555555",
    targetUserId: TARGET,
    mode: "timed",
    // 89.5 minutes of slack: the floor has to bite, or a fixture that divides exactly would hide the
    // one arithmetic decision this module makes.
    expiresAt: new Date(NOW.getTime() + 89.5 * 60_000).toISOString(),
    isRevoked: false,
    priorityDeviceId: PHONE,
    note: "تا شب",
    createdAt: "2026-10-21T10:00:00.000Z",
    ...overrides
  };
}

function device(overrides: Partial<UserDevice> = {}): UserDevice {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    deviceId: PHONE,
    deviceName: "Chrome on Android",
    ip: "10.0.0.7",
    isCurrentDevice: true,
    lastActiveAt: "2026-10-21T11:55:00.000Z",
    isOnline: true,
    ...overrides
  };
}

describe("planReprioritize", () => {
  it("re-points a timed share with the minutes that are still left, floored", () => {
    const plan = planReprioritize(share(), LAPTOP, NOW);
    expect(plan).toEqual({
      kind: "ready",
      shareId: expect.any(String),
      body: { targetUserIds: [TARGET], mode: "timed", durationMinutes: 89, priorityDeviceId: LAPTOP }
    });
    // 90 minutes minus one second of staleness floors to 89, and the server only extends an expiry when
    // the new instant is strictly later — so this cannot lengthen what the recipient sees.
    expect((plan as { body: { durationMinutes: number } }).body.durationMinutes).toBeLessThan(90);
  });

  it("rounding up would have bought the recipient an extra minute", () => {
    // A 89.9-minute row must not become 90, and an exactly-whole row must not pass the boundary either:
    // the server only patches an expiry that is strictly later, so `<= remaining` is the safe side.
    const almost = share({ expiresAt: new Date(NOW.getTime() + 89.9 * 60_000).toISOString() });
    expect((planReprioritize(almost, LAPTOP, NOW) as { body: { durationMinutes: number } }).body.durationMinutes).toBe(89);
    const exact = share({ expiresAt: new Date(NOW.getTime() + 90 * 60_000).toISOString() });
    expect((planReprioritize(exact, LAPTOP, NOW) as { body: { durationMinutes: number } }).body.durationMinutes).toBe(90);
  });

  it("sends no duration at all for a permanent share", () => {
    const plan = planReprioritize(share({ mode: "permanent", expiresAt: null }), LAPTOP, NOW);
    expect(plan.kind).toBe("ready");
    expect((plan as { body: Record<string, unknown> }).body).not.toHaveProperty("durationMinutes");
  });

  it("never sends a note, because omitting it is what keeps the stored one", () => {
    const plan = planReprioritize(share(), LAPTOP, NOW) as { body: Record<string, unknown> };
    expect(plan.body).not.toHaveProperty("note");
  });

  it("refuses a row that has expired rather than recreating the share", () => {
    const plan = planReprioritize(share({ expiresAt: new Date(NOW.getTime() - 60_000).toISOString() }), LAPTOP, NOW);
    expect(plan).toMatchObject({ kind: "refused", reason: "expired" });
    expect(REPRIORITIZE_REFUSAL_COPY.expired).toContain("اشتراک تازه");
  });

  it("refuses the last minute the same way the share lists describe it", () => {
    const plan = planReprioritize(share({ expiresAt: new Date(NOW.getTime() + 30_000).toISOString() }), LAPTOP, NOW);
    expect(plan).toMatchObject({ kind: "refused", reason: "expired" });
    expect(REPRIORITIZE_REFUSAL_COPY.expired).toContain("کمتر از یک دقیقه");
  });

  it("refuses to post a change that is not a change", () => {
    expect(planReprioritize(share(), PHONE, NOW)).toMatchObject({ kind: "refused", reason: "unchanged" });
  });

  it("treats a share with no device chosen as one that can be pinned", () => {
    // `priorityDeviceId: null` is the auto-pin-not-yet-needed state; saying "unchanged" there would
    // strand the row with no device while the account has several.
    expect(planReprioritize(share({ priorityDeviceId: null }), PHONE, NOW).kind).toBe("ready");
  });

  it("words every refusal with what the user can do next", () => {
    for (const [reason, text] of Object.entries(REPRIORITIZE_REFUSAL_COPY)) {
      expect(text.length).toBeGreaterThan(12);
      expect(text).not.toBe(reason);
    }
  });
});

describe("planReprioritizeAll", () => {
  it("splits the sweep into sends and named skips", () => {
    const shares = [
      share(),
      share({ id: "77777777-7777-4777-8777-777777777777", priorityDeviceId: LAPTOP }),
      share({ id: "88888888-8888-4888-8888-888888888888", expiresAt: new Date(NOW.getTime() - 1000).toISOString() })
    ];
    const sweep = planReprioritizeAll(shares, LAPTOP, NOW);
    expect(sweep.ready).toHaveLength(1);
    expect(sweep.refused.map((entry) => entry.reason)).toEqual(["unchanged", "expired"]);
  });

  it("reports all-applied only when nothing failed and nothing was skipped", () => {
    const sweep = planReprioritizeAll([share(), share({ mode: "permanent", expiresAt: null })], LAPTOP, NOW);
    expect(summarizeReprioritize(sweep, [{ ok: true }, { ok: true }])).toEqual({
      applied: 2,
      failed: 0,
      skipped: 0,
      all: true
    });
    expect(summarizeReprioritize(sweep, [{ ok: true }, { ok: false }]).all).toBe(false);
    // A skip is not a failure: the counts stay separate so the copy can say "۱ مورد لازم نبود".
    const withSkip = planReprioritizeAll([share(), share({ priorityDeviceId: LAPTOP })], LAPTOP, NOW);
    expect(summarizeReprioritize(withSkip, [{ ok: true }])).toEqual({ applied: 1, failed: 0, skipped: 1, all: true });
  });
});

describe("the device table", () => {
  it("keeps an unnamed device sayable and counts what pins it", () => {
    const rows = describeDeviceRows(
      [device({ deviceName: null }), device({ deviceId: LAPTOP, isCurrentDevice: false, isOnline: false })],
      [share(), share({ id: "99999999-9999-4999-8999-999999999999" })],
      NOW
    );
    expect(rows[0]).toMatchObject({ label: "دستگاه بدون نام", hasName: false, pinnedShareCount: 2, minutesSinceActive: 5 });
    expect(rows[1]).toMatchObject({ label: "Chrome on Android", pinnedShareCount: 0, isOnline: false, isCurrent: false, ip: "10.0.0.7" });
  });

  it("never reports a negative age for a session whose clock ran ahead", () => {
    const rows = describeDeviceRows([device({ lastActiveAt: new Date(NOW.getTime() + 600_000).toISOString() })], [], NOW);
    expect(rows[0]!.minutesSinceActive).toBe(0);
    // Human units, as everywhere else in the app.
    expect(formatDuration(rows[0]!.minutesSinceActive)).toBe("۰ دقیقه");
  });

  it("offers offline devices as disabled rather than hiding them, and names the current one", () => {
    const choices = deviceChoices(
      [device(), device({ deviceId: LAPTOP, deviceName: "Safari on macOS", isCurrentDevice: false, isOnline: false })],
      PHONE
    );
    expect(choices.map((choice) => choice.disabled)).toEqual([false, true]);
    expect(choices[1]!.label).toContain("آفلاین");
    expect(choices[0]!.label).toContain("همین دستگاه");
  });

  it("keeps a pinned device that left the list visible but unselectable", () => {
    const gone = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const choices = deviceChoices([device()], gone);
    expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({ value: gone, disabled: true, isGone: true });
    expect(choices[0]!.label).toContain("دیگر در فهرست نیست");
    // The rule the tracker insists on: a device missing from this snapshot is *not* pre-refused. The
    // server owns `unknown_priority_device`, and the panel surfaces that answer instead.
    expect(planReprioritize(share({ priorityDeviceId: gone }), LAPTOP, NOW).kind).toBe("ready");
  });
});

describe("deviceLabelFor", () => {
  it("names all three states a stored pin can be in", () => {
    const rows = describeDeviceRows(
      [device(), device({ deviceId: LAPTOP, deviceName: "Safari on macOS", isOnline: false })],
      [],
      NOW
    );
    expect(deviceLabelFor(rows, PHONE)).toBe("Chrome on Android");
    expect(deviceLabelFor(rows, LAPTOP)).toBe("Safari on macOS · آفلاین");
    expect(deviceLabelFor(rows, null)).toBe("هیچ دستگاهی انتخاب نشده");
    expect(deviceLabelFor(rows, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toContain("دیگر در فهرست نیست");
  });
});

/**
 * The panel and the view are not mounted in tests (repo convention), so the two rules that only exist as
 * template wiring are pinned against their source.
 */
describe("device pin management lives beside the owner share, not in the sessions screen", () => {
  const panel = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");
  const lists = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");
  const view = readFileSync(new URL("../views/_user/UserDevicesView.vue", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");

  it("keeps pin writes in the shared planner and per-user control", () => {
    expect(lists).not.toContain("targetUserIds");
    expect(lists).toContain("deviceSettings.assign(row.id, choice)");
    expect(lists).toContain("deviceSettings.choicesFor(row.share)");
    expect(lists).toContain("chosen !== row.share.priorityDeviceId");
    expect(panel).not.toContain("api.assign(");
    expect(view).toContain("void settings.refresh()");
  });

  it("keeps the same server rejection table for the dialog and pin controls", () => {
    expect(panel).not.toContain("unknown_priority_device");
    expect(lists).not.toContain("unknown_priority_device");
    expect(dialog).toContain("rejectionText(rejection)");
    expect(lists).toContain('aria-live="polite"');
  });
});
