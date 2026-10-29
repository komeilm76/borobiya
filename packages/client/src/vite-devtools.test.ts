import { fileURLToPath } from "node:url";
import { loadConfigFromFile, type ConfigEnv, type Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";

const configPath = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
const originalVitest = process.env.VITEST;

afterEach(() => {
  if (originalVitest === undefined) delete process.env.VITEST;
  else process.env.VITEST = originalVitest;
});

async function pluginNames(env: ConfigEnv) {
  const result = await loadConfigFromFile(env, configPath);
  if (!result) throw new Error("Client Vite config not found");
  const plugins = (result.config.plugins ?? []) as unknown[];
  return plugins.flat(Infinity).filter(Boolean).map((plugin) => (plugin as Plugin).name);
}

describe("Vue DevTools Vite integration", () => {
  it("loads only in the development server, not build, preview, or Vitest", async () => {
    delete process.env.VITEST;
    const dev = await pluginNames({ command: "serve", mode: "development", isPreview: false });
    expect(dev).toContain("vite-plugin-vue-devtools");

    const build = await pluginNames({ command: "build", mode: "production" });
    expect(build).not.toContain("vite-plugin-vue-devtools");

    // Vite uses command: "serve" for preview too, so command alone is insufficient.
    const preview = await pluginNames({ command: "serve", mode: "production", isPreview: true });
    expect(preview).not.toContain("vite-plugin-vue-devtools");

    process.env.VITEST = "true";
    const tests = await pluginNames({ command: "serve", mode: "test", isPreview: false });
    expect(tests).not.toContain("vite-plugin-vue-devtools");
  });
});
