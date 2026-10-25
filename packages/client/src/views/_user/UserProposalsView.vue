<template>
  <main class="offers" dir="rtl">
    <div class="offers__shell">
      <header class="offers__hero">
        <div class="offers__intro">
          <div class="offers__eyebrow"><span class="offers__live-dot" /> میز امدادگر · پیشنهادهای دریافتی</div>
          <h1>جایی که کمک آغاز می‌شود.</h1>
          <p>پیشنهادها را با آرامش بررسی کنید. با پذیرش یک مأموریت، پیشنهادهای دیگر شما خودکار بسته می‌شوند.</p>
        </div>
        <div class="offers__stat" aria-live="polite">
          <v-icon icon="mdi-bell-ring-outline" size="27" />
          <span class="offers__stat-number">{{ inbox.total.toLocaleString('fa-IR') }}</span>
          <span>پیشنهاد در انتظار</span>
        </div>
      </header>

      <v-alert v-if="inbox.decisionError" class="mb-5" type="error" variant="tonal" role="alert" closable
        @click:close="inbox.decisionError = null">{{ inbox.decisionError }}</v-alert>
      <v-alert v-if="inbox.acceptedMissionId" class="mb-5" type="success" variant="tonal" role="status">
        مأموریت پذیرفته شد. پیشنهادهای دیگر شما به‌صورت خودکار بسته شدند. شناسهٔ مأموریت:
        <bdi dir="ltr">{{ inbox.acceptedMissionId }}</bdi>
        <v-btn class="ms-3" to="/_user/mission" color="primary" variant="tonal" size="small">مشاهدهٔ مأموریت</v-btn>
      </v-alert>

      <section v-if="inbox.acceptedOffer?.details" class="accepted-map" aria-label="نمای مأموریت پذیرفته‌شده">
        <div class="accepted-map__intro">
          <div>
            <h2>نمای آغاز مأموریت</h2>
            <p>محل حادثه با رنگ قرمز نمایش داده می‌شود. موقعیت شما فقط با اجازهٔ دستگاه و به‌صورت موقت روی این نقشه دیده می‌شود.</p>
          </div>
          <v-btn v-if="!myPosition" color="primary" variant="tonal" rounded="lg"
            prepend-icon="mdi-crosshairs-gps" :loading="locating" @click="locateMe">
            نمایش موقعیت من و هر دو نقطه
          </v-btn>
        </div>
        <p v-if="locationError" class="offer-detail__hint" role="status">{{ locationError }}</p>
        <div class="accepted-map__canvas">
          <MapCanvas :center="[inbox.acceptedOffer.details.sosRequest.location.lon, inbox.acceptedOffer.details.sosRequest.location.lat]"
            :zoom="14" :constrain-bounds="false" :style-url="mapStyleUrl"
            aria-label="نقشهٔ مأموریت پذیرفته‌شده با محل حادثه و موقعیت امدادگر در صورت اجازه" @ready="onAcceptedMapReady" />
        </div>
        <p class="accepted-map__caption" role="status">
          <span v-if="myPosition">هر دو نقطه در قاب نقشه هستند؛ قرمز: حادثه، سبز: شما. این خط مسیر جاده‌ای یا زمان رسیدن نیست.</span>
          <span v-else>فعلاً فقط محل حادثه نمایش داده می‌شود. اگر مکان‌یابی ممکن نیست، مختصات حادثه را برای پیگیری نگه دارید.</span>
          <bdi dir="ltr">{{ inbox.acceptedOffer.details.sosRequest.location.lat.toFixed(5) }}, {{ inbox.acceptedOffer.details.sosRequest.location.lon.toFixed(5) }}</bdi>
        </p>
      </section>

      <div class="offers__toolbar">
        <div>
          <h2>پیشنهادهای فعال</h2>
          <p>فقط درخواست‌هایی که برای شما فرستاده شده‌اند نمایش داده می‌شوند.</p>
        </div>
        <v-btn color="primary" variant="tonal" rounded="lg" prepend-icon="mdi-refresh" :loading="inbox.loading"
          @click="inbox.refresh()">به‌روزرسانی</v-btn>
      </div>

      <div v-if="inbox.failed && !inbox.proposals.length" class="offers__empty" role="alert">
        <v-icon icon="mdi-wifi-alert" size="38" color="warning" />
        <h3>دریافت پیشنهادها ممکن نشد</h3>
        <p>اتصال را بررسی کنید؛ پیشنهادهای شما در سرور حفظ می‌شوند.</p>
        <v-btn color="primary" rounded="lg" @click="inbox.refresh()">تلاش دوباره</v-btn>
      </div>
      <div v-else-if="inbox.loading && !inbox.proposals.length" class="offers__grid" aria-label="در حال دریافت پیشنهادها">
        <v-skeleton-loader v-for="n in 3" :key="n" type="article, actions" class="offers__skeleton" />
      </div>
      <div v-else-if="!inbox.proposals.length" class="offers__empty">
        <div class="offers__empty-icon"><v-icon icon="mdi-hand-heart-outline" size="34" /></div>
        <h3>فعلاً پیشنهادی در انتظار نیست</h3>
        <p>هنگام دریافت درخواست تازه، زنگ بالای صفحه به شما خبر می‌دهد. این صفحه هر ۳۰ ثانیه نیز تازه می‌شود.</p>
        <v-btn to="/_user/dashboard" variant="text" color="primary" rounded="lg">بازگشت به پیشخوان</v-btn>
      </div>
      <div v-else class="offers__layout">
        <section class="offers__list" aria-label="فهرست پیشنهادهای مأموریت">
          <button v-for="offer in inbox.proposals" :key="offer.id" class="offer-card" type="button"
            :class="{ 'offer-card--selected': selectedId === offer.id }"
            :aria-pressed="selectedId === offer.id" @click="selectedId = offer.id">
            <span class="offer-card__stripe" :class="`offer-card__stripe--${severity(offer).tone}`" />
            <span class="offer-card__body">
              <span class="offer-card__top">
                <span class="offer-card__icon"><v-icon icon="mdi-lifebuoy" size="21" /></span>
                <span class="offer-card__title">{{ offer.details?.incidentTypeName ?? 'درخواست امداد' }}</span>
                <span class="offer-card__severity" :class="`offer-card__severity--${severity(offer).tone}`">
                  {{ severity(offer).label }}
                </span>
              </span>
              <span class="offer-card__description">{{ offer.details?.sosRequest.description ?? 'جزئیات در حال دریافت است.' }}</span>
              <span class="offer-card__foot">
                <span><v-icon icon="mdi-clock-outline" size="16" /> {{ proposalTime(offer.createdAt) }}</span>
                <span>مشاهدهٔ جزئیات <v-icon icon="mdi-chevron-left" size="17" /></span>
              </span>
            </span>
          </button>
          <div v-if="inbox.totalPages > 1" class="offers__pages" aria-label="صفحه‌بندی پیشنهادها">
            <v-btn :disabled="inbox.page <= 1" icon="mdi-chevron-right" variant="text" aria-label="صفحهٔ قبل"
              @click="inbox.setPage(inbox.page - 1)" />
            <span>صفحهٔ {{ inbox.page.toLocaleString('fa-IR') }} از {{ inbox.totalPages.toLocaleString('fa-IR') }}</span>
            <v-btn :disabled="inbox.page >= inbox.totalPages" icon="mdi-chevron-left" variant="text" aria-label="صفحهٔ بعد"
              @click="inbox.setPage(inbox.page + 1)" />
          </div>
        </section>

        <section v-if="selected" class="offer-detail" aria-label="جزئیات پیشنهاد انتخاب‌شده">
          <div class="offer-detail__top">
            <span class="offer-detail__kicker">پروندهٔ امداد · {{ proposalTime(selected.createdAt) }}</span>
            <h2>{{ selected.details?.incidentTypeName ?? 'درخواست امداد' }}</h2>
            <span class="offer-detail__pill" :class="`offer-card__severity--${severity(selected).tone}`">
              <v-icon icon="mdi-alert-circle-outline" size="16" /> {{ severity(selected).label }}
            </span>
          </div>

          <template v-if="selected.details">
            <div class="offer-detail__facts">
              <div><span>درخواست‌دهنده</span><strong>{{ selected.details.requesterName }}</strong></div>
              <div><span>فاصلهٔ تقریبی</span><strong>{{ proposalDistance(myPosition, selected.details) }}</strong></div>
            </div>
            <v-btn v-if="!myPosition" size="small" variant="text" color="primary" prepend-icon="mdi-crosshairs-gps"
              :loading="locating" class="mt-2" @click="locateMe">محاسبهٔ فاصله با اجازهٔ شما</v-btn>
            <p v-if="locationError" class="offer-detail__hint" role="status">{{ locationError }}</p>
            <div class="offer-detail__section">
              <h3><v-icon icon="mdi-text-box-outline" size="19" /> شرح حادثه</h3>
              <p class="offer-detail__description">{{ selected.details.sosRequest.description }}</p>
            </div>
            <div class="offer-detail__section">
              <h3><v-icon icon="mdi-map-marker-outline" size="19" /> محل حادثه</h3>
              <div class="offer-detail__map">
                <MapCanvas :key="selected.id" :center="[selected.details.sosRequest.location.lon, selected.details.sosRequest.location.lat]"
                  :zoom="14" :constrain-bounds="false" :style-url="mapStyleUrl" aria-label="نقشهٔ محل حادثه" @ready="markIncident" />
              </div>
              <p class="offer-detail__coords">مختصات: <bdi dir="ltr">{{ selected.details.sosRequest.location.lat.toFixed(5) }}, {{ selected.details.sosRequest.location.lon.toFixed(5) }}</bdi>
                <span v-if="selected.details.sosRequest.location.isManual"> · انتخاب دستی</span></p>
            </div>
            <div v-if="selected.details.sosRequest.photoUrl" class="offer-detail__section">
              <h3><v-icon icon="mdi-image-outline" size="19" /> تصویر حادثه</h3>
              <div v-if="photoSrc" class="offer-detail__photo"><img :src="photoSrc" alt="تصویر پیوست‌شده به درخواست امداد" referrerpolicy="no-referrer" @error="photoSrc = null; photoError = 'پیوند تصویر پایان یافته است؛ دوباره آن را دریافت کنید.'" /></div>
              <v-btn v-else variant="tonal" color="primary" :loading="photoLoading" rounded="lg" @click="loadPhoto">
                نمایش تصویر ایمن
              </v-btn>
              <p v-if="photoError" class="offer-detail__hint" role="status">{{ photoError }} <v-btn size="small" variant="text" @click="loadPhoto">تلاش دوباره</v-btn></p>
              <p class="offer-detail__hint">پیوند تصویر کوتاه‌مدت است؛ برای مشاهدهٔ دوباره، دکمه را بزنید.</p>
            </div>
          </template>
          <p v-else class="offer-detail__hint">جزئیات این پیشنهاد هنوز در دسترس نیست؛ فهرست را تازه کنید.</p>

          <div class="offer-detail__actions">
            <p><v-icon icon="mdi-information-outline" size="17" /> پذیرش فقط یک مأموریت در هر زمان ممکن است.</p>
            <div class="offer-detail__buttons">
              <v-btn color="primary" size="large" rounded="lg" prepend-icon="mdi-check-circle-outline" :loading="inbox.decidingId === selected.id"
                :disabled="!selected.details || Boolean(inbox.decidingId) || Boolean(inbox.acceptedMissionId)"
                @click="confirmAction = 'accept'">پذیرش مأموریت</v-btn>
              <v-btn variant="outlined" size="large" rounded="lg" color="error" :disabled="Boolean(inbox.decidingId) || Boolean(inbox.acceptedMissionId)"
                @click="confirmAction = 'decline'">رد پیشنهاد</v-btn>
            </div>
          </div>
        </section>
      </div>
    </div>

    <v-dialog :model-value="confirmAction !== null" max-width="460" persistent @update:model-value="(open: boolean) => { if (!open) confirmAction = null; }">
      <v-card rounded="xl" class="pa-2">
        <v-card-title>{{ confirmAction === 'accept' ? 'پذیرش مأموریت' : 'رد پیشنهاد' }}</v-card-title>
        <v-card-text>
          <p v-if="confirmAction === 'accept'">با پذیرش این مأموریت، پیشنهادهای دیگر شما خودکار بسته می‌شوند. برای ادامه مطمئن هستید؟</p>
          <template v-else>
            <p class="mb-4">اگر نمی‌توانید این مأموریت را انجام دهید، می‌توانید دلیل کوتاهی ثبت کنید (اختیاری).</p>
            <v-textarea v-model="declineReason" label="دلیل رد (اختیاری)" :counter="500" maxlength="500" rows="3" auto-grow variant="outlined" />
          </template>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" :disabled="Boolean(inbox.decidingId)" @click="confirmAction = null">بازگشت</v-btn>
          <v-spacer />
          <v-btn :color="confirmAction === 'accept' ? 'primary' : 'error'" :loading="Boolean(inbox.decidingId)"
            @click="submitDecision">{{ confirmAction === 'accept' ? 'بله، می‌پذیرم' : 'ثبت رد پیشنهاد' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useRoute } from "vue-router";
import type { ProposalInboxItem } from "@shared/index";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { missionMapCamera } from "@/sos/mission-map";
import { proposalDistance, proposalSeverity, proposalTime } from "@/sos/proposal-presentation";
import { useAuthStore } from "@/stores/auth";
import { useProposalInboxStore } from "@/stores/proposal-inbox";
import { useThemeStore } from "@/stores/theme";

const inbox = useProposalInboxStore();
const route = useRoute();
const auth = useAuthStore();
const theme = useThemeStore();
const selectedId = ref<string | null>(null);
const selected = computed(() => inbox.proposals.find((item) => item.id === selectedId.value) ?? inbox.proposals[0] ?? null);
const mapStyleUrl = computed(() => theme.isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE);
const confirmAction = ref<"accept" | "decline" | null>(null);
const declineReason = ref("");
const photoSrc = ref<string | null>(null);
const photoError = ref<string | null>(null);
const photoLoading = ref(false);
const myPosition = ref<{ lat: number; lon: number } | null>(null);
const locationError = ref<string | null>(null);
const locating = ref(false);
let photoGeneration = 0;
let locationGeneration = 0;
let marker: Marker | null = null;
let acceptedMap: MapLibreMap | null = null;
let acceptedIncidentMarker: Marker | null = null;
let acceptedRescuerMarker: Marker | null = null;

function severity(item: ProposalInboxItem) {
  return proposalSeverity[item.details?.sosRequest.severity ?? "medium"];
}
function markIncident(map: MapLibreMap): void {
  marker?.remove();
  const point = selected.value?.details?.sosRequest.location;
  if (!point) return;
  marker = new Marker({ color: "#e4564f" }).setLngLat([point.lon, point.lat]).addTo(map);
}
function syncAcceptedMap(): void {
  const incident = inbox.acceptedOffer?.details?.sosRequest.location;
  const map = acceptedMap;
  if (!incident || !map) return;
  acceptedIncidentMarker?.remove();
  acceptedRescuerMarker?.remove();
  acceptedIncidentMarker = new Marker({ color: "#dc2626" }).setLngLat([incident.lon, incident.lat]).addTo(map);
  acceptedIncidentMarker.getElement().setAttribute("aria-label", "محل حادثه");
  if (myPosition.value) {
    acceptedRescuerMarker = new Marker({ color: "#16826c" })
      .setLngLat([myPosition.value.lon, myPosition.value.lat]).addTo(map);
    acceptedRescuerMarker.getElement().setAttribute("aria-label", "موقعیت من");
  } else acceptedRescuerMarker = null;
  const camera = missionMapCamera(incident, myPosition.value);
  if (camera.kind === "both") {
    map.fitBounds(camera.bounds, { padding: camera.padding, maxZoom: camera.maxZoom, duration: 650 });
  } else {
    map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 650 });
  }
}
function onAcceptedMapReady(map: MapLibreMap): void {
  acceptedMap = map;
  syncAcceptedMap();
}

