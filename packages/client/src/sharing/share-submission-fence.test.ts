import { describe, expect, it, vi } from "vitest";
import { createShareSubmissionFence } from "./share-submission-fence";

describe("share dialog submission session fence", () => {
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
