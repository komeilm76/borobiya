// The image copies this directory file by file, so a module that exists, type-checks, and passes its tests
// still produces `Cannot find module` at container start if the Dockerfile was not updated. Nothing else in
// the repository notices: the compose healthcheck only fails, and the operator sees a service that never
// comes up. This test closes that gap by walking the runtime imports itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const dockerfile = readFileSync(join(here, "Dockerfile"), "utf8");
const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8");

function copiedFiles() {
  const names = new Set();
  for (const line of dockerfile.split("\n")) {
    const match = /^COPY\s+(?:--from=\S+\s+)?(.+?)\s+\.\/\s*$/.exec(line.trim());
    if (!match) continue;
    for (const token of match[1].trim().split(/\s+/)) names.add(token);
  }
  return names;
}

// Every relative "./x.mjs" the entrypoint can reach, transitively, read as text (no import() — the point is
// to catch a file the image does not contain, which importing would fail on anyway).
function reachableModules(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    const source = readFileSync(join(here, current), "utf8");
    for (const match of source.matchAll(/from\s+"\.\/([^"]+)"/g)) queue.push(match[1]);
  }
  return seen;
}

test("the image copies every module the runtime imports, transitively", () => {
  const entry = /CMD\s*\[\s*"bun",\s*"([^"]+)"/.exec(dockerfile)[1];
  const copied = copiedFiles();
  for (const module of reachableModules(entry)) {
    assert.ok(copied.has(module), `${module} is imported by the entrypoint but is not in the Dockerfile COPY list`);
  }
});

test("every file the Dockerfile copies exists in this directory", () => {
  for (const name of copiedFiles()) {
    assert.ok(readFileSync(join(here, name), "utf8").length > 0, `${name} is copied but missing or empty`);
  }
});

test("the build context is this directory, so the bare COPY names resolve", () => {
  const service = /^ {2}routing-gateway:\n(?: {4}.*\n)*/m.exec(compose)?.[0] ?? "";
  assert.match(service, /context:\s*\.\/map-server\/routing-gateway\s*$/m,
    "compose must build the gateway from its own directory for the per-file COPY list to work");
});
