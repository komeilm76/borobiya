import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
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

  it("retains known offers but marks their count unverified after a failed refresh", async () => {
    let online = true;
    const list = vi.fn(async () => {
      if (!online) throw new Error("temporary network outage");
      return page([proposal]);
    });
    configureProposalInboxForTests({ list, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.total).toBe(1));
    online = false;
    await inbox.refresh();
    expect(inbox.failed).toBe(true);
    expect(inbox.proposals).toEqual([proposal]);
    expect(inbox.total).toBe(1); // last-known count, not a verified current count
    const view = readFileSync(new URL("../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.vue", import.meta.url), "utf8");
    expect(view).toContain('v-if="inbox.failed && inbox.proposals.length"');
    expect(view).toContain('به‌روزرسانی پیشنهادها انجام نشد');
    expect(view).toContain('variant="text" :loading="inbox.loading" @click="inbox.refresh()"');
    expect(view).toContain("تعداد تأیید نشده");
    expect(app).toContain('!proposalInbox.failed && proposalInbox.total > 0');
    expect(app).toContain("proposalInbox.failed ? 'نامشخص' : proposalInbox.total");
    const sidebar = readFileSync(new URL("../components/shell/MapProposalSidebar.vue", import.meta.url), "utf8");
    expect(sidebar).toContain("props.inbox.failed");
    expect(sidebar).toContain("'تعداد نامشخص'");
    online = true;
    await inbox.refresh();
    expect(inbox.failed).toBe(false);
  });

  it("clears a stale-list warning after the server confirms accepting an offer", async () => {
    let online = true;
    configureProposalInboxForTests({
      list: async () => { if (!online) throw new Error("offline"); return page([proposal]); },
      accept: async () => "77777777-7777-4777-8777-777777777777",
      openSocket: async () => ({ socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn() })
    });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    auth.initialized = true;
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.total).toBe(1));
    online = false;
    await inbox.refresh();
    expect(inbox.failed).toBe(true);
    expect(await inbox.decide(proposal.id, "accept")).toBe(true);
    expect(inbox.acceptedMissionId).toBe("77777777-7777-4777-8777-777777777777");
    expect(inbox.failed).toBe(false);
    expect(inbox.total).toBe(0);
  });

  it("reopens a failed SOS socket on the next inbox poll without retrying after logout", async () => {
    vi.useFakeTimers();
    try {
      const socket = Object.assign(new EventEmitter(), { connected: false });
      const close = vi.fn();
      const connect = vi.fn(() => { socket.connected = true; });
      const openSocket = vi.fn().mockRejectedValueOnce(new Error("temporary setup failure"))
        .mockResolvedValue({ socket, updateToken: vi.fn(), connect, close });
      configureProposalInboxForTests({ list: async () => page([]), openSocket });
      const auth = useAuthStore();
      auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
      auth.accessToken = "first-token";
      useProposalInboxStore();
      await nextTick();
      await Promise.resolve();
      expect(openSocket).toHaveBeenCalledTimes(1);
      auth.accessToken = "rotated-token";
      await nextTick();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(openSocket).toHaveBeenCalledTimes(2);
      expect(connect).toHaveBeenCalledOnce();
      auth.accessToken = null;
      auth.user = null;
      await nextTick();
      expect(close).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(openSocket).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("closes a delayed socket opened for the previous account rather than restoring its presence", async () => {
    let finishOld!: (value: unknown) => void;
    const oldSocket = Object.assign(new EventEmitter(), { connected: false });
    const oldClose = vi.fn();
    const newConnect = vi.fn();
    const openSocket = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValue({ socket: Object.assign(new EventEmitter(), { connected: false }),
        updateToken: vi.fn(), connect: newConnect, close: vi.fn() });
    configureProposalInboxForTests({ list: async () => page([]), openSocket });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "first-token";
    useProposalInboxStore();
    await nextTick();
    auth.user = { id: "44444444-4444-4444-8444-444444444444", username: "second", role: "user",
      mustCompleteSecurityQuestions: false };
    auth.accessToken = "second-token";
    await nextTick();
    finishOld({ socket: oldSocket, updateToken: vi.fn(), connect: vi.fn(), close: oldClose });
    await vi.waitFor(() => expect(oldClose).toHaveBeenCalledOnce());
    expect(newConnect).toHaveBeenCalledOnce();
    expect(openSocket).toHaveBeenCalledTimes(2);
  });

  it("serializes accept clicks, remembers a committed mission and clears other pending offers", async () => {
    let resolve!: (id: string) => void;
    const waiting = new Promise<string>((done) => { resolve = done; });
    const accept = vi.fn(async () => waiting);
    configureProposalInboxForTests({
      list: async () => page([proposal, { ...proposal, id: "66666666-6666-4666-8666-666666666666" }]),
      accept,
      openSocket: async () => ({ socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn() })
    });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.total).toBe(2));
    auth.initialized = true;
    const first = inbox.decide(proposal.id, "accept");
    expect(inbox.decidingId).toBe(proposal.id);
    expect(await inbox.decide(proposal.id, "accept")).toBe(false);
    await vi.waitFor(() => expect(accept).toHaveBeenCalledOnce());
    resolve("77777777-7777-4777-8777-777777777777");
    expect(await first).toBe(true);
    expect(inbox.acceptedMissionId).toBe("77777777-7777-4777-8777-777777777777");
    expect(inbox.proposals).toEqual([]);
  });

  it("keeps only the accepted incident in private memory for the post-accept map", async () => {
    const offered = { ...proposal, details: {
      incidentTypeName: "امداد شهری", requesterName: "requester",
      sosRequest: { severity: "high" as const, description: "کمک اضطراری مورد نیاز است",
        location: { lat: 35.71, lon: 51.43, isManual: false }, photoUrl: null,
        createdAt: "2026-10-24T12:00:00.000Z" }
    } };
    configureProposalInboxForTests({
      list: async () => ({ ...page([]), items: [offered], total: 1, totalPages: 1 }),
      accept: async () => "77777777-7777-4777-8777-777777777777",
      openSocket: async () => ({ socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn() })
    });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    auth.initialized = true;
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.proposals).toHaveLength(1));
    expect(await inbox.decide(offered.id, "accept")).toBe(true);
    expect(inbox.acceptedOffer?.details?.sosRequest.location).toEqual(offered.details.sosRequest.location);
    expect(inbox.proposals).toEqual([]);
    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    expect(inbox.acceptedOffer).toBeNull();
  });

  it("passes an optional decline reason and loads further pages instead of hiding offers beyond twenty", async () => {
    const decline = vi.fn(async () => undefined);
    const list = vi.fn(async (_token: string, currentPage = 1) => ({
      ...page([proposal]), page: currentPage, total: 21, totalPages: 2
    }));
    configureProposalInboxForTests({ list, decline, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    auth.initialized = true;
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.totalPages).toBe(2));
    inbox.setPage(2);
    await vi.waitFor(() => expect(list).toHaveBeenCalledWith("rescuer-token", 2));
    expect(await inbox.decide(proposal.id, "decline", "Unavailable today")).toBe(true);
    expect(decline).toHaveBeenCalledWith("rescuer-token", proposal.id, "Unavailable today");
  });

  it("keeps the displayed page number aligned with retained rows when a page change fails", async () => {
    const other = { ...proposal, id: "66666666-6666-4666-8666-666666666666" };
    let failSecondPage = true;
    const list = vi.fn(async (_token: string, currentPage = 1) => {
      if (currentPage === 2 && failSecondPage) throw new Error("offline");
      return { items: currentPage === 1 ? [proposal] : [other], total: 21, page: currentPage,
        limit: 20, totalPages: 2 };
    });
    configureProposalInboxForTests({ list, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.totalPages).toBe(2));
    inbox.setPage(2);
    await vi.waitFor(() => expect(inbox.failed).toBe(true));
    expect(inbox.page).toBe(1); // A failed page 2 must not label page 1's retained offers as page 2.
    expect(inbox.proposals).toEqual([proposal]);
    failSecondPage = false;
    inbox.setPage(2);
    await vi.waitFor(() => expect(inbox.proposals).toEqual([other]));
    expect(inbox.page).toBe(2);
    expect(inbox.failed).toBe(false);
  });

  it("rolls back a failed page change even when a newer refresh supersedes the first read", async () => {
    let finishOld!: (result: ReturnType<typeof page>) => void;
    const pending = new Promise<ReturnType<typeof page>>((resolve) => { finishOld = resolve; });
    let secondPageReads = 0;
    const list = vi.fn(async (_token: string, currentPage = 1) => {
      if (currentPage === 1) return { ...page([proposal]), total: 21, totalPages: 2 };
      if (++secondPageReads === 1) return pending;
      throw new Error("offline on retry");
    });
    configureProposalInboxForTests({ list, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.totalPages).toBe(2));
    inbox.setPage(2);
    await vi.waitFor(() => expect(secondPageReads).toBe(1));
    await inbox.refresh();
    expect(inbox.failed).toBe(true);
    expect(inbox.page).toBe(1);
    finishOld({ ...page([]), page: 2, total: 21, totalPages: 2 });
    await nextTick();
    expect(inbox.proposals).toEqual([proposal]);
    expect(inbox.page).toBe(1);
  });

  it("returns to the last real page after declining the sole offer on a now-empty page", async () => {
    const previous = Array.from({ length: 20 }, (_, index) => ({ ...proposal, id: `older-${index}` }));
    let declined = false;
    const list = vi.fn(async (_token: string, currentPage = 1) => ({
      items: currentPage === 1 ? previous : declined ? [] : [proposal],
      total: declined ? 20 : 21,
      page: currentPage,
      limit: 20,
      totalPages: declined ? 1 : 2
    }));
    const decline = vi.fn(async () => { declined = true; });
    configureProposalInboxForTests({ list, decline, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    auth.initialized = true;
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.total).toBe(21));
    inbox.setPage(2);
    await vi.waitFor(() => expect(inbox.proposals).toEqual([proposal]));
    expect(await inbox.decide(proposal.id, "decline")).toBe(true);
    await vi.waitFor(() => expect(inbox.loading).toBe(false));
    expect(inbox.page).toBe(1);
    expect(inbox.proposals).toEqual(previous);
    expect(inbox.total).toBe(20);
    expect(inbox.failed).toBe(false);
    expect(list).toHaveBeenLastCalledWith("rescuer-token", 1);
  });

  it("returns to page one without another fetch when the server reports a truly empty inbox", async () => {
    let expired = false;
    const previous = Array.from({ length: 20 }, (_, index) => ({ ...proposal, id: `older-${index}` }));
    const list = vi.fn(async (_token: string, currentPage = 1) => ({
      items: expired ? [] : currentPage === 1 ? previous : [proposal],
      total: expired ? 0 : 21, page: currentPage, limit: 20, totalPages: expired ? 0 : 2
    }));
    configureProposalInboxForTests({ list, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.totalPages).toBe(2));
    inbox.setPage(2);
    await vi.waitFor(() => expect(inbox.proposals).toEqual([proposal]));
    expired = true;
    await inbox.refresh();
    expect(inbox.page).toBe(1);
    expect(inbox.proposals).toEqual([]);
    expect(inbox.total).toBe(0);
    expect(inbox.failed).toBe(false);
    expect(list).toHaveBeenCalledTimes(3);
  });

  it("reports a failed page rewind instead of claiming there are no pending offers", async () => {
    let declined = false;
    const previous = Array.from({ length: 20 }, (_, index) => ({ ...proposal, id: `older-${index}` }));
    const list = vi.fn(async (_token: string, currentPage = 1) => {
      if (declined && currentPage === 1) throw new Error("offline during page rewind");
      return { items: currentPage === 1 ? previous : declined ? [] : [proposal],
        total: declined ? 20 : 21, page: currentPage, limit: 20, totalPages: declined ? 1 : 2 };
    });
    configureProposalInboxForTests({ list, decline: async () => { declined = true; }, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    auth.initialized = true;
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.totalPages).toBe(2));
    inbox.setPage(2);
    await vi.waitFor(() => expect(inbox.proposals).toEqual([proposal]));
    expect(await inbox.decide(proposal.id, "decline")).toBe(true);
    await vi.waitFor(() => expect(inbox.failed).toBe(true));
    expect(inbox.page).toBe(1);
    expect(inbox.proposals).toEqual([]);
    expect(inbox.total).toBe(20);
    expect(inbox.loading).toBe(false);
    expect(list).toHaveBeenLastCalledWith("rescuer-token", 1);
  });

  it("does not let a late decision response restore another account's inbox", async () => {
    let resolve!: (id: string) => void;
    const waiting = new Promise<string>((done) => { resolve = done; });
    const accept = vi.fn(async () => waiting);
    configureProposalInboxForTests({
      list: async () => page([proposal]), accept,
      openSocket: async () => ({ socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn() })
    });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.total).toBe(1));
    auth.initialized = true;
    const decision = inbox.decide(proposal.id, "accept");
    await vi.waitFor(() => expect(accept).toHaveBeenCalledOnce());
    auth.accessToken = null;
    auth.user = null;
    await nextTick();
    resolve("77777777-7777-4777-8777-777777777777");
    expect(await decision).toBe(false);
    expect(inbox.acceptedMissionId).toBeNull();
    expect(inbox.total).toBe(0);
  });

  it("does not report a delayed decline as a success for a different signed-in account", async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    const decline = vi.fn(async () => waiting);
    configureProposalInboxForTests({ list: async (token) => token === "rescuer-token" ? page([proposal]) : page([]), decline, openSocket: async () => ({
      socket: new EventEmitter() as never, connect: vi.fn(), updateToken: vi.fn(), close: vi.fn()
    }) });
    const auth = useAuthStore();
    auth.user = { id: rescuerId, username: "rescuer", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "rescuer-token";
    auth.initialized = true;
    const inbox = useProposalInboxStore();
    await vi.waitFor(() => expect(inbox.total).toBe(1));
    const decision = inbox.decide(proposal.id, "decline");
    await vi.waitFor(() => expect(decline).toHaveBeenCalledOnce());
    const otherId = "44444444-4444-4444-8444-444444444444";
    auth.user = { id: otherId, username: "other", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = "other-token";
    await nextTick();
    finish();
    expect(await decision).toBe(false);
    expect(inbox.proposals).toEqual([]);
    expect(inbox.decisionError).toBeNull();
    expect(inbox.acceptedMissionId).toBeNull();
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
