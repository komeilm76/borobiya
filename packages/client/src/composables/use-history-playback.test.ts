import { readFileSync } from "node:fs";
import { effectScope, nextTick, ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationHistoryPoint } from "@shared/index";
import {
  PLAYBACK_MAX_TICK_DELTA_MS,
  PLAYBACK_TICK_MS,
  useHistoryPlayback
} from "./use-history-playback";
import {
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_RANGE_PRESET_DAYS,
  HISTORY_LOAD_ISSUE_COPY,
  HISTORY_WINDOW_ISSUE_COPY
} from "@/history/playback";

/**
 * The panel's scheduling and state rules, tested at the seam the components use: which request a control
 * produces, what the cursor does while playing, and which failure copy the user is shown. No rendering is
 * involved — `UserMapView` passes these refs straight through.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-21T12:00:00.000Z");

interface FetchCall {
  readonly url: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

let calls: FetchCall[] = [];
let autoRespond: ((url: string) => unknown) | null = null;
let pending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];

function jsonResponse(body: unknown, status = 200): Response {
  // Hand-rolled, as in the search composable's tests: undici's `Response.json()` resolves on a real
  // scheduler, which fake timers would never let finish.
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body
  } as unknown as Response;
}

function point(lat: number, lon: number, iso: string): LocationHistoryPoint {
  return { lat, lon, timestamp: iso };
}

function historyBody(points: LocationHistoryPoint[], totalPoints = points.length) {
  return { points, totalPoints };
}

function uuid(seed: string) {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

function grantRow(id: string) {
  return {
    id: uuid(id),
    ownerId: uuid("a"),
    targetUserId: uuid("b"),
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-08T00:00:00.000Z",
    maxPoints: 500,
    createdAt: "2026-10-08T00:00:00.000Z",
    owner: { id: uuid("a"), username: "sara" }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  calls = [];
  pending = [];
  autoRespond = null;
  globalThis.fetch = vi.fn(async (input: unknown, _init?: unknown) => {
    const url = String(input);
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Response>((res, rej) => {
      // `autoRespond` may return `{ __status, __body }` to make the API layer throw a real `ApiError`,
      // which is the only honest way to reach the panel's failure branches.
      resolve = (payload: unknown) => {
        const shaped = payload as { __status?: number; __body?: unknown } | null;
        if (shaped && typeof shaped === "object" && "__status" in shaped) {
          res(jsonResponse(shaped.__body, shaped.__status ?? 500));
          return;
        }
        res(jsonResponse(payload));
      };
      reject = (error: unknown) => rej(error);
    });
    const call: FetchCall = { url, resolve, reject };
    calls.push(call);
    pending.push({ resolve, reject });
    if (autoRespond) resolve(autoRespond(url));
    return promise;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function mount(initialToken: string | null = "access-token", ownerId?: Ref<string | null>) {
  const scope = effectScope();
  const token = ref<string | null>(initialToken);
  let api!: ReturnType<typeof useHistoryPlayback>;
  scope.run(() => {
    api = useHistoryPlayback({ accessToken: token, ...(ownerId ? { ownerId } : {}) });
  });
  return { scope, token, api };
}

function bearer(owner: string, sessionId: string, nonce = 0): string {
  return `e30.${btoa(JSON.stringify({ sub: owner, sessionId, nonce }))}.sig`;
}

async function settle(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  await nextTick();
}

describe("JWT login boundary", () => {
  const track = () => historyBody([
    point(35.7, 51.4, new Date(NOW - 2 * HOUR).toISOString()),
    point(35.8, 51.5, new Date(NOW - HOUR).toISOString())
  ]);
  const answer = (url: string) => url.includes("history/shares")
    ? { owned: [], sharedWithMe: [grantRow("c")] } : track();

  it("clears private tracks, grants and playback immediately on a new login for the same account", async () => {
    const owner = ref<string | null>("owner-a");
    const { scope, token, api } = mount(bearer("owner-a", "session-a"), owner);
    try {
      autoRespond = answer;
      await api.loadShares();
      await api.selectPreset(7);
      api.play();
      expect(api.points.value).toHaveLength(2);
      expect(api.grants.value).toHaveLength(1);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      token.value = bearer("owner-a", "session-b");
      expect(vi.getTimerCount()).toBe(0);
      expect(api.points.value).toEqual([]);
      expect(api.grants.value).toEqual([]);
      expect(api.playing.value).toBe(false);
      expect(api.grantsLoaded.value).toBe(false);
      expect(api.loading.value).toBe(false);
    } finally { scope.stop(); }
  });

  it("rejects a late track and grant response from a replaced JWT session", async () => {
    const owner = ref<string | null>("owner-a");
    const { scope, token, api } = mount(bearer("owner-a", "session-a"), owner);
    try {
      const oldTrack = api.selectPreset(7);
      const oldGrants = api.loadShares();
      await settle();
      expect(calls).toHaveLength(2);
      token.value = bearer("owner-a", "session-b");
      calls[0]!.resolve(track());
      calls[1]!.resolve({ owned: [], sharedWithMe: [grantRow("c")] });
      await Promise.all([oldTrack, oldGrants]);
      expect(api.points.value).toEqual([]);
      expect(api.grants.value).toEqual([]);
      expect(api.loading.value).toBe(false);
      expect(api.grantsLoading.value).toBe(false);
    } finally { scope.stop(); }
  });

  it("does not revive the original private track on A→B→A in one tick", async () => {
    const owner = ref<string | null>("owner-a");
    const { scope, token, api } = mount(bearer("owner-a", "session-a"), owner);
    try {
      autoRespond = answer;
      await api.selectPreset(7);
      expect(api.points.value).toHaveLength(2);
      token.value = bearer("owner-a", "session-b");
      token.value = bearer("owner-a", "session-a");
      expect(api.points.value).toEqual([]);
    } finally { scope.stop(); }
  });

  it("allows a cold session recovery to finish its first history read", async () => {
    const owner = ref<string | null>(null);
    const token = ref<string | null>(null);
    const scope = effectScope();
    let api!: ReturnType<typeof useHistoryPlayback>;
    scope.run(() => { api = useHistoryPlayback({
      accessToken: token,
      ownerId: owner,
      ensureSession: async () => {
        token.value = bearer("owner-a", "session-a");
        owner.value = "owner-a";
      }
    }); });
    try {
      autoRespond = answer;
      await api.selectPreset(7);
      expect(api.points.value).toHaveLength(2);
      expect(calls).toHaveLength(1);
    } finally { scope.stop(); }
  });

  it("preserves the track and timer on a same-session JWT renewal", async () => {
    const owner = ref<string | null>("owner-a");
    const { scope, token, api } = mount(bearer("owner-a", "session-a"), owner);
    try {
      autoRespond = answer;
      await api.loadShares();
      await api.selectPreset(7);
      api.play();
      const before = calls.length;
      token.value = bearer("owner-a", "session-a", 1);
      expect(api.points.value).toHaveLength(2);
      expect(api.grants.value).toHaveLength(1);
      expect(api.playing.value).toBe(true);
      expect(calls).toHaveLength(before);
    } finally { scope.stop(); }
  });

  it("does not read a JWT while its subject disagrees with the displayed profile", async () => {
    const owner = ref<string | null>("owner-a");
    const { scope, token, api } = mount(bearer("owner-a", "session-a"), owner);
    try {
      autoRespond = answer;
      await api.selectPreset(7);
      calls = [];
      token.value = bearer("owner-b", "session-b");
      expect(api.points.value).toEqual([]);
      await api.selectPreset(7);
      expect(calls).toHaveLength(0);
      owner.value = "owner-b";
      await api.selectPreset(7);
      expect(api.points.value).toHaveLength(2);
    } finally { scope.stop(); }
  });
});

describe("range controls", () => {
  it("opens on the last 7 days, the shortcut the tracker names", () => {
    const { api } = mount();
    expect(api.presetDays.value).toBe(DEFAULT_RANGE_PRESET_DAYS);
    expect(api.loadIssue.value).toBeNull();
    // Nothing is fetched before the user or the view asks for a window, so opening the map does not
    // start a history read for somebody who only wanted the live view.
    expect(calls).toEqual([]);
  });

  it("turns a preset into local inputs and one request carrying ISO instants", async () => {
    const { api } = mount();
    autoRespond = () => historyBody([point(35.7, 51.4, "2026-10-20T10:00:00.000Z")]);
    await api.selectPreset(7);
    await settle();
    expect(Date.parse(api.toInput.value) - Date.parse(api.fromInput.value)).toBe(7 * DAY);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url, "http://localhost");
    expect(url.pathname).toBe("/api/_user/location/history");
    expect(url.searchParams.get("from")).toBe(new Date(NOW - 7 * DAY).toISOString());
    expect(url.searchParams.get("to")).toBe(new Date(NOW).toISOString());
  });

  it("keeps the manual edit out of the chip's highlight but still validates it", async () => {
    const { api } = mount();
    autoRespond = () => historyBody([]);
    await api.setManualRange("2026-10-21T11:00", "2026-10-21T12:00");
    await settle();
    expect(api.presetDays.value).toBe(0);
    expect(api.windowIssue.value).toBeNull();
    const url = new URL(calls[0]!.url, "http://localhost");
    // Local wall time in, UTC instant out: the field said 11:00 in the viewer's zone.
    expect(url.searchParams.get("from")).toBe(new Date("2026-10-21T11:00").toISOString());
  });

  it("refuses an inverted window before spending a request on it", async () => {
    const { api } = mount();
    await api.setManualRange("2026-10-21T12:00", "2026-10-21T11:00");
    await settle();
    expect(calls).toEqual([]);
    expect(api.windowIssue.value).toBe("order");
    expect(api.failed.value).toBe(true);
    expect(HISTORY_WINDOW_ISSUE_COPY.order).toBeTruthy();
  });

  it("does not restore an old track after the next manual window is invalid", async () => {
    const { api } = mount();
    const first = api.selectPreset(7);
    await settle();
    expect(calls).toHaveLength(1);

    await api.setManualRange("2026-10-21T12:00", "2026-10-21T11:00");
    expect(api.windowIssue.value).toBe("order");
    expect(api.points.value).toEqual([]);

    calls[0]!.resolve(historyBody([point(35.7, 51.4, new Date(NOW - HOUR).toISOString())]));
    await first;
    await settle();
    expect(api.points.value).toEqual([]);
    expect(api.windowIssue.value).toBe("order");
    expect(api.loading.value).toBe(false);
  });

  it("does not start an obsolete read after a slower session check", async () => {
    const waiting: Array<() => void> = [];
    const scope = effectScope();
    const token = ref<string | null>("access-token");
    let api!: ReturnType<typeof useHistoryPlayback>;
    scope.run(() => { api = useHistoryPlayback({
      accessToken: token,
      ensureSession: () => new Promise<void>((resolve) => { waiting.push(resolve); })
    }); });
    const first = api.selectPreset(7);
    const second = api.selectPreset(1);
    expect(waiting).toHaveLength(2);
    waiting[1]!();
    await settle();
    expect(calls).toHaveLength(1);
    calls[0]!.resolve(historyBody([]));
    await second;
    waiting[0]!();
    await first;
    expect(calls).toHaveLength(1);
    scope.stop();
  });

  it("still retries current history and grant reads after a same-session bearer renewal", async () => {
    const scope = effectScope();
    const token = ref<string | null>("expiring-token");
    const refreshSession = vi.fn(async () => { token.value = "renewed-token"; return true; });
    let api!: ReturnType<typeof useHistoryPlayback>;
    scope.run(() => { api = useHistoryPlayback({ accessToken: token, refreshSession }); });
    try {
      const history = api.selectPreset(7);
      await settle();
      autoRespond = () => historyBody([point(35.7, 51.4, new Date(NOW - HOUR).toISOString())]);
      calls[0]!.resolve({ __status: 401, __body: { code: "INVALID_ACCESS_TOKEN", message: "Expired", issues: [] } });
      await history;
      expect(calls).toHaveLength(2);
      expect(api.points.value).toHaveLength(1);
      expect(refreshSession).toHaveBeenCalledOnce();

      autoRespond = null;
      const grants = api.loadShares();
      await settle();
      autoRespond = () => ({ owned: [], sharedWithMe: [grantRow("c")] });
      calls[2]!.resolve({ __status: 401, __body: { code: "INVALID_ACCESS_TOKEN", message: "Expired", issues: [] } });
      await grants;
      expect(calls).toHaveLength(4);
      expect(api.grants.value).toHaveLength(1);
      expect(refreshSession).toHaveBeenCalledTimes(2);
    } finally { scope.stop(); }
  });

  it("does not replay an obsolete private history window with a new account after 401 recovery", async () => {
    const scope = effectScope();
    const token = ref<string | null>("old-account-token");
    const waiting: Array<(refreshed: boolean) => void> = [];
    let api!: ReturnType<typeof useHistoryPlayback>;
    scope.run(() => { api = useHistoryPlayback({
      accessToken: token,
      refreshSession: () => new Promise<boolean>((resolve) => { waiting.push(resolve); })
    }); });
    try {
      const old = api.selectPreset(7);
      await settle();
      calls[0]!.resolve({ __status: 401, __body: { code: "INVALID_ACCESS_TOKEN", message: "Expired", issues: [] } });
      await settle();
      expect(waiting).toHaveLength(1);

      token.value = null;
      token.value = "new-account-token";
      const current = api.selectPreset(1);
      await settle();
      expect(calls).toHaveLength(2);
      calls[1]!.resolve(historyBody([]));
      await current;
      autoRespond = () => historyBody([]); // settle a wrong replay too, so the regression cannot hang
      waiting[0]!(true);
      await old;
      expect(calls).toHaveLength(2);
      expect(api.points.value).toEqual([]);
    } finally { scope.stop(); }
  });

  it("does not replay an obsolete grant-list read with a new account after 401 recovery", async () => {
    const scope = effectScope();
    const token = ref<string | null>("old-account-token");
    const waiting: Array<(refreshed: boolean) => void> = [];
    let api!: ReturnType<typeof useHistoryPlayback>;
    scope.run(() => { api = useHistoryPlayback({
      accessToken: token,
      refreshSession: () => new Promise<boolean>((resolve) => { waiting.push(resolve); })
    }); });
    try {
      const old = api.loadShares();
      await settle();
      calls[0]!.resolve({ __status: 401, __body: { code: "INVALID_ACCESS_TOKEN", message: "Expired", issues: [] } });
      await settle();
      expect(waiting).toHaveLength(1);

      token.value = null;
      token.value = "new-account-token";
      const current = api.loadShares();
      await settle();
      expect(calls).toHaveLength(2);
      calls[1]!.resolve({ owned: [], sharedWithMe: [grantRow("c")] });
      await current;
      autoRespond = () => ({ owned: [], sharedWithMe: [] });
      waiting[0]!(true);
      await old;
      expect(calls).toHaveLength(2);
      expect(api.grants.value).toHaveLength(1);
    } finally { scope.stop(); }
  });

  it("does not restore another session's share list after sign-out", async () => {
    const { token, api } = mount();
    api.selectSource("grant");
    await settle();
    expect(calls).toHaveLength(1);
    token.value = null;
    calls[0]!.resolve({ owned: [], sharedWithMe: [grantRow("c")] });
    await settle();
    expect(api.grants.value).toEqual([]);
    expect(api.grantsLoaded.value).toBe(false);
    expect(api.grantsLoading.value).toBe(false);
  });

  it("does not replay an in-flight private track after sign-out", async () => {
    const { token, api } = mount();
    const read = api.selectPreset(7);
    await settle();
    token.value = null;
    calls[0]!.resolve(historyBody([point(35.7, 51.4, new Date(NOW - HOUR).toISOString())]));
    await read;
    await settle();
    expect(api.points.value).toEqual([]);
    expect(api.loading.value).toBe(false);
  });

  it("reports a failed session check rather than leaving an unhandled read", async () => {
    const scope = effectScope();
    let api!: ReturnType<typeof useHistoryPlayback>;
    scope.run(() => { api = useHistoryPlayback({
      accessToken: ref("access-token"),
      ensureSession: async () => { throw new Error("refresh unavailable"); }
    }); });
    await expect(api.selectPreset(7)).resolves.toBeUndefined();
    expect(api.loadIssue.value).toBe("request_failed");
    expect(api.loading.value).toBe(false);
    expect(calls).toHaveLength(0);
    scope.stop();
  });

  it("ignores a history reply after its view is disposed", async () => {
    const { api, scope } = mount();
    const read = api.selectPreset(7);
    await settle();
    scope.stop();
    calls[0]!.resolve(historyBody([point(35.7, 51.4, new Date(NOW - HOUR).toISOString())]));
    await read;
    expect(api.points.value).toEqual([]);
  });

  it("does not impose a span limit of its own", async () => {
    const { api } = mount();
    autoRespond = () => historyBody([]);
    await api.setManualRange("2025-01-01T00:00", "2026-10-21T12:00");
    await settle();
    expect(api.windowIssue.value).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("the two sources", () => {
  it("reads a grant through the shared route with no query at all", async () => {
    const { api } = mount();
    autoRespond = (url) =>
      url.includes("/shares") ? { owned: [], sharedWithMe: [grantRow("c")] } : historyBody([]);
    api.selectSource("grant");
    await settle();
    expect(calls[0]!.url).toContain("/api/_user/location/history/shares");
    const id = grantRow("c").id;
    api.selectGrant(id);
    await settle();
    await settle();
    const url = new URL(calls[1]!.url, "http://localhost");
    expect(url.pathname).toBe(`/api/_user/location/history/shared/${id}`);
    expect(url.search).toBe("");
  });

  it("asks for a grant instead of guessing one", async () => {
    const { api } = mount();
    api.selectSource("grant");
    await settle();
    expect(api.loadIssue.value).toBe("grant_required");
    expect(HISTORY_LOAD_ISSUE_COPY.grant_required).toBeTruthy();
    expect(calls.filter((call) => call.url.includes("/shared/"))).toEqual([]);
  });

  it("reports a vanished grant and a broken network differently", async () => {
    const { api } = mount();
    autoRespond = (url) =>
      url.includes("/shares")
        ? { owned: [], sharedWithMe: [grantRow("c")] }
        : {
            __status: 404,
            __body: { code: "SHARE_NOT_FOUND", message: "The requested share does not exist.", issues: [] }
          };
    api.selectSource("grant");
    await settle();
    api.selectGrant(grantRow("c").id);
    await settle();
    expect(api.loadIssue.value).toBe("grant_gone");
    expect(HISTORY_LOAD_ISSUE_COPY.grant_gone).toContain("اشتراک");

    autoRespond = (url) =>
      url.includes("/shares") ? { owned: [], sharedWithMe: [grantRow("c")] } : { __status: 500, __body: { code: "INTERNAL", message: "boom", issues: [] } };
    await api.load();
    await settle();
    expect(api.loadIssue.value).toBe("request_failed");
    expect(api.failed.value).toBe(true);
  });

  it("keeps a grant list it already had when a refresh fails", async () => {
    const { api } = mount();
    autoRespond = () => ({ owned: [], sharedWithMe: [grantRow("c")] });
    await api.loadShares();
    await settle();
    expect(api.grants.value).toHaveLength(1);
    autoRespond = null;
    globalThis.fetch = vi.fn(async () => jsonResponse({ code: "INTERNAL", message: "boom", issues: [] }, 500)) as unknown as typeof fetch;
    await api.loadShares();
    await settle();
    expect(api.grants.value).toHaveLength(1);
    expect(api.grantsFailed.value).toBe(true);
  });
});

describe("loading without a session", () => {
  it("names the missing token instead of sending an unauthenticated request", async () => {
    const { token, api } = mount();
    token.value = null;
    await api.load();
    await settle();
    expect(calls).toEqual([]);
    expect(api.loadIssue.value).toBe("no_token");
  });
});

describe("the transport loop", () => {
  async function loaded(count = 5) {
    const { api } = mount();
    autoRespond = () =>
      historyBody(
        Array.from({ length: count }, (_unused, index) => point(35 + index / 100, 51 + index / 100, new Date(NOW - (count - index) * HOUR).toISOString()))
      );
    await api.selectPreset(7);
    await settle();
    return api;
  }

  it("advances the cursor by elapsed time times the speed and stops at the end", async () => {
    const api = await loaded();
    const start = api.cursorMs.value;
    expect(start).toBe(NOW - 5 * HOUR);
    api.play();
    expect(api.playing.value).toBe(true);
    await vi.advanceTimersByTimeAsync(PLAYBACK_TICK_MS * 2);
    expect(api.cursorMs.value).toBe(start + PLAYBACK_TICK_MS * 2 * DEFAULT_PLAYBACK_SPEED);
    expect(api.progress.value).toBeGreaterThan(0);
    expect(api.progress.value).toBeLessThan(1);

    // Five hourly fixes ending at `NOW - 1h`: the cursor has to stop on the *last recorded* instant,
    // not on the wall clock, or the trace would keep playing into a stretch nobody walked.
    await vi.advanceTimersByTimeAsync(5 * HOUR);
    expect(api.cursorMs.value).toBe(NOW - HOUR);
    expect(api.playing.value).toBe(false);
    expect(api.progress.value).toBe(1);
  });

  it("stops charging time while paused", async () => {
    const api = await loaded();
    api.play();
    await vi.advanceTimersByTimeAsync(PLAYBACK_TICK_MS);
    const at = api.cursorMs.value;
    api.pause();
    await vi.advanceTimersByTimeAsync(PLAYBACK_TICK_MS * 20);
    expect(api.cursorMs.value).toBe(at);
    expect(api.playing.value).toBe(false);
  });

  it("gives a throttled tab back its place, not the end of the track", async () => {
    const api = await loaded();
    api.play();
    // The interval fires once after a long stall; without the clamp that single tick would carry five
    // seconds of wall time and the user would come back to a playback that had already finished.
    vi.setSystemTime(NOW + 5000);
    await vi.advanceTimersByTimeAsync(PLAYBACK_TICK_MS);
    expect(api.cursorMs.value).toBe(NOW - 5 * HOUR + PLAYBACK_MAX_TICK_DELTA_MS * DEFAULT_PLAYBACK_SPEED);
  });

  it("rewinds when play is pressed at the end", async () => {
    const api = await loaded();
    api.seekProgress(1);
    expect(api.progress.value).toBe(1);
    api.play();
    await vi.advanceTimersByTimeAsync(PLAYBACK_TICK_MS);
    expect(api.cursorMs.value).toBeGreaterThan(NOW - 5 * HOUR);
    expect(api.playing.value).toBe(true);
  });

  it("does not start a loop for a track that cannot move", async () => {
    const api = await loaded(1);
    expect(api.canPlay.value).toBe(false);
    api.play();
    expect(api.playing.value).toBe(false);
    expect(api.cursorMs.value).toBe(NOW - HOUR);
  });

  it("clears the interval when the view goes away", async () => {
    const { scope, api } = mount();
    autoRespond = () => historyBody([point(35, 51, new Date(NOW - 3 * HOUR).toISOString()), point(36, 52, new Date(NOW - HOUR).toISOString())]);
    await api.selectPreset(1);
    await settle();
    api.play();
    scope.stop();
    const at = api.cursorMs.value;
    await vi.advanceTimersByTimeAsync(PLAYBACK_TICK_MS * 10);
    expect(api.cursorMs.value).toBe(at);
    expect(api.playing.value).toBe(false);
  });
});

describe("stepping and seeking", () => {
  async function loaded() {
    const { api } = mount();
    // `totalPoints` of 9 against 3 points: the sampling caption needs the composable to keep both
    // numbers apart, and a fixture where they were equal would pass without ever proving it.
    autoRespond = () =>
      historyBody(
        [
          point(35, 51, new Date(NOW - 3 * HOUR).toISOString()),
          point(36, 52, new Date(NOW - 2 * HOUR).toISOString()),
          point(37, 53, new Date(NOW - HOUR).toISOString())
        ],
        9
      );
    await api.selectPreset(1);
    await settle();
    return api;
  }

  it("walks recorded positions and pauses while doing so", async () => {
    const api = await loaded();
    api.play();
    await vi.advanceTimersByTimeAsync(PLAYBACK_TICK_MS);
    api.stepNext();
    expect(api.playing.value).toBe(false);
    expect(api.cursorMs.value).toBe(NOW - 2 * HOUR);
    api.stepNext();
    expect(api.cursorMs.value).toBe(NOW - HOUR);
    api.stepNext();
    expect(api.cursorMs.value).toBe(NOW - HOUR);
    api.stepPrevious();
    expect(api.cursorMs.value).toBe(NOW - 2 * HOUR);
  });

  it("seeks by progress and clamps outside 0..1", async () => {
    const api = await loaded();
    api.seekProgress(0.5);
    expect(api.cursorMs.value).toBe(NOW - 2 * HOUR);
    api.seekProgress(2);
    expect(api.cursorMs.value).toBe(NOW - HOUR);
    api.seekProgress(-1);
    expect(api.cursorMs.value).toBe(NOW - 3 * HOUR);
    expect(api.progress.value).toBe(0);
  });

  it("falls back to normal speed for a control that produced a non-positive value", async () => {
    const api = await loaded();
    api.setSpeed(0);
    expect(api.speed.value).toBe(DEFAULT_PLAYBACK_SPEED);
    api.setSpeed(4);
    expect(api.speed.value).toBe(4);
  });

  it("tells a sampled view from the complete record", async () => {
    const api = await loaded();
    expect(api.sampling.value).toEqual({ sampled: true, ratio: 3 / 9 });
    expect(api.points.value.length).toBe(3);
    expect(api.totalPoints.value).toBe(9);
  });
});

describe("reloading a track", () => {
  it("drops the cursor on the first point of the new window", async () => {
    const { api } = mount();
    autoRespond = () =>
      historyBody([
        point(35, 51, new Date(NOW - 2 * HOUR).toISOString()),
        point(36, 52, new Date(NOW - HOUR).toISOString())
      ]);
    await api.selectPreset(1);
    await settle();
    api.seekProgress(1);
    expect(api.cursorMs.value).toBe(NOW - HOUR);
    api.play();

    autoRespond = () => historyBody([point(37, 53, new Date(NOW - 6 * HOUR).toISOString())]);
    await api.selectPreset(7);
    await settle();
    expect(api.playing.value).toBe(false);
    expect(api.cursorMs.value).toBe(NOW - 6 * HOUR);
  });

  it("keeps the newer response when an older request answers last", async () => {
    const { api } = mount();
    autoRespond = null;
    const first = api.selectPreset(1);
    await nextTick();
    const second = api.selectPreset(7);
    await nextTick();
    expect(calls).toHaveLength(2);
    calls[1]!.resolve(historyBody([point(37, 53, new Date(NOW - HOUR).toISOString())], 1));
    await second;
    await settle();
    expect(api.points.value[0]!.lat).toBe(37);
    expect(api.loading.value).toBe(false);

    calls[0]!.resolve(historyBody([point(35, 51, new Date(NOW - 20 * HOUR).toISOString())], 1));
    await first;
    await settle();
    expect(api.points.value[0]!.lat).toBe(37);
    expect(api.cursorMs.value).toBe(NOW - HOUR);
  });

  it("leaves an empty window as no track and no error", async () => {
    const { api } = mount();
    autoRespond = () => historyBody([]);
    await api.selectPreset(1);
    await settle();
    expect(api.hasTrack.value).toBe(false);
    expect(api.failed.value).toBe(false);
    expect(api.loadIssue.value).toBeNull();
    expect(api.bounds.value).toBeNull();
  });

  it("re-reads companion grants on re-entering grant mode and evicts a revoked active grant on refresh", async () => {
    const { api } = mount();
    autoRespond = () => ({ owned: [], sharedWithMe: [] });
    api.selectSource("grant");
    await settle();
    expect(api.grants.value).toHaveLength(0);

    // Companion creates a share while the viewer switched back to own history.
    api.selectSource("own");
    await settle();
    autoRespond = (url) =>
      url.includes("/shares")
        ? { owned: [], sharedWithMe: [grantRow("c")] }
        : historyBody([point(35.71, 51.41, new Date(NOW - HOUR).toISOString())]);
    api.selectSource("grant");
    await settle();
    expect(api.grants.value).toHaveLength(1);

    api.selectGrant(grantRow("c").id);
    await settle();
    expect(api.hasTrack.value).toBe(true);

    // Companion revokes the grant; refreshing the list evicts the stale track immediately.
    autoRespond = () => ({ owned: [], sharedWithMe: [] });
    await api.loadShares();
    await settle();
    expect(api.grants.value).toHaveLength(0);
    expect(api.grantId.value).toBe("");
    expect(api.hasTrack.value).toBe(false);
    expect(api.loadIssue.value).toBe("grant_gone");

    const panelSource = readFileSync(new URL("../components/map/HistoryPlaybackPanel.vue", import.meta.url), "utf8");
    expect(panelSource).toContain("api.loadShares()");
    expect(panelSource).toContain("v-else-if=\"api.grantsFailed.value\"");
  });
});
