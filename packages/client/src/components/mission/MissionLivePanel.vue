<template>
  <section class="live-panel" :class="{ 'live-panel--routing': routeActive, 'live-panel--fullscreen': fullscreen }" dir="rtl" aria-label="نقشه و موقعیت اعضای مأموریت">
    <div v-if="!fullscreen" class="live-panel__heading">
      <div>
        <span class="live-panel__eyebrow"><v-icon icon="mdi-map-marker-radius" size="17" /> اتاق خصوصی مأموریت</span>
        <h3>{{ routeActive ? 'نقشهٔ مأموریت' : 'موقعیت اعضای مأموریت' }}</h3>
        <p>{{ routeActive ? 'محل حادثه و مسیرها در همین نقشه‌اند؛ فقط موقعیت‌های دریافت‌شدهٔ اعضای مجاز نمایش داده می‌شوند.' : 'ارسال خصوصی موقعیت درخواست‌کننده و امدادگر در مأموریت فعال خودکار آغاز می‌شود، اما به اجازهٔ GPS و اتصال نیاز دارد؛ مدیر دسترسی دو طرف را کنترل می‌کند.' }}</p>
      </div>
      <div class="d-flex flex-wrap align-center ga-2">
        <slot name="map-toolbar" />
        <v-chip :color="live.connected.value && !live.recoveryPending.value ? 'success' : 'warning'" variant="tonal" size="small">
          {{ !live.connected.value ? 'در حال اتصال / آفلاین' : live.recoveryPending.value ? 'وضعیت مأموریت تأیید نشده' : 'اتصال زنده' }}
        </v-chip>
        <v-btn v-if="hasFreshMembers" :disabled="!map || !visible" variant="tonal" size="small" color="primary" rounded="lg"
          prepend-icon="mdi-fit-to-screen" @click="focusMembers(true)">نمایش همهٔ اعضا</v-btn>
      </div>
    </div>
    <v-alert v-if="!fullscreen && live.error.value" type="warning" variant="tonal" role="alert" class="mb-3">
      {{ live.error.value }} <v-btn size="small" variant="text" @click="live.start()">تلاش دوباره</v-btn>
    </v-alert>
    <div v-if="!fullscreen" class="d-flex flex-wrap ga-2 mb-3" role="status" aria-live="polite">
      <v-chip size="small" variant="tonal" :color="presence.requester.value === 'online' ? 'success' : 'warning'">
        اتصال درخواست‌کننده: {{ missionPresenceLabel[presence.requester.value] }}
      </v-chip>
      <v-chip size="small" variant="tonal" :color="presence.rescuer.value === 'online' ? 'success' : 'warning'">
        اتصال امدادگر: {{ missionPresenceLabel[presence.rescuer.value] }}
      </v-chip>
      <small>وضعیت اتصال، مستقل از اشتراک موقعیت مأموریت است. پس از ۵ دقیقه فقط بررسی دستی لازم است؛ مأموریت خودکار لغو نمی‌شود.</small>
    </div>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ locationAnnouncement }}</span>
    <div class="live-panel__grid">
      <div class="live-panel__map-area">
        <div class="live-panel__map">
          <MapCanvas v-if="!externalCanvas" :center="center" :zoom="13" :constrain-bounds="false" :show-zoom="!fullscreen"
            :compass-action="fullscreen" :style-url="mapStyleUrl"
            :aria-label="routeActive ? 'نقشهٔ مأموریت، مسیرها و موقعیت‌های دریافت‌شدهٔ مجاز' : 'نقشهٔ موقعیت‌های دریافت‌شدهٔ اعضای مجاز مأموریت'"
            @ready="onMapReady" />
          <slot name="map-actions" />
        </div>
        <!-- The rescuer's route planner shares this canvas; other callers keep just the live map. -->
        <slot name="route-planner" />
      </div>
      <div :id="fullscreen ? 'mission-team-panel' : undefined" v-show="!fullscreen || roomOpen"
        class="live-panel__members" role="region" aria-label="اعضای مأموریت"
        :tabindex="fullscreen ? -1 : undefined">
        <header class="live-panel__room-heading">
          <h2>اعضای مأموریت</h2>
          <v-btn icon="mdi-fit-to-screen" size="small" variant="tonal" color="primary"
            aria-label="نمایش همهٔ اعضای دارای موقعیت تازه روی نقشه" title="نمایش همهٔ اعضا روی نقشه"
            :disabled="!hasFreshMembers || !map || !visible" @click="focusMembers(true)" />
          <v-btn v-if="fullscreen" icon="mdi-close" variant="text" aria-label="بستن پنل اعضای مأموریت" @click="emit('close-room')" />
        </header>
        <ul class="live-panel__member-list" aria-label="فهرست اعضای مأموریت" tabindex="0">
          <li v-for="member in live.participantStatus.value" :key="member.role">
            <button type="button" class="live-panel__member" :disabled="!member.fresh || !member.entry || !map || !visible"
              @click="focusMember(member.role)">
              <span class="live-panel__avatar" :class="member.role" aria-hidden="true">
                <v-icon :icon="member.role === 'rescuer' ? 'mdi-lifebuoy' : member.role === 'admin' ? 'mdi-shield-account' : 'mdi-account'" size="20" />
                <i :class="{ 'live-panel__avatar-status--fresh': member.fresh }" />
              </span>
              <span class="live-panel__member-copy">
                <strong>{{ memberLabel(member.role) }}</strong>
                <small>{{ !member.entry ? 'موقعیت در دسترس نیست' : member.fresh ? 'موقعیت تازه' : 'موقعیت قدیمی' }}
                  <template v-if="member.entry"> · {{ new Date(member.entry.timestamp).toLocaleTimeString('fa-IR') }}</template>
                </small>
              </span>
              <v-icon v-if="member.fresh && member.entry && map && visible" icon="mdi-crosshairs-gps" size="18" aria-hidden="true" />
              <span v-if="member.fresh && member.entry && map && visible" class="sr-only">نمایش روی نقشه</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
    <v-alert v-if="fullscreen && live.error.value" class="live-panel__room-alert"
      type="warning" variant="tonal" role="alert">
      {{ live.error.value }} <v-btn size="small" variant="text" @click="live.start()">تلاش دوباره</v-btn>
    </v-alert>
    <v-alert v-if="!fullscreen && isAdmin && policyError" type="warning" variant="tonal" role="alert">{{ policyError }}</v-alert>
    <details v-if="!fullscreen && isAdmin" class="live-panel__privacy">
      <summary>{{ live.sharing.value ? 'ارسال موقعیت مدیر فعال · تنظیم دسترسی' : 'تنظیم دسترسی و موقعیت مدیر' }}</summary>
      <p>ارسال موقعیت درخواست‌کننده و امدادگر در مأموریت فعال خودکار است، اگر GPS و اتصال برقرار باشد؛ نمایش هرکدام برای طرف مقابل را اینجا تعیین کنید. دسترسی مدیر به هر دو حفظ می‌شود.</p>
      <template v-if="locationPolicy">
        <v-checkbox v-model="locationPolicy.rescuerVisibleToRequester" label="نمایش امدادگر به درخواست‌کننده" density="compact" hide-details />
        <v-checkbox v-model="locationPolicy.requesterVisibleToRescuer" label="نمایش درخواست‌کننده به امدادگر" density="compact" hide-details />
        <v-checkbox v-model="locationPolicy.adminVisibleToRequester" label="ارسال موقعیت من به درخواست‌کننده" density="compact" hide-details />
        <v-checkbox v-model="locationPolicy.adminVisibleToRescuer" label="ارسال موقعیت من به امدادگر" density="compact" hide-details />
        <v-btn variant="tonal" color="primary" :loading="savingPolicy" @click="savePolicy">ذخیرهٔ دسترسی‌ها</v-btn>
      </template>
      <p v-if="live.recoveryPending.value" role="status">پس از اتصال دوباره، وضعیت مأموریت در حال بررسی است.</p>
      <v-btn v-if="canAdminShare && !live.sharing.value" color="primary" variant="flat" rounded="lg"
        :disabled="!live.connected.value || live.recoveryPending.value || savingPolicy" prepend-icon="mdi-crosshairs-gps" @click="live.startSharing()">
        آغاز ارسال موقعیت مدیر به اعضای انتخاب‌شده
      </v-btn>
      <v-btn v-if="live.sharing.value" color="error" variant="tonal" rounded="lg"
        @click="live.stopSharing()">توقف ارسال موقعیت مدیر</v-btn>
      <p>ارسال موقعیت مدیر ابتدا خاموش است. پس از ذخیرهٔ گیرندگان، ارسال آن را جداگانه آغاز کنید. پخش عمومی مستقل است.</p>
    </details>
    <template v-if="!fullscreen && !isAdmin">
      <p class="live-panel__note" role="status">برنامه در مأموریت فعال اشتراک خصوصی موقعیت شما را خودکار آغاز می‌کند؛ دریافت موقعیت به اجازهٔ GPS، اتصال و فعال‌بودن دستگاه بستگی دارد. پخش عمومی مستقل است.</p>
      <v-alert v-if="auth.user?.id === mission.requesterId && (requesterShare.statusError || requesterShare.gpsError(mission.id))"
        type="warning" variant="tonal" role="alert">
        {{ requesterShare.statusError || requesterShare.gpsError(mission.id) }}
        <v-btn variant="text" size="small" @click="requesterShare.retry(mission.id)">بررسی دوباره</v-btn>
      </v-alert>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { Map as MapLibreMap, MapMovementEvent, Marker } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { missionLiveCamera } from "@/mission/live-camera";
