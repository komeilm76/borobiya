import { describe, expect, it } from "vitest";
import {
  DISCARD_AFTER_MS,
  LIVE_BOTTOM_LAYER_ID,
  LIVE_HALO_LAYER_ID,
  LIVE_SOURCE_ID,
  STALE_AFTER_MS,
  ageWords,
  applyPeerUpdate,
  applyShareEnded,
  applyShareList,
  countAwaiting,
  emptyRegistry,
  liveCompanionsStyle,
  liveMarkerColors,
  connectionTitle,
  liveStatus,
  peersOf,
  peersOverlay,
  peerLabel,
  pruneRegistry
} from "./companion-locations";

const NOW = Date.parse("2026-04-10T12:00:00.000Z");
const ALICE = "3f2a6b1c-8d4e-4f70-9a11-5c2b7d0e64f1";
const BOB = "7c1d9f43-2ab6-4c58-8f0e-1d3a5b7c9e02";
const ME = "b58e0c71-4d93-4a06-b1f7-2e8c40a6d139";

function registryWith(peer: { userId: string; name?: string; observedAtMs?: number | null; lat?: number; lon?: number }) {
  return {
    [peer.userId]: {
      userId: peer.userId,
      name: peer.name ?? "سمیرا",
      fix: {
        lat: peer.lat ?? 35.7,
        lon: peer.lon ?? 51.4,
        accuracy: null,
        observedAtMs: peer.observedAtMs === undefined ? NOW - 5_000 : peer.observedAtMs
      }
    }
  };
}

