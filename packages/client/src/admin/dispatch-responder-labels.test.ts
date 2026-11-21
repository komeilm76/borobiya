import { describe, expect, it } from "vitest";
import { nonOverlappingResponderLabelIds, visibleResponderLabelIds } from "./dispatch-responder-labels";

describe("visible responder name chips", () => {
  const individual = new Set(["nearby-pin", "nearby-dot", "selected-pin", "selected-dot"]);
  const feature = (layer: string, id: unknown) => ({ layer: { id: layer }, properties: { id } });

  it("names only rendered individual pins, never a cluster or stale/unauthorised member", () => {
    const ids = visibleResponderLabelIds([
      feature("nearby-pin", "near"), feature("nearby-dot", "near"),
      feature("nearby-cluster", "hidden"), feature("nearby-pin", "stale"),
      feature("selected-pin", "selected"), feature("nearby-pin", null)
    ], new Set(["near", "hidden", "selected"]), individual);
    expect([...ids]).toEqual(["near", "selected"]);
  });

  it("keeps a selected member named through clustering and supports the circle fallback", () => {
    expect([...visibleResponderLabelIds([
      feature("nearby-cluster", "selected"), feature("selected-dot", "selected"),
      feature("nearby-dot", "other")
    ], new Set(["selected", "other"]), individual)]).toEqual(["selected", "other"]);
    expect(visibleResponderLabelIds([feature("nearby-pin", "removed")], new Set(), individual).size).toBe(0);
  });

  it("prioritises selected responders and never covers the selected incident title", () => {
    const box = (left: number, top: number) => ({ left, top, right: left + 50, bottom: top + 30 });
    const visible = nonOverlappingResponderLabelIds([
      { id: "near", selected: false, bounds: box(10, 10) },
      { id: "selected", selected: true, bounds: box(20, 15) },
      { id: "sos-overlap", selected: false, bounds: box(101, 12) },
      { id: "free", selected: false, bounds: box(180, 12) }
    ], [box(100, 10)]);
    expect([...visible]).toEqual(["selected", "free"]);
  });
});
