import { describe, expect, it } from "vitest";
import { historyWindowPreview } from "./history-window-presentation";

describe("shared history window preview", () => {
  it("shows the exact preset instants and their duration in the selected local timezone", () => {
    const window = { from: "2026-10-23T06:00:00.000Z", to: "2026-10-23T12:00:00.000Z" };
    const preview = historyWindowPreview(window, Date.parse(window.to), "Europe/Helsinki");
    const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-gregory", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Helsinki"
    });
    expect(preview).toEqual({
      fromLabel: formatter.format(new Date(window.from)),
      toLabel: formatter.format(new Date(window.to)),
      durationMinutes: 360,
      includesFuture: false
    });
  });

  it("distinguishes both repeated DST hours even when local inputs cannot", () => {
    const first = historyWindowPreview({ from: "2026-10-25T00:30:00.000Z", to: "2026-10-25T01:30:00.000Z" },
      Date.parse("2026-10-26T00:00:00.000Z"), "Europe/Helsinki");
    expect(first?.durationMinutes).toBe(60);
    expect(first?.fromLabel).toContain("GMT+3");
    expect(first?.toLabel).toContain("GMT+2");
    expect(first?.fromLabel).not.toBe(first?.toLabel);
  });

  it("signals a future endpoint and refuses invalid or reversed ranges", () => {
    const now = Date.parse("2026-10-23T12:00:00.000Z");
    expect(historyWindowPreview({ from: "2026-10-23T11:00:00.000Z", to: "2026-10-23T13:00:00.000Z" }, now, "UTC")?.includesFuture).toBe(true);
    expect(historyWindowPreview(null, now)).toBeNull();
    expect(historyWindowPreview({ from: "bad", to: "2026-10-23T13:00:00.000Z" }, now)).toBeNull();
    expect(historyWindowPreview({ from: "2026-10-23T13:00:00.000Z", to: "2026-10-23T13:00:00.000Z" }, now)).toBeNull();
    expect(historyWindowPreview({ from: "2026-10-23T14:00:00.000Z", to: "2026-10-23T13:00:00.000Z" }, now)).toBeNull();
  });
});
