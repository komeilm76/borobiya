import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createShareEndedSubscription, type ShareEndedClient } from "./share-list-session";
import { SHARE_ENDED_EVENT } from "../services/socket-events";
import { createShareSubmissionFence } from "./share-submission-fence";

const source = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeClient() {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    socket: {
      on: vi.fn((event: string, handler: (payload: unknown) => void) => { handlers.set(event, handler); }),
      off: vi.fn((event: string, handler: (payload: unknown) => void) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      })
    },
    connect: vi.fn(),
    close: vi.fn()
  };
}

describe("share-list session boundaries", () => {
  it("opens once per token, rotates the handshake on refresh, and closes on logout", async () => {
    const first = fakeClient(), rotated = fakeClient();
    const open = vi.fn(async (token: string) => token === "old" ? first as unknown as ShareEndedClient : rotated as unknown as ShareEndedClient);
    const onEnded = vi.fn();
    const sync = createShareEndedSubscription(open, onEnded);
    await sync.setToken("old");
    await sync.setToken("old");
    expect(open).toHaveBeenCalledTimes(1);
    expect(first.connect).toHaveBeenCalledOnce();
    first.handlers.get(SHARE_ENDED_EVENT)?.({ shareId: "before" });
    expect(onEnded).toHaveBeenCalledTimes(1);

    await sync.setToken("new");
    expect(first.socket.off).toHaveBeenCalledWith(SHARE_ENDED_EVENT, onEnded);
    expect(first.close).toHaveBeenCalledOnce();
    expect(open).toHaveBeenLastCalledWith("new");
    expect(rotated.connect).toHaveBeenCalledOnce();
    first.handlers.get(SHARE_ENDED_EVENT)?.({ shareId: "late" });
    rotated.handlers.get(SHARE_ENDED_EVENT)?.({ shareId: "after" });
    expect(onEnded).toHaveBeenCalledTimes(2);

    await sync.setToken(null);
    expect(rotated.close).toHaveBeenCalledOnce();
    expect(rotated.handlers.size).toBe(0);
  });

  it("closes a stale async open instead of attaching after sign-out or a newer token", async () => {
    const old = deferred<ShareEndedClient>();
    const replacement = fakeClient();
    const onEnded = vi.fn();
    const sync = createShareEndedSubscription((token) => token === "old" ? old.promise : Promise.resolve(replacement as unknown as ShareEndedClient), onEnded);
    const opening = sync.setToken("old");
    await sync.setToken("new");
    const stale = fakeClient();
    old.resolve(stale as unknown as ShareEndedClient);
    await opening;
    expect(stale.connect).not.toHaveBeenCalled();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(replacement.connect).toHaveBeenCalledOnce();
    await sync.setToken(null);
    expect(replacement.close).toHaveBeenCalledOnce();
  });

  it("cannot attach a socket whose dynamic import finishes after logout", async () => {
    const pending = deferred<ShareEndedClient>();
    const sync = createShareEndedSubscription(() => pending.promise, vi.fn());
    const opening = sync.setToken("old");
    await sync.setToken(null);
    const stale = fakeClient();
    pending.resolve(stale as unknown as ShareEndedClient);
    await opening;
    expect(stale.connect).not.toHaveBeenCalled();
    expect(stale.close).toHaveBeenCalledOnce();
  });

  it("ignores a failed connection and closes on component disposal", async () => {
    const client = fakeClient();
    const open = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(client as unknown as ShareEndedClient);
    const sync = createShareEndedSubscription(open, vi.fn());
    await sync.setToken("old");
    await sync.setToken("old");
    expect(client.connect).toHaveBeenCalledOnce();
    sync.close();
    expect(client.close).toHaveBeenCalledOnce();
    await sync.setToken("new");
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("drops late revocation feedback after an account switch or unmount, without rejecting a bearer renewal", async () => {
    let owner = "owner-a";
    let token: string | null = "old-token";
    let mounted = true;
    const fence = createShareSubmissionFence({ ownerId: () => owner, accessToken: () => token, isOpen: () => mounted });
    const publish = vi.fn();
    const first = deferred<void>();
    const ticket = fence.begin();
    const pending = first.promise.then(() => { if (fence.isCurrent(ticket)) publish(); });
    token = "renewed-token";
    expect(fence.isCurrent(ticket)).toBe(true);
    owner = "owner-b";
    fence.invalidate();
    first.resolve();
    await pending;
    expect(publish).not.toHaveBeenCalled();

    const second = deferred<void>();
    const next = fence.begin();
    const later = second.promise.then(() => { if (fence.isCurrent(next)) publish(); });
    mounted = false;
    fence.invalidate();
    second.resolve();
    await later;
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not let a late revocation from the old session change the new account's rows or feedback", () => {
    expect(source).toContain('const revocation = revocationFence.begin();');
    expect(source).toMatch(/await auth\.ensureSession\(\);\s*if \(!revocationFence\.isActive\(revocation\)\) return;/);
    expect(source).toMatch(/await revokeLocationShare\(row\.id, token\);\s*if \(!revocationFence\.isCurrent\(revocation\)\) return;/);
    expect(source).toMatch(/await revokeLocationHistoryShare\(row\.id, token\);\s*if \(!revocationFence\.isCurrent\(revocation\)\) return;/);
    expect(source).toMatch(/await refresh\(\);\s*if \(!revocationFence\.isCurrent\(revocation\)\) return;/);
    expect(source).toMatch(/function resetShareRows\(\): void \{[\s\S]*?revocationFence\.invalidate\(\);/);
    expect(source).toMatch(/onBeforeUnmount\(\(\) => \{\s*disposed = true;\s*revocationFence\.invalidate\(\);/);
    expect(source).toMatch(/catch \(error\) \{\s*if \(!revocationFence\.isCurrent\(revocation\)\) return;/);
    expect(source).toContain('revoking.value = false;');
    expect(source).toContain('pendingRevocation.value = null;');
    expect(source).toContain('if (revoking.value) return;');
    expect(source).toContain(':disabled="revoking"');
    expect(source).toMatch(/if \(!token && previousToken\) resetShareRows\(\);\s*},\s*\{ immediate: true, flush: "sync" \}/);
    expect(source).toMatch(/if \(nextId && auth\.accessToken && \(previousId \|\| loaded\.value\)\) void refresh\(\);\s*}, \{ flush: "sync" \}/);
  });

  it("invalidates in-flight reads and clears four private lists on sign-out and account switch", () => {
    expect(source).toContain("createShareEndedSubscription(");
    expect(source).toContain("void shareSync.setToken(token)");
    expect(source).toContain("if (!token && previousToken) resetShareRows();");
    expect(source).toContain("watch(() => auth.user?.id, (nextId, previousId) => {");
    expect(source).toContain("if (nextId === previousId) return;");
    expect(source).toContain("readVersion += 1;");
    for (const rows of ["owned", "received", "ownedHistory", "receivedHistory"]) {
      expect(source).toContain(`${rows}.value = [];`);
    }
    expect(source).toContain("if (nextId && auth.accessToken && (previousId || loaded.value)) void refresh();");
    expect(source).toContain("shareSync.close();");
  });
});
