import { describe, expect, it } from "vitest";
import { placeResponderLabels, selectedSosPinBounds, visibleResponderLabelIds } from "./dispatch-responder-labels";

describe("visible responder name chips", () => {
  const individual = new Set(["nearby-pin", "nearby-dot", "selected-pin", "selected-dot"]);
  const feature = (layer: string, id: unknown) => ({ layer: { id: layer }, properties: { id } });
  const box = (left: number, top = 10) => ({ left, top, right: left + 60, bottom: top + 30 });

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

  it("tries the other side when two visible pins' preferred label positions overlap", () => {
    const placed = placeResponderLabels([
      { id: "one", selected: false, preferred: "right" },
      { id: "two", selected: false, preferred: "right" }
    ], (id, side) => side === "right" ? box(id === "one" ? 100 : 110) :
      side === "left" ? box(id === "one" ? 20 : 200) : null);
    expect([...placed]).toEqual([["one", "right"], ["two", "left"]]);
  });

  it("prioritises selected responders, reserves the SOS chip and pin, and hides only when all sides fail", () => {
    const pin = selectedSosPinBounds(100, 100, true);
    expect(pin).toEqual({ left: 74, right: 126, top: 41, bottom: 106 });
    const circle = selectedSosPinBounds(100, 100, false);
    expect(circle).toEqual({ left: 82, right: 118, top: 82, bottom: 118 });
    const reserved = [box(110, 10), pin];
    const placed = placeResponderLabels([
      { id: "near", selected: false, preferred: "right" },
      { id: "selected", selected: true, preferred: "right" },
      { id: "trapped", selected: false, preferred: "below" }
    ], (id, side) => {
      if (id === "selected") return side === "right" ? box(120, 55) : side === "left" ? box(5, 55) : null;
      if (id === "near") return side === "right" ? box(5, 55) : side === "above" ? box(200, 10) : null;
      return box(110, 10); // Every side conflicts with the reserved SOS title.
    }, reserved);
    expect([...placed]).toEqual([["selected", "left"], ["near", "above"]]);
    expect([...placeResponderLabels([
      { id: "circle-covered", selected: true, preferred: "right" }
    ], () => ({ left: 90, right: 140, top: 90, bottom: 110 }), [circle])]).toEqual([]);
  });

  it("keeps equal-priority names stable when rendered feature order changes", () => {
    const a = { id: "a", selected: false, preferred: "right" as const };
    const b = { id: "b", selected: false, preferred: "right" as const };
    const measure = () => box(100);
    expect([...placeResponderLabels([b, a], measure)]).toEqual([["a", "right"]]);
    expect([...placeResponderLabels([a, b], measure)]).toEqual([["a", "right"]]);
  });

  it("rejects directions that clip the map and preserves above/below as valid alternatives", () => {
    const placed = placeResponderLabels([
      { id: "edge", selected: false, preferred: "right" }
    ], (_id, side) => side === "below" ? box(90, 150) : null);
    expect([...placed]).toEqual([["edge", "below"]]);
    expect(placeResponderLabels([{ id: "offscreen", selected: false, preferred: "right" }], () => null).size).toBe(0);
  });
});
