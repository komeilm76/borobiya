import { describe, expect, it, vi } from "vitest";
import { createShareSubmissionFence } from "./share-submission-fence";

function bearer(owner: string, session: string, nonce = 0): string {
  return `e30.${btoa(JSON.stringify({ sub: owner, sessionId: session, nonce }))}.sig`;
}

describe("share dialog submission session fence", () => {
  it("rejects a pending share result after a different JWT login for the same account", async () => {
    let token: string | null = bearer("owner-a", "session-1");
    const fence = createShareSubmissionFence({ ownerId: () => "owner-a", accessToken: () => token, isOpen: () => true });
    const first = fence.begin();
    expect(fence.isCurrent(first)).toBe(true);
    token = bearer("owner-a", "session-1", 1);
    expect(fence.isCurrent(first)).toBe(true); // Normal renewal keeps the ticket.
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const published = vi.fn();
    const oldWrite = pending.then(() => { if (fence.isCurrent(first)) published(); });
    token = bearer("owner-a", "session-2");
    expect(fence.isCurrent(first)).toBe(false);
    release();
    await oldWrite;
    expect(published).not.toHaveBeenCalled();
    expect(fence.isCurrent(fence.begin())).toBe(true);
  });

  it("permits a missing bearer to recover for the same profile before a share is posted", () => {
    let token: string | null = null;
    const fence = createShareSubmissionFence({ ownerId: () => "owner-a", accessToken: () => token, isOpen: () => true });
    const ticket = fence.begin();
    expect(ticket).not.toBeNull();
    expect(fence.isCurrent(ticket)).toBe(false);
    token = bearer("owner-a", "restored-session");
    expect(fence.isCurrent(ticket)).toBe(true);
  });

  it("does not issue a ticket while the displayed profile disagrees with a JWT", () => {
    const fence = createShareSubmissionFence({
      ownerId: () => "owner-a", accessToken: () => bearer("owner-b", "session-2"), isOpen: () => true
    });
    expect(fence.begin()).toBeNull();
  });
  it("rejects late share or device-list results after close and reopen, even for the same user", () => {
    let owner: string | null = "owner-a";
    let token: string | null = "token-a";
    let open = true;
    const fence = createShareSubmissionFence({ ownerId: () => owner, accessToken: () => token, isOpen: () => open });
    const old = fence.begin();
    expect(fence.isCurrent(old)).toBe(true);
    open = false;
    fence.invalidate();
    open = true;
    expect(fence.isCurrent(old)).toBe(false);
    expect(fence.isCurrent(fence.begin())).toBe(true);
    owner = "owner-b";
    expect(fence.isCurrent(old)).toBe(false);
  });

  it("drops a delayed device-conflict result after close, even if reopened before the response", async () => {
    let open = true;
    const fence = createShareSubmissionFence({ ownerId: () => "owner-a", accessToken: () => "token-a", isOpen: () => open });
    const ticket = fence.begin();
    const openChooser = vi.fn();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const running = pending.then(() => { if (fence.isCurrent(ticket)) openChooser(); });
    open = false;
    fence.invalidate();
    open = true;
    finish();
    await running;
    expect(openChooser).not.toHaveBeenCalled();
  });

  it("allows same-session bearer renewal but never accepts a lost session or a new account", () => {
    let owner: string | null = "owner-a";
    let token: string | null = "token-a";
    const fence = createShareSubmissionFence({ ownerId: () => owner, accessToken: () => token, isOpen: () => true });
    const ticket = fence.begin();
    token = "rotated-token-a";
    expect(fence.isCurrent(ticket)).toBe(true);
    token = null;
    expect(fence.isActive(ticket)).toBe(true); // a still-open sign-in prompt can be shown
    expect(fence.isCurrent(ticket)).toBe(false);
    fence.invalidate();
    token = "token-a-new-session";
    expect(fence.isCurrent(ticket)).toBe(false);
    const next = fence.begin();
    owner = "owner-b";
    expect(fence.isCurrent(next)).toBe(false);
    expect(fence.isCurrent(fence.begin())).toBe(true);
  });
});
