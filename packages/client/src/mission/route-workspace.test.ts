import { describe, expect, it, vi } from "vitest";
import { createMissionRouteWorkspace } from "./route-workspace";

describe("mission route alternatives", () => {
  it("previews without committing, and restores the prior route on Back or Escape", () => {
    const select = vi.fn();
    const workspace = createMissionRouteWorkspace(select);
    workspace.openAlternatives(1);
    workspace.preview(2, 3);
    expect(select).toHaveBeenLastCalledWith(2);
    workspace.close();
    expect(select).toHaveBeenLastCalledWith(1);
    expect(workspace.section).toBe("plan");
    workspace.openAlternatives(1);
    workspace.preview(0, 3);
    workspace.accept();
    workspace.close();
    expect(select).toHaveBeenLastCalledWith(0);
    expect(select).toHaveBeenCalledTimes(3);
  });
  it("ignores invalid previews and resets when the mission or route set changes", () => {
    const select = vi.fn();
    const workspace = createMissionRouteWorkspace(select);
    workspace.openAlternatives(0);
    workspace.preview(4, 2);
    workspace.preview(-1, 2);
    expect(select).not.toHaveBeenCalled();
    workspace.preview(1, 2);
    workspace.reset(); // A fresh route response must not restore an index from the old array.
    expect(select).toHaveBeenCalledTimes(1);
    expect(workspace.section).toBe("plan");
    workspace.openTransport();
    expect(workspace.section).toBe("transport");
    workspace.close();
    expect(workspace.section).toBe("plan");
  });
});
