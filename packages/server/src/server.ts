import { createFastifyApp } from "./app";
import { parseServerEnv } from "./config/env";

export async function startServer() {
  const config = parseServerEnv();
  const app = await createFastifyApp(config);

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
