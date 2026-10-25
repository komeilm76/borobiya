import { apiRoutes } from "@borobiya/shared/api";
import type { FastifyInstance } from "fastify";
import { SYNC_MAX_AGE_MS, type SyncStore } from "../db/sync-store";

/** HTTP reconciliation behind the ordinary /_user live-session guard. A reconnect is not authority. */
export async function registerUserSyncRoute(app: FastifyInstance, store: SyncStore): Promise<void> {
  const route = apiRoutes.sos.sync;
  app.get(route.url, async (request, reply) => {
    const response = reply.header("cache-control", "no-store");
    const user = request.authenticatedUser;
    if (!user) return response.code(401).send({ error: true, code: "UNAUTHORIZED", message: "Authentication required.", issues: [] });
    if (user.role !== "user") return response.code(403).send({ error: true, code: "FORBIDDEN", message: "User account required.", issues: [] });
    const parsed = route.schema.query.safeParse(request.query);
    const since = parsed.success ? new Date(parsed.data.since) : null;
    const now = Date.now();
    if (!since || !Number.isFinite(since.getTime()) || since.getTime() < now - SYNC_MAX_AGE_MS || since.getTime() > now + 10_000) {
      return response.code(400).send({ error: true, code: "INVALID_SYNC_WINDOW",
        message: "Use a timestamp within the last 30 days; use full reads for older gaps.", issues: [] });
    }
    if (!parsed.success) return response.code(400).send({ error: true, code: "INVALID_SYNC_WINDOW",
      message: "Invalid sync query.", issues: [] });
    const result = await store.readSync({ userId: user.userId, since, cursor: parsed.data.cursor });
    if (result === "invalid_cursor") return response.code(400).send({
      error: true, code: "INVALID_SYNC_CURSOR", message: "Invalid sync cursor.", issues: []
    });
    return response.code(200).send(result);
  });
}
