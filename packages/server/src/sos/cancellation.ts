import { apiRoutes } from "@borobiya/shared/api";
import type { FastifyInstance } from "fastify";
import type { SosCancellationStore } from "../db/sos-cancellation-store";

const error = (code: string, message: string, issues: unknown[] = []) => ({ error: true as const, code, message, issues });

/** Cancel only pending/dispatched SOSes; accepted mission teardown is handled by T3.6.4. */
export async function registerSosCancellationRoutes(app: FastifyInstance, store: SosCancellationStore): Promise<void> {
  const catalog = apiRoutes.sos.listCancellationReasons;
  app.get(catalog.url, async (request, reply) => {
    if (!request.authenticatedUser) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required."));
    const parsed = catalog.schema.querystring.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(error("VALIDATION_ERROR", "Select a cancellation type."));
    return reply.code(200).send(await store.listReasons(parsed.data.type));
  });

  const route = apiRoutes.sos.cancelRequest;
  app.post(route.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required."));
    const params = route.schema.params.safeParse(request.params);
    if (!params.success) return reply.code(404).send(error("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
    const body = route.schema.body.safeParse(request.body);
    if (!body.success) return reply.code(400).send(error("VALIDATION_ERROR", "Select a valid cancellation reason.",
      body.error.issues.map(({ code, message, path }) => ({ code, message, path }))));
    const result = await store.cancelUnaccepted(params.data.id, user.userId, body.data);
    switch (result.status) {
      case "not_found": return reply.code(404).send(error("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
      case "invalid_reason": return reply.code(400).send(error("INVALID_CANCELLATION_REASON", "Select an active requester cancellation reason."));
      case "custom_reason_required": return reply.code(400).send(error("CUSTOM_REASON_REQUIRED", "Explain your reason in 10–200 characters."));
      case "custom_reason_not_allowed": return reply.code(400).send(error("CUSTOM_REASON_NOT_ALLOWED", "Only the Other reason accepts a written explanation."));
      case "already_in_progress": return reply.code(409).send(error("SOS_ALREADY_IN_PROGRESS", "This SOS has an active or completed mission. Refresh its status before cancelling."));
      case "cancelled":
      case "unchanged": return reply.code(200).send();
    }
  });
}
