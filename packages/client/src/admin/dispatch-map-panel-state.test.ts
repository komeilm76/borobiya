import { describe, expect, it } from "vitest";
import { dispatchMapPanelState } from "./dispatch-map-panel-state";

describe("compact dispatch map panels", () => {
  it("keeps search visible when the sheet expands without a selected SOS", () => {
    expect(dispatchMapPanelState(true, false, true, false, false))
      .toEqual({ incidentAtTop: false, hideSearch: false });
    expect(dispatchMapPanelState(true, false, false, true, false))
      .toEqual({ incidentAtTop: false, hideSearch: false });
  });

  it("replaces search with the selected incident while the sheet is expanded", () => {
    expect(dispatchMapPanelState(true, true, true, false, false))
      .toEqual({ incidentAtTop: true, hideSearch: true });
  });

  it("hides search and lifts an open incident into its place at sheet peek", () => {
    expect(dispatchMapPanelState(true, true, false, false, true))
      .toEqual({ incidentAtTop: true, hideSearch: true });
    expect(dispatchMapPanelState(true, true, false, false, false))
      .toEqual({ incidentAtTop: false, hideSearch: false });
  });

  it("avoids flash of search during a selected-incident drag without affecting desktop", () => {
    expect(dispatchMapPanelState(true, true, false, true, false))
      .toEqual({ incidentAtTop: false, hideSearch: true });
    expect(dispatchMapPanelState(false, true, true, true, true))
      .toEqual({ incidentAtTop: false, hideSearch: false });
  });
});
