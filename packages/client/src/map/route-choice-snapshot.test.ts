import { describe, expect, it } from "vitest";
import { previousRouteIndex } from "./route-choice-snapshot";

describe("unconfirmed route preview", () => {
  const routes = [{ name: "fast" }, { name: "scenic" }];
  it("restores the choice that was active when the chooser opened", () => {
    expect(previousRouteIndex({ routes, index: 0 }, routes)).toBe(0);
    expect(previousRouteIndex({ routes, index: 1 }, routes)).toBe(1);
  });
  it("never restores an index into an async replacement batch", () => {
    expect(previousRouteIndex({ routes, index: 1 }, [{ name: "replacement" }])).toBeNull();
    expect(previousRouteIndex({ routes, index: 0 }, [])).toBeNull();
  });
  it("does not invent a route when no valid selection was saved", () => {
    expect(previousRouteIndex(null, routes)).toBeNull();
    expect(previousRouteIndex({ routes, index: -1 }, routes)).toBeNull();
    expect(previousRouteIndex({ routes, index: 2 }, routes)).toBeNull();
    expect(previousRouteIndex({ routes, index: 0.5 }, routes)).toBeNull();
  });
});
