import { describe, expect, it, vi } from "vitest";
import { canRenderWebGL2, isWebGL2InitializationError } from "./webgl-support";

// No Vue component mounting: test the browser capability decision separately.
describe("MapCanvas graphics preflight", () => {
  it("accepts WebGL2 and releases the probe context before the real map starts", () => {
    const loseContext = vi.fn();
    const getContext = vi.fn().mockReturnValue({ getExtension: () => ({ loseContext }) });
    expect(canRenderWebGL2(() => ({ getContext }) as unknown as HTMLCanvasElement)).toBe(true);
    expect(getContext).toHaveBeenCalledWith("webgl2");
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it("rejects blocked, unsupported and throwing canvas contexts", () => {
    expect(canRenderWebGL2(() => ({ getContext: () => null }) as unknown as HTMLCanvasElement)).toBe(false);
    expect(canRenderWebGL2(() => { throw new Error("GPU disabled"); })).toBe(false);
  });

  it("separates GPU initialization failure from tile or network failures", () => {
    expect(isWebGL2InitializationError(Object.assign(new Error("Failed to create context"),
      { name: "GPUInitializationError" }))).toBe(true);
    expect(isWebGL2InitializationError(new Error("WebGL2 is required to display this map."))).toBe(true);
    expect(isWebGL2InitializationError(new Error("Failed to fetch /map/style/light"))).toBe(false);
    expect(isWebGL2InitializationError(null)).toBe(false);
  });
});
