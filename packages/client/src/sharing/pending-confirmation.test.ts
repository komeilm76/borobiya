import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-level contracts only: docs/TASKS.md forbids mounting Vue components in unit tests.
const shares = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");
const devices = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");

function dialog(source: string, model: string): string {
  const start = source.indexOf(`<v-dialog v-model="${model}"`);
  expect(start, `dialog ${model}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("</v-dialog>", start);
  expect(end, `closing tag for ${model}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("confirmed privacy/dispatch writes", () => {
  it("does not dismiss the share-revocation confirmation while its server write is pending", () => {
    const revoke = dialog(shares, "confirmOpen");
    expect(revoke).toContain(':persistent="revoking"');
    expect(revoke).toContain(':disabled="revoking" @click="confirmOpen = false"');
    expect(revoke).toContain(':loading="revoking" @click="confirmRevoke"');
    expect(shares).toContain("confirmOpen.value = false;"); // Success/error/session change still closes it.
  });

  it("keeps a partial multi-recipient device change visible until the sweep settles", () => {
    const bulk = dialog(shares, "bulkConfirmOpen");
    expect(bulk).toContain(':persistent="deviceSettings.bulkRunning.value"');
    expect(bulk).toContain(':disabled="deviceSettings.bulkRunning.value" @click="bulkConfirmOpen = false"');
    expect(shares).toContain("bulkConfirmOpen.value = false;");
  });

  it("does not suggest a remote session termination was cancelled by Escape during the DELETE", () => {
    const termination = dialog(devices, "confirmOpen");
    expect(termination).toContain(':persistent="terminating"');
    expect(termination).toContain(':disabled="terminating" @click="confirmOpen = false"');
    expect(devices).toContain('useDeviceTermination({');
  });

  it("keeps the warned manual dispatch confirmation open until its server result arrives", () => {
    const manual = dialog(dispatch, "manualDispatchConfirmation");
    expect(manual).toContain(':persistent="adminSos.dispatchSubmitting"');
    expect(manual).toContain(':disabled="adminSos.dispatchSubmitting" @click="manualDispatchConfirmation = false"');
    expect(manual).toContain(':loading="adminSos.dispatchSubmitting"');
    expect(dispatch).toContain('if (await adminSos.dispatchSelectedResponders()) manualDispatchConfirmation.value = false;');
  });
});
