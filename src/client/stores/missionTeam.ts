import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, errorMessage, get, post, put } from '@/api/client.ts';
import type {
  MissionRequirementView,
  MissionTeamView,
  SupportRequestCandidateView,
  SupportRequestView
} from '@/api/types.ts';

/** Query accepted by the admin candidate search. */
export interface CandidateQuery {
  jobTypeId?: string;
  q?: string;
  includeIneligible?: boolean;
  limit?: number;
}

/** Payload for one review decision on a support request. */
export interface ReviewInput {
  decision: 'approved' | 'partially_approved' | 'rejected';
  adminNote?: string;
  items?: Array<{ jobTypeId: string; approvedQuantity: number }>;
  userIds?: string[];
}

/**
 * Mission teams and support requests, shared by the user mission screen and the
 * administrator review console. Every mutation reloads from the server so the
 * single source of truth stays server-side.
 */
export const useMissionTeamStore = defineStore('missionTeam', () => {
  /** Team projection for the mission currently on screen. */
  const team = ref<MissionTeamView | null>(null);
  /** The mission team could not be loaded because the caller is not a member. */
  const teamDenied = ref(false);
  /** Support requests of the open mission (user/member projection). */
  const requests = ref<SupportRequestView[]>([]);
  /** Administrator review queue. */
  const adminRequests = ref<SupportRequestView[]>([]);
  const adminTotal = ref(0);
  /** Detail of one request under review (decisions included for admin/requester). */
  const detail = ref<SupportRequestView | null>(null);
  /** Last administrator list query, reapplied after a review. */
  const adminQuery = ref<{ status?: string; missionId?: string }>({});
  const candidates = ref<SupportRequestCandidateView[]>([]);
  const candidatesTotal = ref(0);
  const eligibleTotal = ref(0);
  const loading = ref(false);
  const busy = ref(false);
  const error = ref<string | null>(null);

  /** Loads the mission team. User and admin scopes hit different endpoints. */
  async function loadTeam(missionId: string, admin = false): Promise<void> {
    loading.value = true;
    error.value = null;
    teamDenied.value = false;
    try {
      team.value = await get<MissionTeamView>(admin ? `/_admin/missions/${missionId}/team` : `/_user/missions/${missionId}/team`);
    } catch (caught) {
      if ((caught as { status?: number })?.status === 403) teamDenied.value = true;
      else error.value = errorMessage(caught);
      team.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** Loads the mission's support requests (user projection). */
  async function loadRequests(missionId: string): Promise<void> {
    try {
      const result = await get<{ items: SupportRequestView[] }>(`/_user/missions/${missionId}/support-requests`, { limit: 50 });
      requests.value = result.items ?? [];
    } catch (caught) {
      // A non-member never reaches this panel; surface anything else.
      if ((caught as { status?: number })?.status !== 403) error.value = errorMessage(caught);
      requests.value = [];
    }
  }

  /** Reloads team + requests for the mission shown on screen. */
  async function refresh(missionId: string, admin = false): Promise<void> {
    await Promise.all([loadTeam(missionId, admin), ...(admin ? [] : [loadRequests(missionId)])]);
  }

  /** Leader-only: ask for more workers for this mission. */
  async function createSupportRequest(missionId: string, input: { items: Array<{ jobTypeId: string; quantity: number }>; reason: string; note?: string }): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      await post(`/_user/missions/${missionId}/support-requests`, input);
      await Promise.all([loadTeam(missionId), loadRequests(missionId)]);
    } finally {
      busy.value = false;
    }
  }

  /** Leader-only: withdraw a pending request. */
  async function cancelSupportRequest(missionId: string, requestId: string): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      await post(`/_user/missions/${missionId}/support-requests/${requestId}/cancel`);
      await Promise.all([loadTeam(missionId), loadRequests(missionId)]);
    } finally {
      busy.value = false;
    }
  }

  /** Admin: filtered review queue. */
  async function loadAdminRequests(status?: string, missionId?: string): Promise<void> {
    loading.value = true;
    error.value = null;
    adminQuery.value = { status, missionId };
    try {
      const result = await get<{ items: SupportRequestView[]; total: number }>('/_admin/support-requests', {
        ...(status ? { status } : {}),
        ...(missionId ? { missionId } : {}),
        limit: 100
      });
      adminRequests.value = result.items ?? [];
      adminTotal.value = result.total ?? adminRequests.value.length;
    } catch (caught) {
      error.value = errorMessage(caught);
      adminRequests.value = [];
    } finally {
      loading.value = false;
    }
  }

  /** Admin: full review context for one request (mission, leader, decisions). */
  async function loadDetail(requestId: string): Promise<SupportRequestView | null> {
    error.value = null;
    try {
      detail.value = await get<SupportRequestView>(`/_admin/support-requests/${requestId}`);
      return detail.value;
    } catch (caught) {
      error.value = errorMessage(caught);
      detail.value = null;
      return null;
    }
  }

  /** Admin: candidate workers for a request, optionally filtered by line/search. */
  async function loadCandidates(requestId: string, query: CandidateQuery = {}): Promise<void> {
    error.value = null;
    try {
      const result = await get<{ items: SupportRequestCandidateView[]; total: number; eligibleTotal: number }>(
        `/_admin/support-requests/${requestId}/candidates`,
        { ...query, limit: query.limit ?? 50 }
      );
      candidates.value = result.items ?? [];
      candidatesTotal.value = result.total ?? candidates.value.length;
      eligibleTotal.value = result.eligibleTotal ?? candidates.value.filter((item) => item.eligible).length;
    } catch (caught) {
      error.value = errorMessage(caught);
      candidates.value = [];
    }
  }

  /** Admin: record the review decision and (on approval) assign the workers. */
  async function review(requestId: string, input: ReviewInput): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      await post(`/_admin/support-requests/${requestId}/review`, input);
      await loadAdminRequests(adminQuery.value.status, adminQuery.value.missionId);
      if (detail.value?.id === requestId) await loadDetail(requestId);
    } finally {
      busy.value = false;
    }
  }

  /** Admin: attach already-selected workers to a mission roster. */
  async function addMembers(missionId: string, userIds: string[]): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      team.value = await post<MissionTeamView>(`/_admin/missions/${missionId}/members`, { userIds });
    } finally {
      busy.value = false;
    }
  }

  /** Admin: remove one member from the roster (leader cannot be removed). */
  async function removeMember(missionId: string, userId: string, reason?: string): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      team.value = await api<MissionTeamView>(`/_admin/missions/${missionId}/members/${userId}`, { method: 'DELETE', body: reason ? { reason } : {} });
    } finally {
      busy.value = false;
    }
  }

  /** Admin: designate an active member as the mission leader. */
  async function designateLeader(missionId: string, userId: string): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      team.value = await post<MissionTeamView>(`/_admin/missions/${missionId}/leader`, { userId });
    } finally {
      busy.value = false;
    }
  }

  /** Admin: replace the required composition of a team mission. */
  async function setRequirements(missionId: string, requirements: Array<{ jobTypeId: string; quantity: number }>): Promise<void> {
    busy.value = true;
    error.value = null;
    try {
      team.value = await put<MissionTeamView>(`/_admin/missions/${missionId}/requirements`, { requirements });
    } finally {
      busy.value = false;
    }
  }

  /** Admin: dispatch a pending SOS as a team mission (leader + composition). */
  async function teamDispatch(sosId: string, input: { groupId: string; leaderId: string; requirements: MissionRequirementView[] | Array<{ jobTypeId: string; quantity: number }>; memberIds?: string[] }): Promise<string | undefined> {
    busy.value = true;
    error.value = null;
    try {
      const result = await post<{ missionId?: string }>(`/_admin/sos/${sosId}/team-dispatch`, {
        groupId: input.groupId,
        leaderId: input.leaderId,
        requirements: input.requirements.map((line) => ({ jobTypeId: line.jobTypeId, quantity: line.quantity })),
        ...(input.memberIds?.length ? { memberIds: input.memberIds } : {})
      });
      return result?.missionId;
    } finally {
      busy.value = false;
    }
  }

  /** Drops every loaded slice; call when the screen changes missions. */
  function reset(): void {
    team.value = null;
    teamDenied.value = false;
    requests.value = [];
    adminRequests.value = [];
    adminTotal.value = 0;
    detail.value = null;
    candidates.value = [];
    candidatesTotal.value = 0;
    eligibleTotal.value = 0;
    loading.value = false;
    busy.value = false;
    error.value = null;
  }

  return {
    team,
    teamDenied,
    requests,
    adminRequests,
    adminTotal,
    detail,
    candidates,
    candidatesTotal,
    eligibleTotal,
    loading,
    busy,
    error,
    loadTeam,
    loadRequests,
    refresh,
    createSupportRequest,
    cancelSupportRequest,
    loadAdminRequests,
    loadDetail,
    loadCandidates,
    review,
    addMembers,
    removeMember,
    designateLeader,
    setRequirements,
    teamDispatch,
    reset
  };
});
