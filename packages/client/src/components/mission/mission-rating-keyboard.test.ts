import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned only: docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const panel = readFileSync(new URL("./MissionRatingPanel.vue", import.meta.url), "utf8");

describe("mission rating keyboard semantics", () => {
  it("uses one labeled native radio group instead of five independent toggle buttons", () => {
    expect(panel).toContain('<fieldset class="rating__fieldset" :disabled="rating.submitting.value">');
    expect(panel).toContain('<legend class="rating__legend">');
    expect(panel).toContain('<label v-for="value in 5" :key="value" class="rating__choice">');
    expect(panel).toMatch(/<input class="sr-only" type="radio" :name="ratingGroupName" :value="value"[\s\S]*?:checked="rating\.score\.value === value"[\s\S]*?@change="rating\.score\.value = value"/);
    expect(panel).toContain(':aria-label="`${value} از ۵ ستاره`"');
    expect(panel).toContain('const ratingGroupName = useId();');
    expect(panel).not.toContain('role="group" aria-label="انتخاب امتیاز از ۱ تا ۵"');
    expect(panel).not.toContain(':aria-pressed="rating.score.value === value"');
  });

  it("retains readable 48px star targets and a visible keyboard focus indicator", () => {
    expect(panel).toContain('aria-hidden="true"');
    expect(panel).toContain('.rating__choice {');
    expect(panel).toContain('flex: 0 0 48px; width: 48px; height: 48px;');
    expect(panel).toContain('.rating__choice:focus-within { outline: 3px solid');
    expect(panel).toContain('.rating__fieldset:disabled .rating__choice {');
  });
});
