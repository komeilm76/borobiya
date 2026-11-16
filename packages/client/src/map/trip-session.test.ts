import { describe, expect, it } from "vitest";
import { createTripSession } from "./trip-session";

describe("trip-to-mission foreground handoff", () => {
  it("ends guidance before mission acceptance; an idle trip needs no handoff", () => {
    const session = createTripSession();
    expect(session.endForMission()).toBe(true);
    let ended = 0;
    const dispose = session.register(() => { ended++; session.update(false); });
    session.update(true);
    expect(session.endForMission()).toBe(true);
    expect(ended).toBe(1);
    expect(session.navigating.value).toBe(false);
    dispose();
  });
  it("rejects a broken stop callback rather than accepting while GPS guidance continues", () => {
    const session = createTripSession();
    session.register(() => {});
    session.update(true);
    expect(session.endForMission()).toBe(false);
    expect(session.navigating.value).toBe(true);
  });
  it("prevents stale unregisters from clearing a new map session", () => {
    const session = createTripSession();
    const old = session.register(() => {});
    const current = session.register(() => { session.update(false); });
    session.update(true);
    old();
    expect(session.navigating.value).toBe(true);
    expect(session.endForMission()).toBe(true);
    current();
    expect(session.navigating.value).toBe(false);
  });
});
