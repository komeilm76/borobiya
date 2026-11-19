/* MapLibre's vector renderer requires WebGL2. A failed GPU initialization is
 * not a tile/network error and retrying style downloads cannot make it work. */
export function canRenderWebGL2(createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): boolean {
  try {
    const context = createCanvas().getContext("webgl2");
    if (!context) return false;
    // Don't keep a probe context alive alongside the real MapLibre canvas.
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    // Security policy, disabled GPU, exhausted contexts, or unsupported browser.
    return false;
  }
}

export function isWebGL2InitializationError(value: unknown): boolean {
  if (!(value instanceof Error)) return false;
  return value.name === "GPUInitializationError" || /WebGL\s*2\s+is\s+required/i.test(value.message);
}
