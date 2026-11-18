import postgres from "postgres";
import { createFastifyApp } from "./app";
import { parseServerEnv } from "./config/env";
import { safeMigrationErrorDetails } from "./db/migration-error";
import { checkSchemaReadiness, schemaReadinessMessage } from "./db/schema-readiness";

export async function startServer() {
  const config = parseServerEnv();
  // Check the *same* DATABASE_URL this process will use before exposing healthy
  // HTTP. Do not run migrations at startup: the operator must apply/review them.
  const probe = postgres(config.databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const state = await checkSchemaReadiness(async (sql) => await probe.unsafe(sql));
    if (!state.ready) throw new Error(schemaReadinessMessage(state));
  } catch (error) {
    if (error instanceof Error && /^(Database schema is behind|Database journal claims)/.test(error.message)) throw error;
    const details = safeMigrationErrorDetails(error, config.databaseUrl);
    throw new Error(`Database schema preflight failed: ${details.join("; ") || "Check database connectivity."}`);
  } finally {
    await probe.end();
  }
  const app = await createFastifyApp(config, { startMaintenanceJobs: true });

  // Docker and other process supervisors stop containers with SIGTERM. Close
  // Fastify explicitly so its onClose hooks can end the Postgres pool.
  // The cleanup hook must be registered before listen(); Fastify rejects
  // addHook() calls on an already-listening instance.
  const shutdown = (signal: "SIGINT" | "SIGTERM") => {
    app.log.info({ signal }, "Shutting down Borobiya API");
    void app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("Borobiya API shutdown failed.", error);
        process.exit(1);
      }
    );
  };
  const onSigint = () => shutdown("SIGINT");
  const onSigterm = () => shutdown("SIGTERM");
  app.addHook("onClose", async () => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  });

  let address: string;
  try {
    address = await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    // Do not leave plugins or the database pool open if binding the port fails.
    await app.close().catch(() => undefined);
    if ((error as NodeJS.ErrnoException | null)?.code === "EADDRINUSE") {
      // Under `bun --watch` this failure otherwise looks deceptively alive:
      // the watcher keeps waiting while some other process (usually the
      // Docker `api` container) silently serves the port with stale code.
      console.error(
        `Port ${config.port} is already in use. If the Docker \`api\` service is running, ` +
        "stop it (`docker compose stop api`) before `bun run dev`, or set a different PORT."
      );
    }
    throw error;
  }
  app.log.info({ address }, "Borobiya API listening");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  return app;
}

void startServer().catch((error: unknown) => {
  // parseServerEnv reports issue paths/messages only; no secret values are logged.
  console.error("Borobiya API startup failed.", error);
  process.exitCode = 1;
});
