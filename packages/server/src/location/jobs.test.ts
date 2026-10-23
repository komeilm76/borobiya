import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  HISTORY_PRUNE_BATCH_ROWS,
  HISTORY_PRUNE_MAX_BATCHES,
  JOB_TICK_INTERVAL_MS,
  runLocationJobs,
  startLocationJobs,
  type LocationJobLogger
} from "./jobs";
import type { LocationShareStore, RetiredLocationShare } from "../db/location-share-store";
import type { LocationHistoryStore } from "../db/location-history-store";
import { SHARE_ENDED_EVENT, userRoom } from "../realtime/socket";

const NOW = new Date("2026-10-21T09:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function retiredShares(count: number): RetiredLocationShare[] {
  return Array.from({ length: count }, () => ({
    id: randomUUID(),
    ownerId: randomUUID(),
    targetUserId: randomUUID()
  }));
}

function makeEmitter() {
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  return {
    emitted,
    io: {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        }
      })
    }
  };
}

function makeLogger(): LocationJobLogger & { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } {
  return { info: vi.fn(), warn: vi.fn() } as unknown as LocationJobLogger & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

function makeStores(overrides: {
  expireOverdueShares?: LocationShareStore["expireOverdueShares"];
  repairStaleSharePins?: LocationShareStore["repairStaleSharePins"];
  pruneOlderThan?: LocationHistoryStore["pruneOlderThan"];
} = {}) {
  return {
    shareStore: {
      expireOverdueShares: overrides.expireOverdueShares ?? (async () => []),
      repairStaleSharePins: overrides.repairStaleSharePins ?? (async () => 0)
    } as unknown as LocationShareStore,
    historyStore: {
      pruneOlderThan: overrides.pruneOlderThan ?? (async () => 0)
    } as unknown as LocationHistoryStore
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runLocationJobs", () => {
  it("expires overdue shares, emits share-ended per recipient, and prunes history older than the retention window", async () => {
    const expired = retiredShares(7);
    const expireOverdueShares = vi.fn<LocationShareStore["expireOverdueShares"]>(async () => expired);
    const repairStaleSharePins = vi.fn<LocationShareStore["repairStaleSharePins"]>(async () => 2);
    const pruneOlderThan = vi.fn<LocationHistoryStore["pruneOlderThan"]>(async () => 120);
    const logger = makeLogger();
    const { io, emitted } = makeEmitter();

    const outcome = await runLocationJobs({
      ...makeStores({ expireOverdueShares, repairStaleSharePins, pruneOlderThan }),
      now: () => NOW,
      retentionDays: 90,
      io,
      logger
    });

    expect(expireOverdueShares).toHaveBeenCalledWith({ now: NOW });
    expect(repairStaleSharePins).toHaveBeenCalledWith({ now: NOW });
    expect(pruneOlderThan).toHaveBeenCalledWith({
      olderThan: new Date(NOW.getTime() - 90 * DAY_MS),
      limit: HISTORY_PRUNE_BATCH_ROWS
    });
    expect(outcome).toEqual({
      expiredShares: 7,
      repairedPins: 2,
      prunedHistoryRows: 120,
      prunedBatches: 1,
      failures: []
    });
    expect(emitted).toEqual(
      expired.map((share) => ({
        room: userRoom(share.targetUserId),
        event: SHARE_ENDED_EVENT,
        payload: { shareId: share.id, userId: share.ownerId, reason: "expired" }
      }))
    );
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs nothing when there is nothing to expire or prune", async () => {
    const logger = makeLogger();

    const outcome = await runLocationJobs({
      ...makeStores(),
      now: () => NOW,
      retentionDays: 90,
      logger
    });

    expect(outcome).toEqual({
      expiredShares: 0,
      repairedPins: 0,
      prunedHistoryRows: 0,
      prunedBatches: 1,
      failures: []
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("keeps the daily prune on its own schedule when only the share sweep fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const expireOverdueShares = vi.fn<LocationShareStore["expireOverdueShares"]>(async () => {
      throw new Error("column location_shares.priority_device_id does not exist");
    });
    const pruneOlderThan = vi.fn<LocationHistoryStore["pruneOlderThan"]>(async () => 0);
    const { shareStore, historyStore } = makeStores({ expireOverdueShares, pruneOlderThan });

    const jobs = startLocationJobs({ shareStore, historyStore, retentionDays: 90 });
    await jobs.tick({ runAll: true });
    expect(pruneOlderThan).toHaveBeenCalledTimes(1);

    // A sweep that fails forever must retry forever, but it must not re-arm the prune's marker too:
    // sharing one schedule meant a daily batch delete every 15 seconds for as long as the sweep broke.
    await vi.advanceTimersByTimeAsync(5 * JOB_TICK_INTERVAL_MS);
    expect(expireOverdueShares.mock.calls.length).toBeGreaterThan(1);
    expect(pruneOlderThan).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DAY_MS + JOB_TICK_INTERVAL_MS);
    expect(pruneOlderThan.mock.calls.length).toBe(2);
    jobs.stop();
  });

  it("still reports and emits the shares it expired when the pin repair fails", async () => {
    const expired = retiredShares(4);
    const expireOverdueShares = vi.fn<LocationShareStore["expireOverdueShares"]>(async () => expired);
    const repairStaleSharePins = vi.fn<LocationShareStore["repairStaleSharePins"]>(async () => {
      throw new Error("device list unavailable");
    });
    const logger = makeLogger();
    const { io, emitted } = makeEmitter();

    const outcome = await runLocationJobs({
      ...makeStores({ expireOverdueShares, repairStaleSharePins }),
      now: () => NOW,
      retentionDays: 90,
      io,
      logger
    });

    // The expiry statement already committed, so receivers are notified, its count is kept, and the repair retries next tick.
    expect(emitted).toHaveLength(4);
    expect(outcome.expiredShares).toBe(4);
    expect(outcome.repairedPins).toBe(0);
    expect(outcome.failures).toEqual(["share-expiry"]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("keeps batching until the batch is not full and stops at the cap", async () => {
    const pruneOlderThan = vi.fn<LocationHistoryStore["pruneOlderThan"]>(async () => HISTORY_PRUNE_BATCH_ROWS);

    const outcome = await runLocationJobs({
      ...makeStores({ pruneOlderThan }),
      now: () => NOW,
      retentionDays: 30
    });

    // A full batch every time: bounded by the cap rather than looping forever on a huge backlog.
    expect(pruneOlderThan).toHaveBeenCalledTimes(HISTORY_PRUNE_MAX_BATCHES);
    expect(outcome.prunedHistoryRows).toBe(HISTORY_PRUNE_BATCH_ROWS * HISTORY_PRUNE_MAX_BATCHES);
    expect(outcome.prunedBatches).toBe(HISTORY_PRUNE_MAX_BATCHES);
  });

  it("isolates a failing job so the other one still runs", async () => {
    const expireOverdueShares = vi.fn<LocationShareStore["expireOverdueShares"]>(async () => {
      throw new Error("share sweep unavailable");
    });
    const pruneOlderThan = vi.fn<LocationHistoryStore["pruneOlderThan"]>(async () => 3);
    const logger = makeLogger();

    const outcome = await runLocationJobs({
      ...makeStores({ expireOverdueShares, pruneOlderThan }),
      now: () => NOW,
      retentionDays: 90,
      logger
    });

    expect(outcome).toEqual({
      expiredShares: 0,
      repairedPins: 0,
      prunedHistoryRows: 3,
      prunedBatches: 1,
      failures: ["share-expiry"]
    });
    expect(pruneOlderThan).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[1]).toBe("location share state sweep failed");
  });
});

describe("startLocationJobs", () => {
  it("runs due jobs on the tick and stops on demand", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const expireOverdueShares = vi.fn<LocationShareStore["expireOverdueShares"]>(async () => []);
    const pruneOlderThan = vi.fn<LocationHistoryStore["pruneOlderThan"]>(async () => 0);
    const { shareStore, historyStore } = makeStores({ expireOverdueShares, pruneOlderThan });

    const jobs = startLocationJobs({ shareStore, historyStore, retentionDays: 90 });
    // Nothing has run yet: the entrypoint decides when the first pass happens.
    await vi.advanceTimersByTimeAsync(JOB_TICK_INTERVAL_MS - 1);
    expect(expireOverdueShares).not.toHaveBeenCalled();
    expect(pruneOlderThan).not.toHaveBeenCalled();

    const startup = await jobs.tick({ runAll: true });
    expect(startup?.failures).toEqual([]);
    expect(expireOverdueShares).toHaveBeenCalledTimes(1);
    expect(pruneOlderThan).toHaveBeenCalledTimes(1);

    // A minute later the expiry sweep is due again; pruning stays daily.
    await vi.advanceTimersByTimeAsync(60_000 + JOB_TICK_INTERVAL_MS);
    expect(expireOverdueShares).toHaveBeenCalledTimes(2);
    expect(pruneOlderThan).toHaveBeenCalledTimes(1);

    const expiryBeforeDay = expireOverdueShares.mock.calls.length;
    await vi.advanceTimersByTimeAsync(DAY_MS);
    expect(pruneOlderThan.mock.calls.length).toBe(2);
    expect(expireOverdueShares.mock.calls.length - expiryBeforeDay).toBeGreaterThan(1_400);

    const expiryAtStop = expireOverdueShares.mock.calls.length;
    const pruneAtStop = pruneOlderThan.mock.calls.length;
    jobs.stop();
    await vi.advanceTimersByTimeAsync(DAY_MS + 60_000);
    expect(expireOverdueShares.mock.calls.length).toBe(expiryAtStop);
    expect(pruneOlderThan.mock.calls.length).toBe(pruneAtStop);
  });

  it("retries a failed job on the next tick instead of waiting a full interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const expireOverdueShares = vi.fn<LocationShareStore["expireOverdueShares"]>(() => {
      throw new Error("pool down");
    });
    const logger = makeLogger();
    const { shareStore, historyStore } = makeStores({ expireOverdueShares });

    const jobs = startLocationJobs({ shareStore, historyStore, retentionDays: 90, logger });
    await jobs.tick({ runAll: true });
    // A failed pass leaves the schedule untouched, so even a schedule-aware tick re-runs it.
    await jobs.tick();
    await vi.advanceTimersByTimeAsync(JOB_TICK_INTERVAL_MS);

    expect(expireOverdueShares).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(3);
    jobs.stop();
  });

  it("never overlaps a slow pass with the next tick", async () => {
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let started = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const expireOverdueShares = vi.fn<LocationShareStore["expireOverdueShares"]>(async () => {
      started += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate;
      inFlight -= 1;
      return [];
    });
    const { shareStore, historyStore } = makeStores({ expireOverdueShares });
    const jobs = startLocationJobs({ shareStore, historyStore, retentionDays: 90, now: () => NOW });

    const first = jobs.tick({ runAll: true });
    await vi.waitFor(() => expect(started).toBe(1));
    await expect(jobs.tick({ runAll: true })).resolves.toBeNull();
    releaseGate();
    await first;

    expect(maxInFlight).toBe(1);
    jobs.stop();
  });
});
