import { idSchema } from "@shared/index";
import { apiBasePath } from "./http";

/** SSE over authenticated fetch: never put bearer credentials in a URL or EventSource query. */
export async function followMissionTimelineEvents(token: string, missionId: string, signal: AbortSignal,
  onRefresh: () => void): Promise<void> {
  const id = idSchema.parse(missionId);
  const response = await fetch(`${apiBasePath()}/_user/sos/missions/${encodeURIComponent(id)}/timeline/events`, {
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
    credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", signal
  });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    throw new Error("MISSION_STREAM_UNAVAILABLE");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll("\r\n", "\n");
      if (buffer.length > 8192) throw new Error("INVALID_MISSION_STREAM");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.startsWith(":")) continue;
        const lines = frame.split("\n");
        if (lines[0] !== "event: refresh" || lines.length !== 2 || !lines[1]?.startsWith("data: ")) continue;
        let payload: unknown;
        try { payload = JSON.parse(lines[1].slice(6)); } catch { continue; }
        if (payload && typeof payload === "object" && "missionId" in payload && payload.missionId === id && !signal.aborted) {
          onRefresh(); // notice only: always reread the scoped HTTP timeline
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
