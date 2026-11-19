import { describe, expect, it } from "vitest";
import { dispatchMapEdgeCues } from "./dispatch-map-edge";

describe("dispatch map edge cues", () => {
  const sos = { kind: "sos" as const, id: "selected", label: "امداد پزشکی", selected: true };
  const rescuer = { kind: "responder" as const, id: "nearby", label: "rescuer_1", selected: false };

  it("keeps top and bottom positions visible and identifies all four directions", () => {
    expect(dispatchMapEdgeCues(320, 280, [
      { ...sos, x: 160, y: -25 }, { ...rescuer, x: 220, y: 290 }
    ])).toEqual([
      { ...sos, edge: "top", x: 160, y: 80 },
      { ...rescuer, edge: "bottom", x: 220, y: 250 }
    ]);
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: -10, y: 140 }])[0])
      .toMatchObject({ edge: "left", x: 72, y: 140 });
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: 340, y: 140 }])[0])
      .toMatchObject({ edge: "right", x: 248, y: 140 });
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: 160, y: 140 }])).toEqual([]);
  });

  it("prioritises the selected incident, selected responders, and avoids stacked cards", () => {
    const cues = dispatchMapEdgeCues(320, 280, [
      { ...rescuer, id: "other", x: 160, y: -3 },
      { ...rescuer, selected: true, id: "picked", x: 160, y: 281 },
      { ...sos, x: 160, y: -25 },
      { ...rescuer, id: "far", x: -15, y: 150 }
    ]);
    expect(cues.map((cue) => cue.id)).toEqual(["selected", "picked", "far"]);
    expect(dispatchMapEdgeCues(100, 80, [{ ...sos, x: 150, y: -20 }])).toEqual([]);
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: Number.NaN, y: -20 }])).toEqual([]);
  });
});
