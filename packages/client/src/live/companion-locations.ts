import { formatDuration } from "@/sharing/share-form";
import { pointsOverlay, type MapPosition, type OverlayCollection, type OverlayStyle } from "@/map/overlay-sync";

/**
 * Live companion markers (T2.1.8) — the whole model, as data.
 *
 * A receiver gets positions two ways, and the difference between them is the reason this file exists:
 *
 * 1. `GET /_user/location/shares` answers each `sharedWithMe` row with `owner.lastLocation`, which is
 *    `{lat, lon}` and **nothing else** — no accuracy, and no timestamp. It says "this is the last
 *    position we have", not "this is where they are now".
 * 2. `location:peer-update` carries `{userId, lat, lon, accuracy, timestamp}` for every fix the server
 *    accepted from a device somebody shared with me — and it is emitted to the sender's own room too
 *    (`realtime/socket.ts` echoes so a broadcaster can confirm its fix landed), so a receiver that
 *    is also broadcasting would draw itself as one of its own companions unless `userId` is filtered.
 *
 * So a seeded peer gets `observedAtMs: null` and is rendered stale-but-present, which is exactly what
 * the server told us. And a live fix never moves a dot backwards, because the same fix can arrive
 * twice over two paths (HTTP `/location/update` fan-out and the socket ack) and a reconnect replays.
 */

export const LIVE_SOURCE_ID = "borobiya-live-peers";
export const LIVE_HALO_LAYER_ID = "borobiya-live-peers-halo";
export const LIVE_DOT_LAYER_ID = "borobiya-live-peers-dot";

/**
 * The bottom-most live layer. `UserMapView` passes it as `beforeLayerId` to the playback planner, so a
 * greyed history trace slides *under* the markers that are moving right now instead of covering them.
 */
export const LIVE_BOTTOM_LAYER_ID = LIVE_HALO_LAYER_ID;

/**
 * A peer counts as stale after this much silence.
 *
 * A broadcaster sends every 3–5s (`LOCATION_UPDATE_INTERVAL_MS`) and the server allows 20 updates a
 * minute, so 45 seconds is roughly ten missed updates: long enough that a dropped packet never flips
 * a dot grey, short enough that a phone in a pocket stops claiming to be live within a minute.
 */
export const STALE_AFTER_MS = 45_000;

/**
 * After this much silence the dot leaves the map entirely.
 *
 * Deliberately not instant-on-stale: the age is what a user reads, so a peer who stopped 3 minutes ago
 * should still be on the map, grey and labelled. After half an hour "live companion" is a misnomer —
 * the position could be kilometres wrong — and `/_user/map` is not the place for old data; the history
 * share already shows that with a real timestamp.
 */
export const DISCARD_AFTER_MS = 30 * 60_000;

/** Below this age the copy says "now" rather than "0 seconds ago". */
const MOMENT_MS = 15_000;

const UNKNOWN_NAME = "همراه";

export interface CompanionFix {
  readonly lat: number;
  readonly lon: number;
  /** Only a live fix carries accuracy; the share list does not. */
  readonly accuracy: number | null;
  /** `null` for a position seeded from the share list: we do not know when it was observed. */
  readonly observedAtMs: number | null;
}

export interface CompanionPeer {
  readonly userId: string;
  readonly name: string;
  /**
   * `null` for a peer with an open share and no position yet. Membership is what authorises their fixes;
   * an empty position must not remove them from the allow-list, or the first fix they ever send — which is
   * exactly the "share created a moment ago" case — would be dropped as unlisted, forever.
   */
  readonly fix: CompanionFix | null;
  /** Active share ids backing this peer when seeded from full `sharedWithMe` rows. */
  readonly shareIds?: readonly string[];
}

/** Keyed by owner id, so one peer is one dot however many shares or devices feed it. */
export type CompanionRegistry = Readonly<Record<string, CompanionPeer>>;

export const emptyRegistry: CompanionRegistry = {};

export type ApplyReason = "applied" | "self" | "unlisted" | "invalid" | "stale-replay";