import { freshMissionMemberCamera } from "@/mission/member-focus";
import { createLiveCameraIntent } from "@/mission/live-camera-intent";
import { planMissionMarkerSync, type MissionMarkerSnapshot } from "@/mission/live-marker-sync";
import { useMissionLiveLocations, type LiveMissionIdentity } from "@/composables/use-mission-live-locations";
import { getMissionLocationPolicy, putMissionLocationPolicy, type MissionLocationPolicy } from "@/api/mission";
import { accountSessionKey } from "@/composables/device-identity";
import { useRequesterMissionShareStore } from "@/stores/requester-mission-share";
import { useMissionPresence } from "@/composables/use-mission-presence";
import { missionPresenceLabel } from "@/mission/presence";
import { missionLocationAnnouncement } from "@/mission/location-phase";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { useRescuerMissionShareStore } from "@/stores/rescuer-mission-share";

const props = withDefaults(defineProps<{
  mission: LiveMissionIdentity; center?: [number, number]; routeActive?: boolean;
  fullscreen?: boolean; roomOpen?: boolean; visible?: boolean;
  externalCanvas?: boolean; externalMap?: MapLibreMap | null; externalMarker?: typeof Marker | null;
}>(), {
  center: () => [51.4, 35.7], routeActive: false, fullscreen: false, roomOpen: false, visible: true
});
const emit = defineEmits<{
  ready: [map: MapLibreMap, marker: typeof Marker];
  "close-room": [];
  "sharing-change": [sharing: boolean];
  "mission-ended": [missionId: string];
  "camera-selected": [];
}>();
const auth = useAuthStore();
const missionShare = useRescuerMissionShareStore();
const requesterShare = useRequesterMissionShareStore();
const theme = useThemeStore();
const mapStyleUrl = computed(() => theme.isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE);
const live = useMissionLiveLocations(computed(() => props.mission), computed(() => auth.accessToken),
  computed(() => auth.user?.id ?? null), () => auth.ensureSession());
