import { describe, expect, it } from "vitest";
import { dispatchDraggedHeight, dispatchSheetBounds, dispatchSheetShouldExpand } from "./dispatch-sheet-gesture";

describe("dispatch bottom-sheet gesture", () => {
  it("matches the CSS peek/expanded dvh and rem stops on short phones and tablets", () => {
    expect(dispatchSheetBounds(568, 16)).toEqual({ peek: 255.6, expanded: 465.76 });
    expect(dispatchSheetBounds(1024, 16)).toEqual({ peek: 384, expanded: 736 });
    expect(dispatchSheetBounds(568, 20)).toEqual({ peek: 255.6, expanded: 465.76 });
  });

  it("follows upward/downward motion and stays within the two stops", () => {
    const bounds = { peek: 250, expanded: 500 };
    expect(dispatchDraggedHeight(250, 400, 300, bounds)).toBe(350);
    expect(dispatchDraggedHeight(500, 300, 400, bounds)).toBe(400);
    expect(dispatchDraggedHeight(250, 400, -500, bounds)).toBe(500);
    expect(dispatchDraggedHeight(500, 300, 900, bounds)).toBe(250);
  });

  it("snaps to nearest stop, but lets a deliberate flick override the midpoint", () => {
    const bounds = { peek: 250, expanded: 500 };
    expect(dispatchSheetShouldExpand(380, -5, -.9, bounds)).toBe(true); // Tap-sized motion is not a flick.
    expect(dispatchSheetShouldExpand(370, -40, -1, bounds)).toBe(true);
    expect(dispatchSheetShouldExpand(390, 45, 1, bounds)).toBe(false);
    expect(dispatchSheetShouldExpand(375, 30, .1, bounds)).toBe(true);
    expect(dispatchSheetShouldExpand(374, -30, -.1, bounds)).toBe(false);
  });
});