export interface ApplyResult {
  readonly registry: CompanionRegistry;
  readonly changed: boolean;
  readonly reason: ApplyReason;
}

export type ShareEndedReason = "revoked" | "expired";

export type ShareEndedApplyReason = "removed" | "retained" | "stale-share" | "absent" | "invalid";

export interface ShareEndedResult {
  readonly registry: CompanionRegistry;
  readonly changed: boolean;
  /** True when an active share arrangement we held has now ended. */
  readonly shareEnded: boolean;
  readonly reason: ShareEndedApplyReason;
}

export type ShareListEntry =
  | { readonly id?: unknown; readonly username?: unknown; readonly lastLocation?: unknown }
  | {
      readonly id?: unknown;
      readonly owner: { readonly id?: unknown; readonly username?: unknown; readonly lastLocation?: unknown };
    };

/** Why a peer is on the map, spelled out for the status line and the tests. */
export interface CompanionView {
  readonly userId: string;
  readonly name: string;
  readonly position: MapPosition;
  readonly accuracy: number | null;
  /** `null` when the position was seeded from the share list rather than received live. */
  readonly ageMs: number | null;
  readonly stale: boolean;
}

/**
 * Records one `location:peer-update`.
 *
 * `registry` doubles as the allow-list: the server only emits to a user holding an active share, so an
 * id we have never seen means our list is out of date (a share created a moment ago, or a forged
 * payload on a compromised connection). `unlisted` tells the caller to re-read the shares instead of
 * silently dropping a legitimate first fix or drawing something we were never granted.
 */
export function applyPeerUpdate(
  registry: CompanionRegistry,
  update: { userId?: unknown; lat?: unknown; lon?: unknown; accuracy?: unknown; timestamp?: unknown },
  ownUserId: string | null
): ApplyResult {
  const userId = typeof update.userId === "string" ? update.userId : "";
  if (!userId) return { registry, changed: false, reason: "invalid" };
  if (ownUserId && userId === ownUserId) return { registry, changed: false, reason: "self" };

  const known = registry[userId];
  if (!known) return { registry, changed: false, reason: "unlisted" };

  const lat = finiteNumber(update.lat);
  const lon = finiteNumber(update.lon);
  if (lat === null || lon === null || !isCoordinate(lat, lon)) {
    return { registry, changed: false, reason: "invalid" };
  }

  const observedAtMs = parseTime(update.timestamp);
  if (observedAtMs === null) return { registry, changed: false, reason: "invalid" };
  const previous = known.fix?.observedAtMs ?? null;
  // A seeded fix (no time) is always replaced; a live one only by something newer. Same-instant
  // duplicates from the double fan-out are dropped so the dot does not re-render on every echo.
  if (previous !== null && observedAtMs <= previous) return { registry, changed: false, reason: "stale-replay" };

  return {
    registry: { ...registry, [userId]: { ...known, fix: { lat, lon, accuracy: finiteNumber(update.accuracy), observedAtMs } } },
    changed: true,
    reason: "applied"
  };
}

function isWrappedShareRow(
  entry: ShareListEntry
): entry is {
  readonly id?: unknown;
  readonly owner: { readonly id?: unknown; readonly username?: unknown; readonly lastLocation?: unknown };
} {
  return "owner" in entry && Boolean(entry.owner) && typeof entry.owner === "object";
}

function dropPeers(
  registry: CompanionRegistry,
  shouldDrop: (peer: CompanionPeer) => boolean
): { registry: CompanionRegistry; changed: boolean } {
  let changed = false;
  const next: Record<string, CompanionPeer> = {};
  for (const [userId, peer] of Object.entries(registry)) {
    if (shouldDrop(peer)) {
      changed = true;
      continue;
    }
    next[userId] = peer;
  }
  return changed ? { registry: next, changed: true } : { registry, changed: false };
}

/**
 * Reconciles the registry with a fresh read of `sharedWithMe`.
 *
 * Peers who lost their share are dropped (that is what a revoke looks like from this side), new ones
 * are seeded from `owner.lastLocation`, and the ones still there keep the live fix they already have —
 * a list read must never teleport somebody back to an older position just because it arrived later.
 */
