import { describe, expect, it } from "vitest";
import { proposalEntryIntent, workspaceTabQuery } from "./workspace-tab-query";

describe("map tab navigation", () => {
  it("consumes one-time proposal links without losing unrelated map parameters or mutating the current URL", () => {
    const current = { offer: "proposal-1", inbox: "1", tab: "missions", filter: "nearby", tags: ["a", "b"] };
    expect(workspaceTabQuery(current, "history")).toEqual({ tab: "history", filter: "nearby", tags: ["a", "b"] });
    expect(current).toEqual({ offer: "proposal-1", inbox: "1", tab: "missions", filter: "nearby", tags: ["a", "b"] });
  });
  it("keeps a direct offer link intact until the user changes tabs", () => {
    expect(workspaceTabQuery({ offer: "proposal-1" }, "missions")).toEqual({ tab: "missions" });
  });
  it("recognizes only a new proposal-entry intent, not a tab-only URL change", () => {
    const offer = proposalEntryIntent("/_user/map", { offer: "proposal-1", tab: "missions" });
    expect(offer).toBe("offer:proposal-1");
    expect(proposalEntryIntent("/_user/map", { offer: "proposal-1", tab: "sharing" })).toBe(offer);
    expect(proposalEntryIntent("/_user/map", { offer: "proposal-2" })).not.toBe(offer);
    expect(proposalEntryIntent("/_user/map", { inbox: "1", tab: "trips" })).toBe("inbox");
    expect(proposalEntryIntent("/_user/map", { inbox: "1", tab: "history" })).toBe("inbox");
    expect(proposalEntryIntent("/_user/map", { tab: "history" })).toBeNull();
    expect(proposalEntryIntent("/_user/mission-history", { inbox: "1" })).toBeNull();
  });
});
