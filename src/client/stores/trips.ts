import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { del, get, patch, post, errorMessage } from '@/api/client.ts';
import type {
  TripInvitationInboxView, TripListItemView, TripView
} from '@/api/types.ts';

/** One stop as the create form collects it; placeId is optional and references a saved place. */
export interface TripStopInput {
  label: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
}

/**
 * Trips and group rides (Stage 5). The server is the authority on leadership, transitions and
 * membership; every action re-reads from it rather than maintaining a derived local copy.
 */
export const useTripsStore = defineStore('trips', () => {
  const trips = ref<TripListItemView[]>([]);
  const invitations = ref<TripInvitationInboxView[]>([]);
  const detail = ref<TripView | null>(null);
  const savedOnly = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** Loads the list (honouring the saved-only filter) and the invitation inbox. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [tripList, inviteList] = await Promise.all([
        get<{ items: TripListItemView[] }>('/_user/trips', savedOnly.value ? { saved: 'true' } : {}),
        get<{ items: TripInvitationInboxView[] }>('/_user/trips/invitations')
      ]);
      trips.value = tripList.items ?? [];
      invitations.value = inviteList.items ?? [];
    } catch (caught) {
      error.value = errorMessage(caught);
    } finally {
      loading.value = false;
    }
  }

  /** Reloads and returns the full detail of one trip. */
  async function open(tripId: string): Promise<TripView | null> {
    try {
      detail.value = await get<TripView>(`/_user/trips/${encodeURIComponent(tripId)}`);
      return detail.value;
    } catch (caught) {
      error.value = errorMessage(caught);
      return null;
    }
  }

  /** Creates a trip; the creator becomes its leader. */
  async function create(name: string, stops: TripStopInput[]): Promise<TripView | null> {
    const created = await post<TripView>('/_user/trips', { name, stops });
    detail.value = created;
    await load();
    return created;
  }

  /** Renames the trip or rewrites its stops (leader only; finished trips are refused by the server). */
  async function update(tripId: string, input: { name?: string; stops?: TripStopInput[] }): Promise<TripView | null> {
    detail.value = await patch<TripView>(`/_user/trips/${encodeURIComponent(tripId)}`, input);
    await load();
    return detail.value;
  }

  /** Toggles the personal saved marker on a trip. */
  async function toggleSave(tripId: string, saved: boolean): Promise<void> {
    await post(`/_user/trips/${encodeURIComponent(tripId)}/save`, { saved });
    trips.value = trips.value.map((trip) => (trip.id === tripId ? { ...trip, saved } : trip));
    if (detail.value?.id === tripId) detail.value = { ...detail.value, saved };
    if (savedOnly.value && !saved) await load();
  }

  /** Starts the trip (leader only); planned -> active. */
  async function start(tripId: string): Promise<void> {
    detail.value = await post<TripView>(`/_user/trips/${encodeURIComponent(tripId)}/start`, {});
    await load();
  }

  /** Completes an active trip (leader only). */
  async function complete(tripId: string): Promise<void> {
    detail.value = await post<TripView>(`/_user/trips/${encodeURIComponent(tripId)}/complete`, {});
    await load();
  }

  /** Cancels a planned or active trip (leader only). */
  async function cancel(tripId: string): Promise<void> {
    detail.value = await post<TripView>(`/_user/trips/${encodeURIComponent(tripId)}/cancel`, {});
    await load();
  }

  /** Invites an account; the invitee must accept before joining. */
  async function invite(tripId: string, inviteeId: string): Promise<TripView | null> {
    detail.value = await post<TripView>(`/_user/trips/${encodeURIComponent(tripId)}/invitations`, { inviteeId });
    return detail.value;
  }

  /** Answers a pending invitation addressed to the current account. */
  async function answerInvitation(invitationId: string, accept: boolean): Promise<void> {
    await post(`/_user/trips/invitations/${encodeURIComponent(invitationId)}/${accept ? 'accept' : 'decline'}`, {});
    await load();
  }

  /** Cancels a pending invitation (leader only). */
  async function cancelInvitation(invitationId: string): Promise<void> {
    await del(`/_user/trips/invitations/${encodeURIComponent(invitationId)}`);
    if (detail.value) await open(detail.value.id);
  }

  /** Leaves a trip (members only). */
  async function leave(tripId: string): Promise<void> {
    await post(`/_user/trips/${encodeURIComponent(tripId)}/leave`, {});
    detail.value = null;
    await load();
  }

  const activeCount = computed(() => trips.value.filter((trip) => trip.status === 'active').length);

  return {
    trips, invitations, detail, savedOnly, loading, error, activeCount,
    load, open, create, update, toggleSave, start, complete, cancel,
    invite, answerInvitation, cancelInvitation, leave
  };
});
