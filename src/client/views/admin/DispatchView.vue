<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import { useMissionTeamStore } from '@/stores/missionTeam.ts';
import type { AdminJobTypeView, NearestResponderView, SosView } from '@/api/types.ts';

/** Dispatch board: pending SOS requests on the right, groups on the left. */
const admin = useAdminStore();
const team = useMissionTeamStore();
const format = useFormatters();
const toast = useToast();
const queue = computed(() => admin.dispatchQueue?.items ?? []);

/** active groups that actually have members — the server refuses everything else. */
const staffedGroups = computed(() => admin.groups.filter((group) => group.status === 'active' && (group.memberIds?.length ?? 0) > 0));

/**
 * The panel is deliberately explicit: the dispatcher picks the group, then ticks the responders.
 * Auto-picking the first staffed group (the old behavior) sent whoever happened to come first in
 * the membership list, with no chance to match the responder to the incident at hand.
 */
const openId = ref<string | null>(null);
const selectedGroupId = ref('');
const selectedResponderIds = ref<string[]>([]);
/** Team mode: explicit leader choice (never auto-picked) and the required composition. */
const leaderId = ref('');
const teamLines = ref<Array<{ jobTypeId: string; quantity: number }>>([]);
const jobTypes = ref<AdminJobTypeView[]>([]);
const jobTypesError = ref<string | null>(null);
/** Offer-based (requires acceptance), immediate (direct assignment), or team (leader + composition). */
const mode = ref<'offer' | 'immediate' | 'team'>('offer');
const nearest = ref<{ loading: boolean; error: string | null; items: NearestResponderView[] }>({ loading: false, error: null, items: [] });
const dispatching = ref(false);

const openItem = computed(() => queue.value.find((item) => item.id === openId.value) ?? null);
const selectedGroup = computed(() => staffedGroups.value.find((group) => group.id === selectedGroupId.value) ?? null);
const nearestById = computed(() => new Map(nearest.value.items.map((item) => [item.id, item])));

/**
 * The panel lists every member of the chosen group, enriched with the nearest-responders
 * payload (distance, rating, readiness) where a fix exists. A member without a recent fix still
 * appears — the dispatcher may know better than the last beacon does.
 */
const memberRows = computed(() => {
  const group = selectedGroup.value;
  if (!group) return [];
  return (group.memberIds ?? [])
    .map((id) => nearestById.value.get(id) ?? { id, username: id, averageRating: null, readyForMission: null, latitude: null, longitude: null, distanceMeters: null, recordedAt: null })
    .sort((a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER));
});

/** Team mode: every group member except the chosen leader can ride along immediately. */
const teamMemberRows = computed(() => memberRows.value.filter((row) => row.id !== leaderId.value));
const teamLinesValid = computed(() => {
  if (!teamLines.value.length) return false;
  const ids = new Set<string>();
  for (const line of teamLines.value) {
    if (!line.jobTypeId || ids.has(line.jobTypeId)) return false;
    ids.add(line.jobTypeId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1) return false;
  }
  return true;
});

/** Nearest responders, shown read-only until a group is chosen; selection is always explicit. */
const nearestRows = computed(() => nearest.value.items);

function formatDistance(value: number | null): string {
  return value === null ? 'بدون موقعیت ثبت‌شده' : format.distance(value);
}

function rowChecked(id: string): boolean {
  return selectedResponderIds.value.includes(id);
}

