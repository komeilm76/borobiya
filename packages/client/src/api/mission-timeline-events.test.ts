import { afterEach, describe, expect, it, vi } from "vitest";
import { followMissionTimelineEvents } from "./mission-timeline-events";

const id = "70000000-0000-4000-8000-000000000001";
const other = "70000000-0000-4000-8000-000000000002";
afterEach(() => vi.unstubAllGlobals());

function stream(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    }
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

describe("authenticated mission SSE parser", () => {
  it("uses the same-origin bearer header and handles split CRLF frames, ignoring other missions and comments", async () => {
    const refresh = vi.fn();
    const fetcher = vi.fn(async () => stream([
      `: keepalive\r\n\r\nevent: refresh\r`, `\ndata: {"missionId":"${id}"}\r\n\r\n`,
      `event: refresh\ndata: {"missionId":"${other}"}\n\nevent: refresh\ndata: broken\n\n`
    ]));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    await followMissionTimelineEvents("secret", id, controller.signal, refresh);
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(`/api/_user/sos/missions/${id}/timeline/events`, expect.objectContaining({
      credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal),
      headers: { authorization: "Bearer secret", accept: "text/event-stream" }
    }));
    expect(controller.signal.aborted).toBe(false); // Internal cleanup must not cancel the owner's mission context.
  });
  it("accepts many small valid frames coalesced into one read without stampeding timeline reloads", async () => {
    const refresh = vi.fn();
    const frame = `event: refresh\ndata: {"missionId":"${id}"}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => stream([frame.repeat(150)])));
    await followMissionTimelineEvents("token", id, new AbortController().signal, refresh);
    expect(refresh).toHaveBeenCalledOnce(); // Invalidation, not one HTTP re-read per queued notice.
  });

  it("bounds a connection that never returns SSE headers, even if fetch ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetcher);
      const refresh = vi.fn();
      const follow = followMissionTimelineEvents("token", id, new AbortController().signal, refresh);
      const failure = expect(follow).rejects.toThrow("MISSION_STREAM_CONNECT_TIMEOUT");
      await vi.advanceTimersByTimeAsync(12_000);
      await failure;
      expect((fetcher.mock.calls[0]?.[1].signal as AbortSignal).aborted).toBe(true);
      expect(refresh).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("stops an in-flight SSE connection promptly when the mission is no longer selected", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetcher);
      const controller = new AbortController();
      const follow = followMissionTimelineEvents("token", id, controller.signal, vi.fn());
      const cancelled = expect(follow).rejects.toMatchObject({ name: "AbortError" });
      controller.abort();
      await cancelled;
      expect((fetcher.mock.calls[0]?.[1].signal as AbortSignal).aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("rejects a cancellation fired synchronously by the fetch adapter before it returns", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetcher = vi.fn(() => {
        controller.abort();
        return new Promise<Response>(() => {});
      });
      vi.stubGlobal("fetch", fetcher);
      await expect(followMissionTimelineEvents("token", id, controller.signal, vi.fn()))
        .rejects.toMatchObject({ name: "AbortError" });
      expect(fetcher).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("clears its connection deadline after headers, leaving the stream's own silence clock in charge", async () => {
    vi.useFakeTimers();
    try {
      let resolveHeaders!: (response: Response) => void;
      const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveHeaders = resolve; }));
      vi.stubGlobal("fetch", fetcher);
      const refresh = vi.fn();
      const follow = followMissionTimelineEvents("token", id, new AbortController().signal, refresh);
      await vi.advanceTimersByTimeAsync(10_000);
      resolveHeaders(stream([`event: refresh\ndata: {"missionId":"${id}"}\n\n`]));
      await follow;
      expect(refresh).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(46_000);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("detects a silent open stream after missed keepalives so the fallback can reconnect", async () => {
    vi.useFakeTimers();
    try {
      const cancelled = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode(
          `event: refresh\ndata: {"missionId":"${id}"}\n\n`
        )); },
        cancel: cancelled
      });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
        headers: { "content-type": "text/event-stream" }
      })));
      const refresh = vi.fn();
      const follow = followMissionTimelineEvents("token", id, new AbortController().signal, refresh);
      const failure = expect(follow).rejects.toThrow("MISSION_STREAM_STALLED");
      await vi.advanceTimersByTimeAsync(0);
      expect(refresh).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(45_000);
      await failure;
      expect(cancelled).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("reports a stalled stream even if its underlying cancel never settles", async () => {
    vi.useFakeTimers();
    try {
      const cancelled = vi.fn(() => new Promise<void>(() => {}));
      const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
        headers: { "content-type": "text/event-stream" }
      })));
      let outcome = "pending";
      void followMissionTimelineEvents("token", id, new AbortController().signal, vi.fn())
        .then(() => { outcome = "resolved"; }, (error: Error) => { outcome = error.message; });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(45_000);
      await Promise.resolve();
      expect(cancelled).toHaveBeenCalledOnce();
      expect(outcome).toBe("MISSION_STREAM_STALLED");
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("leaves a stalled body read promptly when the mission is cancelled", async () => {
    vi.useFakeTimers();
    try {
      const cancelled = vi.fn(() => new Promise<void>(() => {}));
      const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
        headers: { "content-type": "text/event-stream" }
      })));
      const controller = new AbortController();
      let outcome = "pending";
      void followMissionTimelineEvents("token", id, controller.signal, vi.fn())
        .then(() => { outcome = "resolved"; }, (error: Error) => { outcome = error.name; });
      await vi.advanceTimersByTimeAsync(0); // Headers have arrived; reader.read is pending.
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(cancelled).toHaveBeenCalledOnce();
      expect(outcome).toBe("AbortError");
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("accepts periodic keepalives instead of timing out an idle but healthy stream", async () => {
    vi.useFakeTimers();
    try {
      let writer!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({ start(controller) { writer = controller; } });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
        headers: { "content-type": "text/event-stream" }
      })));
      const refresh = vi.fn();
      const follow = followMissionTimelineEvents("token", id, new AbortController().signal, refresh);
      await vi.advanceTimersByTimeAsync(0);
      for (let tick = 0; tick < 3; tick++) {
        await vi.advanceTimersByTimeAsync(30_000);
        writer.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        await vi.advanceTimersByTimeAsync(0);
      }
      writer.close();
      await follow;
      expect(refresh).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("rejects non-SSE and oversized frames without calling the refresh handler", async () => {
    const refresh = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(followMissionTimelineEvents("token", id, new AbortController().signal, refresh)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => stream(["event: refresh\ndata: " + "x".repeat(8192)])));
    await expect(followMissionTimelineEvents("token", id, new AbortController().signal, refresh)).rejects.toThrow("INVALID_MISSION_STREAM");
    vi.stubGlobal("fetch", vi.fn(async () => stream(["event: refresh\ndata: " + "x".repeat(8192) + "\n\n"])));
    await expect(followMissionTimelineEvents("token", id, new AbortController().signal, refresh)).rejects.toThrow("INVALID_MISSION_STREAM");
    expect(refresh).not.toHaveBeenCalled();
  });
});
