import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { SosRequestRecord, SosRequestStatus } from "@shared/index";
import { listAdminSosRequests, type ListAdminSosRequestsParams } from "@/api/admin-sos";
import { ApiError } from "@/api/http";
import {
  mergeSosAlertSnapshot,
  parseSosNewRequestPayload,
  playSosAlertSound,
  upsertSosAlert,
  type AlertAudioContextLike
} from "@/admin/sos-alerts";
import { SOS_NEW_REQUEST_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { useAuthStore } from "./auth";

export interface AdminSosRuntime {
  openSocket?: (accessToken: string) => Promise<RealtimeClient>;
  listRequests?: (
    accessToken: string,
    params: ListAdminSosRequestsParams
  ) => Promise<{ items: SosRequestRecord[]; total: number }>;
  createAudioContext?: () => AlertAudioContextLike | null;
}

let activeOverrides: AdminSosRuntime = {};

/** Test hook allowing deterministic injection of Socket.IO, REST, & Web Audio doubles without mounting `.vue` views. */
export function configureAdminSosRuntimeForTests(overrides: AdminSosRuntime = {}): void {
  activeOverrides = overrides;
}

async function defaultOpenSocket(accessToken: string): Promise<RealtimeClient> {
  const { createRealtimeClient } = await import("@/services/socket");
  return createRealtimeClient(accessToken);
}

export const useAdminSosStore = defineStore("admin-sos", () => {
  const auth = useAuthStore();

  const requests = ref<SosRequestRecord[]>([]);
  const selectedId = ref<string | null>(null);
  const filterStatus = ref<"pending" | "all">("pending");
  const latestAlert = ref<SosRequestRecord | null>(null);
  const soundMuted = ref(false);
  const connected = ref(false);
  const loading = ref(false);
  const errorMessage = ref<string | null>(null);

  let attachedClient: RealtimeClient | null = null;
  let detachSocketListeners: (() => void) | null = null;
  let socketGeneration = 0;
  let refreshGeneration = 0;

  const isAdminSession = computed(
    () => auth.isAuthenticated && auth.user?.role === "admin"
  );

  const visibleRequests = computed(() =>
    filterStatus.value === "pending"
      ? requests.value.filter((item) => item.status === "pending")
      : requests.value
  );

  const pendingCount = computed(
    () => requests.value.filter((item) => item.status === "pending").length
  );

  const selectedRequest = computed(
    () => requests.value.find((item) => item.id === selectedId.value) ?? null
  );

  async function fetchListWithAuthRetry(status?: SosRequestStatus) {
    const listFn = activeOverrides.listRequests ?? listAdminSosRequests;
    const token = auth.accessToken;
    if (!token) return null;

    try {
      return await listFn(token, { status, page: 1, limit: 100 });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const refreshed = await auth.refreshSession();
        if (refreshed && auth.accessToken) {
          return await listFn(auth.accessToken, { status, page: 1, limit: 100 });
        }
      }
      throw err;
    }
  }

  async function refreshRequests(statusOverride?: "pending" | "all"): Promise<void> {
    if (!isAdminSession.value) return;
    const gen = ++refreshGeneration;
    loading.value = true;
    errorMessage.value = null;

    const targetFilter = statusOverride ?? filterStatus.value;
    try {
      const response = await fetchListWithAuthRetry(
        targetFilter === "pending" ? "pending" : undefined
      );
      if (gen !== refreshGeneration || !response) return;
      requests.value = mergeSosAlertSnapshot(requests.value, response.items);
      if (!selectedId.value && requests.value.length > 0) {
        selectedId.value = requests.value[0]!.id;
      }
    } catch (err) {
      if (gen !== refreshGeneration) return;
      errorMessage.value =
        err instanceof Error ? err.message : "دریافت فهرست درخواست‌های اضطراری انجام نشد.";
    } finally {
      if (gen === refreshGeneration) {
        loading.value = false;
      }
    }
  }

  function handleIncomingPayload(payload: unknown): void {
    const parsed = parseSosNewRequestPayload(payload);
    if (!parsed) return;

    const { items, isNew, record } = upsertSosAlert(requests.value, parsed);
    requests.value = items;

    if (!selectedId.value) {
      selectedId.value = record.id;
    }

    if (isNew) {
      latestAlert.value = record;
      void playSosAlertSound(record.severity, {
        muted: soundMuted.value,
        createContext: activeOverrides.createAudioContext
      });
    } else if (latestAlert.value?.id === record.id) {
      latestAlert.value = record;
    }
  }

  async function attachRealtime(): Promise<void> {
    if (!isAdminSession.value || !auth.accessToken) return;
    if (attachedClient) {
      attachedClient.updateToken(auth.accessToken);
      attachedClient.connect();
      return;
    }

    const gen = ++socketGeneration;
    const opener = activeOverrides.openSocket ?? defaultOpenSocket;
    let client: RealtimeClient;
    try {
      client = await opener(auth.accessToken);
    } catch {
      return;
    }

    if (gen !== socketGeneration || !isAdminSession.value) {
      client.close();
      return;
    }

    attachedClient = client;

    const onConnect = () => {
      connected.value = true;
      void refreshRequests();
    };
    const onDisconnect = () => {
      connected.value = false;
    };
    const onConnectError = (err: Error) => {
      connected.value = false;
      if (/unauthorized|token|jwt|session|expired/i.test(err.message)) {
        void auth.refreshSession().then((ok) => {
          if (ok && attachedClient && auth.accessToken) {
            attachedClient.updateToken(auth.accessToken);
            attachedClient.connect();
          }
        });
      }
    };
    const onNewRequest = (payload: unknown) => {
      handleIncomingPayload(payload);
    };

    client.socket.on("connect", onConnect);
    client.socket.on("disconnect", onDisconnect);
    client.socket.on("connect_error", onConnectError);
    client.socket.on(SOS_NEW_REQUEST_EVENT, onNewRequest);

    detachSocketListeners = () => {
      client.socket.off("connect", onConnect);
      client.socket.off("disconnect", onDisconnect);
      client.socket.off("connect_error", onConnectError);
      client.socket.off(SOS_NEW_REQUEST_EVENT, onNewRequest);
      client.close();
    };

    connected.value = client.socket.connected;
    client.connect();
  }

  function detachRealtime(): void {
    socketGeneration++;
    detachSocketListeners?.();
    detachSocketListeners = null;
    attachedClient = null;
    connected.value = false;
  }

  function startMonitoring(): void {
    if (!isAdminSession.value) return;
    void attachRealtime();
    void refreshRequests();
  }

  function resetState(): void {
    refreshGeneration++;
    detachRealtime();
    requests.value = [];
    selectedId.value = null;
    latestAlert.value = null;
    errorMessage.value = null;
    loading.value = false;
  }

  function selectRequest(id: string | null): void {
    selectedId.value = id;
  }

  function setFilterStatus(next: "pending" | "all"): void {
    if (filterStatus.value === next) return;
    filterStatus.value = next;
    void refreshRequests(next);
  }

  function dismissLatestAlert(): void {
    latestAlert.value = null;
  }

  function toggleSoundMuted(): void {
    soundMuted.value = !soundMuted.value;
  }

  async function testAlertSound(): Promise<boolean> {
    return playSosAlertSound("high", {
      muted: false,
      createContext: activeOverrides.createAudioContext
    });
  }

  watch(
    () => auth.accessToken,
    (nextToken) => {
      if (nextToken && attachedClient) {
        attachedClient.updateToken(nextToken);
      }
    }
  );

  watch(
    isAdminSession,
    (active) => {
      if (active) {
        startMonitoring();
      } else {
        resetState();
      }
    },
    { immediate: true }
  );

  return {
    requests,
    visibleRequests,
    pendingCount,
    selectedId,
    selectedRequest,
    filterStatus,
    latestAlert,
    soundMuted,
    connected,
    loading,
    errorMessage,
    isAdminSession,
    startMonitoring,
    detachRealtime,
    resetState,
    refreshRequests,
    handleIncomingPayload,
    selectRequest,
    setFilterStatus,
    dismissLatestAlert,
    toggleSoundMuted,
    testAlertSound
  };
});
