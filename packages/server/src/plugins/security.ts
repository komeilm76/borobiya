import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "../config/env";

/** Register baseline HTTP hardening; auth handlers may add stricter route-specific limits. */
export async function registerHttpSecurityPlugins(
  app: FastifyInstance,
  config: ServerConfig
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"]
      }
    },
    frameguard: { action: "deny" }
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Native clients and command-line tools may omit Origin; browsers must match the allowlist.
      callback(null, origin === undefined || config.corsOrigins.includes(origin));
    },
    credentials: true
  });

  // One default for every response the API sends, including the ones that never reach a handler: a
  // throttled 429 and Fastify's own 404 for an unknown path. Without it the header depends on 39 route
  // files each remembering to set it, and the responses most worth not caching are the ones no handler
  // ever saw. An explicit `cache-control` from the handler still wins, which is what keeps the public
  // security-question catalog the one cacheable response in the API.
  app.addHook("onSend", async (_request, reply, payload) => {
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
    return payload;
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: true,
      code: "RATE_LIMITED",
      message: `Too many requests. Retry in ${context.after}.`,
      issues: []
    })
  });
}
