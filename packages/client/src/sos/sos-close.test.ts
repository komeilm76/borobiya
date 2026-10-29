import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldResetSosOnClose } from "./sos-form";

// Keep the close policy testable without mounting a Vue SFC (repository convention).
const sheet = readFileSync(new URL("../components/sos/SosRequestSheet.vue", import.meta.url), "utf8");

describe("SOS sheet close policy", () => {
  it("discards an unsent draft and a finished/cancelled SOS, but preserves a committed photo retry", () => {
    const state = { createdRequestId: null as string | null, isCompleted: false, cancelled: false };
    expect(shouldResetSosOnClose(state)).toBe(true); // Cancel or X before submitting.
    expect(shouldResetSosOnClose({ ...state, createdRequestId: "request-id", isCompleted: true })).toBe(true);
    expect(shouldResetSosOnClose({ ...state, createdRequestId: "request-id", cancelled: true })).toBe(true);
    expect(shouldResetSosOnClose({ ...state, createdRequestId: "request-id" })).toBe(false);
  });

  it("routes button Cancel, top close and sheet dismissal through the same reset-on-close watcher", () => {
    expect(sheet).toContain('@click="close"');
    expect(sheet).toContain('@update:model-value="onVisibility"');
    expect(sheet).toContain('() => props.modelValue,');
    expect(sheet).toContain('shouldResetSosOnClose({');
    expect(sheet).toMatch(/shouldResetSosOnClose\(\{[\s\S]*?\}\)\) \{\s*sos\.reset\(\);\s*cancellation\.reset\(\);/);
  });
});