describe("applyPeerUpdate", () => {
  it("records a fix for a peer the share list named", () => {
    const result = applyPeerUpdate(registryWith({ userId: ALICE }), { userId: ALICE, lat: 35.75, lon: 51.42, accuracy: 12, timestamp: new Date(NOW).toISOString() }, ME);
    expect(result.changed).toBe(true);
    expect(result.reason).toBe("applied");
    expect(result.registry[ALICE]?.fix).toEqual({ lat: 35.75, lon: 51.42, accuracy: 12, observedAtMs: NOW });
  });

  it("keeps the name a peer already had, so a fix never renames somebody", () => {
    const result = applyPeerUpdate(registryWith({ userId: ALICE, name: "مریم" }), { userId: ALICE, lat: 35.7, lon: 51.4, timestamp: NOW }, ME);
    expect(result.registry[ALICE]?.name).toBe("مریم");
  });

  it("ignores our own echoed fix, because the server emits to the sender's room too", () => {
    const registry = { ...emptyRegistry, ...registryWith({ userId: ME }) };
    const result = applyPeerUpdate(registry, { userId: ME, lat: 35.9, lon: 51.9, timestamp: NOW + 10_000 }, ME);
    expect(result).toMatchObject({ changed: false, reason: "self" });
    expect(result.registry[ME]?.fix?.lat).toBe(35.7);
  });

  it("drops a fix for a peer the share list never named, and asks for a re-read", () => {
    const result = applyPeerUpdate(emptyRegistry, { userId: BOB, lat: 35.7, lon: 51.4, timestamp: NOW }, ME);
    expect(result).toMatchObject({ changed: false, reason: "unlisted" });
    expect(result.registry).toEqual({});
  });

  it("never moves a dot backwards when an older fix arrives after a newer one", () => {
    const registry = registryWith({ userId: ALICE, observedAtMs: NOW });
    const result = applyPeerUpdate(registry, { userId: ALICE, lat: 35.1, lon: 50.1, timestamp: NOW - 60_000 }, ME);
    expect(result).toMatchObject({ changed: false, reason: "stale-replay" });
  });

  it("drops the duplicate a double fan-out produces at the same instant", () => {
    const registry = registryWith({ userId: ALICE, observedAtMs: NOW });
    expect(applyPeerUpdate(registry, { userId: ALICE, lat: 35.7, lon: 51.4, timestamp: NOW }, ME)).toMatchObject({ changed: false, reason: "stale-replay" });
  });

  it("replaces a seeded position, which has no time to lose against", () => {
    const registry = registryWith({ userId: ALICE, observedAtMs: null });
    const result = applyPeerUpdate(registry, { userId: ALICE, lat: 36.2, lon: 50.9, timestamp: NOW - 3_600_000 }, ME);
    expect(result.changed).toBe(true);
    expect(result.registry[ALICE]?.fix?.observedAtMs).toBe(NOW - 3_600_000);
  });

  it("reads a numeric timestamp as well as an ISO one, and accepts either", () => {
    const result = applyPeerUpdate(registryWith({ userId: ALICE }), { userId: ALICE, lat: 35.7, lon: 51.4, timestamp: NOW + 1 }, ME);
    expect(result.registry[ALICE]?.fix?.observedAtMs).toBe(NOW + 1);
  });

  for (const [label, payload] of [
    ["a missing id", { lat: 35.7, lon: 51.4, timestamp: NOW }],
    ["a non-numeric latitude", { userId: ALICE, lat: "35.7", lon: 51.4, timestamp: NOW }],
    ["a latitude beyond the poles", { userId: ALICE, lat: 91, lon: 51.4, timestamp: NOW }],
    ["a longitude beyond the antimeridian", { userId: ALICE, lat: 35.7, lon: 181, timestamp: NOW }],
    ["a NaN from a dead GPS", { userId: ALICE, lat: Number.NaN, lon: 51.4, timestamp: NOW }],
    ["an unparsable timestamp", { userId: ALICE, lat: 35.7, lon: 51.4, timestamp: "همیشه" }],
    ["no timestamp at all", { userId: ALICE, lat: 35.7, lon: 51.4 }]
  ] as const) {
    it(`rejects ${label} instead of drawing it`, () => {
      const result = applyPeerUpdate(registryWith({ userId: ALICE }), payload, ME);
      expect(result).toMatchObject({ changed: false, reason: "invalid" });
    });
  }

  it("keeps accuracy null when the fix carries none, so no dot claims a radius", () => {
    const result = applyPeerUpdate(registryWith({ userId: ALICE }), { userId: ALICE, lat: 35.7, lon: 51.4, timestamp: NOW + 1 }, ME);
    expect(result.registry[ALICE]?.fix?.accuracy).toBeNull();
  });
});

