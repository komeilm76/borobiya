import { EventEmitter } from "node:events";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOS_PROPOSAL_RECEIVED_EVENT } from "@/services/socket-events";
import { useAuthStore } from "./auth";
import { configureProposalInboxForTests, useProposalInboxStore } from "./proposal-inbox";

const rescuerId = "11111111-1111-4111-8111-111111111111";
const proposal = {
  id: "22222222-2222-4222-8222-222222222222",
  sosRequestId: "33333333-3333-4333-8333-333333333333",
  rescuerId, status: "pending" as const, createdAt: "2026-10-24T12:00:00.000Z"
};

function page(items: typeof proposal[]) {
  return { items, total: items.length, page: 1, limit: 20, totalPages: items.length ? 1 : 0 };
}

describe("proposal inbox", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => { configureProposalInboxForTests(); vi.restoreAllMocks(); });

  it("loads only a signed-in rescuer's pending count, refreshes on socket event, and clears on logout", async () => {
    const socket = Object.assign(new EventEmitter(), { connected: false });
    const close = vi.fn();
    const updateToken = vi.fn();
    let items: typeof proposal[] = [];
    const list = vi.fn(async () => page(items));
    configureProposalInboxForTests({
      list,
      openSocket: async () => ({ socket: socket as never, connect: vi.fn(), updateToken, close })
    });
    const auth = useAuthStore();
    const inbox = useProposalInboxStore();
    expect(list).not.toHaveBeenCalled();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
    expect(inbox.total).toBe(0);

    items = [proposal];
    socket.emit(SOS_PROPOSAL_RECEIVED_EVENT, { proposal, sosRequest: {
      id: proposal.sosRequestId, requesterId: "44444444-4444-4444-8444-444444444444",
      severity: "high", description: "An urgent mission proposal for rescue.",
      incidentTypeId: "55555555-5555-4555-8555-555555555555",
      location: { lat: 35.7, lon: 51.4, isManual: false },
      photoUrl: null, status: "dispatched", cancellationReasonId: null,
      cancellationCustomText: null, cancelledAt: null, createdAt: "2026-10-24T12:00:00.000Z"
    } });
    await vi.waitFor(() => expect(inbox.total).toBe(1));
    expect(inbox.proposals).toEqual([proposal]);
    auth.accessToken = "rotated-token";
    await nextTick();
    expect(updateToken).toHaveBeenCalledWith("rotated-token");

    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    expect(inbox.proposals).toEqual([]);
    expect(inbox.total).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it("ignores a late inbox reply from the previous account", async () => {
    let resolve!: (result: ReturnType<typeof page>) => void;
    const pending = new Promise<ReturnType<typeof page>>((done) => { resolve = done; });
    configureProposalInboxForTests({ list: async () => pending, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.loading).toBe(true));
    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    resolve(page([proposal]));
    await pending;
    await nextTick();
    expect(inbox.proposals).toEqual([]);
    expect(inbox.total).toBe(0);
  });
});
