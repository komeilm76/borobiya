import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso } from "@/history/playback";
import { dateForPicker, withPickerDate, withPickerTime } from "./history-date-time";

describe("Vuetify history calendar and clock", () => {
  it("keeps the browser's local wall-clock time across date and time changes", () => {
    const initial = "2026-10-29T18:25";
    expect(dateForPicker(initial)?.getDate()).toBe(29);
    const next = withPickerDate(initial, new Date(2026, 9, 30));
    expect(next).toBe("2026-10-30T18:25");
    expect(withPickerTime(next!, "07:05")).toBe("2026-10-30T07:05");
    expect(isoToLocalInput(localInputToIso(next!)!)).toBe(next);
  });

  it("uses accessible Vuetify calendar/clock dialogs and matches their Gregorian labels to their dates", () => {
    const field = readFileSync(new URL("../components/sharing/HistoryDateTimeField.vue", import.meta.url), "utf8");
    const vuetify = readFileSync(new URL("../plugins/vuetify.ts", import.meta.url), "utf8");
    expect(field).toContain('<v-date-picker');
    expect(field).toContain('<v-time-picker');
    expect(field).toContain(':fullscreen="$vuetify.display.smAndDown"');
    expect(field).toContain('fa-IR-u-ca-gregory');
    expect(vuetify).toContain('fa: "fa-IR-u-ca-gregory"');
  });

  it("rejects empty or invalid picker events instead of corrupting a share window", () => {
    expect(dateForPicker("2026-02-30T18:00")).toBeUndefined();
    expect(withPickerDate("2026-10-29T18:00", null)).toBeNull();
    expect(withPickerTime("2026-10-29T18:00", "25:70")).toBeNull();
    expect(withPickerTime("2026-10-29T18:00", null)).toBeNull();
  });
});
