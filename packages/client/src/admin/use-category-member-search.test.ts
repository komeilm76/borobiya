import type { UserProfile } from "@shared/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCategoryMemberSearch } from "./use-category-member-search";

function row(id: string, isActive = true): UserProfile {
  return { id, username: id, role: "user", isActive, mustCompleteSecurityQuestions: false,
    avgRating: null, createdAt: "2026-10-28T00:00:00.000Z", categories: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("category member search feedback", () => {
  it("clears old candidates immediately on edit and ignores a response in the debounce window", async () => {
    const old = deferred<UserProfile[]>();
    const lookup = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce([row("new")]);
    const search = useCategoryMemberSearch(lookup, () => new Set());
    search.queueSearch("old");
    await vi.advanceTimersByTimeAsync(300);
    search.queueSearch("new");
    expect(search.candidates.value).toEqual([]);
    expect(search.searching.value).toBe(true);
    old.resolve([row("old")]);
    await settle();
    expect(search.candidates.value).toEqual([]);
    expect(search.searching.value).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(search.candidates.value.map((candidate) => candidate.id)).toEqual(["new"]);
    search.reset();
  });

  it("invalidates an already displayed result on edit, and cancels pending work on clear or close", async () => {
    const late = deferred<UserProfile[]>();
    const lookup = vi.fn().mockResolvedValueOnce([row("first")]).mockReturnValueOnce(late.promise);
    const search = useCategoryMemberSearch(lookup, () => new Set());
    search.queueSearch("first");
    await vi.advanceTimersByTimeAsync(300);
    expect(search.candidates.value.map((candidate) => candidate.id)).toEqual(["first"]);
    search.queueSearch("second");
    expect(search.candidates.value).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    search.reset(); // dialog closed while second lookup is in flight
    late.resolve([row("second")]);
    await settle();
    expect(search.candidates.value).toEqual([]);
    expect(search.searching.value).toBe(false);
    search.queueSearch(null);
    await vi.advanceTimersByTimeAsync(300);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("never offers inactive or already assigned users; a stale error cannot replace current feedback", async () => {
    const old = deferred<UserProfile[]>();
    const lookup = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce([row("active"), row("inactive", false), row("assigned")]);
    const search = useCategoryMemberSearch(lookup, () => new Set(["assigned"]));
    search.queueSearch("old");
    await vi.advanceTimersByTimeAsync(300);
    search.queueSearch("new");
    old.reject(new Error("old failure"));
    await settle();
    expect(search.searchError.value).toBe("");
    await vi.advanceTimersByTimeAsync(300);
    expect(search.candidates.value.map((candidate) => candidate.id)).toEqual(["active"]);
    expect(search.searchError.value).toBe("");
  });
});
