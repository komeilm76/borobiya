import { apiRoutes } from "@shared/api";
import { userSyncResponseSchema, type UserSyncResponse } from "@shared/index";
import { requestJson } from "./http";

/** Reconcile only durable, participant-scoped mission state; GPS is never replayed. */
export async function readUserSync(token: string, since: string, cursor?: string, signal?: AbortSignal): Promise<UserSyncResponse> {
  const route = apiRoutes.sos.sync;
  const input = route.schema.query.parse({ since, ...(cursor ? { cursor } : {}) });
  const params = new URLSearchParams({ since: input.since });
  if (input.cursor) params.set("cursor", input.cursor);
  return userSyncResponseSchema.parse(await requestJson<unknown>(`${route.url}?${params}`, { accessToken: token, signal }));
}

/** A bounded cursor walk. Never report a partial replay as complete. */
export async function readAllUserSync(token: string, since: string, signal?: AbortSignal,
  read = readUserSync): Promise<UserSyncResponse> {
  let cursor: string | undefined;
  const visited = new Set<string>();
  const events: UserSyncResponse["events"] = [];
  const seen = new Set<string>();
  let snapshot: UserSyncResponse | null = null;
  for (let page = 0; page < 20; page++) {
    if (signal?.aborted) throw new Error("SYNC_ABORTED");
    const next = await read(token, since, cursor, signal);
    if (signal?.aborted) throw new Error("SYNC_ABORTED");
    snapshot = next;
    for (const event of next.events) if (!seen.has(event.id)) {
      seen.add(event.id); events.push(event);
    }
    if (!next.nextCursor) return { ...next, events };
    if (visited.has(next.nextCursor)) throw new Error("SYNC_CURSOR_LOOP");
    visited.add(next.nextCursor);
    cursor = next.nextCursor;
  }
  throw new Error("SYNC_TOO_MANY_PAGES");
}
