<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useTripsStore, type TripStopInput } from '@/stores/trips.ts';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useToast } from '@/composables/useToast.ts';
import { get, errorMessage } from '@/api/client.ts';
import type { SavedPlaceView, UserSearchView } from '@/api/types.ts';

/**
 * Trips and group rides (Stage 5): saved trips, group rides with explicit invitations and the
 * leader-only route modification rule. The server enforces leadership, transitions and
 * membership; every action goes through the store, which re-reads the authoritative state.
 */
const trips = useTripsStore();
const map = useMapStore();
const format = useFormatters();
const toast = useToast();

onMounted(() => {
  void trips.load();
});

const STATUS_LABEL: Record<string, string> = {
  planned: 'برنامه‌ریزی‌شده',
  active: 'در حال انجام',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده'
};
const ROLE_LABEL: Record<string, string> = { leader: 'رهبر', member: 'عضو' };

const selectedId = ref<string | null>(null);
const current = computed(() => (trips.detail && trips.detail.id === selectedId.value ? trips.detail : null));

watch(selectedId, async (id) => { if (id) await trips.open(id); });

function selectTrip(id: string): void {
  selectedId.value = selectedId.value === id ? null : id;
}

async function toggleSave(event: MouseEvent, id: string, saved: boolean): Promise<void> {
  event.stopPropagation();
  await trips.toggleSave(id, !saved);
}

/* ---- Create panel ---- */
interface DraftStop { label: string; latitude: string; longitude: string; placeId: string | null }
const createOpen = ref(false);
const newName = ref('');
const draftStops = ref<DraftStop[]>([{ label: '', latitude: '35.7219', longitude: '51.3347', placeId: null }]);

function addStop(): void {
  draftStops.value.push({ label: '', latitude: '', longitude: '', placeId: null });
}
function removeStop(index: number): void {
  if (draftStops.value.length <= 1) return;
  draftStops.value.splice(index, 1);
}
function addStopFromCenter(): void {
  draftStops.value.push({
    label: `توقف ${format.number(draftStops.value.length + 1)}`,
    latitude: map.center.latitude.toFixed(4),
    longitude: map.center.longitude.toFixed(4),
    placeId: null
  });
}
function addStopFromPlace(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  const place = map.places.find((candidate) => candidate.id === value);
  if (place) {
    draftStops.value.push({
      label: place.label,
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      placeId: place.id
    });
  }
  (event.target as HTMLSelectElement).value = '';
}

function parsedStop(stop: DraftStop): TripStopInput | null {
  const label = stop.label.trim();
  const latitude = Number(stop.latitude);
  const longitude = Number(stop.longitude);
  if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { label, latitude, longitude, placeId: stop.placeId };
}
const parsedStops = computed(() => draftStops.value.map(parsedStop));
const canSubmit = computed(() => newName.value.trim().length > 0 && parsedStops.value.length > 0 && parsedStops.value.every((stop) => stop !== null));

