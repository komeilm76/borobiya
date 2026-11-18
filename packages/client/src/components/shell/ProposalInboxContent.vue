<template>
  <div class="offers" :class="{ 'offers--map': compactMap, 'offers--detail-open': compactMap && detailOpen }" dir="rtl">
    <div class="offers__shell">
      <header class="offers__hero">
        <div class="offers__intro">
          <div class="offers__eyebrow"><span class="offers__live-dot" /> میز امدادگر</div>
          <h3>پیشنهادهای فعال</h3>
          <p>جزئیات را بررسی کنید؛ پذیرش یک مأموریت، پیشنهادهای دیگر را می‌بندد.</p>
        </div>
        <div class="offers__stat" aria-live="polite"
          :aria-label="compactMap ? (inbox.failed || (inbox.loading && !inbox.proposals.length) ? 'تعداد پیشنهادها تأیید نشده' : `${inbox.total.toLocaleString('fa-IR')} پیشنهاد در انتظار`) : undefined">
          <v-icon icon="mdi-bell-ring-outline" size="27" />
          <span class="offers__stat-number">{{ inbox.failed || (inbox.loading && !inbox.proposals.length) ? '؟' : inbox.total.toLocaleString('fa-IR') }}</span>
          <span>{{ inbox.failed ? 'تعداد تأیید نشده' : inbox.loading && !inbox.proposals.length ? 'در حال دریافت' : 'پیشنهاد در انتظار' }}</span>
        </div>
        <v-btn v-if="compactMap" class="offers__map-refresh" icon="mdi-refresh" variant="tonal" color="primary"
          :loading="inbox.loading" aria-label="به‌روزرسانی پیشنهادها" title="به‌روزرسانی پیشنهادها"
          @click="inbox.refresh()" />
      </header>

      <v-alert v-if="inbox.decisionError" class="mb-5" type="error" variant="tonal" role="alert" closable
        @click:close="inbox.decisionError = null">{{ inbox.decisionError }}</v-alert>
      <v-alert v-if="inbox.acceptedMissionId && (!compactMap || !inbox.acceptedOffer?.details)" class="mb-5" type="success" variant="tonal" role="status">
        مأموریت پذیرفته شد. پیشنهادهای دیگر شما به‌صورت خودکار بسته شدند. شناسهٔ مأموریت:
        <bdi dir="ltr">{{ inbox.acceptedMissionId }}</bdi>
        <v-btn class="ms-3" to="/_user/map?tab=missions" color="primary" variant="tonal" size="small">مشاهدهٔ مأموریت</v-btn>
      </v-alert>
      <v-alert v-if="!compactMap && inbox.failed && inbox.proposals.length" class="mb-5" type="warning" variant="tonal" role="alert">
        به‌روزرسانی پیشنهادها انجام نشد؛ موارد زیر آخرین فهرست شناخته‌شده‌اند و ممکن است تغییر کرده باشند.
        <v-btn size="small" variant="text" :loading="inbox.loading" @click="inbox.refresh()">تلاش دوباره</v-btn>
      </v-alert>

      <section v-if="inbox.acceptedOffer?.details" class="accepted-map" aria-label="نمای مأموریت پذیرفته‌شده">
        <div class="accepted-map__intro">
          <div>
            <h2>مأموریت پذیرفته‌شده</h2>
            <p v-if="compactMap">محل حادثه و اعضا روی نقشهٔ همین زبانه نمایش داده می‌شوند.</p>
            <p v-else>محل حادثه و اعضای مأموریت روی نقشهٔ اصلی در زبانهٔ مأموریت‌ها نمایش داده می‌شوند؛ اینجا نقشهٔ دوم یا درخواست GPS جداگانه باز نمی‌شود.</p>
          </div>
          <v-btn color="primary" variant="tonal" rounded="lg" to="/_user/map?tab=missions" @click="emit('close')">نمایش روی نقشه</v-btn>
        </div>
        <p class="accepted-map__caption" role="status">
          محل حادثه: <bdi dir="ltr">{{ inbox.acceptedOffer.details.sosRequest.location.lat.toFixed(5) }}, {{ inbox.acceptedOffer.details.sosRequest.location.lon.toFixed(5) }}</bdi>
        </p>
      </section>

      <div v-if="!compactMap" class="offers__toolbar">
        <div>
          <h2>فهرست و جزئیات</h2>
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
        <v-skeleton-loader v-for="n in compactMap ? 2 : 3" :key="n" :type="compactMap ? 'list-item-two-line' : 'article, actions'" class="offers__skeleton" />
      </div>
      <div v-else-if="!inbox.proposals.length && !inbox.acceptedMissionId" class="offers__empty">
        <div class="offers__empty-icon"><v-icon icon="mdi-hand-heart-outline" size="34" /></div>
        <h3>فعلاً پیشنهادی در انتظار نیست</h3>
        <p>هنگام دریافت درخواست تازه، زنگ نقشه به شما خبر می‌دهد. این فهرست هر ۳۰ ثانیه نیز تازه می‌شود.</p>
        <v-btn variant="text" color="primary" rounded="lg" @click="emit('close')">بازگشت به نقشه</v-btn>
      </div>
      <div v-else-if="inbox.proposals.length" class="offers__layout">
        <section ref="listRef" class="offers__list" aria-label="فهرست پیشنهادهای مأموریت">
          <v-alert v-if="compactMap && inbox.failed" type="warning" variant="tonal" role="alert" density="compact">
            به‌روزرسانی ناموفق بود؛ فهرست ممکن است قدیمی باشد.
            <v-btn variant="text" color="primary" :loading="inbox.loading" @click="inbox.refresh()">تلاش دوباره</v-btn>
          </v-alert>
          <div class="offers__items" role="region" :aria-label="compactMap ? 'پیشنهادهای مأموریت' : 'پیشنهادها؛ برای موارد بیشتر پیمایش کنید'"
            :tabindex="!compactMap && inbox.proposals.length > 1 ? 0 : -1">
            <button v-for="offer in inbox.proposals" :key="offer.id" class="offer-card" type="button"
              :class="{ 'offer-card--selected': selected?.id === offer.id && (!compactMap || detailOpen) }"
              :data-offer-id="offer.id" :aria-pressed="selected?.id === offer.id && (!compactMap || detailOpen)"
              @click="selectOffer(offer.id)">
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
          </div>
          <div v-if="inbox.totalPages > 1" class="offers__pages" aria-label="صفحه‌بندی پیشنهادها">
            <v-btn :disabled="inbox.page <= 1" icon="mdi-chevron-right" variant="text" aria-label="صفحهٔ قبل"
              @click="inbox.setPage(inbox.page - 1)" />
            <span>صفحهٔ {{ inbox.page.toLocaleString('fa-IR') }} از {{ inbox.totalPages.toLocaleString('fa-IR') }}</span>
            <v-btn :disabled="inbox.page >= inbox.totalPages" icon="mdi-chevron-left" variant="text" aria-label="صفحهٔ بعد"
              @click="inbox.setPage(inbox.page + 1)" />
          </div>
        </section>

        <section v-if="selected" ref="detailRef" class="offer-detail" aria-label="جزئیات پیشنهاد انتخاب‌شده" tabindex="-1">
          <v-btn v-if="compactMap" class="offer-detail__back" icon="mdi-arrow-right" variant="text" color="primary"
            aria-label="بازگشت به فهرست پیشنهادها" title="بازگشت به پیشنهادها" @click="closeMapDetail" />
          <v-alert v-if="compactMap && inbox.failed" type="warning" variant="tonal" role="alert" density="compact">
            به‌روزرسانی ناموفق بود؛ این پیشنهاد ممکن است تغییر کرده باشد.
            <v-btn variant="text" color="primary" :loading="inbox.loading" @click="inbox.refresh()">تلاش دوباره</v-btn>
          </v-alert>
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
              <div v-if="!compactMap"><span>فاصلهٔ تقریبی</span><strong>{{ proposalDistance(myPosition, selected.details) }}</strong></div>
            </div>
            <div v-if="compactMap" class="offer-detail__route" role="status" aria-live="polite">
              <div class="offer-detail__route-heading"><v-icon icon="mdi-map-marker-path" size="19" aria-hidden="true" /> پیش‌نمایش مسیر روی نقشه · خودرو</div>
              <div class="offer-detail__metrics">
                <div><span>زمان رسیدن · برآورد اولیه</span><strong>{{ previewRoute ? new Date(previewCalculatedAt + previewRoute.duration_s * 1000).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—' }}</strong></div>
                <div><span>مسافت مسیر</span><strong>{{ previewRoute ? formatRouteDistance(previewRoute.distance_m) : '—' }}</strong></div>
              </div>
              <p v-if="previewRoute">{{ formatRouteDuration(previewRoute.duration_s) }} از مبدأ GPS هنگام محاسبه؛ زمان تقریبی و بدون ترافیک است.</p>
              <p v-if="previewRoute && !previewPainted" role="status">مسیر محاسبه شد، اما هنوز روی نقشه رسم نشده است.
                <v-btn size="small" variant="text" color="primary" @click="previewRepaintToken++">تلاش برای نمایش مسیر</v-btn>
              </p>
              <p v-else-if="previewRoute" class="sr-only">مسیر روی نقشه نمایش داده شد.</p>
              <p v-else-if="previewLoading">در حال محاسبهٔ مسیر از موقعیت فعلی شما…</p>
              <p v-else-if="previewError" role="alert">{{ previewError }}</p>
              <template v-else>
                <p>برای پیش‌نمایش مسیر و زمان رسیدن، موقعیت GPS تازه روی نقشه لازم است. محل حادثه روی نقشه مشخص است.</p>
                <v-btn size="small" variant="text" color="primary" prepend-icon="mdi-crosshairs-gps"
                  @click="emit('request-location')">دریافت موقعیت من</v-btn>
              </template>
            </div>
            <v-btn v-if="!compactMap && !myPosition" size="small" variant="text" color="primary" prepend-icon="mdi-crosshairs-gps"
              :loading="locating" class="offer-detail__locate mt-2" @click="locateMe">محاسبهٔ فاصله با اجازهٔ شما</v-btn>
            <p v-if="locationError" class="offer-detail__hint" role="status">{{ locationError }}</p>
            <div class="offer-detail__section">
              <h3><v-icon icon="mdi-text-box-outline" size="19" /> شرح حادثه</h3>
              <p class="offer-detail__description">{{ selected.details.sosRequest.description }}</p>
            </div>
            <div class="offer-detail__section">
              <h3><v-icon icon="mdi-map-marker-outline" size="19" /> محل حادثه</h3>
              <p v-if="!compactMap" class="offer-detail__map">پس از پذیرش، محل حادثه روی نقشهٔ مشترک مأموریت‌ها مشخص می‌شود. جزئیات و مختصات را پیش از تصمیم بررسی کنید.</p>
              <p v-if="compactMap" class="offer-detail__address" role="status"><v-icon icon="mdi-map-marker-outline" size="18" aria-hidden="true" /> نشانی نزدیک (تقریبی): <bdi dir="auto">{{ addressStatus === 'loading' ? 'در حال دریافت…' : addressStatus === 'ready' ? address : addressStatus === 'error' ? 'دریافت نشانی ممکن نشد.' : 'نشانی مشخصی برای این نقطه پیدا نشد.' }}</bdi></p>
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
        <div v-else class="offers__empty" role="status">
          این پیشنهاد دیگر در فهرست شما نیست. پیشنهاد دیگری را انتخاب کنید یا فهرست را تازه کنید.
        </div>
      </div>
    </div>

    <v-dialog :model-value="confirmAction !== null" max-width="460" scrollable persistent @update:model-value="(open: boolean) => { if (!open) confirmAction = null; }">
      <v-card rounded="xl" class="pa-2">
        <v-card-title>{{ confirmAction === 'accept' ? mapTripSession.navigating.value ? 'پایان سفر فعلی و شروع مأموریت' : 'پذیرش مأموریت' : 'رد پیشنهاد' }}</v-card-title>
        <v-card-text>
          <p v-if="confirmAction === 'accept' && mapTripSession.navigating.value" role="alert">
            با تأیید، سفر فعلی و مسیر شخصی آن پایان می‌یابد؛ سپس پذیرش مأموریت ثبت می‌شود. اگر ثبت ناموفق باشد، سفر قبلی خودکار بازنمی‌گردد.
          </p>
          <p v-else-if="confirmAction === 'accept'">با پذیرش این مأموریت، پیشنهادهای دیگر شما خودکار بسته می‌شوند. برای ادامه مطمئن هستید؟</p>
          <p v-if="tripEndError" role="alert" class="text-error">{{ tripEndError }}</p>
          <template v-if="confirmAction === 'decline'">
            <p class="mb-4">اگر نمی‌توانید این مأموریت را انجام دهید، می‌توانید دلیل کوتاهی ثبت کنید (اختیاری).</p>
            <v-textarea v-model="declineReason" label="دلیل رد (اختیاری)" :counter="500" maxlength="500" rows="3" variant="outlined" />
          </template>
        </v-card-text>
        <v-card-actions class="offer-confirm-actions">
          <v-btn variant="text" :disabled="Boolean(inbox.decidingId)" @click="confirmAction = null">بازگشت</v-btn>
          <v-spacer />
          <v-btn :color="confirmAction === 'accept' ? 'primary' : 'error'" :loading="Boolean(inbox.decidingId)"
            @click="submitDecision">{{ confirmAction === 'accept' ? 'بله، می‌پذیرم' : 'ثبت رد پیشنهاد' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { clearOfferRoute, paintOfferRoute } from "@/map/offer-route-overlay";
import { getMissionRouteChoices, type RouteChoice, type RoutePoint } from "@/api/mission-routing";
import { reversePlace } from "@/api/geocoding";
import { missionMapCamera } from "@/sos/mission-map";
import { useMissionRouteGeometry } from "@/sos/mission-route-geometry";
import { formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
import type { ProposalInboxItem } from "@shared/index";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { mapTripSession } from "@/map/trip-session";
import { proposalDistance, proposalSeverity, proposalTime } from "@/sos/proposal-presentation";
import { useAuthStore } from "@/stores/auth";
import { useProposalInboxStore } from "@/stores/proposal-inbox";

const props = withDefaults(defineProps<{
  selectedOfferId: string | null; compactMap?: boolean; visible?: boolean;
  map?: MapLibreMap | null; markerClass?: typeof Marker | null; ownPosition?: RoutePoint | null;
}>(), { compactMap: false, visible: true });
const emit = defineEmits<{ close: []; 'detail-change': [open: boolean]; 'request-location': [] }>();
const inbox = useProposalInboxStore();
const auth = useAuthStore();
const selectedId = ref<string | null>(props.selectedOfferId);
const detailOpen = ref(Boolean(props.compactMap && props.selectedOfferId));
const listRef = ref<HTMLElement | null>(null);
const selected = computed(() => selectedId.value
  ? inbox.proposals.find((item) => item.id === selectedId.value) ?? null
  : inbox.proposals[0] ?? null);
const detailRef = ref<HTMLElement | null>(null);
watch(detailOpen, (open) => emit('detail-change', open), { flush: 'sync' });

// This is only an offer preview. It never starts guidance, saves a route or
// creates another canvas/GPS watcher. Use the map's short-lived private fix.
const previewRoute = ref<RouteChoice | null>(null);
const previewOrigin = ref<RoutePoint | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const address = ref<string | null>(null);
const addressStatus = ref<'loading' | 'missing' | 'error' | 'ready'>('missing');
const previewCalculatedAt = ref(0);
const previewGeometry = useMissionRouteGeometry(previewRoute);
const offerForPreview = computed(() => props.compactMap && props.visible && detailOpen.value ? selected.value : null);
const incident = computed(() => offerForPreview.value?.details?.sosRequest.location ?? null);
// An offer switch, page change, tab change or logout invalidates BOTH requests.
watch([() => offerForPreview.value?.id, () => incident.value?.lat, () => incident.value?.lon,
  () => Boolean(props.ownPosition), () => auth.user?.id], (_values, _previous, onCleanup) => {
  const target = incident.value;
  const origin = props.ownPosition;
  previewRoute.value = null;
  previewOrigin.value = null;
  previewLoading.value = false;
  previewError.value = null;
  address.value = null;
  addressStatus.value = target ? 'loading' : 'missing';
  if (!target || !offerForPreview.value || !auth.user?.id) return;
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const requestId = offerForPreview.value.id;
  void reversePlace({ lat: target.lat, lon: target.lon }, controller.signal).then((result) => {
    if (controller.signal.aborted || offerForPreview.value?.id !== requestId) return;
    address.value = result?.formattedAddress ?? null;
    addressStatus.value = result ? 'ready' : 'missing';
  }).catch(() => { if (!controller.signal.aborted) addressStatus.value = 'error'; });
  if (!origin) return;
  previewLoading.value = true;
  previewOrigin.value = { lat: origin.lat, lon: origin.lon };
  void getMissionRouteChoices(previewOrigin.value, target, 'car', controller.signal).then((choices) => {
    if (controller.signal.aborted || offerForPreview.value?.id !== requestId) return;
    const route = choices[0];
    if (!route) throw new Error('NO_ROUTE');
    previewRoute.value = route;
    // Validate geometry before it can reach the shared map. No straight-line
    // distance or arrival estimate should masquerade as a road route.
    void previewGeometry.value.data;
    previewCalculatedAt.value = Date.now();
  }).catch(() => {
    if (!controller.signal.aborted) { previewRoute.value = null; previewError.value = 'مسیر خودرو در دسترس نیست؛ فاصله و زمان قابل برآورد نیست.'; }
  }).finally(() => { if (!controller.signal.aborted) previewLoading.value = false; });
}, { immediate: true });

const previewPainted = ref(false);
const previewRepaintToken = ref(0);
watch([() => props.map, () => props.markerClass, incident, previewRoute, () => props.visible, previewRepaintToken], (_values, _previous, onCleanup) => {
  const map = props.map, MarkerClass = props.markerClass, target = incident.value;
  previewPainted.value = false;
  if (!map || !MarkerClass || !target || !props.visible) return;
  let marker: Marker | null = null;
  try {
    marker = new MarkerClass({ color: '#cc623f' }).setLngLat([target.lon, target.lat]).addTo(map);
    marker.getElement().setAttribute('aria-label', 'محل حادثهٔ پیشنهاد انتخاب‌شده');
  } catch { /* The map may be changing styles or unmounting. */ }
  let painting = false;
  const paint = () => {
    // Adding a source/layer can itself fire styledata. Avoid reentrant writes
    // and only repair the overlay if either layer is missing after a style swap.
    if (painting) return;
    painting = true;
    try {
      if (!previewRoute.value) { clearOfferRoute(map); previewPainted.value = false; }
      else previewPainted.value = paintOfferRoute(map, previewGeometry.value.data);
    } finally { painting = false; }
  };
  map.on('styledata', paint);
  map.on('idle', paint);
  paint();
  try {
    const camera = missionMapCamera(target, previewOrigin.value, [], previewGeometry.value.bounds);
    if (camera.kind === 'both') map.fitBounds(camera.bounds, { maxZoom: camera.maxZoom, duration: 400,
      padding: { top: window.innerWidth < 600 && window.innerHeight < 500 ? 85 : 105,
        bottom: window.innerWidth < 600 ? Math.round(window.innerHeight * (window.innerHeight < 500 ? .56 : .62)) : 96,
        left: window.innerWidth >= 600 && window.innerWidth < 1024 ? Math.min(440, Math.round(window.innerWidth * .52)) : 25,
        right: window.innerWidth >= 1024 ? Math.min(470, Math.round(window.innerWidth * .34)) : window.innerWidth >= 600 ? 80 : 25 } });
    else map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 400,
      offset: [0, window.innerWidth < 600 ? -Math.min(130, Math.round(window.innerHeight * .2)) : 0] });
  } catch { /* A zero-sized map can recover when MapCanvas becomes ready. */ }
  onCleanup(() => {
    map.off('styledata', paint);
    map.off('idle', paint);
    marker?.remove();
    clearOfferRoute(map);
    previewPainted.value = false;
  });
}, { flush: 'post' });

async function selectOffer(id: string): Promise<void> {
  selectedId.value = id;
  if (props.compactMap) detailOpen.value = true;
  await nextTick();
  if (selectedId.value !== id || !detailRef.value) return;
  const detail = detailRef.value;
  // In the mission map the list and details are two states of ONE bounded
  // surface. Return to its top instead of jumping the entire map or app shell.
  const panel = detail.closest<HTMLElement>(".mission-desk__empty, .map-proposal__details-scroll");
  if (props.compactMap) detail.scrollTo({ top: 0, behavior: "auto" });
  else if (panel) {
    // Elsewhere the existing full inbox retains its stacked master/detail view.
    const top = detail.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    if (top < 0 || top > panel.clientHeight - 64)
      panel.scrollTo({ top: panel.scrollTop + top - 12, behavior: "auto" });
  }
  detail.focus({ preventScroll: true });
}
async function closeMapDetail(): Promise<void> {
  detailOpen.value = false;
  await nextTick();
  // Keep the list's own scroll position so declining or reviewing an offer
  // returns to the same neighborhood; never scroll the whole map panel.
  const cards = listRef.value?.querySelectorAll<HTMLButtonElement>(".offer-card");
  (Array.from(cards ?? []).find((card) => card.dataset.offerId === selectedId.value) ?? cards?.[0])
    ?.focus({ preventScroll: true });
}
const confirmAction = ref<"accept" | "decline" | null>(null);
const tripEndError = ref<string | null>(null);
watch(confirmAction, () => { tripEndError.value = null; });
const declineReason = ref("");
const photoSrc = ref<string | null>(null);
const photoError = ref<string | null>(null);
const photoLoading = ref(false);
const myPosition = ref<{ lat: number; lon: number } | null>(null);
const locationError = ref<string | null>(null);
const locating = ref(false);
let photoGeneration = 0;
let locationGeneration = 0;

function severity(item: ProposalInboxItem) {
  return proposalSeverity[item.details?.sosRequest.severity ?? "medium"];
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
  // Confirmation is explicit: a trip, including Start waiting for GPS, must
  // release its watcher and route before the server can accept a mission.
  if (action === "accept" && !mapTripSession.endForMission()) {
    tripEndError.value = "پایان سفر تأیید نشد؛ مأموریت پذیرفته نشد. سفر را متوقف کنید و دوباره تلاش کنید.";
    return;
  }
  const success = await inbox.decide(id, action, action === "decline" ? declineReason.value.trim() || undefined : undefined);
  if (success) {
    confirmAction.value = null;
    declineReason.value = "";
    if (action === "decline") {
      selectedId.value = null;
      if (props.compactMap) void closeMapDetail();
    }
  }
}
// The inbox keeps the previous page's rows visible while the next page loads.
// An ID chosen on the old page must not strand the new page without details.
watch(() => inbox.page, () => { selectedId.value = null; detailOpen.value = false; });
watch(() => props.selectedOfferId, (id) => {
  selectedId.value = id; detailOpen.value = Boolean(props.compactMap && id);
});
watch(() => selected.value?.id, (id) => {
  // A refresh can withdraw an offer while its map detail is open. Return to
  // the list rather than leaving a stale choice or an empty detail on screen.
  if (props.compactMap && selectedId.value && selectedId.value !== id) {
    selectedId.value = null;
    void closeMapDetail();
  }
  photoGeneration++;
  photoSrc.value = null;
  photoError.value = null;
  photoLoading.value = false;
  confirmAction.value = null;
  declineReason.value = "";
});
watch(() => auth.user?.id, () => {
  detailOpen.value = false;
  myPosition.value = null;
  locating.value = false;
  locationGeneration++;
  photoGeneration++;
  photoSrc.value = null;
});
onBeforeUnmount(() => { photoGeneration++; locationGeneration++; photoSrc.value = null; });
</script>

<style scoped>
.offers { min-height: 0; padding: clamp(12px, 3vw, 30px) 12px 32px; background: radial-gradient(ellipse at 80% 0%, rgba(48, 117, 106, .11), transparent 48%), rgb(var(--v-theme-background)); color: rgb(var(--v-theme-on-background)); }
.offers__shell { max-width: 1260px; margin-inline: auto; container-type: inline-size; }
.offers__hero { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 14px 18px; border-radius: var(--bb-radius-card, 24px); background: linear-gradient(118deg, #103c3d, #185352 60%, #29736b); color: #fff; box-shadow: var(--bb-shadow-hero); }
.offers__intro { min-width: 0; }
.offers__eyebrow { display: inline-flex; gap: 8px; align-items: center; color: #bbefdf; font-size: 0.82rem; font-weight: 700; }
.offers__live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #74e9be; box-shadow: 0 0 0 4px rgba(116,233,190,.17); }
.offers__hero h3 { font-size: 1.15rem; margin: 3px 0; line-height: 1.3; font-weight: 800; }
.offers__hero p { color: #d2e8e2; line-height: 1.45; margin: 0; font-size: 0.82rem; }
.offers__stat { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.11); border-radius: var(--bb-radius-nested, 16px); min-width: 78px; min-height: 88px; padding: 6px; gap: 0; font-size: 0.82rem; color: #e1f7ec; text-align: center; }
.offers__stat-number { font-size: 1.25rem; line-height: 1.1; font-weight: 800; color: #fff; }
.accepted-map { margin-top: 22px; padding: clamp(18px, 3vw, 28px); border-radius: var(--bb-radius-card, 24px); border: 1px solid rgba(49,149,129,.28); background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-surface); }
.accepted-map__intro { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
.accepted-map__intro h2 { font-size: 1.25rem; font-weight: 800; margin: 0 0 5px; }
.accepted-map__intro p { font-size: .86rem; opacity: .78; max-width: 650px; margin: 0; line-height: 1.7; }
.accepted-map__caption { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; font-size: .83rem; margin: 16px 0 0; line-height: 1.7; }
.accepted-map__caption bdi { font-weight: 700; }
.offers__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 18px 0 12px; }
.offers__toolbar h2 { font-size: 1.28rem; font-weight: 800; margin: 0 0 4px; }
.offers__toolbar p { font-size: .82rem; opacity: .66; margin: 0; }
.offers__layout { display: grid; grid-template-columns: minmax(265px, 385px) minmax(0, 1fr); gap: 20px; align-items: start; }
.offers__list,.offers__items { display: grid; gap: 11px; min-width: 0; }
.offer-card { width: 100%; text-align: start; color: inherit; font: inherit; border: 1px solid rgba(128, 155, 151, .25); border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); padding: 0; display: flex; overflow: hidden; cursor: pointer; box-shadow: var(--bb-shadow-item); transition: border-color .2s, transform .2s, box-shadow .2s; }
.offer-card:not(:disabled):not(.offer-card--selected):hover { transform: translateY(-2px); box-shadow: var(--bb-shadow-item-hover); }
.offer-card:focus-visible, .offers__pages :focus-visible { outline: 3px solid #398c7d; outline-offset: 2px; }
.offer-card--selected { border-color: #319581; box-shadow: 0 0 0 2px rgba(49,149,129,.22), var(--bb-shadow-item); }
.offer-card__stripe { width: 5px; flex-shrink: 0; }
.offer-card__stripe--urgent { background: #df554f; }.offer-card__stripe--important { background: #db9837; }.offer-card__stripe--standard { background: #3a9a8a; }
.offer-card__body { min-width: 0; width: 100%; display: grid; padding: 20px 19px; gap: 12px; }
.offer-card__top, .offer-card__foot { display: flex; align-items: center; gap: 10px; }
.offer-card__icon { display: inline-flex; justify-content: center; align-items: center; background: rgba(49,149,129,.12); color: rgb(var(--v-theme-primary)); border-radius: 11px; width: 36px; height: 36px; flex-shrink: 0; }
.offer-card__title { font-weight: 800; font-size: .95rem; line-height: 1.55; flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.offer-card__severity, .offer-detail__pill { font-weight: 750; font-size: 0.82rem; border-radius: 50px; padding: 5px 10px; white-space: nowrap; }
.offer-card__severity--urgent { background: #ffe7e4; color: #a2241e; }.offer-card__severity--important { background: #fff0d4; color: #875000; }.offer-card__severity--standard { background: #d9f4ed; color: #066b57; }
.offer-card__description { font-size: .85rem; line-height: 1.65; opacity: .9; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.offer-card__foot { justify-content: space-between; flex-wrap: wrap; font-size: 0.82rem; color: rgb(var(--v-theme-primary)); }
.offer-card__foot span { min-width: 0; overflow-wrap: anywhere; }
.offer-card__foot span:first-child { opacity: .9; }
.offers__pages { display: flex; justify-content: center; gap: 8px; align-items: center; font-size: .8rem; }
.offer-detail { background: rgb(var(--v-theme-surface)); border-radius: var(--bb-radius-card, 24px); border: 1px solid rgba(128,155,151,.25); box-shadow: var(--bb-shadow-surface); overflow: hidden; }
.offer-detail__top { padding: 28px clamp(22px, 3vw, 36px); border-bottom: 1px solid rgba(128,155,151,.18); background: linear-gradient(105deg, rgba(42,137,114,.1), transparent 80%); }
.offer-detail__kicker { font-size: 0.82rem; color: rgb(var(--v-theme-primary)); font-weight: 700; }.offer-detail__top h2 { margin: 8px 0 12px; font-size: clamp(1.35rem, 2vw, 1.7rem); font-weight: 800; }
.offer-detail__pill { display: inline-flex; align-items: center; gap: 5px; }
.offer-detail__facts { display: flex; flex-wrap: wrap; gap: 12px; padding: 22px clamp(22px, 3vw, 36px) 0; }
.offer-detail__facts > div { flex: 1 1 180px; display: grid; gap: 5px; padding: 14px 17px; background: rgba(128,155,151,.08); border-radius: var(--bb-radius-nested, 16px); }.offer-detail__facts span { opacity: .65; font-size: 0.82rem; }.offer-detail__facts strong { font-size: .92rem; }
.offer-detail__section { padding: 23px clamp(22px, 3vw, 36px) 0; }.offer-detail__section h3 { display: flex; align-items: center; gap: 8px; font-size: .91rem; font-weight: 800; margin-bottom: 11px; color: rgb(var(--v-theme-primary)); }.offer-detail__description { line-height: 2; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .92rem; }
.offer-detail__map { padding: .75rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); line-height: 1.7; }
.offer-detail__coords { margin: 10px 0 0; font-size: 0.82rem; opacity: .7; }.offer-detail__photo { max-width: 100%; overflow: hidden; border-radius: var(--bb-radius-nested, 16px); background: #163b39; }.offer-detail__photo img { max-width: 100%; max-height: 360px; display: block; margin-inline: auto; object-fit: contain; }
.offer-detail__hint { font-size: 0.82rem; line-height: 1.7; opacity: .7; margin: 8px 0 0; overflow-wrap: anywhere; }
.offer-detail > .offer-detail__hint, .offer-detail > .offer-detail__locate { margin-inline: clamp(22px, 3vw, 36px); }
.offer-detail > .offer-detail__hint { margin-top: 8px; }
.offer-detail__actions { margin-top: 26px; padding: 22px clamp(22px, 3vw, 36px) 27px; border-top: 1px solid rgba(128,155,151,.18); }.offer-detail__actions p { margin: 0 0 16px; display: flex; gap: 8px; align-items: center; font-size: .8rem; opacity: .75; }.offer-detail__buttons { display: flex; flex-wrap: wrap; gap: 10px; }
.offers__empty { border: 1px dashed rgba(89,145,133,.4); background: rgb(var(--v-theme-surface)); border-radius: var(--bb-radius-card, 24px); text-align: center; padding: 65px 20px; margin-top: 18px; }.offers__empty-icon { display: inline-flex; padding: 15px; background: rgba(48,148,123,.12); border-radius: 50%; color: rgb(var(--v-theme-primary)); }.offers__empty h3 { font-size: 1.25rem; margin: 16px 0 8px; }.offers__empty p { opacity: .7; font-size: .9rem; line-height: 1.8; max-width: 440px; margin: 0 auto 20px; }.offers__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }.offers__skeleton { border-radius: var(--bb-radius-nested, 16px); }
@media (max-width: 850px) {
  .offers__layout { grid-template-columns: 1fr; }
  .offers__list { order: 1; } /* Put the chosen incident first in the full-screen dialog. */
  .offers__items { max-height: min(45vh, 26rem); max-height: min(45dvh, 26rem); overflow-y: auto; padding: 8px 10px 12px; }
  .offers__items:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: var(--bb-radius-nested, 16px); }
  .offer-detail { scroll-margin-top: 85px; }
}
@media (max-width: 580px) {
  .offers { padding-inline: 12px; }
  .offers__hero { padding: 12px; }
  .offers__stat { min-width: 74px; }
  .offers__toolbar { align-items: start; }
  .offers__toolbar p { display: none; }
  .offers__grid { grid-template-columns: 1fr; }
  .offer-detail__buttons > * { flex: 1 1 100%; }
  .accepted-map__intro :deep(.v-btn),.offer-detail .offer-detail__locate { max-width: 100%; min-width: 0; min-height: 44px; height: auto; }
  .accepted-map__intro :deep(.v-btn__content),.offer-detail__locate :deep(.v-btn__content) { white-space: normal; text-align: center; }
  .offer-confirm-actions { flex-direction: column; align-items: stretch; gap: 8px; }
  .offer-confirm-actions :deep(.v-spacer) { display: none; }
  .offer-confirm-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }
  .offer-confirm-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
}
/* The inbox is also embedded in a narrow map sheet on wide screens.
   Measure its own space rather than relying on the viewport breakpoint. */
@container (max-width: 42rem) {
  .offers__layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
@container (max-width: 28rem) {
  .offers__hero { flex-wrap: wrap; align-items: flex-start; }
  .offers__stat { flex-direction: row; min-width: 0; min-height: 44px; gap: 6px; padding: 6px 10px; }
  .offers__toolbar { flex-wrap: wrap; }
  .offers__toolbar > div { flex: 1 1 100%; min-width: 0; }
  .offer-card__body { padding: 14px 12px; gap: 8px; }
  .offer-card__top { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 7px 9px; }
  .offer-card__severity { grid-column: 2; justify-self: start; }
}
/* Mission map: a compact inbox, then an explicit detail step inside the same
   bounded surface. The full-page inbox above keeps its own generous layout. */
.offers--map { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.offers--map .offers__shell { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; }
.offers--map:not(.offers--detail-open) .offer-detail,
.offers--map.offers--detail-open .offers__list { display: none; }
.offers--map.offers--detail-open .offers__hero { display: none; }
.offers--map .offers__hero { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: .4rem; align-items: center; }
.offers--map .offers__eyebrow, .offers--map .offers__hero p,
.offers--map .offers__stat > :deep(.v-icon), .offers--map .offers__stat > span:last-child { display: none; }
.offers--map .offers__hero h3 { margin: 0; font-size: 1rem; line-height: 1.35; }
.offers--map .offers__stat { min-width: 44px; min-height: 44px; padding: .25rem .4rem; }
.offers--map .offers__stat-number { font-size: 1rem; }
.offers--map .offers__map-refresh { min-width: 44px; min-height: 44px; }
.offers--map .offers__layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); align-items: stretch; gap: 0; flex: 1; min-height: 0; }
.offers--map .offers__list, .offers--map .offer-detail { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.offers--map .offers__list { align-content: start; padding: .25rem .15rem .25rem .1rem; }
/* Let a short list size the card naturally. Only the list's parent scrolls
   once its content exceeds the map space; never reserve an idle scrollbar. */
.offers--map:not(.offers--detail-open) { height: auto; }
.offers--map:not(.offers--detail-open) .offers__shell,
.offers--map:not(.offers--detail-open) .offers__layout { flex: none; }
.offers--map:not(.offers--detail-open) .offers__layout,
.offers--map:not(.offers--detail-open) .offers__list { display: block; }
.offers--map:not(.offers--detail-open) .offers__list { max-height: var(--offer-list-max-height); overflow-y: auto; scrollbar-gutter: auto; }
.offers--map .offers__list :deep(.v-alert), .offers--map .offer-detail > :deep(.v-alert) { margin: .35rem; }
.offers--map .offers__list :deep(.v-alert .v-btn), .offers--map .offer-detail > :deep(.v-alert .v-btn) { min-height: 44px; height: auto; }
.offers--map .offers__hero { flex: none; }
.offers--map .offers__shell > :deep(.v-alert) { flex: none; margin: .3rem 0 !important; }
.offers--map .offers__grid { grid-template-columns: 1fr; gap: .35rem; }
.offers--map .offers__list, .offers--map .offers__items { gap: .35rem; }
.offers--map .offers__items { max-height: none; overflow: visible; padding: 0; }
.offers--map .offer-card { min-height: 64px; border-color: var(--bb-color-outline); box-shadow: none; }
.offers--map .offer-card:not(:disabled):not(.offer-card--selected):hover { transform: none; border-color: rgb(var(--v-theme-primary)); box-shadow: none; }
.offers--map .offer-card--selected { border-color: rgb(var(--v-theme-primary)); box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary)); }
.offers--map .offer-card__body { padding: .45rem .65rem; gap: .15rem; }
.offers--map .offer-card__icon { display: none; }
.offers--map .offer-card__top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .4rem; align-items: start; }
.offers--map .offer-card__title { font-size: .875rem; line-height: 1.35; }
.offers--map .offer-card__severity { grid-column: 2; grid-row: 1; align-self: start; padding: .12rem .4rem; font-size: .8rem; }
.offers--map .offer-card__description { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: .8rem; line-height: 1.35; -webkit-line-clamp: unset; }
.offers--map .offer-card__foot { font-size: .8rem; line-height: 1.25; }
.offers--map .offer-card__foot span:last-child { display: none; }
.offers--map .offers__pages { margin-top: .2rem; }
.offers--map .offers__pages :deep(.v-btn) { min-width: 44px; min-height: 44px; }
.offers--map .offer-detail { border-radius: 0; }
.offers--map .offer-detail__route { padding: .6rem .65rem; margin: .5rem .65rem 0; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.offers--map .offer-detail__route-heading { display: flex; align-items: center; gap: .3rem; font-size: .875rem; font-weight: 800; color: rgb(var(--v-theme-primary)); }
.offers--map .offer-detail__metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .4rem; margin-top: .4rem; }
.offers--map .offer-detail__metrics > div { min-width: 0; display: grid; gap: .1rem; }
.offers--map .offer-detail__metrics span { font-size: .8rem; color: var(--bb-color-muted); }
.offers--map .offer-detail__metrics strong { font-size: 1.05rem; }
.offers--map .offer-detail__route p { margin: .4rem 0 0; font-size: .8rem; line-height: 1.5; }
.offers--map .offer-detail__route :deep(.v-btn) { min-height: 44px; height: auto; }
.offers--map .offer-detail__address { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; margin: .2rem 0; line-height: 1.6; overflow-wrap: anywhere; }
.offers--map .offer-detail__address bdi { min-width: 0; }
.offers--map .offer-detail__back { position: sticky; top: 0; z-index: 2; min-width: 44px; min-height: 44px;
  background: rgb(var(--v-theme-surface)); }
.offers--map .offer-detail__top { padding: .25rem .65rem .5rem; background: transparent; }
.offers--map .offer-detail__top h2 { margin: .2rem 0; font-size: 1rem; line-height: 1.4; }
.offers--map .offer-detail__facts { gap: .4rem; padding: .5rem .65rem 0; }
.offers--map .offer-detail__facts > div { flex: 1 1 8rem; gap: 1px; padding: .4rem .5rem; }
.offers--map .offer-detail__section { padding: .6rem .65rem 0; }
.offers--map .offer-detail__section h3 { margin: 0 0 .25rem; }
.offers--map .offer-detail__description { margin: 0; line-height: 1.55; }
.offers--map .offer-detail__coords { margin: .2rem 0 0; overflow-wrap: anywhere; }
.offers--map .offer-detail__actions { margin-top: .65rem; padding: .65rem .65rem 1rem; }
.offers--map .offer-detail__actions p { margin-bottom: .4rem; }
.offers--map .offer-detail__buttons > * { flex: 1 1 8rem; min-width: 0; min-height: 44px; height: auto; }
.offers--map .offer-detail__buttons :deep(.v-btn__content) { white-space: normal; text-align: center; }
.offers--map .offer-detail__photo img { max-height: 12rem; }
.offers--map .accepted-map { margin-top: .5rem; padding: .65rem; }
.offers--map .offers__empty { margin-top: .4rem; padding: .65rem; }
.offers--map .offers__empty-icon { display: none; }
.offers--map .offers__empty h3 { margin: .35rem 0; font-size: 1rem; }
.offers--map .offers__empty p { margin-bottom: .4rem; font-size: .875rem; line-height: 1.5; }

@media (prefers-reduced-motion: reduce) { .offer-card { transition: none; }.offer-card:not(:disabled):not(.offer-card--selected):hover { transform: none; } }

:global(:root.dark .offer-card:not(.offer-card--selected)) { border-color: var(--bb-color-outline); }
:global(:root.dark .offer-card--selected) {
  border-color: var(--bb-color-primary);
  box-shadow: 0 0 0 2px var(--bb-color-primary), var(--bb-shadow-item);
}
:global(:root.dark .offer-detail__facts > div) {
  background: var(--bb-color-inset);
  border: 1px solid var(--bb-color-outline);
}
:global(:root.dark .offer-card__severity--urgent) { color: #ffadad; background: #422b2b; }
:global(:root.dark .offer-card__severity--important) { color: #f9ca76; background: #443522; }
:global(:root.dark .offer-card__severity--standard) { color: var(--bb-color-primary); background: #1d4038; }
</style>
