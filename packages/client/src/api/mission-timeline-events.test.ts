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
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: { authorization: "Bearer secret", accept: "text/event-stream" }
    }));
  });
  it("rejects non-SSE and oversized frames without calling the refresh handler", async () => {
    const refresh = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(followMissionTimelineEvents("token", id, new AbortController().signal, refresh)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => stream(["event: refresh\ndata: " + "x".repeat(8192)])));
    await expect(followMissionTimelineEvents("token", id, new AbortController().signal, refresh)).rejects.toThrow("INVALID_MISSION_STREAM");
    expect(refresh).not.toHaveBeenCalled();
  });
});