const presence = useMissionPresence(computed(() => props.mission.id), computed(() => auth.accessToken),
  computed(() => auth.user?.id ?? null));
// Participant publishers are app-owned; only the admin opts in from this panel.
watch(() => props.fullscreen ? Boolean(missionShare.mission?.id === props.mission.id && missionShare.sharing)
  : auth.user?.id === props.mission.requesterId ? requesterShare.isSharingMission(props.mission.id) : live.sharing.value, (sharing) => emit("sharing-change", sharing), { immediate: true, flush: "sync" });
watch(live.endedMissionId, (id) => { if (id) emit("mission-ended", id); }, { flush: "sync" });
const isAdmin = computed(() => auth.user?.role === "admin");
const locationPolicy = ref<MissionLocationPolicy | null>(null);
const savedPolicy = ref<MissionLocationPolicy | null>(null);
const policyError = ref<string | null>(null);
const savingPolicy = ref(false);
const canAdminShare = computed(() => Boolean(savedPolicy.value?.adminVisibleToRequester || savedPolicy.value?.adminVisibleToRescuer));
watch(() => [props.mission.id, accountSessionKey(auth.user?.id ?? null, auth.accessToken), auth.user?.id, isAdmin.value] as const,
  async ([id, session, _owner, admin], _previous, onCleanup) => {
    const token = auth.accessToken;
    let cancelled = false;
    onCleanup(() => { cancelled = true; });
    locationPolicy.value = null;
    savedPolicy.value = null;
    policyError.value = null;
    live.stopSharing();
    if (!admin || !token || !session) return;
    try {
      const next = await getMissionLocationPolicy(token, id);
      if (!cancelled) { locationPolicy.value = { ...next }; savedPolicy.value = { ...next }; }
    } catch { if (!cancelled) policyError.value = "تنظیمات موقعیت بارگیری نشد؛ دوباره صفحه را باز کنید."; }
  }, { immediate: true });
