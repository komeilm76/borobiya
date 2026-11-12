import { describe, expect, it } from "vitest";
import { createLiveCameraIntent } from "./live-camera-intent";

describe("mission room camera intent", () => {
  it("automatically frames participants only before someone moves the map", () => {
    const intent = createLiveCameraIntent();
    expect(intent.shouldAutoFrame(false)).toBe(true);
    expect(intent.shouldAutoFrame(true)).toBe(false);
    intent.noteGesture();
    expect(intent.shouldAutoFrame(false)).toBe(false);
    expect(intent.shouldAutoFrame(true)).toBe(false);
  });

  it("allows explicit show-all or route closure to restore the room overview", () => {
    const intent = createLiveCameraIntent();
    intent.noteGesture();
    intent.reset();
    expect(intent.shouldAutoFrame(false)).toBe(true);
    intent.noteGesture();
    intent.reset();
    expect(intent.shouldAutoFrame(false)).toBe(true);
  });
});
