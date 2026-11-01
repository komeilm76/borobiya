import { afterEach, describe, expect, it, vi } from "vitest";
import { createNavigationAlert } from "./navigation-alert";

afterEach(() => vi.unstubAllGlobals());

describe("off-route chime", () => {
  it("fails quietly if browser audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const alert = createNavigationAlert();
    expect(() => { alert.play(); alert.playArrival(); alert.arm(); alert.playArrival(); alert.dispose(); }).not.toThrow();
  });

  it("plays arrival exactly once after an asynchronously permitted audio unlock", async () => {
    let release!: () => void;
    let ready = false;
    const unlocked = new Promise<void>(resolve => { release = () => { ready = true; resolve(); }; });
    const notes: number[] = [];
    vi.stubGlobal("AudioContext", class {
      get state() { return ready ? "running" : "suspended"; }
      currentTime = 0; destination = {};
      resume = vi.fn(() => unlocked);
      close = vi.fn(async () => {});
      createOscillator = () => ({ type: "sine", frequency: { value: 0 }, connect: vi.fn(),
        start: vi.fn(function (this: { frequency: { value: number } }) { notes.push(this.frequency.value); }), stop: vi.fn() });
      createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });
    });
    const alert = createNavigationAlert();
    alert.arm(); alert.playArrival();
    expect(notes).toEqual([]);
    release(); await unlocked; await Promise.resolve();
    expect(notes).toEqual([523, 659, 784]);
    alert.dispose();
  });

  it("waits for a permitted but delayed audio unlock and cancels a dismissed arrival", async () => {
    let release!: () => void;
    const unlocked = new Promise<void>(resolve => { release = resolve; });
    const notes: number[] = [];
    const close = vi.fn(async () => {});
    vi.stubGlobal("AudioContext", class {
      state = "suspended"; currentTime = 0; destination = {};
      resume = vi.fn(() => unlocked);
      close = close;
      createOscillator = () => ({ type: "sine", frequency: { value: 0 }, connect: vi.fn(),
        start: vi.fn(function (this: { frequency: { value: number } }) { notes.push(this.frequency.value); }), stop: vi.fn() });
      createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() });
    });
    const alert = createNavigationAlert();
    alert.arm(); alert.playArrival();
    expect(notes).toEqual([]);
    alert.cancelArrival();
    release(); await unlocked; await Promise.resolve();
    expect(notes).toEqual([]); // User closed the dialog before the browser unlocked sound.
    alert.dispose(); expect(close).toHaveBeenCalledTimes(1);
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
    alert.play(); alert.playArrival(); expect(notes).toEqual([]);
    alert.arm(); alert.play(); expect(notes).toEqual([740, 590]);
    alert.playArrival(); expect(notes).toEqual([740, 590, 523, 659, 784]);
    alert.dispose(); alert.play(); alert.playArrival(); expect(notes).toHaveLength(5);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
