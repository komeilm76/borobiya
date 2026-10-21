import type { LocationHistoryStore } from "../db/location-history-store";
import type { LocationShareStore } from "../db/location-share-store";

/** Spec §7.1: timed shares are expired by a cron that runs every minute. */
export const SHARE_EXPIRY_INTERVAL_MS = 60_000;
/** Spec §7.2/§17.2: history retention is enforced once per day. */
export const HISTORY_PRUNE_INTERVAL_MS = 24 * 60 * 60_000;
/** How often the schedule is re-checked; also the retry delay after a failed pass. */
export const JOB_TICK_INTERVAL_MS = 15_000;
/** Rows deleted per statement, so a first run after a long outage cannot hold one long lock. */
export const HISTORY_PRUNE_BATCH_ROWS = 5_000;
/** Upper bound on batches per run so one pass can never loop unbounded. */
export const HISTORY_PRUNE_MAX_BATCHES = 40;

/** Thrown internally when the prune job is not part of this pass. */
class SkipJob extends Error {}

/** Structurally satisfied by the Fastify (pino) logger. */
export interface LocationJobLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
}

export interface LocationJobDependencies {
  shareStore: Pick<LocationShareStore, "expireOverdueShares">;
  historyStore: Pick<LocationHistoryStore, "pruneOlderThan">;
  /** `LOCATION_HISTORY_RETENTION_DAYS` (spec §17.2). */
  retentionDays: number;
  now?: () => Date;
  logger?: LocationJobLogger;
}

export interface LocationJobOutcome {
  expiredShares: number;
  prunedHistoryRows: number;
  prunedBatches: number;
  /** A job that threw is reported here instead of rejecting the whole pass. */
  failures: string[];
}

/**
 * One pass of both Phase 2 maintenance jobs. Each job is isolated: a broken sweep is logged and
 * retried on the next tick, and never blocks the other one. Both statements are idempotent, so
 * running them from more than one API replica is wasted work rather than a correctness problem.
 */
/** Which jobs this pass should run; the scheduler enables them per cadence. */
export interface LocationJobSelection {
  expiry: boolean;
  prune: boolean;
}

const BOTH_JOBS: LocationJobSelection = { expiry: true, prune: true };

export async function runLocationJobs(
  dependencies: LocationJobDependencies,
  selection: LocationJobSelection = BOTH_JOBS
): Promise<LocationJobOutcome> {
  const now = (dependencies.now ?? (() => new Date()))();
  const logger = dependencies.logger;
  const failures: string[] = [];

  let expiredShares = 0;
  try {
    if (selection.expiry) {
      expiredShares = await dependencies.shareStore.expireOverdueShares({ now });
      if (expiredShares > 0) {
        logger?.info({ expiredShares, now: now.toISOString() }, "location share expiry sweep ran");
      }
    }
  } catch (error) {
    failures.push("share-expiry");
    logger?.warn({ err: error }, "location share expiry sweep failed");
  }

  let prunedHistoryRows = 0;
  let prunedBatches = 0;
  try {
    if (!selection.prune) throw new SkipJob();
    const cutoff = new Date(now.getTime() - dependencies.retentionDays * 24 * 60 * 60 * 1000);
    while (prunedBatches < HISTORY_PRUNE_MAX_BATCHES) {
      const deleted = await dependencies.historyStore.pruneOlderThan({
        olderThan: cutoff,
        limit: HISTORY_PRUNE_BATCH_ROWS
      });
      prunedBatches += 1;
      prunedHistoryRows += deleted;
      if (deleted < HISTORY_PRUNE_BATCH_ROWS) break;
    }
    if (prunedHistoryRows > 0) {
      logger?.info(
        { prunedHistoryRows, prunedBatches, cutoff: cutoff.toISOString() },
        "location history retention prune ran"
      );
    }
  } catch (error) {
    if (error instanceof SkipJob) {
      // Not due yet: silence, and no retry pressure on the schedule.
      prunedBatches = 0;
    } else {
      failures.push("history-prune");
      logger?.warn({ err: error }, "location history retention prune failed");
    }
  }

  return { expiredShares, prunedHistoryRows, prunedBatches, failures };
}

export interface LocationJobHandle {
  /** Runs whatever is due; `runAll` ignores the schedule (used at startup and in tests). */
  tick(options?: { runAll?: boolean }): Promise<LocationJobOutcome | null>;
  stop(): void;
}

/**
 * Starts the in-process timers for share expiry (every minute, spec §7.1) and the history
 * retention prune (daily, spec §7.2). The entrypoint runs one `tick({ runAll: true })` at startup
 * so a restarted API does not keep serving a share whose window closed while it was down;
 * after that the schedule applies. `stop()` is wired into Fastify's close hooks.
 */
export function startLocationJobs(dependencies: LocationJobDependencies): LocationJobHandle {
  const now = dependencies.now ?? (() => new Date());
  let lastExpiryAt = 0;
  let lastPruneAt = 0;
  let running: Promise<LocationJobOutcome> | null = null;

  async function run(which: { expiry: boolean; prune: boolean }): Promise<LocationJobOutcome | null> {
    if (!which.expiry && !which.prune) return null;
    // Never overlap a slow database with the next tick.
    if (running) return null;

    const startedAt = now().getTime();
    const pass = runLocationJobs({ ...dependencies, now }, which).then((outcome) => {
      // Only a clean pass counts for the schedule, so failures retry on the next tick.
      if (outcome.failures.length === 0) {
        if (which.expiry) lastExpiryAt = startedAt;
        if (which.prune) lastPruneAt = startedAt;
      }
      return outcome;
    });
    running = pass.finally(() => {
      running = null;
    });
    // runLocationJobs never rejects, but a thrown logger must not take the process with it.
    return running.catch(() => null);
  }

  const timer = setInterval(() => {
    const current = now().getTime();
    void run({
      expiry: current - lastExpiryAt >= SHARE_EXPIRY_INTERVAL_MS,
      prune: current - lastPruneAt >= HISTORY_PRUNE_INTERVAL_MS
    });
  }, JOB_TICK_INTERVAL_MS);
  // Never keep the process alive for the maintenance timer alone.
  timer.unref?.();

  return {
    async tick(options = {}) {
      if (options.runAll) {
        lastExpiryAt = 0;
        lastPruneAt = 0;
      }
      const current = now().getTime();
      return run({
        expiry: options.runAll || current - lastExpiryAt >= SHARE_EXPIRY_INTERVAL_MS,
        prune: options.runAll || current - lastPruneAt >= HISTORY_PRUNE_INTERVAL_MS
      });
    },
    stop() {
      clearInterval(timer);
    }
  };
}
