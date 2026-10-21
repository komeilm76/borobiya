import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpenApiDocument(value: unknown): value is OpenApiDocument {
  return isRecord(value) && typeof value.openapi === "string" && isRecord(value.paths);
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specUrl = new URL(process.env.API_OPENAPI_URL ?? "http://localhost:3000/docs/json");
if (specUrl.protocol !== "http:" && specUrl.protocol !== "https:") {
  throw new Error("API_OPENAPI_URL must use HTTP or HTTPS.");
}
const specUrlLabel = `${specUrl.origin}${specUrl.pathname}`;
const outputDirectory = resolve(packageRoot, process.env.ZOPIA_OUTPUT_DIR ?? "src/generated/api");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "borobiya-openapi-"));

try {
  const response = await fetch(specUrl);
  if (!response.ok) {
    throw new Error(`OpenAPI request failed with HTTP ${response.status} (${specUrlLabel}).`);
  }

  const document: unknown = await response.json();
  if (!isOpenApiDocument(document)) {
    throw new Error(`The endpoint did not return an OpenAPI document with a paths object (${specUrlLabel}).`);
  }

  const specFile = join(temporaryDirectory, "openapi.json");
  await writeFile(specFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  console.log(`Generating client API files in ${outputDirectory}...`);
  const result = spawnSync(
    process.execPath,
    ["x", "zopia", "generate", specFile, outputDirectory, "--mode", "directory"],
    { cwd: packageRoot, stdio: "inherit" }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    console.log("Zopia API generation completed.");
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
