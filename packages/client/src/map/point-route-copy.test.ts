import { describe, expect, it, vi } from "vitest";
import { destinationCopyText, tryCopyDestination } from "./point-route-copy";

describe("route sheet destination copy", () => {
  const point = { lat: 35.689197, lon: 51.388973 };
  it("copies latitude before longitude and only the actual resolved address", () => {
    expect(destinationCopyText("coordinates", point, null)).toBe("35.68920, 51.38897");
    expect(destinationCopyText("address", point, "  تهران، میدان آزادی  ")).toBe("تهران، میدان آزادی");
    expect(destinationCopyText("address", point, null)).toBeNull();
    expect(destinationCopyText("address", point, "   ")).toBeNull();
    expect(destinationCopyText("coordinates", null, "تهران")).toBeNull();
    expect(destinationCopyText("coordinates", { lat: NaN, lon: 51 }, null)).toBeNull();
    expect(destinationCopyText("coordinates", { lat: 95, lon: 51 }, null)).toBeNull();
  });

  it("uses the clipboard when available but preserves text for manual copy on HTTP or denial", async () => {
    const write = vi.fn(async (_text: string) => {});
    expect(await tryCopyDestination("35.68920, 51.38897", write)).toBe(true);
    expect(write).toHaveBeenCalledWith("35.68920, 51.38897");
    expect(await tryCopyDestination("تهران")).toBe(false);
    expect(await tryCopyDestination("تهران", vi.fn(async () => { throw new Error("not allowed"); }))).toBe(false);
  });
});
