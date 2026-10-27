import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { sosProposalReceivedEventSchema, type ProposalInboxItem } from "@shared/index";
import { acceptProposal, declineProposal, listPendingProposals } from "@/api/proposals";
import { ApiError } from "@/api/http";
import { friendlyErrorMessage } from "@/api/error-message";
import { SOS_PROPOSAL_RECEIVED_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { useAuthStore } from "./auth";

export interface ProposalInboxRuntime {
  list?: typeof listPendingProposals;
  accept?: typeof acceptProposal;
  decline?: typeof declineProposal;
  openSocket?: (token: string) => Promise<RealtimeClient>;
}
let runtime: ProposalInboxRuntime = {};
export function configureProposalInboxForTests(overrides: ProposalInboxRuntime = {}): void {
  runtime = overrides;
}

const POLL_INTERVAL_MS = 30_000;

export const useProposalInboxStore = defineStore("proposal-inbox", () => {
  const auth = useAuthStore();
  const proposals = ref<ProposalInboxItem[]>([]);
  const page = ref(1);
  const totalPages = ref(0);
  const decidingId = ref<string | null>(null);
  const decisionError = ref<string | null>(null);
  const acceptedMissionId = ref<string | null>(null);
  const acceptedOffer = ref<ProposalInboxItem | null>(null);
  const total = ref(0);
  const loading = ref(false);
  const failed = ref(false);
  const identity = computed(() => auth.isAuthenticated && auth.user?.role === "user" &&
    !auth.mustCompleteSecurityQuestions ? auth.user.id : null);

  let generation = 0;
  let sessionGeneration = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let client: RealtimeClient | null = null;
  let opening: object | null = null;

  async function refresh(): Promise<void> {
    const userId = identity.value;
    const token = auth.accessToken;
    if (!userId || !token || acceptedMissionId.value) return;
    const gen = ++generation;
    loading.value = true;
    try {
      const result = await (runtime.list ?? listPendingProposals)(token, page.value);
      if (gen !== generation || identity.value !== userId) return;
      proposals.value = result.items;
      total.value = result.total;
      totalPages.value = result.totalPages;
      failed.value = false;
    } catch {
      if (gen === generation && identity.value === userId) failed.value = true;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  function setPage(next: number): void {
    if (!Number.isInteger(next) || next < 1 || next === page.value) return;
    page.value = next;
    void refresh();
  }

  async function decide(id: string, action: "accept" | "decline", reason?: string): Promise<boolean> {
    // Lock before the first await; a double-click cannot create two concurrent writes.
    const userId = identity.value;
    if (decidingId.value || acceptedMissionId.value || !userId || !proposals.value.some((item) => item.id === id)) return false;
    decidingId.value = id;
    decisionError.value = null;
    const session = sessionGeneration;
    try {
      await auth.ensureSession();
      if (identity.value !== userId || session !== sessionGeneration || !auth.accessToken) return false;
      if (action === "accept") {
        const missionId = await (runtime.accept ?? acceptProposal)(auth.accessToken, id);
        // The server may have committed, but the former account's reply is not a success for the
        // current view. Do not clear its dialog or alter its inbox after a session transition.
        if (identity.value !== userId || session !== sessionGeneration) return false;
        generation++; // invalidate any pre-accept inbox read
        loading.value = false;
        acceptedMissionId.value = missionId;
        acceptedOffer.value = proposals.value.find((offer) => offer.id === id) ?? null;
        proposals.value = [];
        total.value = 0;
        totalPages.value = 0;
      } else {
        await (runtime.decline ?? declineProposal)(auth.accessToken, id, reason);
        if (identity.value !== userId || session !== sessionGeneration) return false;
        proposals.value = proposals.value.filter((item) => item.id !== id);
        total.value = Math.max(0, total.value - 1);
      }
      void refresh();
      return true;
    } catch (error) {
      if (identity.value === userId && session === sessionGeneration) {
        decisionError.value = error instanceof ApiError && [404, 409].includes(error.status)
          ? "این پیشنهاد دیگر در دسترس نیست. فهرست تازه می‌شود."
          : friendlyErrorMessage(error, "پاسخ ثبت نشد؛ دوباره تلاش کنید.");
        if (error instanceof ApiError && [404, 409].includes(error.status)) void refresh();
      }
      return false;
    } finally {
      if (session === sessionGeneration) decidingId.value = null;
    }
  }

  function stop(): void {
    generation++;
    sessionGeneration++;
    if (interval) clearInterval(interval);
    interval = null;
    client?.close();
    client = null;
    opening = null;
    proposals.value = [];
    total.value = 0;
    page.value = 1;
    totalPages.value = 0;
    decidingId.value = null;
    decisionError.value = null;
    acceptedMissionId.value = null;
    acceptedOffer.value = null;
    loading.value = false;
    failed.value = false;
  }

  async function attachRealtime(userId: string): Promise<void> {
    if (client || opening || identity.value !== userId || !auth.accessToken) return;
    const attempt = {};
    opening = attempt;
    const gen = sessionGeneration;
    try {
      const opener = runtime.openSocket ?? (async (token: string) => {
        const { createRealtimeClient } = await import("@/services/socket");
        return createRealtimeClient(token);
      });
      const connected = await opener(auth.accessToken);
      if (identity.value !== userId || gen !== sessionGeneration || !auth.accessToken) {
        connected.close();
        return;
      }
      client = connected;
      connected.socket.on("connect", () => { void refresh(); });
      connected.socket.on(SOS_PROPOSAL_RECEIVED_EVENT, (payload: unknown) => {
        const parsed = sosProposalReceivedEventSchema.safeParse(payload);
        if (parsed.success && parsed.data.proposal.rescuerId === identity.value) void refresh();
      });
      connected.updateToken(auth.accessToken);
      connected.connect();
    } catch {
      // A failed import/handshake setup must not leave this user permanently offline.
      // The existing 30-second inbox poll will try opening a socket again.
    } finally {
      if (opening === attempt) opening = null;
    }
  }

  function start(userId: string): void {
    void refresh();
    void attachRealtime(userId);
    interval = setInterval(() => {
      void refresh();
      if (!client) void attachRealtime(userId);
      else if (!client.socket.connected) client.connect();
    }, POLL_INTERVAL_MS);
    interval.unref?.();
  }

  watch(identity, (next) => {
    stop();
    if (next) void start(next);
  }, { immediate: true });
  watch(() => auth.accessToken, (token) => {
    if (token && client) {
      client.updateToken(token);
      // An auth-rejected handshake will not reconnect on its own. A fresh bearer can retry
      // the Socket.IO handshake; polling continues in parallel if the socket remains down.
      if (!client.socket.connected) client.connect();
    }
  });

  return { proposals, total, page, totalPages, loading, failed, decidingId, decisionError, acceptedMissionId, acceptedOffer, refresh, setPage, decide, stop };
});