describe("applyShareList", () => {
  it("seeds a peer from the owner's last location, marked as not-live", () => {
    const registry = applyShareList(emptyRegistry, [{ id: ALICE, username: "مریم", lastLocation: { lat: 35.7, lon: 51.4 } }]);
    expect(peersOf(registry, NOW)).toEqual([
      { userId: ALICE, name: "مریم", position: [51.4, 35.7], accuracy: null, ageMs: null, stale: true }
    ]);
  });

  it("registers an owner who has never sent a fix, without drawing anything for them", () => {
    const registry = applyShareList(emptyRegistry, [
      { id: ALICE, username: "مریم", lastLocation: null },
      { id: BOB, username: "علی", lastLocation: { lat: 400, lon: 0 } }
    ]);
    expect(peersOf(registry, NOW)).toEqual([]);
    expect(countAwaiting(registry)).toBe(2);
  });

  it("lets the first fix from a peer we know nothing about paint, because the share is what authorises them", () => {
    // The regression this pins: seeding from a share with no `lastLocation` used to skip the row, so
    // `applyPeerUpdate` read their very first update as unauthorised and dropped it on the floor.
    const registry = applyShareList(emptyRegistry, [{ id: ALICE, username: "مریم", lastLocation: null }]);
    const result = applyPeerUpdate(registry, { userId: ALICE, lat: 35.7, lon: 51.4, timestamp: NOW }, ME);
    expect(result.changed).toBe(true);
    expect(peersOf(result.registry, NOW)[0]).toMatchObject({ name: "مریم", stale: false });
  });

  it("says a peer has sent nothing yet instead of pretending the map is empty for no reason", () => {
    const registry = applyShareList(emptyRegistry, [
      { id: ALICE, username: "مریم", lastLocation: null },
      { id: BOB, username: "علی", lastLocation: { lat: 35.7, lon: 51.4 } }
    ]);
    const status = liveStatus(registry, { connected: true, nowMs: NOW, shareCount: 2 });
    expect(status).toMatchObject({ peerCount: 1, awaitingCount: 1 });
    expect(status.line).toContain("1 نفر هنوز موقعیتی نفرستاده");
  });

  it("keeps a live fix when a list read carries an older one", () => {
    const live = registryWith({ userId: ALICE, observedAtMs: NOW, lat: 36.9, lon: 50.2 });
    const registry = applyShareList(live, [{ id: ALICE, username: "مریم", lastLocation: { lat: 35.1, lon: 51.1 } }]);
    expect(registry[ALICE]?.fix).toMatchObject({ lat: 36.9, lon: 50.2, observedAtMs: NOW });
  });

  it("drops a peer whose share has gone, which is what a revoke looks like here", () => {
    const registry = { ...registryWith({ userId: ALICE }), ...registryWith({ userId: BOB }) };
    const next = applyShareList(registry, [{ id: BOB, username: "علی", lastLocation: { lat: 35.7, lon: 51.4 } }]);
    expect(Object.keys(next)).toEqual([BOB]);
  });

  it("falls back to a generic label when an owner row carries no username", () => {
    expect(applyShareList(emptyRegistry, [{ id: ALICE, username: "  ", lastLocation: { lat: 35.7, lon: 51.4 } }])[ALICE]?.name).toBe("همراه");
  });
});

