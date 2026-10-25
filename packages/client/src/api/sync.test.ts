import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserSyncResponse } from "@shared/index";
import { readAllUserSync, readUserSync } from "./sync";
const missionId = "10000000-0000-4000-8000-000000000001";
const cursor = "20000000-0000-4000-8000-000000000002";
const at = "2026-10-25T08:00:00.000Z";
const step = { id: cursor, missionId, fromStatus: null, toStatus: "pending" as const,
  changedBy: null, createdAt: at };
const page = (nextCursor: string | null): UserSyncResponse => ({ events: [step], missions: [],
  missionsTruncated: false, location: null, nextCursor });
afterEach(() => vi.unstubAllGlobals());
describe("mission sync adapter", () => {
  it("validates wire payload and uses a same-origin, credential-scoped request", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(page(null))));
    vi.stubGlobal("fetch", fetcher);
    expect(await readUserSync("access", at, cursor)).toEqual(page(null));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/_user/sync?since=${encodeURIComponent(at)}&cursor=${cursor}`);
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("authorization")).toBe("Bearer access");
    expect(fetcher.mock.calls[0]![1]?.credentials).toBe("same-origin");
    await expect(readUserSync("access", "not a timestamp")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("pages deterministically, deduplicates by durable id, and refuses cursor loops/partial reads", async () => {
    const read = vi.fn().mockResolvedValueOnce(page(cursor)).mockResolvedValueOnce(page(null));
    const result = await readAllUserSync("access", at, undefined, read);
    expect(result.events).toEqual([step]);
    expect(read.mock.calls.map((call) => call[2])).toEqual([undefined, cursor]);
    await expect(readAllUserSync("access", at, undefined, vi.fn(async () => page(cursor))))
      .rejects.toThrow("SYNC_CURSOR_LOOP");
  });
});