function toggleResponder(id: string, checked: boolean): void {
  if (mode.value === 'immediate') {
    // Immediate dispatch assigns exactly one worker.
    selectedResponderIds.value = checked ? [id] : [];
    return;
  }
  const next = new Set(selectedResponderIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedResponderIds.value = [...next];
}

async function chooseMode(next: 'offer' | 'immediate' | 'team'): Promise<void> {
  mode.value = next;
  // Immediate dispatch is single-worker: drop extra ticks rather than silently reinterpret them.
  selectedResponderIds.value = next === 'immediate' ? selectedResponderIds.value.slice(0, 1) : selectedResponderIds.value;
  if (next === 'team') {
    selectedResponderIds.value = [];
    if (!jobTypes.value.length) {
      try {
        jobTypes.value = await admin.loadJobTypes();
        jobTypesError.value = null;
        if (!teamLines.value.length) {
          const first = jobTypes.value.find((jobType) => jobType.active);
          if (first) teamLines.value = [{ jobTypeId: first.id, quantity: 1 }];
        }
      } catch (caught) {
        jobTypesError.value = errorMessage(caught);
      }
    }
  }
}

function toggleTeamMember(id: string, checked: boolean): void {
  const next = new Set(selectedResponderIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedResponderIds.value = [...next];
}

function addTeamLine(): void {
  const used = new Set(teamLines.value.map((line) => line.jobTypeId));
  const next = jobTypes.value.find((jobType) => jobType.active && !used.has(jobType.id));
  teamLines.value = [...teamLines.value, { jobTypeId: next?.id ?? '', quantity: 1 }];
}

function removeTeamLine(index: number): void {
  teamLines.value = teamLines.value.filter((_, itemIndex) => itemIndex !== index);
}

async function openPanel(item: SosView): Promise<void> {
  if (openId.value === item.id) {
    openId.value = null;
    return;
  }
  openId.value = item.id;
  selectedGroupId.value = '';
  selectedResponderIds.value = [];
  leaderId.value = '';
  teamLines.value = [];
  nearest.value = { loading: true, error: null, items: [] };
  await loadNearest(item);
}

async function loadNearest(item: SosView): Promise<void> {
  nearest.value.loading = true;
  nearest.value.error = null;
  try {
    nearest.value.items = await admin.nearestResponders(item.id);
  } catch (caught) {
    nearest.value.items = [];
    nearest.value.error = errorMessage(caught);
  } finally {
    nearest.value.loading = false;
  }
}

function chooseGroup(event: Event): void {
  selectedGroupId.value = (event.target as HTMLSelectElement).value;
  // Selection is per group: carrying ticks across groups would dispatch people nobody chose.
  selectedResponderIds.value = [];
  leaderId.value = '';
}

const canDispatch = computed(() => {
  if (!selectedGroup.value || dispatching.value) return false;
  if (mode.value === 'immediate') return selectedResponderIds.value.length === 1;
  if (mode.value === 'team') return Boolean(leaderId.value) && teamLinesValid.value;
  return selectedResponderIds.value.length > 0;
});

async function dispatch(): Promise<void> {
  const item = openItem.value;
  const group = selectedGroup.value;
  if (!item || !group || !canDispatch.value) return;
  dispatching.value = true;
  try {
    if (mode.value === 'team') {
      const missionId = await team.teamDispatch(item.id, {
        groupId: group.id,
        leaderId: leaderId.value,
        requirements: teamLines.value.map((line) => ({ jobTypeId: line.jobTypeId, quantity: line.quantity })),
        ...(selectedResponderIds.value.length ? { memberIds: [...selectedResponderIds.value] } : {})
      });
      toast.push(missionId ? 'مأموریت تیمی با سرپرست و ترکیب مشخص ساخته شد.' : 'مأموریت تیمی ساخته شد.', 'success', 2600);
      await admin.loadDispatch();
      openId.value = null;
      selectedGroupId.value = '';
      selectedResponderIds.value = [];
      leaderId.value = '';
      teamLines.value = [];
      return;
    }
    const result = await admin.dispatch(item.id, group.id, [...selectedResponderIds.value], mode.value);
    toast.push(result?.mode === 'immediate' ? 'اعزام فوری انجام شد؛ امدادگر بدون پذیرش مأمور شد.' : 'درخواست اعزام شد.', 'success', 2600);
    openId.value = null;
    selectedGroupId.value = '';
    selectedResponderIds.value = [];
  } catch (caught) {
    // The panel stays open with the same selection: the dispatcher sees the server's reason and can
    // fix the choice (e.g. a responder who lost membership between loading and dispatching).
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    dispatching.value = false;
  }
}

onMounted(() => void admin.loadDispatch());
</script>

<template>
  <section class="admin-page" data-testid="admin-dispatch">
    <article class="panel">
      <header class="panel__head">
        <h2>صف اعزام</h2>
        <span class="panel__hint">{{ format.number(queue.length) }} درخواست</span>
      </header>
      <ul class="admin-list">
        <template v-for="item in queue" :key="item.id">
        <li>
          <span class="mdi mdi-alarm-light-outline" aria-hidden="true" />
          <div>
            <strong>{{ item.incidentLabel }} · {{ item.severity }}</strong>
            <small>{{ item.description }}</small>
          </div>
          <button type="button" class="admin-action" data-testid="open-dispatch" @click="openPanel(item)">{{ openId === item.id ? 'بستن' : 'اعزام' }}</button>
        </li>
        <li v-if="openItem?.id === item.id" class="dispatch-panel" data-testid="dispatch-panel">
          <strong class="dispatch-panel__title">اعزام درخواست</strong>

          <fieldset class="dispatch-mode" data-testid="dispatch-mode">
            <legend>نحوه اعزام</legend>
            <label>
              <input type="radio" name="dispatch-mode" value="offer" :checked="mode === 'offer'" data-testid="dispatch-mode-offer" @change="chooseMode('offer')" />
              <span><strong>اعزام با پیشنهاد</strong><small>پیشنهاد برای امدادگرها ارسال می‌شود؛ اولین پذیرنده مأمور می‌شود.</small></span>
            </label>
            <label>
              <input type="radio" name="dispatch-mode" value="immediate" :checked="mode === 'immediate'" data-testid="dispatch-mode-immediate" @change="chooseMode('immediate')" />
              <span><strong>اعزام فوری</strong><small>یک امدادگر بدون مرحله پذیرش مستقیماً مأمور می‌شود (وضعیت: تعیین‌شده).</small></span>
            </label>
            <label>
              <input type="radio" name="dispatch-mode" value="team" :checked="mode === 'team'" data-testid="dispatch-mode-team" @change="chooseMode('team')" />
              <span><strong>مأموریت تیمی</strong><small>سرپرست و ترکیب مورد نیاز تعیین می‌شود؛ یک مأموریت واحد با تیم کامل ساخته می‌شود.</small></span>
            </label>
          </fieldset>

          <label class="dispatch-panel__field">
            <span>گروه امداد</span>
            <select :value="selectedGroupId" data-testid="dispatch-group" @change="chooseGroup">
              <option value="">{{ staffedGroups.length ? 'انتخاب کنید…' : 'گروهی با امدادگر فعال تعریف نشده است' }}</option>
              <option v-for="group in staffedGroups" :key="group.id" :value="group.id">{{ group.name }} ({{ format.number(group.memberIds?.length ?? 0) }} امدادگر)</option>
            </select>
          </label>

          <div v-if="staffedGroups.length === 0" class="dispatch-panel__warn" role="alert">گروهی با امدادگر فعال برای اعزام تعریف نشده است.</div>

          <div class="dispatch-panel__nearest">
            <span class="dispatch-panel__label">نزدیک‌ترین امدادگرها (نسبت به موقعیت درخواست)</span>
            <p v-if="nearest.loading" class="dispatch-panel__hint"><span class="mdi mdi-loading is-spinning" aria-hidden="true" /> در حال یافتن نزدیک‌ترین امدادگرها…</p>
            <div v-else-if="nearest.error" class="dispatch-panel__warn" role="alert">
              <span>بارگذاری نزدیک‌ترین امدادگرها ناموفق بود: {{ nearest.error }}</span>
              <button type="button" class="ghost-button dispatch-panel__retry" data-testid="nearest-retry" @click="loadNearest(openItem)">تلاش دوباره</button>
            </div>
            <p v-else-if="!nearest.items.length" class="dispatch-panel__hint">هیچ امدادگری یافت نشد.</p>
            <ul v-else-if="!selectedGroup" class="dispatch-rows" data-testid="nearest-readonly">
              <li v-for="row in nearestRows" :key="row.id" class="dispatch-row">
                <span class="mdi mdi-account" aria-hidden="true" />
                <div>
                  <strong>{{ row.username }}</strong>
                  <small>فاصله: {{ formatDistance(row.distanceMeters) }} · امتیاز {{ row.averageRating === null ? '—' : format.number(row.averageRating) }} · {{ row.readyForMission === null ? 'بدون وضعیت' : row.readyForMission ? 'آماده' : 'مشغول' }}</small>
                </div>
                <span class="status-pill status-pill--neutral">انتخاب پس از انتخاب گروه</span>
              </li>
            </ul>
          </div>

          <!-- Team mode: explicit leader, required composition, optional immediate riders -->
          <div v-if="mode === 'team' && selectedGroup" class="dispatch-team" data-testid="team-builder">
            <label class="dispatch-panel__field">
              <span>سرپرست مأموریت</span>
              <select v-model="leaderId" data-testid="team-leader">
                <option value="">انتخاب سرپرست…</option>
                <option v-for="row in memberRows" :key="row.id" :value="row.id">{{ row.username }} · {{ row.readyForMission ? 'آماده' : 'مشغول' }}</option>
              </select>
            </label>
            <div class="dispatch-panel__field">
              <span>ترکیب مورد نیاز</span>
              <p v-if="jobTypesError" class="dispatch-panel__warn" role="alert">بارگذاری نوع شغل‌ها ناموفق بود: {{ jobTypesError }}</p>
              <div v-for="(line, index) in teamLines" :key="index" class="team-editor__line">
                <select v-model="line.jobTypeId" :aria-label="`نوع شغل خط ${index + 1}`">
                  <option value="">انتخاب…</option>
                  <option v-for="jobType in jobTypes.filter((item) => item.active)" :key="jobType.id" :value="jobType.id">{{ jobType.label }}</option>
                </select>
                <input v-model.number="line.quantity" type="number" min="1" max="20" inputmode="numeric" :aria-label="`تعداد خط ${index + 1}`" />
                <button type="button" class="admin-action" :aria-label="`حذف خط ${index + 1}`" @click="removeTeamLine(index)">
                  <span class="mdi mdi-close-circle-outline" aria-hidden="true" />
                </button>
              </div>
              <button type="button" class="ghost-button dispatch-team__add" :disabled="teamLines.length >= 10" @click="addTeamLine">
                <span class="mdi mdi-plus" aria-hidden="true" />
                <span>خط تازه</span>
              </button>
              <p v-if="teamLines.length && !teamLinesValid" class="team-panel__error" role="alert">هر خط باید یک نوع شغل یکتا و تعداد حداقل ۱ داشته باشد.</p>
            </div>
            <div v-if="leaderId" class="dispatch-panel__field">
              <span>اعضای اضافه بدون پذیرش (اختیاری)</span>
              <ul class="dispatch-rows" data-testid="team-riders">
                <li v-for="row in teamMemberRows" :key="row.id" class="dispatch-row">
                  <label class="dispatch-row__pick">
                    <input type="checkbox" :checked="rowChecked(row.id)" :data-testid="`team-rider-${row.id}`" @change="toggleTeamMember(row.id, ($event.target as HTMLInputElement).checked)" />
                    <span class="mdi mdi-account" aria-hidden="true" />
                    <span>
                      <strong>{{ row.username }}</strong>
                      <small>امتیاز {{ row.averageRating === null ? '—' : format.number(row.averageRating) }} · {{ row.readyForMission === null ? 'بدون وضعیت' : row.readyForMission ? 'آماده' : 'مشغول' }}</small>
                    </span>
                  </label>
                </li>
              </ul>
              <p v-if="!teamMemberRows.length" class="team-panel__hint">عضو دیگری در گروه انتخابی نیست.</p>
            </div>
          </div>

          <ul v-if="selectedGroup && mode !== 'team'" class="dispatch-rows" data-testid="dispatch-members">
            <li v-for="row in memberRows" :key="row.id" class="dispatch-row">
              <label class="dispatch-row__pick">
                <input :type="mode === 'immediate' ? 'radio' : 'checkbox'" name="dispatch-member-pick" :checked="rowChecked(row.id)" :data-testid="`responder-${row.id}`" @change="toggleResponder(row.id, ($event.target as HTMLInputElement).checked)">
                <span class="mdi mdi-account" aria-hidden="true" />
                <span>
                  <strong>{{ nearestById.get(row.id)?.username ?? row.id }}</strong>
                  <small>فاصله: {{ formatDistance(row.distanceMeters) }} · امتیاز {{ row.averageRating === null ? '—' : format.number(row.averageRating) }} · {{ row.readyForMission === null ? 'بدون وضعیت' : row.readyForMission ? 'آماده' : 'مشغول' }}</small>
                </span>
              </label>
            </li>
            <li v-if="!memberRows.length" class="dispatch-panel__hint">گروه انتخاب‌شده امدادگر ندارد.</li>
          </ul>

          <div class="action-row">
            <button type="button" class="primary-button" :disabled="!canDispatch" data-testid="confirm-dispatch" @click="dispatch">
              <span class="mdi mdi-send" aria-hidden="true" />
              <span>{{ dispatching ? 'در حال اعزام…' : mode === 'immediate' ? `اعزام فوری${selectedResponderIds.length ? ` (${format.number(selectedResponderIds.length)} نفر)` : ''}` : mode === 'team' ? 'اعزام تیمی' : `اعزام و ارسال پیشنهاد${selectedResponderIds.length ? ` (${format.number(selectedResponderIds.length)} نفر)` : ''}` }}</span>
            </button>
            <button type="button" class="ghost-button" data-testid="close-dispatch" @click="openId = null">انصراف</button>
          </div>
        </li>
        </template>
      </ul>
      <p v-if="!queue.length" class="panel__empty">صف اعزام خالی است.</p>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>گروه‌های امداد</h2></header>
      <ul class="admin-list">
        <li v-for="group in admin.groups" :key="group.id">
          <i class="group-dot" :style="{ background: group.color }" />
          <div>
            <strong>{{ group.name }}</strong>
            <small>ظرفیت {{ format.number(group.capacity) }} · {{ group.status }}</small>
          </div>
          <span class="status-pill status-pill--neutral">{{ format.number(group.incidentIds.length) }} نوع</span>
        </li>
      </ul>
    </article>
  </section>
</template>