describe("staleness", () => {
  it("treats a fix as fresh up to the stale threshold and grey after it", () => {
    const fresh = registryWith({ userId: ALICE, observedAtMs: NOW - (STALE_AFTER_MS - 1) });
    expect(peersOf(fresh, NOW)[0]?.stale).toBe(false);
    const grey = registryWith({ userId: ALICE, observedAtMs: NOW - (STALE_AFTER_MS + 1) });
    expect(peersOf(grey, NOW)[0]?.stale).toBe(true);
  });

  it("keeps a stale peer on the map for half an hour, because the age is the useful part", () => {
    const registry = registryWith({ userId: ALICE, observedAtMs: NOW - (DISCARD_AFTER_MS - 1) });
    expect(pruneRegistry(registry, NOW).changed).toBe(false);
  });

  it("discards a peer only past the discard threshold, and leaves the rest alone", () => {
    const registry = {
      ...registryWith({ userId: ALICE, observedAtMs: NOW - DISCARD_AFTER_MS - 1 }),
      ...registryWith({ userId: BOB, observedAtMs: NOW - 1_000 })
    };
    const result = pruneRegistry(registry, NOW);
    expect(result.changed).toBe(true);
    expect(Object.keys(result.registry)).toEqual([BOB]);
  });

  it("removes a revoked dot, an expired-share dot, and a silence-discarded dot through the exact same rule", () => {
    const initial = {
      ...registryWith({ userId: ALICE, observedAtMs: NOW - DISCARD_AFTER_MS - 1 }),
      ...registryWith({ userId: BOB, observedAtMs: NOW - 1_000 })
    };

    const byRevoke = applyShareEnded(initial, {
      shareId: "share-alice",
      userId: ALICE,
      reason: "revoked"
    });
    const byExpiry = applyShareEnded(initial, {
      shareId: "share-alice",
      userId: ALICE,
      reason: "expired"
    });
    const bySilence = pruneRegistry(initial, NOW);

    expect(byRevoke).toMatchObject({ changed: true, shareEnded: true, reason: "removed" });
    expect(byExpiry).toMatchObject({ changed: true, shareEnded: true, reason: "removed" });
    expect(byRevoke.registry).toEqual(bySilence.registry);
    expect(byExpiry.registry).toEqual(bySilence.registry);
    expect(peersOf(byRevoke.registry, NOW)).toEqual(peersOf(byExpiry.registry, NOW));
    expect(peersOverlay(byRevoke.registry, NOW)).toEqual(peersOverlay(byExpiry.registry, NOW));
  });

  it("ignores stale share ids once a fresh share has replaced them, and ignores malformed payloads", () => {
    const seeded = applyShareList(emptyRegistry, [
      { id: "share-current", owner: { id: ALICE, username: "مریم", lastLocation: { lat: 35.7, lon: 51.4 } } }
    ]);

    const stale = applyShareEnded(seeded, {
      shareId: "share-previous",
      userId: ALICE,
      reason: "revoked"
    });
    expect(stale).toMatchObject({ changed: false, shareEnded: false, reason: "stale-share" });
    expect(peersOf(stale.registry, NOW)).toHaveLength(1);

    const matching = applyShareEnded(seeded, {
      shareId: "share-current",
      userId: ALICE,
      reason: "expired"
    });
    expect(matching).toMatchObject({ changed: true, shareEnded: true, reason: "removed" });
    expect(peersOf(matching.registry, NOW)).toEqual([]);

    for (const bad of [
      null,
      undefined,
      {},
      { shareId: "", userId: ALICE, reason: "revoked" },
      { shareId: "s1", userId: "", reason: "revoked" },
      { shareId: "s1", userId: ALICE, reason: "other" }
    ]) {
      expect(applyShareEnded(seeded, bad as never)).toMatchObject({
        changed: false,
        shareEnded: false,
        reason: "invalid"
      });
    }
  });

  it("never discards a seeded position, which has no age to judge", () => {
    const registry = registryWith({ userId: ALICE, observedAtMs: null });
    expect(pruneRegistry(registry, NOW + 86_400_000).changed).toBe(false);
  });

  it("never reports a future fix as a negative age", () => {
    expect(peersOf(registryWith({ userId: ALICE, observedAtMs: NOW + 60_000 }), NOW)[0]?.ageMs).toBe(0);
  });
});

describe("peersOverlay", () => {
  it("draws one point per peer, in [lon, lat] order and not the reverse", () => {
    const registry = { ...registryWith({ userId: ALICE }), ...registryWith({ userId: BOB, lat: 32, lon: 53 }) };
    const collection = peersOverlay(registry, NOW);
    expect(collection.features.map((feature) => feature.geometry.coordinates)).toEqual([
      [51.4, 35.7],
      [53, 32]
    ]);
  });

  it("keeps clock-only age out of the map source, where no layer consumes it", () => {
    const feature = peersOverlay(registryWith({ userId: ALICE }), NOW).features[0];
    expect(feature?.properties).toEqual({ name: "سمیرا", stale: 0 });
  });

  it("reuses only identical visible dots, including names and ordering, while age labels keep advancing", () => {
    const first = registryWith({ userId: ALICE, observedAtMs: NOW - 1000 });
    const snapshot = peersOverlay(first, NOW);
    expect(peersOverlay(first, NOW + 5000, snapshot)).toBe(snapshot);
    expect(peersOf(first, NOW + 5000)[0]?.ageMs).toBe(6000);
    expect(peersOverlay(registryWith({ userId: ALICE, name: "نام تازه", observedAtMs: NOW - 1000 }),
      NOW + 5000, snapshot)).not.toBe(snapshot);
    expect(peersOverlay(registryWith({ userId: ALICE, lon: 52, observedAtMs: NOW - 1000 }),
      NOW + 5000, snapshot)).not.toBe(snapshot);
    expect(peersOverlay(first, NOW + STALE_AFTER_MS + 1, snapshot).features[0]?.properties.stale).toBe(1);
    const cleared = peersOverlay(emptyRegistry, NOW, snapshot);
    expect(cleared.features).toEqual([]);
    expect(cleared).not.toBe(snapshot);
    expect(peersOverlay(emptyRegistry, NOW + 5000, cleared)).toBe(cleared);
  });

  it("carries the stale flag as 0/1 so one layer can paint both states", () => {
    const registry = {
      ...registryWith({ userId: ALICE, observedAtMs: NOW - 1_000 }),
      ...registryWith({ userId: BOB, observedAtMs: NOW - STALE_AFTER_MS - 1 })
    };
    expect(peersOverlay(registry, NOW).features.map((feature) => feature.properties.stale)).toEqual([0, 1]);
  });

  it("is an empty collection with no peers, which clears the layer rather than removing it", () => {
    expect(peersOverlay(emptyRegistry, NOW)).toEqual({ type: "FeatureCollection", features: [] });
  });
});