export function applyShareList(
  registry: CompanionRegistry,
  entries: readonly ShareListEntry[]
): CompanionRegistry {
  const next: Record<string, CompanionPeer> = {};
  const shareIdsByUser = new Map<string, string[]>();

  for (const entry of entries) {
    const shareId = isWrappedShareRow(entry) && typeof entry.id === "string" && entry.id ? entry.id : null;
    const owner = isWrappedShareRow(entry) ? entry.owner : entry;
    const userId = typeof owner.id === "string" ? owner.id : "";
    if (!userId) continue;

    if (shareId) {
      const recorded = shareIdsByUser.get(userId) ?? [];
      if (!recorded.includes(shareId)) recorded.push(shareId);
      shareIdsByUser.set(userId, recorded);
    }

    const name = typeof owner.username === "string" && owner.username.trim() ? owner.username.trim() : UNKNOWN_NAME;
    const existing = next[userId] ?? registry[userId];
    if (existing) {
      next[userId] = existing.name === name ? existing : { ...existing, name };
      continue;
    }
    const seeded = seedFix(owner.lastLocation);
    // `observedAtMs: null` rather than the read time: claiming "now" for a position the server never
    // timestamped would be an invention, and an age we made up would later win the "never move
    // backwards" comparison against a real fix. A seed is therefore stale from the first render, and
    // `pruneRegistry` keeps it (there is no age to judge) until the share goes or a live fix arrives.
    // A peer with no `lastLocation` at all is registered with `fix: null` rather than skipped.
    next[userId] = { userId, name, fix: seeded ? { ...seeded, observedAtMs: null } : null };
  }

  for (const [userId, peer] of Object.entries(next)) {
    const ids = shareIdsByUser.get(userId);
    if (ids && ids.length > 0) {
      next[userId] = { ...peer, shareIds: ids };
    } else if ("shareIds" in peer) {
      const { shareIds: _dropped, ...bare } = peer;
      next[userId] = bare;
    }
  }
  return next;
}

/**
 * Applies a server `location:share-ended` notification (`reason: "revoked" | "expired"`).
 *
 * Manual revocations and minute-sweep expiries pass through the exact same removal rule as
 * `pruneRegistry`: once no active share remains for `userId`, the peer leaves `registry` immediately.
 */
export function applyShareEnded(
  registry: CompanionRegistry,
  event: { shareId?: unknown; userId?: unknown; reason?: unknown } | null | undefined,
  openShareIds?: ReadonlySet<string>
): ShareEndedResult {
  if (!event || typeof event !== "object") {
    return { registry, changed: false, shareEnded: false, reason: "invalid" };
  }
  const shareId = typeof event.shareId === "string" ? event.shareId : "";
  const userId = typeof event.userId === "string" ? event.userId : "";
  if (!shareId || !userId || (event.reason !== "revoked" && event.reason !== "expired")) {
    return { registry, changed: false, shareEnded: false, reason: "invalid" };
  }

  const peer = registry[userId];
  if (!peer) {
    return {
      registry,
      changed: false,
      shareEnded: Boolean(openShareIds?.has(shareId)),
      reason: "absent"
    };
  }

  if (peer.shareIds && peer.shareIds.length > 0) {
    if (!peer.shareIds.includes(shareId)) {
      return { registry, changed: false, shareEnded: false, reason: "stale-share" };
    }
    const remaining = peer.shareIds.filter((id) => id !== shareId);
    if (remaining.length > 0) {
      return {
        registry: { ...registry, [userId]: { ...peer, shareIds: remaining } },
        changed: false,
        shareEnded: true,
        reason: "retained"
      };
    }
  } else if (openShareIds && !openShareIds.has(shareId)) {
    return { registry, changed: false, shareEnded: false, reason: "stale-share" };
  }

  const dropped = dropPeers(registry, (candidate) => candidate.userId === userId);
  return { ...dropped, shareEnded: dropped.changed, reason: "removed" };
}

