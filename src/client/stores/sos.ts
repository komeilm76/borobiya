import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { errorMessage, get, post } from '@/api/client.ts';
import type { CancellationReasonView, IncidentTypeView, MissionView, SosView } from '@/api/types.ts';
import { MISSION_STATUS, SOS_STATUS } from '@shared/protocol.ts';

/** Four-step SOS composition draft. */
interface SosDraft {
  step: number;
  severity: 'low' | 'medium' | 'high';
  incidentTypeId: string;
  description: string;
  photoDataUrl: string | null;
  latitude: number;
  longitude: number;
  accuracy: number;
  isManual: boolean;
}

const DRAFT_STEPS = [1, 2, 3, 4] as const;

/**
 * SOS and mission state: the four-step composer, the request list, the mission list
 * and the cancel/rate dialogs. Every mutation goes through the API and then a reload,
 * so the server stays the single source of truth.
 */
export const useSosStore = defineStore('sos', () => {
  const incidentTypes = ref<IncidentTypeView[]>([]);
  const cancellationReasons = ref<CancellationReasonView[]>([]);
  const requests = ref<SosView[]>([]);
  const missions = ref<MissionView[]>([]);
  const draft = ref<SosDraft>(createDraft());
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);
  const activeMissionId = ref<string | null>(null);

  const activeRequest = computed(() =>
    requests.value.find((item) => item.status !== SOS_STATUS.COMPLETED && item.status !== SOS_STATUS.CANCELLED && item.status !== SOS_STATUS.EXPIRED) ?? null
  );
  const activeMission = computed(() =>
    missions.value.find((item) => item.status !== MISSION_STATUS.COMPLETED && item.status !== MISSION_STATUS.CANCELLED) ?? null
  );
  const stepTotal = computed(() => DRAFT_STEPS.length);

  function createDraft(): SosDraft {
    return {
      step: 1,
      severity: 'medium',
      incidentTypeId: '',
      description: '',
      photoDataUrl: null,
      latitude: 35.7219,
      longitude: 51.3347,
      accuracy: 12,
      isManual: false
    };
  }

  /** Loads the catalogs and the user's SOS and mission lists. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [incidents, reasons, sosList, missionList] = await Promise.all([
        get<{ items: IncidentTypeView[] }>('/_public/incident-types'),
        get<{ items: CancellationReasonView[] }>('/_public/cancellation-reasons'),
        get<{ items: SosView[] }>('/_user/sos'),
        get<{ items: MissionView[] }>('/_user/missions')
      ]);
      incidentTypes.value = incidents.items ?? [];
      cancellationReasons.value = reasons.items ?? [];
      requests.value = sosList.items ?? [];
      missions.value = missionList.items ?? [];
      if (!draft.value.incidentTypeId && incidentTypes.value.length) draft.value.incidentTypeId = incidentTypes.value[0].id;
    } catch (caught) {
      error.value = errorMessage(caught);
    } finally {
      loading.value = false;
    }
  }

  /** Resets the composer, optionally seeding it with the current fix. */
  function resetDraft(fix?: { latitude: number; longitude: number; accuracy: number }): void {
    draft.value = { ...createDraft(), incidentTypeId: incidentTypes.value[0]?.id ?? '', ...(fix ?? {}) };
  }

  /** Moves the composer forward one step. */
  function nextStep(): void {
    draft.value.step = Math.min(stepTotal.value, draft.value.step + 1);
  }

  /** Moves the composer back one step. */
  function previousStep(): void {
    draft.value.step = Math.max(1, draft.value.step - 1);
  }

  /**
   * Submits the current draft as a real SOS request.
   *
   * @returns The created request.
   */
  async function submit(): Promise<SosView> {
    submitting.value = true;
    error.value = null;
    try {
      const response = await post<{ sos: SosView }>('/_user/sos', {
        incidentTypeId: draft.value.incidentTypeId,
        severity: draft.value.severity,
        description: draft.value.description,
        ...(draft.value.photoDataUrl ? { photoDataUrl: draft.value.photoDataUrl } : {}),
        latitude: draft.value.latitude,
        longitude: draft.value.longitude,
        accuracy: draft.value.accuracy,
        isManual: draft.value.isManual
      });
      requests.value = [response.sos, ...requests.value];
      resetDraft();
      return response.sos;
    } finally {
      submitting.value = false;
    }
  }

  /** Cancels an open request with a catalog reason. */
  async function cancel(sosId: string, reasonId: string, detail?: string): Promise<void> {
    await post(`/_user/sos/${sosId}/cancel`, { reasonId, ...(detail ? { detail } : {}) });
    await load();
  }

  /** Accepts a dispatched request as a responder. */
  async function accept(sosId: string): Promise<{ missionId: string; missionStatus: string }> {
    const result = await post<{ missionId: string; missionStatus: string }>(`/_user/sos/${sosId}/accept`);
    activeMissionId.value = result.missionId;
    await load();
    return result;
  }

  /** Advances a mission through its state machine. */
  async function progress(missionId: string, action: 'arrive' | 'start' | 'complete' | 'cancel', note?: string): Promise<void> {
    await post(`/_user/missions/${missionId}/progress`, { action, ...(note ? { note } : {}) });
    await load();
  }

  /** Rates a completed mission exactly once. */
  async function rate(missionId: string, rating: number, note?: string): Promise<void> {
    await post(`/_user/missions/${missionId}/rating`, { rating, ...(note ? { note } : {}) });
    await load();
  }

  /**
   * Replaces one request with the detail response, which is the only endpoint carrying the
   * mission timeline. The list omits it, so a screen that renders the rail has to ask for it.
   */
  async function loadDetail(sosId: string): Promise<SosView | null> {
    try {
      const detail = await get<SosView>(`/_user/sos/${sosId}`);
      const index = requests.value.findIndex((item) => item.id === detail.id);
      if (index >= 0) requests.value[index] = { ...requests.value[index], ...detail };
      else requests.value = [detail, ...requests.value];
      return detail;
    } catch (caught) {
      error.value = errorMessage(caught);
      return null;
    }
  }

  /** Merges a realtime SOS payload into the local list. */
  function applyRealtimeUpdate(payload: { sosId?: string; status?: string }): void {
    if (!payload?.sosId) return;
    void load();
  }

  return {
    incidentTypes,
    cancellationReasons,
    requests,
    missions,
    draft,
    loading,
    submitting,
    error,
    activeRequest,
    activeMission,
    activeMissionId,
    stepTotal,
    load,
    loadDetail,
    resetDraft,
    nextStep,
    previousStep,
    submit,
    cancel,
    accept,
    progress,
    rate,
    applyRealtimeUpdate
  };
});
