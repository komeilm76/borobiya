import { describe, expect, it } from "vitest";
import { dispatchMapEdgeCues } from "./dispatch-map-edge";

describe("dispatch map edge cues", () => {
  const sos = { kind: "sos" as const, id: "selected", label: "امداد پزشکی", selected: true };
  const rescuer = { kind: "responder" as const, id: "nearby", label: "rescuer_1", selected: false };

  it("keeps top and bottom positions visible and identifies all four directions", () => {
    expect(dispatchMapEdgeCues(320, 280, [
      { ...sos, x: 160, y: -25 }, { ...rescuer, x: 220, y: 290 }
    ])).toEqual([
      { ...sos, edge: "top", x: 160, y: 86 },
      { ...rescuer, edge: "bottom", x: 220, y: 251 }
    ]);
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: -10, y: 140 }])[0])
      .toMatchObject({ edge: "left", x: 81, y: 140 });
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: 340, y: 140 }])[0])
      .toMatchObject({ edge: "right", x: 239, y: 140 });
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: 160, y: 140 }])).toEqual([]);
  });

  it("keeps compact cues inside narrow maps and their arrows clear of top-right controls", () => {
    const narrow = dispatchMapEdgeCues(160, 272, [
      { ...rescuer, x: -10, y: 160 }
    ]);
    expect(narrow[0]).toMatchObject({ edge: "left", x: 80, y: 160 });
    // The 136px-wide button at x=80 spans x=12..148, not outside the map.
    expect(narrow[0]!.x - (160 - 24) / 2).toBe(12);
    const topRight = dispatchMapEdgeCues(320, 280, [{ ...rescuer, x: 300, y: -10 }]);
    expect(topRight[0]).toMatchObject({ edge: "top", x: 239, y: 126 });
    expect(dispatchMapEdgeCues(320, 280, [{ ...rescuer, x: 330, y: 15 }])[0])
      .toMatchObject({ edge: "right", y: 126 });
    // At 320px wide the 138px cue stays 12px from either horizontal edge.
    expect(dispatchMapEdgeCues(320, 280, [{ ...sos, x: -10, y: 140 }])[0]!.x - 138 / 2).toBe(12);
    expect(dispatchMapEdgeCues(320, 170, [{ ...sos, x: 160, y: -20 }])).toEqual([]);
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