async function savePolicy(): Promise<void> {
  const token = auth.accessToken;
  const draft = locationPolicy.value;
  if (!isAdmin.value || !token || !draft || savingPolicy.value) return;
  const id = props.mission.id;
  const session = accountSessionKey(auth.user?.id ?? null, token);
  savingPolicy.value = true;
  policyError.value = null;
  try {
    const result = await putMissionLocationPolicy(token, id, draft);
    if (props.mission.id !== id || !session ||
      accountSessionKey(auth.user?.id ?? null, auth.accessToken) !== session) return;
    savedPolicy.value = { ...result };
    locationPolicy.value = { ...result };
    if (!result.adminVisibleToRequester && !result.adminVisibleToRescuer) live.stopSharing();
  } catch {
    if (props.mission.id === id && session &&
      accountSessionKey(auth.user?.id ?? null, auth.accessToken) === session) {
      policyError.value = "ذخیرهٔ دسترسی‌ها انجام نشد؛ تنظیمات پیشین همچنان معتبر است.";
    }
  } finally { savingPolicy.value = false; }
}
const map = shallowRef<MapLibreMap | null>(null);
const cameraIntent = createLiveCameraIntent();
let detachCameraGesture: (() => void) | null = null;
// MapCanvas supplies the constructor after its lazy MapLibre import finishes.
let markerConstructor: typeof Marker | null = null;
const hasFreshMembers = computed(() => live.participantStatus.value.some((member) => member.fresh && member.entry));
// Announce only changes in whether each participant shares a fresh/old fix.
// The visible timestamps can still update on every GPS fix without interrupting speech.
const locationAnnouncement = computed(() => missionLocationAnnouncement(live.participantStatus.value));
const presentRoles = computed(() => Object.keys(live.locations.value).sort().join(","));
type Role = "requester" | "rescuer" | "admin";
const markers: Partial<Record<Role, Marker>> = {};
const paintedMarkers: Partial<Record<Role, MissionMarkerSnapshot>> = {};
function clearMarkers(): void {
  for (const role of ["requester", "rescuer", "admin"] as const) {
    markers[role]?.remove();
    delete markers[role];
    delete paintedMarkers[role];
  }
}
function syncMarkers(): void {
  // A hidden mission stays subscribed for safety, but its DOM markers live in
  // the shared MapCanvas, outside the v-show-hidden mission subtree.
  if (!props.visible) { clearMarkers(); return; }
  const instance = map.value;
  const MarkerClass = markerConstructor;
  if (!instance || !MarkerClass) return;
  for (const op of planMissionMarkerSync(paintedMarkers, live.participantStatus.value)) {
    const { role } = op;
    if (op.kind === "move") {
      markers[role]?.setLngLat([op.next.lon, op.next.lat]);
      paintedMarkers[role] = op.next;
      continue;
    }
    markers[role]?.remove();
    delete markers[role];
    delete paintedMarkers[role];
    if (op.kind === "remove") continue;
    // A freshness transition changes both marker scale and accessible label.
    const marker = new MarkerClass({ color: role === "rescuer" ? "#16826c" : role === "admin" ? "#5555ae" : "#dc593b",
      scale: op.next.fresh ? 1 : 0.8 }).setLngLat([op.next.lon, op.next.lat]).addTo(instance);
    marker.getElement().setAttribute("aria-label", `${role === "rescuer" ? "امدادگر" : role === "admin" ? "مدیر مرکز" : "درخواست‌کننده"}، ${op.next.fresh ? "موقعیت تازه" : "موقعیت قدیمی"}`);
    marker.getElement().style.opacity = op.next.fresh ? "1" : "0.55";
    markers[role] = marker;
    paintedMarkers[role] = op.next;
  }
}
function focusMembers(userInitiated = false) {
  if (!props.visible || !map.value) return;
  const camera = missionLiveCamera(live.participantStatus.value
    .filter((member) => member.fresh && member.entry).map((member) => member.entry!));
  if (!camera) return;
  if (userInitiated) {
    cameraIntent.noteGesture(); // Explicit framing must not be stolen by later GPS/peer updates.
    emit("camera-selected"); // Preserve this explicit view against GPS follow.
    if (props.fullscreen) emit("close-room"); // Reveal the points rather than covering them with the sheet.
  }
  if (camera.kind === "single") map.value.easeTo({ center: camera.center, zoom: camera.zoom, duration: 350 });
  else map.value.fitBounds(camera.bounds, { padding: camera.padding, maxZoom: camera.maxZoom, duration: 350 });
}
function memberLabel(role: Role): string {
  return role === "requester" ? "درخواست‌کننده" : role === "rescuer" ? "امدادگر" : "مدیر مرکز";
}
function focusMember(role: Role): void {
  const center = freshMissionMemberCamera(live.participantStatus.value, role);
  if (!props.visible || !center || !map.value) return;
  cameraIntent.noteGesture(); // Do not auto-frame a later peer over the selected member.
  emit("camera-selected"); // An intentional selection suspends route GPS follow.
  if (props.fullscreen) emit("close-room"); // The sheet otherwise covers the centered marker on phones.
  map.value.easeTo({ center, zoom: 15, duration: 350 });
}
function onMapReady(instance: MapLibreMap, MarkerClass: typeof Marker) {
  if (map.value !== instance) {
    clearMarkers();
    detachCameraGesture?.();
    cameraIntent.reset();
    const onMove = (event: MapMovementEvent) => { if (props.visible && event.originalEvent) cameraIntent.noteGesture(); };
    instance.on("movestart", onMove);
    detachCameraGesture = () => instance.off("movestart", onMove);
  }
  markerConstructor = MarkerClass;
  map.value = instance;
  syncMarkers();
  emit("ready", instance, MarkerClass);
  if (props.visible && !props.routeActive) focusMembers();
}
watch(() => props.visible, (visible) => {
  syncMarkers(); // Never leave mission-member pins in the Sharing workspace.
  if (visible && !props.routeActive) { cameraIntent.reset(); frameRoom(); }
}, { flush: "sync" });
// When embedded in the map workspace the parent owns MapCanvas. The room owns
// only its private markers/listeners, and never creates a second WebGL context.
watch(() => [props.externalMap, props.externalMarker] as const, ([instance, MarkerClass]) => {
  if (instance && MarkerClass) onMapReady(instance, MarkerClass);
  else if (map.value) {
    clearMarkers(); detachCameraGesture?.(); detachCameraGesture = null;
    map.value = null; markerConstructor = null;
  }
}, { immediate: true, flush: "post" });
function frameRoom(): void {
  if (!props.visible) return;
  if (hasFreshMembers.value) focusMembers();
  // Never leave the camera on a withdrawn participant's last known position.
  else map.value?.easeTo({ center: props.center, zoom: 13, duration: 350 });
}
// Live room updates can change markers, but must not steal the camera from
// active route planning/guidance or an explicitly explored part of the map.
watch(presentRoles, (next, previous) => {
  if (!props.visible) return;
  if (next === "" && previous && !props.routeActive) {
    // A withdrawn final fix is a privacy boundary, even if someone moved the camera.
    cameraIntent.reset();
    frameRoom();
  } else if (next !== previous && cameraIntent.shouldAutoFrame(props.routeActive)) frameRoom();
});
watch(() => props.routeActive, (active) => {
  if (active) return;
  cameraIntent.reset(); // Closing a private route intentionally restores the room overview.
  frameRoom();
});
// The age clock ticks every second; a new array literal would rebuild three DOM-backed
// markers per tick even when no fix or stale state changed. Sync-flush clears private
// markers on the same call stack as a mission/account/logout boundary.
watch([() => live.locations.value, () => live.participantStatus.value.map((member) => member.fresh).join(",")],
  syncMarkers, { flush: "sync" });