/** Drops peers whose last live fix is too old to call live. Seeded peers are kept: nothing says how old they are. */
export function pruneRegistry(registry: CompanionRegistry, nowMs: number, discardAfterMs = DISCARD_AFTER_MS): { registry: CompanionRegistry; changed: boolean } {
  return dropPeers(registry, (peer) => {
    const age = ageOf(peer.fix, nowMs);
    return age !== null && age > discardAfterMs;
  });
}

export function peersOf(registry: CompanionRegistry, nowMs: number): CompanionView[] {
  return Object.values(registry)
    .filter((peer): peer is CompanionPeer & { fix: CompanionFix } => peer.fix !== null)
    .map((peer) => ({
      userId: peer.userId,
      name: peer.name,
      position: [peer.fix.lon, peer.fix.lat] as MapPosition,
      accuracy: peer.fix.accuracy,
      ageMs: ageOf(peer.fix, nowMs),
      stale: isStale(peer.fix, nowMs)
    }))
    // Newest first: the list a user reads should start with the person who is moving now, and sorting
    // by name would put a silent peer above an active one whenever the alphabet says so.
    .sort((left, right) => (left.ageMs ?? -1) - (right.ageMs ?? -1));
}

function ageOf(fix: CompanionFix | null, nowMs: number): number | null {
  if (!fix || fix.observedAtMs === null) return null;
  return Math.max(0, nowMs - fix.observedAtMs);
}

/**
 * Staleness is only ever *noticed* on a tick, so callers should read this as "stale within one tick of the
 * threshold" rather than at the exact millisecond; nothing about a dot changes between ticks anyway.
 */
function isStale(fix: CompanionFix | null, nowMs: number, staleAfterMs = STALE_AFTER_MS): boolean {
  // A seeded position is stale by definition: we cannot claim it is current when the API never said when it was taken.
  if (!fix || fix.observedAtMs === null) return true;
  return nowMs - fix.observedAtMs > staleAfterMs;
}

/** How many peers hold a share but have sent nothing we can draw yet. */
export function countAwaiting(registry: CompanionRegistry): number {
  return Object.values(registry).filter((peer) => peer.fix === null).length;
}

/** One `FeatureCollection` of every peer, `stale` as 0/1 so a single layer can paint both states. */
export function peersOverlay(registry: CompanionRegistry, nowMs: number): OverlayCollection {
  return pointsOverlay(
    peersOf(registry, nowMs).map((peer) => ({
      position: peer.position,
      properties: { name: peer.name, stale: peer.stale ? 1 : 0, ageSeconds: peer.ageMs === null ? null : Math.floor(peer.ageMs / 1000) }
    }))
  );
}

/**
 * The two marker colors, exposed because the status panel's legend dot has to be the *same* teal the map
 * paints. A component that hardcoded it would drift the first time the map palette moved, and nothing
 * here renders a map to catch that.
 */
export function liveMarkerColors(dark: boolean): { live: string; stale: string } {
  return dark ? { live: "#6ee7d7", stale: "rgba(226, 240, 238, 0.55)" } : { live: "#0e6666", stale: "rgba(23, 59, 60, 0.45)" };
}

/** The sources and layers the live overlay owns, as data — same reason as the playback descriptor. */
export function liveCompanionsStyle(dark: boolean): OverlayStyle {
  const { live: liveColor, stale: staleColor } = liveMarkerColors(dark);
  // No text layer with the peer's name, even though both local styles declare `glyphs`: whether the
  // `/font/{fontstack}/{range}` endpoint actually carries a Persian-capable face is unverified here, and
  // a missing glyph range is a broken map rather than a missing label. Names belong to the status panel,
  // which is also where they stay readable at every zoom.
  //
  // A `["case", ["==", ["get","stale"], 1], …]` expression instead of two layers: one source, one
  // setData per update, and the property lives on the feature that carries it.
  const color = ["case", ["==", ["get", "stale"], 1], staleColor, liveColor];
  return {
    sources: [{ type: "geojson", id: LIVE_SOURCE_ID, data: pointsOverlay([]) }],
    layers: [
      {
        id: LIVE_HALO_LAYER_ID,
        type: "circle",
        source: LIVE_SOURCE_ID,
        // The halo is what makes a moving dot findable on a busy map at street zoom; it grows with the
        // zoom on purpose (interpolate), because at city zoom a 12px halo would fuse neighbouring peers.
        paint: {
          "circle-color": color,
          "circle-opacity": 0.18,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 7, 16, 16]
        }
      },
      {
        id: LIVE_DOT_LAYER_ID,
        type: "circle",
        source: LIVE_SOURCE_ID,
        paint: {
          "circle-color": color,
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": dark ? "#071b1c" : "#ffffff"
        }
      }
    ]
  };
}

