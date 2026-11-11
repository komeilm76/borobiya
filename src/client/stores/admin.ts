import { ref } from 'vue';
import { defineStore } from 'pinia';
import { errorMessage, get, patch, post, put } from '@/api/client.ts';
import type {
  AdminJobTypeView,
  AdminMissionOfferView,
  AdminUserView,
  AlertView,
  AuditEntryView,
  GroupView,
  IncidentTypeView,
  ListView,
  NearestResponderView,
  OverviewView,
  SettingView,
  SosView
} from '@/api/types.ts';

/** User filters accepted by the administrator user list. */
export interface UserFilters {
  q?: string;
  role?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}

/** Audit filters accepted by the audit log screen. */
export interface AuditFilters {
  from?: number;
  to?: number;
  action?: string;
  q?: string;
  limit?: number;
}

/**
 * Administrator data store: overview, dispatch board, users, groups, alert, audit,
 * settings and system health. Every screen reads from here so the shell stays light.
 */
export const useAdminStore = defineStore('admin', () => {
  const overview = ref<OverviewView | null>(null);
  const dispatchQueue = ref<ListView<SosView> | null>(null);
  const users = ref<ListView<AdminUserView> | null>(null);
  const groups = ref<GroupView[]>([]);
  const alerts = ref<AlertView[]>([]);
  const audit = ref<ListView<AuditEntryView> | null>(null);
  const settings = ref<SettingView[]>([]);
  const incidentTypes = ref<IncidentTypeView[]>([]);
  const health = ref<Record<string, unknown> | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const userFilters = ref<UserFilters>({ page: 1, limit: 20 });
  const auditFilters = ref<AuditFilters>({ limit: 100 });

  async function guard<T>(task: () => Promise<T>): Promise<T | null> {
    loading.value = true;
    error.value = null;
    try {
      return await task();
    } catch (caught) {
      error.value = errorMessage(caught);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** Loads the operations overview used by the dashboard and report screens. */
  async function loadOverview(): Promise<void> {
    const result = await guard(() => get<OverviewView>('/_admin/overview'));
    if (result) overview.value = result;
  }

  /** Loads the dispatch board queue. */
  async function loadDispatch(): Promise<void> {
    const result = await guard(() =>
      get<{ queue: ListView<SosView>; groups: ListView<GroupView>; incidentTypes: ListView<IncidentTypeView> }>('/_admin/dispatch')
    );
    if (result) {
      dispatchQueue.value = result.queue;
      // These three are list envelopes, not bare arrays. Assigning the envelope left `groups` as
      // `{ items, total }`, so every `v-for` over it rendered the envelope's own keys and the
      // board crashed on the first group field it touched.
      groups.value = result.groups?.items ?? [];
      incidentTypes.value = result.incidentTypes?.items ?? [];
    }
  }

  /** Loads a page of users with the active filters. */
  async function loadUsers(filters: UserFilters = userFilters.value): Promise<void> {
    userFilters.value = filters;
    const result = await guard(() =>
      get<ListView<AdminUserView>>('/_admin/users', {
        q: filters.q,
        role: filters.role,
        active: filters.active,
        page: filters.page,
        limit: filters.limit
      })
    );
    if (result) users.value = result;
  }

  /** Creates an administrator-managed account. */
  async function createUser(input: { username: string; password: string; role: string; jobTypeId?: string }): Promise<void> {
    await post('/_admin/users', input);
    await loadUsers();
  }

  /** Activates, deactivates or re-roles an account. */
  async function updateUser(userId: string, input: { active?: boolean; role?: string; jobTypeId?: string | null }): Promise<void> {
    await patch(`/_admin/users/${userId}`, input);
    await loadUsers();
  }

  /** Loads service groups. */
  async function loadGroups(): Promise<void> {
    const result = await guard(() => get<{ items: GroupView[] }>('/_admin/groups'));
    if (result) groups.value = result.items ?? [];
  }

  /** Creates a service group. */
  async function createGroup(input: { name: string; color: string; capacity: number; incidentIds: string[]; status?: string }): Promise<void> {
    await post('/_admin/groups', input);
    await loadGroups();
  }

  /** Updates a service group. */
  async function updateGroup(
    groupId: string,
    input: { name: string; color: string; capacity: number; incidentIds: string[]; status?: string }
  ): Promise<void> {
    await patch(`/_admin/groups/${groupId}`, input);
    await loadGroups();
  }

  /** Loads open (and optionally resolved) alerts. */
  async function loadAlerts(includeResolved = false): Promise<void> {
    const result = await guard(() => get<{ items: AlertView[] }>('/_admin/alerts', { includeResolved }));
    if (result) alerts.value = result.items ?? [];
  }

  /** Resolves an alert. */
  async function resolveAlert(alertId: string): Promise<void> {
    await post(`/_admin/alerts/${alertId}/resolve`);
    await loadAlerts();
  }

  /** Loads the audit log. */
  async function loadAudit(filters: AuditFilters = auditFilters.value): Promise<void> {
    auditFilters.value = filters;
    const result = await guard(() => get<ListView<AuditEntryView>>('/_admin/audit', { ...filters }));
    if (result) audit.value = result;
  }

  /** Loads system settings. */
  async function loadSettings(): Promise<void> {
    const result = await guard(() => get<{ items: SettingView[] }>('/_admin/settings'));
    if (result) settings.value = result.items ?? [];
  }

  /** Persists system settings. */
  async function saveSettings(values: Record<string, string>): Promise<void> {
    await put('/_admin/settings', values);
    await loadSettings();
  }

  /** Loads the incident-type catalog. */
  async function loadIncidentTypes(): Promise<void> {
    const result = await guard(() => get<{ items: IncidentTypeView[] }>('/_admin/incident-types'));
    if (result) incidentTypes.value = result.items ?? [];
  }

  /** Loads the system health snapshot. */
  async function loadHealth(): Promise<void> {
    const result = await guard(() => get<Record<string, unknown>>('/_admin/system/health'));
    if (result) health.value = result;
  }

  /**
   * Returns the responders nearest to a point, nearest first. Unlike the guarded actions this
   * throws on failure: the dispatch panel shows its own retry affordance instead of a toast.
   * Distances are null when no location fix is available for a responder.
   */
  async function nearestResponders(sosId: string, limit = 10): Promise<NearestResponderView[]> {
    const result = await get<{ items: NearestResponderView[]; total: number }>(`/_admin/sos/${sosId}/nearest`, {
      limit
    });
    return result.items ?? [];
  }

  /** Dispatches responders to an SOS request. 'offer' sends offers that require acceptance; 'immediate' assigns the single responder directly. */
  async function dispatch(sosId: string, groupId: string, responderIds: string[], mode: 'offer' | 'immediate' = 'offer'): Promise<{ mode: string } | undefined> {
    const result = await post<{ mode?: string }>(`/_admin/sos/${sosId}/dispatch`, { groupId, responderIds, mode });
    await loadDispatch();
    return result ? { mode: result.mode ?? mode } : undefined;
  }

  /** Loads the job types catalog (admin). */
  async function loadJobTypes(): Promise<AdminJobTypeView[]> {
    const result = await guard(() => get<{ items: AdminJobTypeView[] }>('/_admin/job-types'));
    return result?.items ?? [];
  }

  /** Lists every mission offer, optionally filtered by status (admin). */
  async function loadMissionOffers(status?: string, limit = 100): Promise<AdminMissionOfferView[]> {
    const result = await guard(() =>
      get<{ items: AdminMissionOfferView[] }>('/_admin/mission-offers', {
        ...(status ? { status } : {}),
        limit
      })
    );
    return result?.items ?? [];
  }

  /** Creates/updates a job type (admin). */
  async function createJobType(input: { label: string; offerPolicy: 'all' | 'ready_only' }): Promise<void> {
    await post('/_admin/job-types', input);
  }

  async function updateJobType(jobTypeId: string, input: { label?: string; offerPolicy?: 'all' | 'ready_only'; active?: boolean }): Promise<void> {
    await patch(`/_admin/job-types/${jobTypeId}`, input);
  }

  /** Loads every dataset an administrator screen may need. */
  async function loadAll(): Promise<void> {
    await Promise.all([loadOverview(), loadDispatch(), loadGroups(), loadAlerts(), loadSettings()]);
  }

  return {
    overview,
    dispatchQueue,
    users,
    groups,
    alerts,
    audit,
    settings,
    incidentTypes,
    health,
    loading,
    error,
    userFilters,
    auditFilters,
    loadOverview,
    loadDispatch,
    loadUsers,
    createUser,
    updateUser,
    loadGroups,
    createGroup,
    updateGroup,
    loadAlerts,
    resolveAlert,
    loadAudit,
    loadSettings,
    saveSettings,
    loadIncidentTypes,
    loadHealth,
    dispatch,
    nearestResponders,
    loadMissionOffers,
    loadJobTypes,
    createJobType,
    updateJobType,
    loadAll
  };
});