onBeforeUnmount(() => {
  detachCameraGesture?.();
  detachCameraGesture = null;
  clearMarkers();
  map.value = null;
  markerConstructor = null;
});
</script>

<style scoped>
.live-panel { margin-block: 22px; container-type: inline-size; border: 1px solid rgba(31,121,102,.25); border-radius: var(--bb-radius-card, 24px); background: rgb(var(--v-theme-surface)); padding: clamp(16px,3vw,26px); box-shadow: var(--bb-shadow-surface); }
.live-panel__heading { display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
.live-panel__heading h3 { font-size: 1.15rem; margin: 6px 0 2px; }
.live-panel__heading p,.live-panel__note { font-size: .8rem; opacity: .75; line-height: 1.7; }
.live-panel__eyebrow { font-size: 0.82rem; color: rgb(var(--v-theme-primary)); font-weight: 750; }
.live-panel__grid { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(230px,.6fr); gap: 18px; }
.live-panel__map-area { min-width: 0; }
.live-panel__map { position: relative; min-height: 20rem; border-radius: var(--bb-radius-nested, 16px); overflow: hidden; }
.live-panel__map :deep(.map-canvas) { height: 100%; min-height: 20rem; }
.live-panel--routing .live-panel__map { height: min(50dvh, 450px); min-height: 310px; }
.live-panel--routing .live-panel__map :deep(.map-canvas) { min-height: 0; }
.live-panel__members { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: .65rem; gap: .35rem;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-card, 24px);
  background: rgba(var(--v-theme-surface), .95); box-shadow: var(--bb-shadow-overlay); }