/**
 * The status line above the map. Every state says who is missing and why — the rule this phase holds
 * itself to for refusals too.
 */
export function liveStatus(
  registry: CompanionRegistry,
  options: { connected: boolean; nowMs: number; shareCount: number; readFailed?: boolean }
): { line: string; peerCount: number; staleCount: number; awaitingCount: number } {
  const peers = peersOf(registry, options.nowMs);
  const staleCount = peers.filter((peer) => peer.stale).length;
  const awaiting = countAwaiting(registry);
  if (options.readFailed) {
    // A failed read is our fault, not a companion's: "nobody has shared with you" would be a confident
    // invention, so the copy says the list did not load and keeps whatever is already on the map.
    const shown = peers.length > 0 ? `${peers.length} آخرین موقعیت شناخته‌شده نمایش داده می‌شود` : "موقعیتی نمایش داده نمی‌شود";
    return { line: `فهرست اشتراک‌ها خوانده نشد؛ ${shown}. با دکمهٔ تازه‌سازی دوباره تلاش کنید.`, peerCount: peers.length, staleCount, awaitingCount: awaiting };
  }
  if (peers.length === 0) {
    if (options.shareCount === 0) {
      return { line: "هنوز کسی موقعیتش را با شما زنده به اشتراک نگذاشته است.", peerCount: 0, staleCount: 0, awaitingCount: 0 };
    }
    return {
      line: options.connected
        ? `${options.shareCount} اشتراک زنده باز است و منتظر اولین به‌روزرسانی هستیم.`
        : `${options.shareCount} اشتراک زنده باز است، اما اتصال زنده برقرار نیست.`,
      peerCount: 0,
      staleCount: 0,
      awaitingCount: awaiting
    };
  }
  const parts = [`${peers.length} همراه روی نقشه`];
  if (staleCount > 0) parts.push(`${staleCount} نفر آخرین موقعیت شناخته‌شده`);
  if (awaiting > 0) parts.push(`${awaiting} نفر هنوز موقعیتی نفرستاده`);
  parts.push(options.connected ? "اتصال زنده" : "بدون اتصال زنده");
  return { line: parts.join(" · "), peerCount: peers.length, staleCount, awaitingCount: awaiting };
}

/**
 * What the signal icon says. It lives here for the same reason the status line does: a component allowed
 * to phrase the connection state would phrase it differently from the sentence next to it, and the two
 * would contradict each other in exactly the case a user is trying to understand.
 */
export function connectionTitle(connected: boolean): string {
  return connected ? "اتصال زنده برقرار است" : "اتصال زنده برقرار نیست";
}

/** The age of one peer, in the words the interface uses everywhere. */
export function ageWords(ageMs: number | null): string {
  if (ageMs === null) return "نامشخص";
  if (ageMs <= MOMENT_MS) return "همین حالا";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return `${Math.floor(ageMs / 1000)} ثانیه پیش`;
  return `${formatDuration(minutes)} پیش`;
}

export function peerLabel(peer: CompanionView, nowMs: number): string {
  const age = ageWords(peer.ageMs);
  return `${peer.name} · ${age}`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function parseTime(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function seedFix(value: unknown): Omit<CompanionFix, "observedAtMs"> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { lat?: unknown; lon?: unknown };
  const lat = finiteNumber(candidate.lat);
  const lon = finiteNumber(candidate.lon);
  if (lat === null || lon === null || !isCoordinate(lat, lon)) return null;
  return { lat, lon, accuracy: null };
}
