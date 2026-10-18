import { apiRoutes } from "@borobiya/shared/api";
import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config/env";
import { registerHttpSecurityPlugins } from "./plugins/security";
import { registerSwagger } from "./plugins/swagger";

const sensitiveLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.cookies.refreshToken",
  "req.body.password",
  "req.body.confirmPassword",
  "req.body.newPassword",
  "req.body.answer",
  "req.body.securityQuestions[*].answer",
  "req.body.answers[*].answer",
  "req.body.refreshToken",
  "req.body.resetToken"
];

export async function createFastifyApp(config: ServerConfig): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.trustedProxyIps.length > 0 ? config.trustedProxyIps : false,
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info",
      redact: { paths: sensitiveLogPaths, censor: "[REDACTED]" }
    }
  });

  await registerHttpSecurityPlugins(app, config);
  await registerSwagger(app, config.openApiServerPath);

  app.get(apiRoutes.public.health.url, async () => ({
    status: "ok" as const,
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? "0.1.0"
  }));

  return app;
}
