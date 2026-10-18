import { createFastifyApp } from "./app";
import { parseServerEnv } from "./config/env";

export async function startServer() {
  const config = parseServerEnv();
  const app = await createFastifyApp(config);
  const address = await app.listen({ host: config.host, port: config.port });
  app.log.info({ address }, "Borobiya API listening");
  return app;
}

void startServer().catch((error: unknown) => {
  // parseServerEnv reports issue paths/messages only; no secret values are logged.
  console.error("Borobiya API startup failed.", error);
  process.exitCode = 1;
});