describe("liveCompanionsStyle", () => {
  it("declares one source and the halo beneath DOM avatar markers", () => {
    const style = liveCompanionsStyle(false);
    expect(style.sources.map((source) => source.id)).toEqual([LIVE_SOURCE_ID]);
    expect(style.layers.map((layer) => layer.id)).toEqual([LIVE_HALO_LAYER_ID]);
    for (const layer of style.layers) {
      expect(layer.source).toBe(LIVE_SOURCE_ID);
      expect(layer.type).toBe("circle");
    }
  });

  it("names the halo as the layer playback should sit under", () => {
    expect(LIVE_BOTTOM_LAYER_ID).toBe(LIVE_HALO_LAYER_ID);
  });

  it("separates fresh from stale in both themes, so a grey dot never reads as live", () => {
    for (const dark of [true, false]) {
      const paint = liveCompanionsStyle(dark).layers.map((layer) => layer.paint["circle-color"]);
      for (const color of paint) {
        expect(Array.isArray(color)).toBe(true);
        const expression = color as unknown[];
        expect(expression[0]).toBe("case");
        expect(expression).toHaveLength(4); // ["case", condition, staleColor, liveColor]
        expect(new Set(expression.slice(2)).size).toBe(2);
      }
    }
  });

  it("hands the panel the same colors the map paints, so a legend cannot drift", () => {
    for (const dark of [true, false]) {
      const colors = liveMarkerColors(dark);
      const expression = liveCompanionsStyle(dark).layers[0]?.paint["circle-color"] as unknown[];
      expect(new Set(expression.slice(2))).toEqual(new Set([colors.stale, colors.live]));
    }
  });

  it("carries no text layer, because the map labels belong to the base style", () => {
    for (const layer of liveCompanionsStyle(true).layers) expect(layer.type).not.toBe("symbol");
  });
});

