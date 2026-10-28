import { effectScope, nextTick, ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DEBOUNCE_MS } from "@/sharing/share-form";
import { useTargetSearch } from "./use-target-search";

/**
 * The picker's scheduling rules are the part of T2.1.7 that a user feels, so they are tested
 * directly: one lookup per pause, no request for a term the server would reject, and never a list
 * that belongs to an older keystroke.
 */

const token = ref("access-token");

/**
 * A hand-rolled response instead of `new Response(...)`: the fetch under fake timers must resolve
 * on microtasks only, and undici's `Response.json()` reads a stream on a real scheduler, which
 * `advanceTimersByTimeAsync` would never let finish.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body
  } as unknown as Response;
}

function page(items: unknown[], total = items.length) {
  return { items, total, page: 1, limit: 20, totalPages: Math.max(1, Math.ceil(total / 20)) };
}

function row(username: string, slot: string): UserSearchResultFixture {
  // Real uuid shapes: `userSearchResultSchema` parses `id` with the shared uuid rule, and a
  // fixture that fails that parse would look like a stale-guard bug instead of a bad test.
  return {
    id: `${slot.repeat(8)}-${slot.repeat(4)}-4${slot.repeat(3)}-8${slot.repeat(3)}-${slot.repeat(12)}`,
    username,
    category: null,
    avgRating: null,
    isOnline: false,
    distance: null
  };
}

interface UserSearchResultFixture {
  id: string;
  username: string;
  category: string | null;
  avgRating: number | null;
  isOnline: boolean;
  distance: number | null;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface MountOverrides {
  minRating?: Ref<number | undefined>;
  online?: Ref<boolean | undefined>;
  limit?: number;
}

/** The access token is always the module-level `token` ref; everything else is optional. */
function mountComposable(overrides: MountOverrides = {}) {
  const scope = effectScope();
  let mounted!: ReturnType<typeof useTargetSearch>;
  scope.run(() => {
    mounted = useTargetSearch({ accessToken: token, ...overrides });
  });
  return { scope, search: mounted };
}

