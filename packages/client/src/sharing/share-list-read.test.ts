import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readShareListWithinDeadline, SHARE_LIST_READ_DEADLINE_MS } from "./share-list-read";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("independent, bounded share-list reads", () => {
  it("retains one verified list when the other read ignores abort and times out", async () => {
    const parent = new AbortController();
    let late!: (value: string) => void;
    let stalledSignal!: AbortSignal;
    const live = readShareListWithinDeadline(async () => "verified live", parent.signal);
    const history = readShareListWithinDeadline((signal) => {
      stalledSignal = signal;
      return new Promise<string>((resolve) => { late = resolve; });
    }, parent.signal);
    const results = Promise.allSettled([live, history]);
    await vi.advanceTimersByTimeAsync(SHARE_LIST_READ_DEADLINE_MS);
    expect(await results).toEqual([
      { status: "fulfilled", value: "verified live" },
      { status: "rejected", reason: expect.any(Error) }
    ]);
    expect(stalledSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    late("stale history");
    await Promise.resolve();
    expect(await results).toMatchObject([{ status: "fulfilled", value: "verified live" }, { status: "rejected" }]);
  });

  it("also retains a verified history list when the live list stalls", async () => {
    const live = readShareListWithinDeadline(() => new Promise<string>(() => {}));
    const history = readShareListWithinDeadline(async () => "verified history");
    const results = Promise.allSettled([live, history]);
    await vi.advanceTimersByTimeAsync(SHARE_LIST_READ_DEADLINE_MS);
    expect(await results).toMatchObject([
      { status: "rejected" },
      { status: "fulfilled", value: "verified history" }
    ]);
  });

  it("aborts both reads immediately on a superseding refresh or session loss", async () => {
    const parent = new AbortController();
    const signals: AbortSignal[] = [];
    const pending = Promise.allSettled([0, 1].map(() => readShareListWithinDeadline((signal) => {
      signals.push(signal);
      return new Promise<string>(() => {}); // Model an HTTP adapter that ignores abort.
    }, parent.signal)));
    parent.abort();
    expect((await pending).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await expect(readShareListWithinDeadline(async () => "never started", parent.signal)).rejects.toThrow("ABORTED");
  });
});
