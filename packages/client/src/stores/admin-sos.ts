import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type {
  MissionProposal,
  NearestResponder,
  SosRequestRecord,
  SosRequestStatus
} from "@shared/index";
import {
  dispatchSosResponders,
  getNearestSosResponders,
  listAdminSosRequests,
  type ListAdminSosRequestsParams
} from "@/api/admin-sos";
import { friendlyErrorMessage } from "@/api/error-message";
import { ApiError } from "@/api/http";
import {
  isDispatchableSosStatus,
  mergeSosAlertSnapshot,
  parseSosNewRequestPayload,
  playSosAlertSound,
  upsertSosAlert,
  type AlertAudioContextLike
} from "@/admin/sos-alerts";
import { SOS_NEW_REQUEST_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { useAuthStore } from "./auth";

export type AdminSosFilterStatus = "pending" | "dispatched" | "all";

export interface DispatchFeedbackBanner {
  type: "success" | "error";
  message: string;
}

export interface AdminSosRuntime {
  openSocket?: (accessToken: string) => Promise<RealtimeClient>;
  listRequests?: (
    accessToken: string,
    params: ListAdminSosRequestsParams
  ) => Promise<{ items: SosRequestRecord[]; total: number }>;
  getNearestResponders?: (
    requestId: string,
    accessToken: string
  ) => Promise<{ responders: NearestResponder[] }>;
  dispatchResponders?: (
    requestId: string,
    rescuerIds: string[],
    accessToken: string
  ) => Promise<{ proposals: MissionProposal[] }>;
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
  const filterStatus = ref<AdminSosFilterStatus>("pending");
  const latestAlert = ref<SosRequestRecord | null>(null);
  const soundMuted = ref(false);
  const connected = ref(false);
  const loading = ref(false);
  const errorMessage = ref<string | null>(null);

  const nearestResponders = ref<NearestResponder[]>([]);
  const nearestLoading = ref(false);
  const nearestError = ref<string | null>(null);
  const selectedResponderIds = ref<string[]>([]);
  const dispatchSubmitting = ref(false);
  const dispatchFeedback = ref<DispatchFeedbackBanner | null>(null);
  const proposalsByRequestId = ref<Record<string, MissionProposal[]>>({});

  let attachedClient: RealtimeClient | null = null;
  let detachSocketListeners: (() => void) | null = null;
  let socketGeneration = 0;
  let refreshGeneration = 0;
  let nearestGeneration = 0;
  let dispatchGeneration = 0;
  let refreshingSocketAuth = false;

  const isAdminSession = computed(
    () => auth.isAuthenticated && auth.user?.role === "admin"
  );

  const visibleRequests = computed(() => {
    if (filterStatus.value === "pending") {
      return requests.value.filter(
        (item) => item.status === "pending" || item.status === "cancelled_by_rescuer"
      );
    }
    if (filterStatus.value === "dispatched") {
      return requests.value.filter((item) => item.status === "dispatched");
    }
    return requests.value;
  });

  const pendingCount = computed(
    () =>
      requests.value.filter(
        (item) => item.status === "pending" || item.status === "cancelled_by_rescuer"
      ).length
  );

  const dispatchedCount = computed(
    () => requests.value.filter((item) => item.status === "dispatched").length
  );

  const selectedRequest = computed(
    () => requests.value.find((item) => item.id === selectedId.value) ?? null
  );

  const selectedRequestProposals = computed<MissionProposal[]>(() =>
    selectedId.value ? proposalsByRequestId.value[selectedId.value] ?? [] : []
  );

  const canDispatchSelected = computed(
    () =>
      Boolean(selectedRequest.value) &&
      isDispatchableSosStatus(selectedRequest.value!.status) &&
      selectedResponderIds.value.length > 0 &&
      !dispatchSubmitting.value
  );

  async function withAdminAuthRetry<T>(run: (token: string) => Promise<T>): Promise<T | null> {
    const token = auth.accessToken;
    if (!token) return null;

    try {
      return await run(token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const refreshed = await auth.refreshSession();
        if (refreshed && auth.accessToken) {
          return await run(auth.accessToken);
        }
      }
      throw err;
    }
  }

  async function fetchListWithAuthRetry(status?: SosRequestStatus) {
    const listFn = activeOverrides.listRequests ?? listAdminSosRequests;
    return withAdminAuthRetry((token) => listFn(token, { status, page: 1, limit: 100 }));
  }

  async function refreshRequests(statusOverride?: AdminSosFilterStatus): Promise<void> {
    if (!isAdminSession.value) return;
    const gen = ++refreshGeneration;
    loading.value = true;
    errorMessage.value = null;

    const targetFilter = statusOverride;
    try {
      const response = await fetchListWithAuthRetry(
        targetFilter && targetFilter !== "all" && targetFilter !== "pending"
          ? targetFilter
          : undefined
      );
      if (gen !== refreshGeneration || !response) return;
      requests.value = mergeSosAlertSnapshot(requests.value, response.items);
      if (!selectedId.value && requests.value.length > 0) {
        selectedId.value = (visibleRequests.value[0] ?? requests.value[0])!.id;
      }
    } catch (err) {
      if (gen !== refreshGeneration) return;
      errorMessage.value = friendlyErrorMessage(
        err,
        "دریافت فهرست درخواست‌های اضطراری انجام نشد."
      );
    } finally {
      if (gen === refreshGeneration) {
        loading.value = false;
      }
    }
  }

  async function loadNearestResponders(requestId?: string | null): Promise<void> {
    // Even an empty selection invalidates the previous request: otherwise a late HTTP reply
    // repopulates the picker with responders for an SOS that is no longer selected.
    const gen = ++nearestGeneration;
    const targetId = requestId ?? selectedId.value;
    if (!isAdminSession.value || !targetId) {
      nearestResponders.value = [];
      selectedResponderIds.value = [];
      nearestError.value = null;
      nearestLoading.value = false;
      return;
    }

    nearestLoading.value = true;
    nearestError.value = null;

    const nearestFn = activeOverrides.getNearestResponders ?? getNearestSosResponders;
    try {
      const response = await withAdminAuthRetry((token) => nearestFn(targetId, token));
      if (gen !== nearestGeneration || !response) return;
      nearestResponders.value = response.responders;
      const validIds = new Set(response.responders.map((item) => item.userId));
      selectedResponderIds.value = selectedResponderIds.value.filter((id) => validIds.has(id));
    } catch (err) {
      if (gen !== nearestGeneration) return;
      nearestResponders.value = [];
      nearestError.value = friendlyErrorMessage(
        err,
        "دریافت فهرست نزدیک‌ترین امدادگران انجام نشد."
      );
    } finally {
      if (gen === nearestGeneration) {
        nearestLoading.value = false;
      }
    }
  }

  function toggleResponderSelection(userId: string): void {
    if (selectedResponderIds.value.includes(userId)) {
      selectedResponderIds.value = selectedResponderIds.value.filter((id) => id !== userId);
    } else {
      selectedResponderIds.value = [...selectedResponderIds.value, userId];
    }
  }

  function selectAllNearestResponders(): void {
    selectedResponderIds.value = nearestResponders.value.map((item) => item.userId);
  }

  function clearResponderSelection(): void {
    selectedResponderIds.value = [];
  }

  async function dispatchSelectedResponders(): Promise<boolean> {
    const activeRequest = selectedRequest.value;
    if (!activeRequest || selectedResponderIds.value.length === 0 || dispatchSubmitting.value) {
      return false;
    }

    const idsToDispatch = [...selectedResponderIds.value];
    const gen = ++dispatchGeneration;
    dispatchSubmitting.value = true;
    dispatchFeedback.value = null;

    const dispatchFn = activeOverrides.dispatchResponders ?? dispatchSosResponders;
    try {
      const response = await withAdminAuthRetry((token) =>
        dispatchFn(activeRequest.id, idsToDispatch, token)
      );
      // Logout/reset may occur while the request is on the wire. Never hydrate private SOS
      // data into a newly initialized admin session from an earlier session's response.
      if (!response || gen !== dispatchGeneration || !isAdminSession.value) return false;

      proposalsByRequestId.value = {
        ...proposalsByRequestId.value,
        [activeRequest.id]: response.proposals
      };

      const updatedRecord: SosRequestRecord = {
        ...activeRequest,
        status: "dispatched"
      };
      const { items } = upsertSosAlert(requests.value, updatedRecord);
      requests.value = items;
      // The dispatcher may have selected another SOS while this request was in flight. The
      // first SOS still needs its updated status, but the new selection and banner are its own.
      if (selectedId.value === activeRequest.id) {
        selectedResponderIds.value = [];
        dispatchFeedback.value = {
          type: "success",
          message: `پیشنهاد مأموریت با موفقیت برای ${response.proposals.length} امدادگر ارسال شد.`
        };
      }
      return true;
    } catch (err) {
      if (gen === dispatchGeneration && isAdminSession.value && selectedId.value === activeRequest.id) {
        dispatchFeedback.value = {
          type: "error",
          message: friendlyErrorMessage(err, "ارسال پیشنهاد مأموریت انجام نشد.")
        };
      }
      return false;
    } finally {
      if (gen === dispatchGeneration) dispatchSubmitting.value = false;
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
    const onDisconnect = (reason?: string) => {
      connected.value = false;
      if (reason === "io server disconnect" && !refreshingSocketAuth && isAdminSession.value) {
        refreshingSocketAuth = true;
        void auth
          .refreshSession()
          .then((ok) => {
            if (ok && attachedClient && auth.accessToken) {
              attachedClient.updateToken(auth.accessToken);
              if (attachedClient.reconnect) attachedClient.reconnect();
              else attachedClient.connect();
            }
          })
          .finally(() => {
            refreshingSocketAuth = false;
          });
      }
    };
    const onConnectError = (err: Error & { data?: { code?: unknown } }) => {
      connected.value = false;
      const errorCode = typeof err.data?.code === "string" ? err.data.code : "";
      const isAuthFailure =
        errorCode === "UNAUTHORIZED" ||
        errorCode === "INVALID_ACCESS_TOKEN" ||
        /unauthorized|token|jwt|session|expired/i.test(err.message);
      if (isAuthFailure && !refreshingSocketAuth) {
        refreshingSocketAuth = true;
        void auth
          .refreshSession()
          .then((ok) => {
            if (ok && attachedClient && auth.accessToken) {
              attachedClient.updateToken(auth.accessToken);
              if (attachedClient.reconnect) attachedClient.reconnect();
              else attachedClient.connect();
            }
          })
          .finally(() => {
            refreshingSocketAuth = false;
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
    nearestGeneration++;
    dispatchGeneration++;
    detachRealtime();
    requests.value = [];
    selectedId.value = null;
    latestAlert.value = null;
    errorMessage.value = null;
    loading.value = false;
    nearestResponders.value = [];
    nearestLoading.value = false;
    nearestError.value = null;
    selectedResponderIds.value = [];
    dispatchSubmitting.value = false;
    dispatchFeedback.value = null;
    proposalsByRequestId.value = {};
  }

  function selectRequest(id: string | null): void {
    selectedId.value = id;
  }

  function setFilterStatus(next: AdminSosFilterStatus): void {
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

  watch(selectedId, (nextId) => {
    // A responder list is scoped to its SOS, not to the dispatch page as a whole. Do not
    // display or allow selecting the previous SOS's candidates while the next read is pending.
    nearestResponders.value = [];
    selectedResponderIds.value = [];
    dispatchFeedback.value = null;
    void loadNearestResponders(nextId);
  });

  watch(
    () => auth.accessToken,
    (nextToken) => {
      if (nextToken && attachedClient) {
        attachedClient.updateToken(nextToken);
      }
    }
  );

  watch(
    () => auth.user?.id,
    (nextId, previousId) => {
      // Two admin logins can replace one another without isAdminSession ever becoming false.
      // The socket is authenticated as the previous account, and its SOS state must not leak
      // into the new account's view. A normal token rotation leaves the user id unchanged.
      if (previousId && nextId && previousId !== nextId && isAdminSession.value) {
        resetState();
        startMonitoring();
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
    dispatchedCount,
    selectedId,
    selectedRequest,
    filterStatus,
    latestAlert,
    soundMuted,
    connected,
    loading,
    errorMessage,
    nearestResponders,
    nearestLoading,
    nearestError,
    selectedResponderIds,
    dispatchSubmitting,
    dispatchFeedback,
    proposalsByRequestId,
    selectedRequestProposals,
    canDispatchSelected,
    isAdminSession,
    startMonitoring,
    detachRealtime,
    resetState,
    refreshRequests,
    loadNearestResponders,
    toggleResponderSelection,
    selectAllNearestResponders,
    clearResponderSelection,
    dispatchSelectedResponders,
    handleIncomingPayload,
    selectRequest,
    setFilterStatus,
    dismissLatestAlert,
    toggleSoundMuted,
    testAlertSound
  };
});