describe("status copy", () => {
  it("says nobody has shared when there is nothing to show, and does not blame a connection", () => {
    expect(liveStatus(emptyRegistry, { connected: true, nowMs: NOW, shareCount: 0 }).line).toBe("هنوز کسی موقعیتش را با شما زنده به اشتراک نگذاشته است.");
  });

  it("names the open shares while waiting for the first fix", () => {
    const status = liveStatus(emptyRegistry, { connected: true, nowMs: NOW, shareCount: 2 });
    expect(status.line).toContain("2 اشتراک زنده باز است");
    expect(status.line).toContain("منتظر اولین به‌روزرسانی");
  });

  it("explains an empty map when the live connection is down, which is a different reason", () => {
    expect(liveStatus(emptyRegistry, { connected: false, nowMs: NOW, shareCount: 1 }).line).toContain("اتصال زنده برقرار نیست");
  });

  it("counts the peers and the silent ones separately", () => {
    const registry = {
      ...registryWith({ userId: ALICE, observedAtMs: NOW - 1_000 }),
      ...registryWith({ userId: BOB, observedAtMs: NOW - STALE_AFTER_MS - 1 })
    };
    const status = liveStatus(registry, { connected: true, nowMs: NOW, shareCount: 2 });
    expect(status).toMatchObject({ peerCount: 2, staleCount: 1 });
    expect(status.line).toContain("2 همراه روی نقشه");
    expect(status.line).toContain("1 نفر آخرین موقعیت شناخته‌شده");
  });

  it("blames the failed read and not the companion when the share list did not load", () => {
    const status = liveStatus(registryWith({ userId: ALICE }), { connected: true, nowMs: NOW, shareCount: 3, readFailed: true });
    expect(status.line).toContain("فهرست اشتراک‌ها خوانده نشد");
    expect(status.line).not.toContain("هنوز کسی");
    expect(status.peerCount).toBe(1);
    expect(liveStatus(emptyRegistry, { connected: true, nowMs: NOW, shareCount: 0, readFailed: true }).line).toContain("موقعیتی نمایش داده نمی‌شود");
  });

  it("says nothing about silence when every peer is moving", () => {
    const status = liveStatus(registryWith({ userId: ALICE }), { connected: true, nowMs: NOW, shareCount: 1 });
    expect(status.line).not.toContain("شناخته‌شده");
    expect(status.line).toContain("اتصال زنده");
  });

  it("drops the live claim when the socket is down but dots remain", () => {
    const status = liveStatus(registryWith({ userId: ALICE }), { connected: false, nowMs: NOW, shareCount: 1 });
    expect(status.line).toContain("بدون اتصال زنده");
  });
});

describe("connection title", () => {
  it("agrees with the status line, so the icon and the sentence cannot contradict each other", () => {
    expect(connectionTitle(true)).toBe("اتصال زنده برقرار است");
    expect(connectionTitle(false)).toBe("اتصال زنده برقرار نیست");
    const down = liveStatus(registryWith({ userId: ALICE }), { connected: false, nowMs: NOW, shareCount: 1 });
    expect(down.line).toContain("بدون اتصال زنده");
    for (const line of [connectionTitle(true), connectionTitle(false), down.line]) expect(line).toContain("اتصال زنده");
  });
});

describe("ages in words", () => {
  it("does not invent an age for a seeded position", () => {
    expect(ageWords(null)).toBe("نامشخص");
  });

  it("says now for a fix that arrived this moment, not 0 seconds ago", () => {
    expect(ageWords(0)).toBe("همین حالا");
    expect(ageWords(14_000)).toBe("همین حالا");
    expect(ageWords(20_000)).toBe("۲۰ ثانیه پیش");
  });

  it("switches to minutes and keeps the human units the rest of the interface uses", () => {
    expect(ageWords(59_000)).toBe("۵۹ ثانیه پیش");
    expect(ageWords(90_000)).toBe("۱ دقیقه پیش");
    expect(ageWords(90 * 60_000)).toBe("۱ ساعت و ۳۰ دقیقه پیش");
  });

  it("labels a peer with the name the share carried and the age of the fix", () => {
    const peer = peersOf(registryWith({ userId: ALICE, name: "مریم", observedAtMs: NOW - 120_000 }), NOW)[0]!;
    expect(peerLabel(peer, NOW)).toBe("مریم · ۲ دقیقه پیش");
  });

  it("ignores stale location:share-ended events when openShareIds proves another share is active", () => {
    const seeded = applyShareList(emptyRegistry, [{ id: ALICE, username: "alice", lastLocation: { lat: 35.7, lon: 51.4 } }]);
    const ignored = applyShareEnded(
      seeded,
      { shareId: "old-retired-share", userId: ALICE, reason: "expired" },
      new Set(["active-share-now"])
    );
    expect(ignored).toMatchObject({ changed: false, shareEnded: false, reason: "stale-share" });
    expect(ignored.registry[ALICE]).toBeDefined();
  });
});