async function submitTrip(): Promise<void> {
  if (!canSubmit.value) return;
  const stops = parsedStops.value.filter((stop): stop is TripStopInput => stop !== null);
  try {
    const created = await trips.create(newName.value.trim(), stops);
    toast.push('سفر ساخته شد.', 'success', 2400);
    newName.value = '';
    draftStops.value = [{ label: '', latitude: '35.7219', longitude: '51.3347', placeId: null }];
    createOpen.value = false;
    if (created) selectedId.value = created.id;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

/* ---- Invite panel (leader) ---- */
const inviteQuery = ref('');
const inviteResults = ref<UserSearchView[]>([]);
const inviteSearched = ref(false);
const inviting = ref(false);
const ROLE_LABEL_INVITE = { user: 'کاربر', responder: 'امدادگر', admin: 'مدیر' } as const;

async function searchInvitee(): Promise<void> {
  const query = inviteQuery.value.trim();
  if (!query || inviting.value) return;
  inviting.value = true;
  try {
    const result = await get<{ items?: UserSearchView[] }>('/_user/users/search', { q: query, limit: 10 });
    inviteResults.value = result.items ?? [];
    inviteSearched.value = true;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    inviting.value = false;
  }
}
async function sendInvite(user: UserSearchView): Promise<void> {
  if (!current.value) return;
  try {
    await trips.invite(current.value.id, user.id);
    toast.push('دعوت ارسال شد.', 'success', 2400);
    inviteQuery.value = '';
    inviteResults.value = [];
    inviteSearched.value = false;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

/* ---- Row and detail actions ---- */
async function runAction(action: 'start' | 'complete' | 'cancel' | 'leave'): Promise<void> {
  if (!current.value) return;
  try {
    if (action === 'start') await trips.start(current.value.id);
    else if (action === 'complete') await trips.complete(current.value.id);
    else if (action === 'cancel') await trips.cancel(current.value.id);
    else await trips.leave(current.value.id);
    if (action === 'leave') selectedId.value = null;
    toast.push('انجام شد.', 'success', 2000);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}
async function answerInvite(invitationId: string, accept: boolean): Promise<void> {
  try {
    await trips.answerInvitation(invitationId, accept);
    toast.push(accept ? 'به سفر پیوستید.' : 'دعوت رد شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}
async function cancelInvite(invitationId: string): Promise<void> {
  try {
    await trips.cancelInvitation(invitationId);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

const savedPlaces = computed<SavedPlaceView[]>(() => map.places);
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>سفرها</strong>
      <span>سفرهای گروهی، دعوتی و ذخیره‌شده</span>
    </div>
    <span class="status-pill status-pill--success">{{ format.number(trips.trips.length) }} سفر</span>
  </div>
  <div class="sheet__body">
    <!-- Inbox: invitations addressed to me -->
    <template v-if="trips.invitations.length">
      <h3 class="sheet__subtitle">دعوت‌ها برای من</h3>
      <ul class="share-list" data-testid="trips-inbox">
        <li v-for="invite in trips.invitations" :key="invite.id" class="share-row">
          <span class="mdi mdi-map-marker-path" aria-hidden="true" />
          <div>
            <strong>{{ invite.tripName }}</strong>
            <span>از {{ invite.inviterUsername }} · {{ format.dateTime(invite.createdAt) }}</span>
          </div>
          <button type="button" class="primary-button" :data-testid="`trips-inbox-accept-${invite.id}`" @click="answerInvite(invite.id, true)">قبول</button>
          <button type="button" class="ghost-button" :data-testid="`trips-inbox-decline-${invite.id}`" @click="answerInvite(invite.id, false)">رد</button>
        </li>
      </ul>
    </template>

    <h3 class="sheet__subtitle">سفرهای من</h3>
    <label class="share-field" style="display:flex;align-items:center;gap:8px">
      <input v-model="trips.savedOnly" type="checkbox" data-testid="trips-saved-filter" @change="() => trips.load()" />
      <span>فقط ذخیره‌شده‌ها</span>
    </label>

    <!-- Create -->
    <button type="button" class="ghost-button" data-testid="trips-create-toggle" :aria-expanded="createOpen" @click="createOpen = !createOpen">
      <span class="mdi mdi-plus" aria-hidden="true" />
      <span>{{ createOpen ? 'بستن فرم سفر' : 'سفر جدید…' }}</span>
    </button>
    <div v-if="createOpen" class="share-create" data-testid="trips-create-panel">
      <label class="share-field">
        <span>نام سفر</span>
        <input v-model="newName" type="text" data-testid="trips-name" placeholder="مثلاً مسیر بیمارستان" maxlength="80" />
      </label>
      <fieldset class="share-kind">
        <legend>توقف‌ها</legend>
        <div v-for="(stop, index) in draftStops" :key="index" class="trip-stop-row">
          <input v-model="stop.label" type="text" :data-testid="`trips-stop-label-${index}`" placeholder="نام توقف" maxlength="120" />
          <input v-model="stop.latitude" type="number" step="0.0001" :data-testid="`trips-stop-lat-${index}`" placeholder="عرض" aria-label="عرض جغرافیایی" />
          <input v-model="stop.longitude" type="number" step="0.0001" :data-testid="`trips-stop-lng-${index}`" placeholder="طول" aria-label="طول جغرافیایی" />
          <button type="button" class="ghost-button" :disabled="draftStops.length <= 1" :data-testid="`trips-stop-remove-${index}`" aria-label="حذف توقف" @click="removeStop(index)">
            <span class="mdi mdi-close" aria-hidden="true" />
          </button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button type="button" class="ghost-button" data-testid="trips-add-stop" @click="addStop">
            <span class="mdi mdi-plus" aria-hidden="true" /><span>افزودن توقف</span>
          </button>
          <button type="button" class="ghost-button" data-testid="trips-add-center-stop" @click="addStopFromCenter">
            <span class="mdi mdi-crosshairs-gps" aria-hidden="true" /><span>مرکز نقشه</span>
          </button>
          <select v-if="savedPlaces.length" data-testid="trips-place-pick" aria-label="افزودن از مکان‌های ذخیره‌شده" @change="addStopFromPlace">
            <option value="">افزودن از مکان‌های ذخیره‌شده…</option>
            <option v-for="place in savedPlaces" :key="place.id" :value="place.id">{{ place.label }}</option>
          </select>
        </div>
      </fieldset>
      <button type="button" class="primary-button" data-testid="trips-submit" :disabled="!canSubmit" @click="submitTrip">
        <span class="mdi mdi-map-marker-path" aria-hidden="true" />
        <span>ساخت سفر</span>
      </button>
    </div>

    <!-- List -->
    <p v-if="!trips.trips.length" class="sheet__status">هنوز سفری ندارید؛ با «سفر جدید…» اولین توقف‌ها را ثبت کنید.</p>
    <ul class="share-list" data-testid="trips-list">
      <li v-for="trip in trips.trips" :key="trip.id" class="share-row">
        <button type="button" class="text-link" :data-testid="`trips-save-${trip.id}`" :aria-pressed="trip.saved" @click="(event) => toggleSave(event, trip.id, trip.saved)">
          <span :class="['mdi', 'mdi-star', { 'is-active': trip.saved }]" aria-hidden="true" />
        </button>
        <button type="button" class="share-recipient" :data-testid="`trips-row-${trip.id}`" :aria-expanded="selectedId === trip.id" @click="selectTrip(trip.id)">
          <span class="share-recipient__meta">
            <strong>{{ trip.name }}</strong>
            <small>{{ STATUS_LABEL[trip.status] ?? trip.status }} · {{ ROLE_LABEL[trip.role] ?? trip.role }} · {{ format.number(trip.stopCount) }} توقف · {{ format.number(trip.memberCount) }} نفر</small>
          </span>
          <span class="mdi mdi-chevron-up" :style="{ transform: selectedId === trip.id ? 'rotate(0)' : 'rotate(180deg)' }" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <!-- Detail -->
    <template v-if="current">
      <h3 class="sheet__subtitle">جزئیات سفر: {{ current.name }}</h3>
      <ol class="trip-stop-list" data-testid="trips-detail-stops">
        <li v-for="stop in current.stops" :key="stop.id">
          <strong>{{ format.number(stop.rank) }}. {{ stop.label }}</strong>
          <small>{{ format.number(stop.latitude.toFixed(4)) }} ، {{ format.number(stop.longitude.toFixed(4)) }}</small>
        </li>
      </ol>
      <ul class="share-list" data-testid="trips-detail-members">
        <li v-for="member in current.members ?? []" :key="member.userId" class="share-row">
          <span class="mdi mdi-account" aria-hidden="true" />
          <div>
            <strong>{{ member.username }}</strong>
            <span>{{ ROLE_LABEL[member.role] ?? member.role }}</span>
          </div>
        </li>
      </ul>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
        <button v-if="current.status === 'planned' && current.role === 'leader'" type="button" class="primary-button" data-testid="trips-start" @click="runAction('start')">شروع سفر</button>
        <button v-if="current.status === 'active' && current.role === 'leader'" type="button" class="primary-button" data-testid="trips-complete" @click="runAction('complete')">پایان سفر</button>
        <button v-if="['planned', 'active'].includes(current.status) && current.role === 'leader'" type="button" class="ghost-button" data-testid="trips-cancel" @click="runAction('cancel')">لغو سفر</button>
        <button v-if="current.role === 'member'" type="button" class="ghost-button" data-testid="trips-leave" @click="runAction('leave')">ترک سفر</button>
        <button type="button" class="ghost-button" :data-testid="`trips-detail-save-${current.id}`" @click="() => trips.toggleSave(current!.id, !current!.saved)">
          <span class="mdi mdi-star" aria-hidden="true" />
          <span>{{ current.saved ? 'برداشتن از ذخیره‌ها' : 'ذخیره سفر' }}</span>
        </button>
      </div>

      <!-- Leader-only: invite and manage invitations -->
      <template v-if="current.role === 'leader'">
        <h3 class="sheet__subtitle">دعوت به سفر</h3>
        <form class="share-search" data-testid="trips-invite-form" @submit.prevent="searchInvitee">
          <input v-model="inviteQuery" type="text" data-testid="trips-invite-search" placeholder="نام کاربری…" aria-label="جستجوی کاربر برای دعوت" />
          <button type="submit" class="ghost-button" :disabled="inviting || !inviteQuery.trim()" data-testid="trips-invite-submit">
            {{ inviting ? '…' : 'جستجو' }}
          </button>
        </form>
        <ul v-if="inviteResults.length" class="share-results">
          <li v-for="user in inviteResults" :key="user.id">
            <button type="button" class="share-recipient" :data-testid="`trips-invite-result-${user.username}`" @click="sendInvite(user)">
              <span class="mdi mdi-account-circle-outline" aria-hidden="true" />
              <span class="share-recipient__meta">
                <strong>{{ user.username }}</strong>
                <small>{{ ROLE_LABEL_INVITE[user.role] }} · {{ user.online ? 'آنلاین' : 'آفلاین' }}</small>
              </span>
              <span class="mdi mdi-send" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-else-if="inviteSearched && !inviting" class="sheet__status">کاربری با این نام پیدا نشد.</p>
        <ul v-if="current.invitations?.length" class="share-list" data-testid="trips-invitations">
          <li v-for="invite in current.invitations" :key="invite.id" class="share-row">
            <span class="mdi mdi-account-clock-outline" aria-hidden="true" />
            <div>
              <strong>{{ invite.inviteeUsername }}</strong>
              <span>{{ invite.status === 'pending' ? 'در انتظار پاسخ' : invite.status === 'accepted' ? 'پذیرفته‌شده' : invite.status === 'declined' ? 'ردشده' : 'لغوشده' }}</span>
            </div>
            <button v-if="invite.status === 'pending'" type="button" class="ghost-button" :data-testid="`trips-invitation-cancel-${invite.id}`" @click="cancelInvite(invite.id)">لغو دعوت</button>
          </li>
        </ul>
      </template>
    </template>

    <p v-if="trips.error" class="sheet__status share-error" data-testid="trips-error">{{ trips.error }}</p>
  </div>
</template>

<style scoped>
.trip-stop-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 6px;
  margin-bottom: 6px;
}
.trip-stop-row input {
  inline-size: 100%;
  font: inherit;
  padding: 8px 10px;
  border-radius: var(--r12, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
}
.trip-stop-list {
  display: grid;
  gap: 8px;
  padding-inline-start: 22px;
  margin: 8px 0 12px;
}
.trip-stop-list small {
  color: var(--muted);
  display: block;
}
.mdi-star.is-active {
  color: var(--warning);
}
</style>
