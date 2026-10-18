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
