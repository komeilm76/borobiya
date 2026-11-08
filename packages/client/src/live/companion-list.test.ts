import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { companionListMembers, type CompanionRegistry, type CompanionView } from "./companion-locations";

const registry: CompanionRegistry = {
  waiting: { userId: "waiting", name: "منتظر", fix: null },
  active: { userId: "active", name: "فعال", fix: { lat: 35, lon: 51, accuracy: 8, observedAtMs: 1000 } },
  old: { userId: "old", name: "قدیمی", fix: { lat: 36, lon: 52, accuracy: null, observedAtMs: null } }
};
const peers: CompanionView[] = [
  { userId: "old", name: "قدیمی", position: [52, 36], accuracy: null, stale: true, ageMs: null },
  { userId: "active", name: "فعال", position: [51, 35], accuracy: 8, stale: false, ageMs: 2000 },
  { userId: "unlisted", name: "غریبه", position: [0, 0], accuracy: 1, stale: false, ageMs: 0 }
];

describe("authorized companion list projection", () => {
  it("keeps grant order, waiting peers and last-known uncertainty, never rendering an unlisted peer", () => {
    const members = companionListMembers(registry, peers);
    expect(members.map((member) => member.userId)).toEqual(["waiting", "active", "old"]);
    expect(members[0]).toMatchObject({ name: "منتظر", position: null, stale: true, ageMs: null, accuracy: null });
    expect(members[1]).toMatchObject({ position: [51, 35], stale: false, ageMs: 2000, accuracy: 8 });
    expect(members[2]).toMatchObject({ position: [52, 36], stale: true, ageMs: null, accuracy: null });
    expect(members).not.toContainEqual(expect.objectContaining({ userId: "unlisted" }));
    // The former .find used the first matching fix if an upstream snapshot repeated an ID.
    const duplicated = companionListMembers(registry, [peers[1]!, { ...peers[1]!, ageMs: 9999 }]);
    expect(duplicated[1]?.ageMs).toBe(2000);
    expect(registry.waiting?.fix).toBeNull(); // projection does not mutate the allow-list
  });

  it("indexes the changing peer snapshot once instead of rescanning it per authorized row", () => {
    let iterators = 0;
    const watched = new Proxy(peers, {
      get(target, property, receiver) {
        if (property === "find") throw new Error("quadratic per-member lookup");
        if (property === Symbol.iterator) iterators++;
        return Reflect.get(target, property, receiver);
      }
    });
    expect(companionListMembers(registry, watched)).toHaveLength(3);
    expect(iterators).toBe(1);
    const panel = readFileSync(new URL("../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");
    expect(panel).toContain("companionListMembers(props.api.registry.value, props.api.peers.value)");
    expect(panel).not.toContain("props.api.peers.value.find(");
  });
});