.live-panel__room-heading { display: flex; align-items: center; gap: .5rem; flex: none; }
.live-panel__room-heading h2 { flex: 1; min-width: 0; margin: 0; font-size: .92rem; font-weight: 800; }
.live-panel__room-heading :deep(.v-btn) { flex: none; width: 44px; min-width: 44px; height: 44px; }
.live-panel__member-list { list-style: none; margin: 0; padding: 0; min-height: 0; max-height: min(13rem, 35dvh);
  overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.live-panel__member-list:focus-visible, .live-panel__member:focus-visible, .live-panel__privacy summary:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -3px; }
.live-panel__member-list li + li { border-top: 1px solid var(--bb-color-outline); }
.live-panel__member { display: flex; align-items: center; text-align: start; width: 100%; min-height: 52px; gap: .65rem;
  padding: .35rem .3rem; border: 0; border-radius: var(--bb-radius-nested, 16px); background: transparent;
  color: rgb(var(--v-theme-on-surface)); cursor: pointer; font: inherit; }
.live-panel__member:not(:disabled):hover { background: var(--bb-color-inset); }
.live-panel__member:disabled { cursor: default; opacity: .72; }
.live-panel__member-copy { display: grid; gap: 1px; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.live-panel__member strong { font-size: .85rem; line-height: 1.4; }
.live-panel__member small { font-size: .8rem; line-height: 1.4; color: var(--bb-color-muted); }
.live-panel__avatar { position: relative; display: grid; place-items: center; flex: none; width: 36px; height: 36px;
  border-radius: 50%; background: rgba(var(--v-theme-primary), .12); color: rgb(var(--v-theme-primary)); }
.live-panel__avatar.requester { background: rgba(220,89,59,.13); color: #dc593b; }
.live-panel__avatar.rescuer { background: rgba(22,130,108,.13); color: #16826c; }
.live-panel__avatar.admin { background: rgba(85,85,174,.13); color: #5555ae; }
.live-panel__avatar i { position: absolute; inset: auto 0 0 auto; width: 9px; height: 9px;
  border: 2px solid rgb(var(--v-theme-surface)); border-radius: 50%; background: rgb(var(--v-theme-warning)); }
.live-panel__avatar i.live-panel__avatar-status--fresh { background: rgb(var(--v-theme-success)); }
.live-panel__member > .v-icon { flex: none; color: rgb(var(--v-theme-primary)); }
.live-panel__privacy { margin-top: .65rem; padding: .65rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); }
.live-panel__privacy summary { min-height: 44px; display: flex; align-items: center; font-weight: 700; cursor: pointer; }
.live-panel__privacy p { font-size: .8rem; line-height: 1.6; }
.live-panel__room-alert { position: absolute; z-index: 7; inset: calc(.5rem + env(safe-area-inset-top, 0px)) 1rem auto; max-width: 25rem; pointer-events: auto; }
@container (min-width: 721px) { .live-panel--routing .live-panel__map { position: sticky; top: 16px; z-index: 1; } }
@container (max-width: 720px) { .live-panel__grid { grid-template-columns: minmax(0,1fr); } }
@container (max-width: 599px) {
  .live-panel--routing .live-panel__map { height: min(42dvh, 360px); min-height: 275px; }
}

/* Map-first mission mode. Other callers keep the normal in-flow room card. */
.live-panel--fullscreen {
  position: absolute; inset: 0; width: 100%; height: 100%; min-height: 0;
  margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none;
  overflow: hidden; isolation: isolate;
}
.live-panel--fullscreen .live-panel__grid,
.live-panel--fullscreen .live-panel__map-area,
.live-panel--fullscreen .live-panel__map {
  position: absolute; inset: 0; display: block; width: 100%; height: 100%; min-height: 0;
  border-radius: 0;
}
.live-panel--fullscreen .live-panel__map :deep(.map-canvas) {
  height: 100%; min-height: 0; border-radius: 0;
}
.live-panel--fullscreen .live-panel__members {
  position: absolute; z-index: 6; inset: auto auto calc(5.5rem + env(safe-area-inset-bottom, 0px)) 1rem;
  width: min(18rem, calc(100vw - 1.5rem)); max-height: min(15.5rem, 42dvh);
  overflow: hidden; backdrop-filter: blur(12px);
}
@media (max-width: 599px) {
  .live-panel--fullscreen .live-panel__members {
    inset-inline: .75rem; width: auto; max-height: min(15.5rem, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
  }
}
@media (max-width: 599px) and (max-height: 560px) {
  .live-panel--fullscreen .live-panel__members {
    top: calc(.75rem + env(safe-area-inset-top, 0px));
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    max-height: none;
  }
  .live-panel--fullscreen .live-panel__member-list { max-height: none; flex: 1 1 auto; }
}

:global(:root.dark .live-panel__member:not(:disabled):hover) { background: var(--bb-color-inset); }
</style>
