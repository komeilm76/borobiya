import { afterEach, describe, expect, it, vi } from "vitest";
import { createNavigationAlert } from "./navigation-alert";

afterEach(() => vi.unstubAllGlobals());

describe("off-route chime", () => {
  it("fails quietly if browser audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const alert = createNavigationAlert();
    expect(() => { alert.play(); alert.arm(); alert.play(); alert.dispose(); }).not.toThrow();
  });

  it("only schedules the short two-note signal after the user's start action", () => {
    const notes: number[] = [];
    const oscillator = () => ({ type: "sine", frequency: { value: 0 }, connect: vi.fn(),
      start: vi.fn(function (this: { frequency: { value: number } }) { notes.push(this.frequency.value); }), stop: vi.fn() });
    const gain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });
    const close = vi.fn(async () => {});
    vi.stubGlobal("AudioContext", class {
      state = "running"; currentTime = 0; destination = {};
      createOscillator = oscillator; createGain = gain;
      resume = vi.fn(async () => {}); close = close;
    });
    const alert = createNavigationAlert();
    alert.play(); expect(notes).toEqual([]);
    alert.arm(); alert.play(); expect(notes).toEqual([740, 590]);
    alert.dispose(); alert.play(); expect(notes).toHaveLength(2);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
