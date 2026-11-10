import { idSchema } from "@shared/index";
import { apiBasePath } from "./http";

/** SSE over authenticated fetch: never put bearer credentials in a URL or EventSource query. */
export async function followMissionTimelineEvents(token: string, missionId: string, signal: AbortSignal,
  onRefresh: () => void): Promise<void> {
  const id = idSchema.parse(missionId);
  if (signal.aborted) throw new DOMException("Mission stream cancelled", "AbortError");
  // Fetch can hang before headers (e.g. a proxy accepts the connection but never
  // responds). Abort the actual request and race even a transport that ignores abort.
  const request = new AbortController();
  let rejectPending: ((reason: Error) => void) | null = null;
  const onAbort = () => {
    // Abort the reader as well as fetch. Some fetch/stream adapters ignore the
    // request signal once headers arrive and leave reader.read() pending forever.
    rejectPending?.(new DOMException("Mission stream cancelled", "AbortError"));
    request.abort();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let response: Response;
    try {
      const connectionDeadline = new Promise<never>((_, reject) => {
        rejectPending = reject;
        connectTimer = setTimeout(() => {
          reject(new Error("MISSION_STREAM_CONNECT_TIMEOUT"));
          request.abort();
        }, 12_000);
      });
      // Cover a caller abort between the initial check and listener registration,
      // or one fired synchronously by an injected fetch before it returns a promise.
      if (signal.aborted) onAbort();
      response = await Promise.race([
        fetch(`${apiBasePath()}/_user/sos/missions/${encodeURIComponent(id)}/timeline/events`, {
          headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
          credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store",
          signal: request.signal
        }),
        connectionDeadline
      ]);
    } finally {
      if (connectTimer !== null) clearTimeout(connectTimer);
      rejectPending = null;
    }
    if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
      throw new Error("MISSION_STREAM_UNAVAILABLE");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // The server sends a refresh or keepalive every ~15 seconds. A proxy that
    // silently stalls an open response must not leave the UI claiming live updates
    // forever. The caller reports a transport failure and reconnects on rejection.
    async function readWithDeadline(): Promise<ReadableStreamReadResult<Uint8Array>> {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            rejectPending = reject;
            // The caller may have aborted between the loop check and this read.
            if (signal.aborted) reject(new DOMException("Mission stream cancelled", "AbortError"));
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("MISSION_STREAM_STALLED")), 45_000);
          })
        ]);
      } finally {
        rejectPending = null;
        if (timer !== null) clearTimeout(timer);
      }
    }
    try {
      while (!signal.aborted) {
        const { done, value } = await readWithDeadline();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll("\r\n", "\n");
        let boundary: number;
        let refreshNeeded = false;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          // Bound each frame, not the entire network chunk: a paused tab can receive
          // many small, valid notices at once without making one oversized SSE event.
          if (frame.length > 8192) throw new Error("INVALID_MISSION_STREAM");
          if (frame.startsWith(":")) continue;
          const lines = frame.split("\n");
          if (lines[0] !== "event: refresh" || lines.length !== 2 || !lines[1]?.startsWith("data: ")) continue;
          let payload: unknown;
          try { payload = JSON.parse(lines[1].slice(6)); } catch { continue; }
          if (payload && typeof payload === "object" && "missionId" in payload && payload.missionId === id) {
            refreshNeeded = true;
          }
        }
        if (buffer.length > 8192) throw new Error("INVALID_MISSION_STREAM");
        // A burst of invalidations names the same authoritative timeline. One scoped
        // HTTP re-read per received chunk is enough; never stampede it per frame.
        if (refreshNeeded && !signal.aborted) onRefresh();
      }
    } finally {
      request.abort();
      // Cancel is best-effort. A broken stream can leave the underlying cancel()
      // promise pending forever; awaiting it would block the error/reconnect path.
      void reader.cancel().catch(() => {});
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    request.abort();
  }
}
