import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned: the repository does not mount Vue SFCs in unit tests.
const incidents = readFileSync(new URL("./AdminIncidentsView.vue", import.meta.url), "utf8");
const services = readFileSync(new URL("./AdminServiceGroupsView.vue", import.meta.url), "utf8");

function block(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = source.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("catalog screens and the network", () => {
  it("gives the incidents list an offline face of its own", () => {
    expect(incidents).toContain('import { useOnlineStatus } from "../../composables/online-status";');
    expect(incidents).toContain("const listOffline = ref(false);");
    expect(incidents).toContain("listError.value, listOffline.value");
    // Recorded where the read failed: the panel cannot tell "no internet" from a 500 by reading the message.
    expect(incidents).toContain('listOffline.value = typeof navigator !== "undefined" && navigator.onLine === false;');
    // Hand-formatted markup puts the attribute on the next line; pin the single-line fragment only.
    expect(incidents).toContain('v-else-if="listState === \'offline\'"');
    expect(incidents).toContain('state="offline"');
    // The verdict dies with the message it describes.
    expect(incidents).toContain('listError.value = "";\n  listOffline.value = false;');
  });

  it("retries the incidents list by itself when the connection returns", () => {
    const retry = block(incidents, "function retryWhenBackOnline(): void {", "\n}");
    expect(retry).toContain("if (!listOffline.value) return;");
    expect(retry).toContain("void load();");
    expect(incidents).toContain('window.addEventListener("online", retryWhenBackOnline);');
    expect(incidents).toContain('window.removeEventListener("online", retryWhenBackOnline);');
  });

  it("orders the services state machine so a 403 outranks a network guess", () => {
    expect(services).toContain("const { isOnline } = useOnlineStatus();");
    const machine = block(services, "const state = computed(() => {", "});");
    expect(machine).toContain('if (forbidden.value) return "forbidden" as const;');
    expect(machine).toContain('if (error.value && offline.value) return "offline" as const;');
    expect(machine).toContain('if (error.value) return "error" as const;');
    expect(machine.indexOf("forbidden")).toBeLessThan(machine.indexOf("offline"));
    expect(machine.indexOf("offline")).toBeLessThan(machine.indexOf('return "error"'));
    expect(services).toContain("offline.value = navigator.onLine === false;");
  });

  it("re-reads the services list only for a failure the network caused", () => {
    const watcher = block(services, "watch(isOnline, (online) => {", "});");
    expect(watcher).toContain("if (!online || !offline.value) return;");
    expect(watcher).toContain("void loadGroups();");
    // A retry clears the verdict; otherwise the panel would keep saying "offline" while it is loading.
    expect(services).toContain("forbidden.value = false;\n  offline.value = false;");
  });
});
