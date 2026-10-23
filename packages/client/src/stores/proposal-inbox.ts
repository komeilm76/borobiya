import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { sosProposalReceivedEventSchema, type MissionProposal } from "@shared/index";
import { listPendingProposals } from "@/api/proposals";
import { SOS_PROPOSAL_RECEIVED_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { useAuthStore } from "./auth";

export interface ProposalInboxRuntime {
  list?: typeof listPendingProposals;
  openSocket?: (token: string) => Promise<RealtimeClient>;
}
let runtime: ProposalInboxRuntime = {};
export function configureProposalInboxForTests(overrides: ProposalInboxRuntime = {}): void {
  runtime = overrides;
}

const POLL_INTERVAL_MS = 30_000;

export const useProposalInboxStore = defineStore("proposal-inbox", () => {
  const auth = useAuthStore();
  const proposals = ref<MissionProposal[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const failed = ref(false);
  const identity = computed(() => auth.isAuthenticated && auth.user?.role === "user" &&
    !auth.mustCompleteSecurityQuestions ? auth.user.id : null);

  let generation = 0;
  let sessionGeneration = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let client: RealtimeClient | null = null;

  async function refresh(): Promise<void> {
    const userId = identity.value;
    const token = auth.accessToken;
    if (!userId || !token) return;
    const gen = ++generation;
    loading.value = true;
    try {
      const page = await (runtime.list ?? listPendingProposals)(token);
      if (gen !== generation || identity.value !== userId) return;
      proposals.value = page.items;
      total.value = page.total;
      failed.value = false;
    } catch {
      if (gen === generation && identity.value === userId) failed.value = true;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  function stop(): void {
    generation++;
    sessionGeneration++;
    if (interval) clearInterval(interval);
    interval = null;
    client?.close();
    client = null;
    proposals.value = [];
    total.value = 0;
    loading.value = false;
    failed.value = false;
  }

  async function start(userId: string): Promise<void> {
    void refresh();
    interval = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    interval.unref?.();
    const gen = sessionGeneration;
    try {
      const opener = runtime.openSocket ?? (async (token: string) => {
        const { createRealtimeClient } = await import("@/services/socket");
        return createRealtimeClient(token);
      });
      const connected = await opener(auth.accessToken ?? "");
      if (identity.value !== userId || gen !== sessionGeneration) {
        connected.close();
        return;
      }
      client = connected;
      connected.socket.on("connect", () => { void refresh(); });
      connected.socket.on(SOS_PROPOSAL_RECEIVED_EVENT, (payload: unknown) => {
        const parsed = sosProposalReceivedEventSchema.safeParse(payload);
        if (parsed.success && parsed.data.proposal.rescuerId === identity.value) void refresh();
      });
      connected.connect();
    } catch {
      // Polling remains the fallback if the socket cannot connect.
    }
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

  return { proposals, total, loading, failed, refresh, stop };
});
