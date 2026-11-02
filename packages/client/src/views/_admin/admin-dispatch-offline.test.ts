import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned: the repository does not mount Vue SFCs in unit tests.
const dispatch = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const template = dispatch.slice(0, dispatch.indexOf("<script"));

function between(start: string, end: string): string {
  const from = dispatch.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = dispatch.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return dispatch.slice(from, to);
}

describe("admin dispatch board when the connection drops", () => {
  it("reads connectivity from the shared composable, not from a failed request", () => {
    expect(dispatch).toContain('import { useOnlineStatus } from "@/composables/online-status";');
    expect(dispatch).toContain("const { isOnline } = useOnlineStatus();");
  });

  it("warns before it shows the error the outage caused", () => {
    const banner = template.indexOf('      v-if="!isOnline"');
    const genericError = template.indexOf('      v-if="adminSos.errorMessage"');
    expect(banner).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(genericError);
    const markup = template.slice(banner, genericError);
    expect(markup).toContain('type="warning"');
    expect(markup).toContain('icon="mdi-cloud-off-outline"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("@click=\"adminSos.refreshRequests()\"");
  });

  it("blames the network, not the queue, for an empty board while offline", () => {
    const offlineBranch = template.indexOf('adminSos.visibleRequests.length === 0 && !isOnline');
    const unverifiedBranch = template.indexOf("adminSos.visibleRequests.length === 0 && !adminSos.queueVerified");
    expect(offlineBranch).toBeGreaterThan(-1);
    // The unverified copy ("the queue is not confirmed") must not appear when the truth is a dead connection.
    expect(offlineBranch).toBeLessThan(unverifiedBranch);
    expect(template.slice(offlineBranch, unverifiedBranch)).toContain("اتصال قطع است");
  });

  it("re-reads the queue by itself when the browser comes back", () => {
    const watcher = between("watch(isOnline, (online) => {", "});");
    expect(watcher).toContain("if (!online || adminSos.queueVerified) return;");
    expect(watcher).toContain("void adminSos.refreshRequests();");
  });
});