async function loadPhoto(): Promise<void> {
  const id = selected.value?.sosRequestId;
  const token = auth.accessToken;
  if (!id || !token || photoLoading.value) return;
  const generation = ++photoGeneration;
  photoLoading.value = true;
  photoError.value = null;
  try {
    const src = await getSosPhotoSrc(id, token);
    if (generation === photoGeneration && auth.accessToken && selected.value?.sosRequestId === id) photoSrc.value = src;
  } catch {
    if (generation === photoGeneration) photoError.value = "دریافت تصویر ممکن نشد.";
  } finally {
    if (generation === photoGeneration) photoLoading.value = false;
  }
}
function locateMe(): void {
  if (!navigator.geolocation) { locationError.value = "مکان‌یابی در این مرورگر در دسترس نیست."; return; }
  locating.value = true;
  locationError.value = null;
  const generation = ++locationGeneration;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (generation !== locationGeneration) return;
      myPosition.value = { lat: position.coords.latitude, lon: position.coords.longitude };
      locating.value = false;
    },
    () => {
      if (generation !== locationGeneration) return;
      locationError.value = "دسترسی به موقعیت ممکن نشد؛ همچنان می‌توانید نشانی روی نقشه را ببینید.";
      locating.value = false;
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
  );
}
async function submitDecision(): Promise<void> {
  const id = selected.value?.id;
  const action = confirmAction.value;
  if (!id || !action) return;
  const success = await inbox.decide(id, action, action === "decline" ? declineReason.value.trim() || undefined : undefined);
  if (success) { confirmAction.value = null; declineReason.value = ""; }
}
watch(() => [route.query.offer, inbox.proposals.map((item) => item.id).join(',')], () => {
  const offer = route.query.offer;
  if (typeof offer === "string" && inbox.proposals.some((item) => item.id === offer)) selectedId.value = offer;
}, { immediate: true });
watch(() => selected.value?.id, () => {
  photoGeneration++;
  photoSrc.value = null;
  photoError.value = null;
  photoLoading.value = false;
  marker?.remove();
  marker = null;
  confirmAction.value = null;
  declineReason.value = "";
});
watch(myPosition, () => syncAcceptedMap());
watch(() => inbox.acceptedOffer?.id, () => syncAcceptedMap());
watch(() => auth.user?.id, () => {
  myPosition.value = null;
  locating.value = false;
  locationGeneration++;
  acceptedIncidentMarker?.remove();
  acceptedRescuerMarker?.remove();
  acceptedMap = null;
  photoGeneration++;
  photoSrc.value = null;
});
onBeforeUnmount(() => { marker?.remove(); acceptedIncidentMarker?.remove(); acceptedRescuerMarker?.remove(); acceptedMap = null; photoGeneration++; locationGeneration++; photoSrc.value = null; });
</script>