beforeEach(() => {
  vi.useFakeTimers();
  token.value = "access-token";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useTargetSearch", () => {
  it("waits for the pause before asking, then sends the trimmed term once", async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => jsonResponse(page([])));
    vi.stubGlobal("fetch", fetchMock);
    const { search, scope } = mountComposable();

    search.term.value = "ha";
    await nextTick();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String((fetchMock.mock.calls[0] as unknown as [unknown])[0])).toContain("q=ha");

    scope.stop();
  });

  it("never asks for a term the server would reject, and clears the list instead", async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => jsonResponse(page([row("hamrah_one", "1")])));
    vi.stubGlobal("fetch", fetchMock);
    const { search, scope } = mountComposable();

    search.term.value = "h";
    await nextTick();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(search.results.value).toEqual([]);
    expect(search.loading.value).toBe(false);

    scope.stop();
  });

  it("collapses a typed word into one request", async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => jsonResponse(page([])));
    vi.stubGlobal("fetch", fetchMock);
    const { search, scope } = mountComposable();

    for (const term of ["ha", "ham", "hamr", "hamra"]) {
      search.term.value = term;
      await nextTick();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50);
    }
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String((fetchMock.mock.calls[0] as unknown as [unknown])[0])).toContain("q=hamra");

    scope.stop();
  });

  it("ignores a slow answer from a superseded keystroke", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const queue = [first, second];
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => queue.shift()!.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { search, scope } = mountComposable();

    search.term.value = "ha";
    await nextTick();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    search.term.value = "ham";
    await nextTick();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    second.resolve(jsonResponse(page([row("hamlet", "2")])));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(search.results.value.map((item) => item.username)).toEqual(["hamlet"]);

    first.resolve(jsonResponse(page([row("hades", "3")])));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(search.results.value.map((item) => item.username)).toEqual(["hamlet"]);
    expect(search.loading.value).toBe(false);

    scope.stop();
  });

  it("invalidates selectable recipients in the same tick as a term or filter change", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(page([row("old_recipient", "3")])));
    vi.stubGlobal("fetch", fetchMock);
    const minRating = ref<number | undefined>(undefined);
    const { search, scope } = mountComposable({ minRating });
    try {
      search.term.value = "ha";
      await nextTick();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      expect(search.results.value).toHaveLength(1);

      search.term.value = "ham";
      expect(search.results.value).toEqual([]); // cannot select an old candidate before nextTick
      expect(search.total.value).toBe(0);
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      expect(search.results.value).toHaveLength(1);

      minRating.value = 4;
      expect(search.results.value).toEqual([]); // clicked filter cannot retain old candidates either
      expect(search.total.value).toBe(0);
    } finally { scope.stop(); }
  });

  it("pressing Enter right after typing runs exactly one immediate search", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(page([row("hamlet", "2")])));
    vi.stubGlobal("fetch", fetchMock);
    const { search, scope } = mountComposable();
    try {
      search.term.value = "ham";
      search.searchNow();
      await nextTick();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(search.results.value.map((item) => item.username)).toEqual(["hamlet"]);
    } finally { scope.stop(); }
  });

  it("never shows a prior term's recipients while the new valid term is still debouncing", async () => {
    const older = deferred<Response>();
    const fetchMock = vi.fn(async () => older.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { search, scope } = mountComposable();
    try {
      search.term.value = "ha";
      await nextTick();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      expect(fetchMock).toHaveBeenCalledOnce();
      search.term.value = "ham";
      await nextTick();
      older.resolve(jsonResponse(page([row("hades", "3")])));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(search.results.value).toEqual([]);
      expect(search.total.value).toBe(0);
    } finally { scope.stop(); }
  });

  it("invalidates an in-flight recipient search immediately when its dialog closes", async () => {
    const older = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(async () => older.promise)); // deliberately ignores AbortSignal
    const { search, scope } = mountComposable();
    try {
      search.term.value = "ham";
      await nextTick();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      expect(search.loading.value).toBe(true);
      search.cancelPending();
      expect(search.loading.value).toBe(false);
      older.resolve(jsonResponse(page([row("old_account", "3")])));
      await vi.advanceTimersByTimeAsync(0);
      expect(search.results.value).toEqual([]);
      expect(search.total.value).toBe(0);
    } finally { scope.stop(); }
  });

  it("does not retry an old recipient query with a new session after cancellation during 401 recovery", async () => {
    const refresh = deferred<void>();
    const fetchMock = vi.fn(async () => jsonResponse({ code: "INVALID_ACCESS_TOKEN", message: "Expired" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const scope = effectScope();
    let search!: ReturnType<typeof useTargetSearch>;
    scope.run(() => { search = useTargetSearch({ accessToken: token,
      ensureSession: async () => { await refresh.promise; token.value = "next-account-token"; } }); });
    try {
      search.term.value = "old_account_query";
      await nextTick();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      expect(fetchMock).toHaveBeenCalledOnce();
      search.cancelPending();
      refresh.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(search.results.value).toEqual([]);
    } finally { scope.stop(); }
  });

  it("reports a failure instead of leaving the previous list on screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, _init?: RequestInit) =>
        jsonResponse({ code: "VALIDATION_ERROR", message: "nope" }, 400)
      )
    );
    const { search, scope } = mountComposable();

    search.term.value = "ham";
    await nextTick();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(search.failed.value).toBe(true);
    expect(search.results.value).toEqual([]);
    expect(search.loading.value).toBe(false);

    scope.stop();
  });

  it("hides previous recipients as soon as a filter changes, before the new request settles", async () => {
    const filtered = deferred<Response>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(page([row("hamrah_one", "1")], 1)))
      .mockImplementationOnce(async () => filtered.promise);
    vi.stubGlobal("fetch", fetchMock);
    const minRating = ref<number | undefined>(undefined);
    const { search, scope } = mountComposable({ minRating });
    try {
      search.term.value = "ham";
      await nextTick();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      await vi.advanceTimersByTimeAsync(0);
      expect(search.results.value).toHaveLength(1);
      minRating.value = 4;
      await nextTick();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(search.results.value).toEqual([]);
      expect(search.total.value).toBe(0);
      filtered.resolve(jsonResponse(page([])));
      await vi.advanceTimersByTimeAsync(0);
    } finally { scope.stop(); }
  });

  it("refetches immediately when a narrowing control changes", async () => {
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) => jsonResponse(page([])));
    vi.stubGlobal("fetch", fetchMock);
    const minRating = ref<number | undefined>(undefined);
    const { search, scope } = mountComposable({ minRating });

    search.term.value = "ham";
    await nextTick();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String((fetchMock.mock.calls[0] as unknown as [unknown])[0])).not.toContain("minRating");

    minRating.value = 4;
    await nextTick();
    // A clicked control is not debounced: no stale list may sit under a filter the user just set.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String((fetchMock.mock.calls[1] as unknown as [unknown])[0])).toContain("minRating=4");

    scope.stop();
  });
});
