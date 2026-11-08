import { defineConfig } from "@playwright/test";
import { e2eTarget } from "./e2e/target";

// Existing dedicated VM only: never silently start a server or run against a default URL.
const target = e2eTarget(process.env);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts", // Vitest deliberately does not discover these browser tests.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  outputDir: "./node_modules/.e2e-results",
  use: {
    baseURL: target.baseURL,
    ignoreHTTPSErrors: target.ignoreHTTPSErrors,
    viewport: { width: 1280, height: 800 },
    // Login creates a session: don't retain screenshots, video, traces, or browser state on disk.
    screenshot: "off",
    video: "off",
    trace: "off"
  }
});
