import { describe, expect, it } from "vitest";
import { createShareAttemptFence, selectedPointShare } from "./selected-point-share";

describe("share selected destination", () => {
  it("shares only valid destination coordinates in a portable map URL", () => {
    const share = selectedPointShare({ lat: 35.6892, lon: 51.389 });
    expect(share?.url).toBe("https://www.openstreetmap.org/?mlat=35.68920&mlon=51.38900#map=16/35.68920/51.38900");
    expect(JSON.stringify(share)).not.toContain("origin");
  });
  it("refuses missing, invalid and nonfinite points", () => {
    for (const point of [null, { lat: 91, lon: 0 }, { lat: 0, lon: -181 }, { lat: NaN, lon: 1 }])
      expect(selectedPointShare(point)).toBeNull();
  });

  it("admits one send at a time, then allows another after completion", () => {
    const fence = createShareAttemptFence();
    const first = fence.begin()!;
    expect(fence.busy).toBe(true);
    expect(fence.begin()).toBeNull(); // A second tap must not launch a competing share/clipboard call.
    expect(fence.isCurrent(first)).toBe(true);
    fence.finish(first);
    expect(fence.busy).toBe(false);
    expect(fence.isCurrent(first)).toBe(false);
    const second = fence.begin()!;
    expect(second).not.toBe(first);
    expect(fence.isCurrent(second)).toBe(true);
  });

  it("discards a late share result after destination/sheet/step changes without unlocking a newer send", async () => {
    const fence = createShareAttemptFence();
    const old = fence.begin()!;
    let resolveOld!: () => void;
    const pending = new Promise<void>(resolve => { resolveOld = resolve; });
    fence.reset();
    const current = fence.begin()!;
    resolveOld();
    await pending;
    expect(fence.isCurrent(old)).toBe(false);
    fence.finish(old); // A stale finally must not re-enable the Send button.
    expect(fence.busy).toBe(true);
    expect(fence.begin()).toBeNull();
    expect(fence.isCurrent(current)).toBe(true);
    fence.finish(current);
    expect(fence.busy).toBe(false);
  });
});