<style scoped>
.offers { min-height: calc(100vh - 140px); padding: clamp(18px, 4vw, 52px) 18px 100px; background: radial-gradient(ellipse at 80% 0%, rgba(48, 117, 106, .11), transparent 48%), rgb(var(--v-theme-background)); color: rgb(var(--v-theme-on-background)); }
.offers__shell { max-width: 1260px; margin-inline: auto; }
.offers__hero { display: flex; gap: 24px; align-items: center; justify-content: space-between; padding: clamp(24px, 4vw, 42px); border-radius: 28px; background: linear-gradient(118deg, #103c3d, #185352 60%, #29736b); color: #fff; box-shadow: 0 18px 42px rgba(13, 67, 65, .15); overflow: hidden; position: relative; }
.offers__hero::after { content: "✳"; position: absolute; inset-inline-end: -24px; top: -95px; color: rgba(255,255,255,.055); font-size: 320px; line-height: 1; pointer-events: none; }
.offers__intro { position: relative; z-index: 1; max-width: 680px; }
.offers__eyebrow { display: inline-flex; gap: 8px; align-items: center; color: #bbefdf; font-size: .8rem; font-weight: 700; letter-spacing: .02em; }
.offers__live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #74e9be; box-shadow: 0 0 0 4px rgba(116,233,190,.17); }
.offers__hero h1 { font-size: clamp(1.65rem, 3vw, 2.6rem); margin: 15px 0 12px; line-height: 1.25; font-weight: 800; }
.offers__hero p { color: #d2e8e2; line-height: 1.9; margin: 0; font-size: .93rem; }
.offers__stat { position: relative; z-index: 1; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.11); border-radius: 22px; min-width: 150px; min-height: 140px; gap: 2px; font-size: .79rem; color: #e1f7ec; }
.offers__stat-number { font-size: 2.5rem; line-height: 1.1; font-weight: 800; color: #fff; }
.accepted-map { margin-top: 22px; padding: clamp(18px, 3vw, 28px); border-radius: 24px; border: 1px solid rgba(49,149,129,.28); background: rgb(var(--v-theme-surface)); box-shadow: 0 14px 36px rgba(20,62,58,.08); }
.accepted-map__intro { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
.accepted-map__intro h2 { font-size: 1.25rem; font-weight: 800; margin: 0 0 5px; }
.accepted-map__intro p { font-size: .86rem; opacity: .78; max-width: 650px; margin: 0; line-height: 1.7; }
.accepted-map__canvas { height: min(52vh, 440px); min-height: 300px; overflow: hidden; border-radius: 17px; }
.accepted-map__canvas :deep(.map-canvas), .accepted-map__canvas :deep(.map-canvas__viewport) { min-height: 0; }
.accepted-map__caption { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; font-size: .83rem; margin: 16px 0 0; line-height: 1.7; }
.accepted-map__caption bdi { font-weight: 700; }
.offers__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 32px 0 17px; }
.offers__toolbar h2 { font-size: 1.28rem; font-weight: 800; margin: 0 0 4px; }
.offers__toolbar p { font-size: .82rem; opacity: .66; margin: 0; }
.offers__layout { display: grid; grid-template-columns: minmax(265px, 385px) minmax(0, 1fr); gap: 20px; align-items: start; }
.offers__list { display: grid; gap: 11px; }
.offer-card { width: 100%; text-align: start; color: inherit; font: inherit; border: 1px solid rgba(128, 155, 151, .25); border-radius: 19px; background: rgb(var(--v-theme-surface)); padding: 0; display: flex; overflow: hidden; cursor: pointer; box-shadow: 0 4px 17px rgba(20, 62, 58, .035); transition: border-color .2s, transform .2s, box-shadow .2s; }
.offer-card:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(20, 62, 58, .1); }
.offer-card:focus-visible, .offers__pages :focus-visible { outline: 3px solid #398c7d; outline-offset: 2px; }
.offer-card--selected { border-color: #319581; box-shadow: 0 0 0 2px rgba(49,149,129,.14), 0 12px 30px rgba(20,62,58,.08); }
.offer-card__stripe { width: 5px; flex-shrink: 0; }
.offer-card__stripe--urgent { background: #df554f; }.offer-card__stripe--important { background: #db9837; }.offer-card__stripe--standard { background: #3a9a8a; }
.offer-card__body { min-width: 0; width: 100%; display: grid; padding: 20px 19px; gap: 12px; }
.offer-card__top, .offer-card__foot { display: flex; align-items: center; gap: 10px; }
.offer-card__icon { display: inline-flex; justify-content: center; align-items: center; background: rgba(49,149,129,.12); color: rgb(var(--v-theme-primary)); border-radius: 11px; width: 36px; height: 36px; flex-shrink: 0; }
.offer-card__title { font-weight: 800; font-size: .95rem; flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.offer-card__severity, .offer-detail__pill { font-weight: 750; font-size: .78rem; border-radius: 50px; padding: 5px 10px; white-space: nowrap; }
.offer-card__severity--urgent { background: #ffe7e4; color: #a2241e; }.offer-card__severity--important { background: #fff0d4; color: #875000; }.offer-card__severity--standard { background: #d9f4ed; color: #066b57; }
.offer-card__description { font-size: .83rem; opacity: .77; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.offer-card__foot { justify-content: space-between; font-size: .72rem; color: rgb(var(--v-theme-primary)); }.offer-card__foot span:first-child { opacity: .8; }
.offers__pages { display: flex; justify-content: center; gap: 8px; align-items: center; font-size: .8rem; }
.offer-detail { background: rgb(var(--v-theme-surface)); border-radius: 24px; border: 1px solid rgba(128,155,151,.25); box-shadow: 0 15px 48px rgba(20,62,58,.07); overflow: hidden; }
.offer-detail__top { padding: 28px clamp(22px, 3vw, 36px); border-bottom: 1px solid rgba(128,155,151,.18); background: linear-gradient(105deg, rgba(42,137,114,.1), transparent 80%); }
.offer-detail__kicker { font-size: .77rem; color: rgb(var(--v-theme-primary)); font-weight: 700; }.offer-detail__top h2 { margin: 8px 0 12px; font-size: clamp(1.35rem, 2vw, 1.7rem); font-weight: 800; }
.offer-detail__pill { display: inline-flex; align-items: center; gap: 5px; }
.offer-detail__facts { display: flex; flex-wrap: wrap; gap: 12px; padding: 22px clamp(22px, 3vw, 36px) 0; }
.offer-detail__facts > div { flex: 1 1 180px; display: grid; gap: 5px; padding: 14px 17px; background: rgba(128,155,151,.08); border-radius: 13px; }.offer-detail__facts span { opacity: .65; font-size: .76rem; }.offer-detail__facts strong { font-size: .92rem; }
.offer-detail__section { padding: 23px clamp(22px, 3vw, 36px) 0; }.offer-detail__section h3 { display: flex; align-items: center; gap: 8px; font-size: .91rem; font-weight: 800; margin-bottom: 11px; color: rgb(var(--v-theme-primary)); }.offer-detail__description { line-height: 2; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .92rem; }
.offer-detail__map { height: 216px; border-radius: 14px; overflow: hidden; background: rgba(43,112,104,.08); }.offer-detail__map :deep(.map-canvas) { min-height: 0; height: 100%; }.offer-detail__map :deep(.map-canvas__viewport) { min-height: 0; }
.offer-detail__coords { margin: 10px 0 0; font-size: .77rem; opacity: .7; }.offer-detail__photo { max-width: 100%; overflow: hidden; border-radius: 13px; background: #163b39; }.offer-detail__photo img { max-width: 100%; max-height: 360px; display: block; margin-inline: auto; object-fit: contain; }
.offer-detail__hint { font-size: .79rem; line-height: 1.7; opacity: .7; margin: 6px 32px 0; }
.offer-detail__actions { margin-top: 26px; padding: 22px clamp(22px, 3vw, 36px) 27px; border-top: 1px solid rgba(128,155,151,.18); }.offer-detail__actions p { margin: 0 0 16px; display: flex; gap: 8px; align-items: center; font-size: .8rem; opacity: .75; }.offer-detail__buttons { display: flex; flex-wrap: wrap; gap: 10px; }
.offers__empty { border: 1px dashed rgba(89,145,133,.4); background: rgb(var(--v-theme-surface)); border-radius: 24px; text-align: center; padding: 65px 20px; margin-top: 18px; }.offers__empty-icon { display: inline-flex; padding: 15px; background: rgba(48,148,123,.12); border-radius: 50%; color: rgb(var(--v-theme-primary)); }.offers__empty h3 { font-size: 1.25rem; margin: 16px 0 8px; }.offers__empty p { opacity: .7; font-size: .9rem; line-height: 1.8; max-width: 440px; margin: 0 auto 20px; }.offers__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }.offers__skeleton { border-radius: 18px; }
@media (max-width: 850px) { .offers__layout { grid-template-columns: 1fr; }.offer-detail { scroll-margin-top: 85px; } }
@media (max-width: 580px) { .offers { padding-inline: 12px; }.offers__hero { flex-direction: column; align-items: stretch; padding: 26px 23px; }.offers__stat { flex-direction: row; min-height: 67px; gap: 12px; }.offers__stat-number { font-size: 1.6rem; }.offers__toolbar { align-items: start; }.offers__toolbar p { display: none; }.offers__grid { grid-template-columns: 1fr; }.offer-detail__buttons > * { flex: 1 1 100%; } }
@media (prefers-reduced-motion: reduce) { .offer-card { transition: none; } }
</style>
