import { afterEach, describe, expect, it, vi } from "vitest";
import { createHoldToSelect } from "./hold-to-select";

afterEach(() => vi.useRealTimers());
const point = (type = "mouse", button = 0, id = 1, x = 10, y = 20, primary = true) => ({ type, button, id, x, y, primary });

describe("hold to select destination", () => {
  it.each(["mouse", "touch", "pen"])("selects only after an uninterrupted %s hold", (type) => {
    vi.useFakeTimers();
    const select = vi.fn(); const hold = createHoldToSelect(select);
    hold.down(point(type)); vi.advanceTimersByTime(549); expect(select).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(select).toHaveBeenCalledExactlyOnceWith(10, 20, type);
    hold.up(1); vi.advanceTimersByTime(1000); expect(select).toHaveBeenCalledTimes(1);
  });
  it("ignores ordinary taps, right clicks, secondary touches, drags and cancelled gestures", () => {
    vi.useFakeTimers(); const select = vi.fn(); const hold = createHoldToSelect(select);
    hold.down(point()); hold.up(1);
    hold.down(point("mouse", 2));
    hold.down(point("touch", 0, 2, 10, 20, false));
    hold.down(point("touch")); hold.move(point("touch", 0, 1, 40, 40));
    hold.down(point("pen")); hold.cancel();
    vi.advanceTimersByTime(1500); expect(select).not.toHaveBeenCalled();
  });
  it("allows tiny jitter but cancels when another pointer starts or a gesture leaves", () => {
    vi.useFakeTimers(); const select = vi.fn(); const hold = createHoldToSelect(select);
    hold.down(point("touch")); expect(hold.isTouchPending()).toBe(true);
    hold.move(point("touch", 0, 1, 13, 24)); vi.advanceTimersByTime(400); expect(select).not.toHaveBeenCalled();
    hold.down(point("touch", 0, 2, 10, 20, false)); vi.advanceTimersByTime(500); expect(select).not.toHaveBeenCalled();
    hold.down(point("touch")); hold.up(1); vi.advanceTimersByTime(600); expect(select).not.toHaveBeenCalled();
    hold.down(point()); hold.move(point("mouse", 0, 99, 100, 100)); vi.advanceTimersByTime(550);
    expect(select).toHaveBeenCalledExactlyOnceWith(10, 20, "mouse");
  });
});
