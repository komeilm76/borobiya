<template>
  <section class="user-map-view" :class="{ 'user-map-view--mission': mode === 'missions',
    'user-map-view--mission-legend': mode === 'missions' && !!missionWorkspace?.hasMapLegend,
    'user-map-view--mission-active': mode === 'missions' && !!missionWorkspace?.hasActiveMission,
    'user-map-view--mission-idle': mode === 'missions' && !missionWorkspace?.hasActiveMission,
    'user-map-view--mission-tool-open': mode === 'missions' && !!missionWorkspace?.hasOpenMapTool,
    'user-map-view--mission-steps': mode === 'missions' && !!missionWorkspace?.hasStepsSheet,
    'user-map-view--route-preview': mode === 'trips' && journey.sheetOpen.value && !!journey.point.value,
    'user-map-view--navigating': isPhone && journey.navigating.value && !journey.sheetOpen.value }" aria-label="نقشهٔ تعاملی همراهان">
    <MapCanvas
      class="user-map-view__canvas"
      :style-url="mapStyleUrl"
      :constrain-bounds="!missionActive && mode !== 'missions'"
      :show-zoom="false" compass-action
      aria-label="نقشهٔ تعاملی"
      @ready="onMapReady"
      @coverage-changed="onMapCoverageChanged"
    />
    <nav class="user-map-view__modes" aria-label="بخش‌های نقشه" dir="rtl">
      <button v-for="item in workspaceModes" :key="item.id" :id="`map-mode-${item.id}`" type="button"
        :class="{ 'user-map-view__mode--active': mode === item.id }"
        :aria-label="modeReason(item.id)" :title="modeReason(item.id)" :aria-current="mode === item.id ? 'page' : undefined"
        :disabled="!modeAvailability[item.id] || (item.id === 'missions' && auth.user?.role !== 'user')"
        @click="chooseMode(item.id)">
        <v-icon :icon="item.icon" size="19" aria-hidden="true" /><span>{{ item.label }}</span>
      </button>
    </nav>
    <v-alert v-if="shareSuccess && !shareOpen" id="map-share-success" class="user-map-view__share-success" type="success"
      variant="tonal" rounded="lg" role="status" aria-live="polite" tabindex="-1" closable
      @click:close="shareSuccess = null">{{ shareSuccess }}</v-alert>
    <UserMissionView v-if="auth.user?.role === 'user' && (mode === 'missions' || missionActive)"
      v-show="mode === 'missions'" ref="missionWorkspace"
      embedded :visible="mode === 'missions'" :external-map="map" :external-marker="workspaceMarker"
      :own-recenter-label="recenterLabel" :own-location-error="!!(own.error.value || recenterError)"
      @focus-own="centerOnOwnLocation" />

    <!-- On phones Search is modal; this map-side action makes other POIs reachable
         again after zooming into one without reopening the full-screen dialog. -->
    <div v-if="isPhone && showAllResultsOnMap && !journey.sheetOpen.value && !journey.navigating.value" v-show="!activeTool"
      class="user-map-view__search-map-actions" role="group" aria-label="نتایج جست‌وجو روی نقشه">
      <span class="user-map-view__search-map-count">{{ placeSearch.mapResults.value.length.toLocaleString('fa-IR') }} نتیجه روی نقشه</span>
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-format-list-bulleted" size="small"
        aria-label="بازگشت به فهرست نتایج جست‌وجو" @click="selectTool('search')">فهرست نتایج</v-btn>
      <v-btn color="primary" variant="flat" prepend-icon="mdi-map-marker-multiple" size="small"
        :disabled="!placeSearch.mapResults.value.length" aria-label="نمایش دوبارهٔ همهٔ نتایج روی نقشه"
        @click="showAllSearchResults">نمایش همه</v-btn>
      <span v-if="placeSearch.loading.value" role="status">در حال به‌روزرسانی نتایج…</span>
      <template v-else-if="placeSearch.failed.value">
        <span role="alert">به‌روزرسانی ناموفق؛ فقط نتایج داخل محدوده.</span>
        <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-refresh"
          aria-label="تلاش دوباره برای نتایج این محدوده" @click="placeSearch.retry()">تلاش دوباره</v-btn>
      </template>
      <span v-else-if="!placeSearch.results.value.length" role="status">در این محدوده نتیجهٔ جدیدی نیست.</span>
    </div>

    <span class="sr-only" role="status" aria-live="polite">{{ clusterZoomAnnouncement }}</span>
    <!-- A cluster zooms to its area first; at maximum zoom, the list keeps
         identical-coordinate results individually selectable without hover UI. -->
    <section v-if="nearbyPlaces.length > 1 && showAllResultsOnMap && !activeTool" id="map-nearby-results"
      class="user-map-view__nearby-results" role="dialog" aria-modal="false" aria-labelledby="map-nearby-title"
      tabindex="-1" @keydown.esc.stop.prevent="closeNearbyResults(true)">
      <header class="user-map-view__nearby-header">
        <h2 id="map-nearby-title">{{ nearbyPlaces.length.toLocaleString('fa-IR') }} مکان نزدیک</h2>
        <button type="button" aria-label="بستن فهرست مکان‌های نزدیک" @click="closeNearbyResults(true)">✕</button>
      </header>
      <ul class="user-map-view__nearby-list" aria-label="مکان‌های نزدیک">
        <li v-for="place in nearbyPlaces" :key="place.placeId">
          <button type="button" @click="chooseNearbyResult(place)">
            <span class="user-map-view__nearby-icon" :style="{ '--result-color': resultAppearance(place).color }" aria-hidden="true">
              <v-icon :icon="resultAppearance(place).icon" size="20" />
            </span>
            <span class="user-map-view__nearby-copy">
              <bdi dir="auto" class="user-map-view__nearby-name">{{ place.name }}</bdi>
              <bdi dir="auto" class="user-map-view__nearby-address">{{ place.address }}</bdi>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <!-- One phone Search action in every workspace tab. SOS is an App sibling;
         its offset is paired with this button's offset in the map shell styles. -->
    <v-btn v-if="isPhone" id="map-tool-search" class="user-map-view__search-action"
      icon="mdi-magnify" variant="flat" color="primary" aria-label="جست‌وجوی مکان"
      title="جست‌وجوی مکان" aria-controls="map-search-panel"
      :aria-expanded="activeTool === 'search'" @click="selectTool('search')" />

    <!-- Keep location a map feature, not a fourth panel. This is a private GPS
         watcher; opening the map never starts outgoing location sharing. -->
    <v-btn
      id="map-recenter" class="user-map-view__recenter"
      v-show="(mode !== 'missions' || !missionWorkspace?.hasActiveMission) && !(isPhone && activeTool)"
      :icon="own.error.value || recenterError ? 'mdi-crosshairs-question' : journey.navigating.value && !navigationFollowEnabled ? 'mdi-navigation-variant' : 'mdi-crosshairs-gps'"
      :color="own.error.value || recenterError ? 'warning' : 'primary'"
      :aria-label="journey.navigating.value && !navigationFollowEnabled ? 'بازگشت به دنبال‌کردن مسیر' : recenterLabel"
      :title="journey.navigating.value && !navigationFollowEnabled ? 'بازگشت به دنبال‌کردن مسیر' : recenterLabel"
      :disabled="!map || !auth.user"
      variant="flat"
      @click="centerOnOwnLocation"
    />
    <!-- Manual Broadcast is available outside active assignments and guidance;
         App owns the automatic broadcast lifecycle in those two states. -->
    <v-btn
      class="user-map-view__share"
      :class="{ 'user-map-view__share--idle': !broadcast.view.isActive && broadcast.view.tone === 'neutral' }"
      v-show="!broadcast.automaticActive && !missionShare.mission && !journey.navigating.value && !journey.navigationPending.value && !(isPhone && (activeTool || (mode === 'missions' && missionWorkspace?.hasOpenMapTool)))"
      :icon="broadcast.view.isActive ? 'mdi-broadcast' : 'mdi-broadcast-off'"
      :color="broadcast.view.tone === 'error' || broadcast.view.tone === 'warn' ? 'warning' : broadcast.view.isActive ? 'primary' : 'surface'"
      :aria-label="broadcast.view.actionLabel"
      :title="`${broadcast.view.headline}؛ ${broadcast.view.detail}`"
      :aria-pressed="broadcast.view.isActive"
      :disabled="!auth.user || auth.mustCompleteSecurityQuestions || !broadcast.isSupported"
      variant="flat"
      @click="broadcast.toggle()"
    />
    <span v-if="isPhone && activeTool !== 'live' && (broadcast.view.tone === 'warn' || broadcast.view.tone === 'error')"
      class="sr-only" role="status" aria-live="polite">{{ broadcast.view.headline }}؛ {{ broadcast.view.detail }}</span>
    <span v-if="own.error.value || recenterError" class="sr-only" role="status" aria-live="polite">
      {{ recenterError ?? own.error.value }}
    </span>

    <div v-if="journey.point.value && journey.navigating.value && !journey.sheetOpen.value"
      class="user-map-view__journey-stack" aria-label="راهبری فعال">
      <v-card id="map-navigation-sheet" class="user-map-view__journey-content bb-floating-card bb-map-navigation-card"
        elevation="3" rounded="xl" dir="rtl" tabindex="-1">
        <div class="user-map-view__journey-bar">
          <span class="user-map-view__journey-emblem" aria-hidden="true"><v-icon icon="mdi-navigation-variant" size="21" /></span>
          <div class="user-map-view__journey-heading">
            <small :title="journey.title.value">در حال سفر · <bdi dir="auto">{{ journey.title.value }}</bdi></small>
            <span class="user-map-view__journey-label" :title="journeyBarLabel">{{ journeyBarLabel }}</span>
          </div>
          <span class="sr-only" role="status" aria-live="polite">{{ journeyAnnouncement }}</span>
          <dl class="user-map-view__telemetry" aria-label="سرعت و زمان مسیر">
            <div class="user-map-view__telemetry-item user-map-view__telemetry-item--eta">
              <dt><v-icon icon="mdi-timer-outline" size="18" aria-hidden="true" />تا مقصد</dt>
              <dd :aria-label="remainingSeconds === null ? 'زمان باقی‌مانده نامشخص' : `زمان باقی‌ماندهٔ تقریبی ${formatRemainingTime(remainingSeconds)}؛ برآورد مسیر بدون ترافیک`">
                {{ remainingSeconds === null ? '—' : isPhone ? `≈ ${formatRemainingTimeCompact(remainingSeconds)}` : formatRemainingTime(remainingSeconds) }}
              </dd>
              <small>برآورد مسیر · بدون ترافیک</small>
            </div>
            <div class="user-map-view__telemetry-item">
              <dt><v-icon icon="mdi-speedometer" size="18" aria-hidden="true" />سرعت</dt>
              <dd :aria-label="liveSpeedKmh === null ? 'سرعت فعلی نامشخص' : `سرعت فعلی ${liveSpeedKmh} کیلومتر بر ساعت بر اساس GPS`">
                {{ liveSpeedKmh === null ? '—' : liveSpeedKmh.toLocaleString('fa-IR') }}
              </dd>
              <span class="user-map-view__telemetry-unit" aria-hidden="true">km/h</span>
              <small>کیلومتر/ساعت · GPS</small>
            </div>
            <div class="user-map-view__telemetry-item user-map-view__telemetry-item--unknown">
              <dt><v-icon icon="mdi-road-variant" size="18" aria-hidden="true" />حد مجاز</dt>
              <dd aria-label="حد مجاز نامشخص" title="مسیر آفلاین دادهٔ حد مجاز قانونی را ارائه نمی‌کند">؟</dd>
              <small>دادهٔ معتبر موجود نیست</small>
            </div>
          </dl>
          <div class="user-map-view__journey-actions" role="group" aria-label="کنترل‌های سفر">
            <v-btn variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-arrow-right"
              aria-label="توقف راهبری و بازگشت به برنامهٔ سفر؛ مسیر حفظ می‌شود" title="بازگشت به برنامهٔ سفر بدون حذف مسیر"
              @click="backToTravelPlan">ویرایش سفر</v-btn>
            <v-btn variant="outlined" color="error" rounded="lg" prepend-icon="mdi-stop-circle-outline"
              aria-label="توقف و پایان سفر؛ مقصد و مسیر حذف می‌شود" title="توقف و پایان سفر؛ حذف مقصد و مسیر"
              @click="clearPointRoute">پایان سفر</v-btn>
          </div>
        </div>
        <div v-if="journey.gpsWarning.value || journey.rerouteMessage.value" class="user-map-view__navigation-status">
          <p v-if="journey.gpsWarning.value" class="user-map-view__gps-warning" role="status" aria-live="polite">
            <v-icon icon="mdi-signal-off" aria-hidden="true" />{{ journey.gpsWarning.value }}
          </p>
          <p v-if="journey.rerouteMessage.value" class="user-map-view__reroute-status"
            role="status" aria-live="assertive">{{ journey.rerouteMessage.value }}</p>
        </div>
      </v-card>
    </div>
    <PointRouteSheet v-show="mode === 'trips' && !missionActive" ref="pointSheetRef" :api="journey" :reverse="reverse" :origin-reverse="originReverse" :own-position="own.position.value"
      :choices-open="routeChoicesOpen || transportChoicesOpen" :show-search="false"
      :search-place="isSelectedSearchDestination ? journey.knownPlace.value : null" v-model:confirm-delete-open="routeDeleteConfirmOpen"
      @start="startPointNavigation" @search="openRouteSearch" @choose-route="openRouteChoices" @choose-transport="openTransportChoices"
      @dismiss="focusDestinationMarker" @layout-change="onPointRouteLayoutChange" />
    <PointRouteChoicesSheet :api="journey" :open="routeChoicesOpen && mode === 'trips' && !missionActive" :show-search="false"
      @choose="selectPointRoute" @confirm="confirmPointRoute" @close="closeRouteChoices" @search="openRouteSearch" />
    <PointTransportChoicesSheet :api="journey" :open="transportChoicesOpen && mode === 'trips' && !missionActive" :show-search="false"
      @confirm="confirmTransportChoice" @close="closeTransportChoices" @search="openRouteSearch" />
    <CompanionDetailSheet :peer="selectedCompanion" :observed-at-ms="selectedObservedAtMs"
      :profile="selectedProfile" :profile-loading="profileLoading" :profile-failed="profileFailed"
      :place="selectedPlace" :place-loading="placeLoading" :place-failed="placeFailed"
      @close="removeSelectedCompanion" @retry-profile="loadSelectedProfile" @retry-place="loadSelectedPlace" />

    <!-- Phone search gets the same full-height dialog treatment as Companions;
         wider maps retain the existing in-flow/side search panel. -->
    <component :is="isPhone ? VDialog : 'div'" class="user-map-view__search-dialog"
      v-bind="isPhone ? phoneSearchDialogProps : {}"
      @update:model-value="onSearchDialogVisibilityChange">
      <v-card class="user-map-view__search-surface" rounded="xl">
        <v-card-title v-if="isPhone" class="user-map-view__search-title">
          <h2>جست‌وجوی مکان</h2>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن جست‌وجو" @click="closeTool()" />
        </v-card-title>
        <v-card-text class="user-map-view__search-body">
          <aside id="map-search-panel" v-show="!isPhone || activeTool === 'search'"
            class="user-map-view__search user-map-view__panel" :role="isPhone ? 'region' : undefined"
            :aria-label="isPhone ? 'جست‌وجوی مکان' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
            <PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" @show-all="showAllSearchResults" />
          </aside>
        </v-card-text>
      </v-card>
    </component>

    <!-- History needs the full phone viewport for range, transport and scrub controls.
         Tablet/desktop keep the existing in-flow/side playback panel. -->
    <component :is="isPhone ? VDialog : 'div'" class="user-map-view__history-dialog"
      v-bind="isPhone ? phoneHistoryDialogProps : {}"
      @update:model-value="onHistoryDialogVisibilityChange">
      <v-card class="user-map-view__history-surface" rounded="xl">
        <v-card-title v-if="isPhone" class="user-map-view__history-title">
          <h2>تاریخچهٔ مسیر</h2>
          <div class="user-map-view__dialog-actions">
            <v-btn :icon="own.error.value || recenterError ? 'mdi-crosshairs-question' : 'mdi-crosshairs-gps'"
              :color="own.error.value || recenterError ? 'warning' : 'primary'" variant="text"
              :aria-label="recenterLabel" :title="recenterLabel" :disabled="!map || !auth.user"
              @click="focusOwnFromDialog" />
            <v-btn icon="mdi-close" variant="text" aria-label="بستن تاریخچه" @click="closeTool()" />
          </div>
        </v-card-title>
        <v-card-text class="user-map-view__history-body">
          <aside id="map-history-panel" v-show="mode === 'history' && (!isPhone || activeTool === 'history')"
            class="user-map-view__playback user-map-view__panel" :role="isPhone ? 'region' : undefined"
            :aria-label="isPhone ? 'تاریخچهٔ مسیر' : undefined" tabindex="-1" @keydown.esc="onPanelEscape">
            <HistoryPlaybackPanel
              :api="playback"
              :expanded="isPhone && activeTool === 'history'"
              :show-return-to-track="userControlledCamera && playback.frames.value.length > 0"
              @return-to-track="showTrack"
            />
            <nav class="user-map-view__history-links" aria-label="سوابق دیگر">
              <v-btn to="/_user/mission-history" variant="tonal" prepend-icon="mdi-lifebuoy">سوابق مأموریت‌ها</v-btn>
              <v-btn to="/_user/sos-history" variant="tonal" prepend-icon="mdi-alert-outline">درخواست‌های امداد</v-btn>
            </nav>
          </aside>
        </v-card-text>
      </v-card>
    </component>

    <!-- A phone's companions tool is a true fullscreen dialog, not another cramped
         bottom sheet. Desktop/tablet keep their original map-side position. -->
    <component
      :is="isPhone ? VDialog : 'div'"
      class="user-map-view__live-dialog"
      v-bind="isPhone ? phoneLiveDialogProps : {}"
      @update:model-value="onLiveDialogVisibilityChange"
    >
      <v-card class="user-map-view__live-surface" rounded="xl">
        <v-card-title v-if="isPhone" class="user-map-view__live-title">
          <h2>همراهان</h2>
          <div class="user-map-view__dialog-actions">
            <v-btn
              v-if="!broadcast.automaticActive && !missionShare.mission && !journey.navigating.value && !journey.navigationPending.value"
              :icon="broadcast.view.isActive ? 'mdi-broadcast' : 'mdi-broadcast-off'"
              :color="broadcast.view.tone === 'error' || broadcast.view.tone === 'warn' ? 'warning' : broadcast.view.isActive ? 'primary' : undefined"
              :aria-label="broadcast.view.actionLabel" :title="`${broadcast.view.headline}؛ ${broadcast.view.detail}`"
              :aria-pressed="broadcast.view.isActive"
              :disabled="!auth.user || auth.mustCompleteSecurityQuestions || !broadcast.isSupported"
              variant="text" @click="broadcast.toggle()" />
            <v-btn :icon="own.error.value || recenterError ? 'mdi-crosshairs-question' : 'mdi-crosshairs-gps'"
              :color="own.error.value || recenterError ? 'warning' : 'primary'" variant="text"
              :aria-label="recenterLabel" :title="recenterLabel" :disabled="!map || !auth.user"
              @click="focusOwnFromDialog" />
            <v-btn icon="mdi-close" variant="text" aria-label="بستن همراهان" @click="closeTool()" />
          </div>
        </v-card-title>
        <v-card-text class="user-map-view__live-body">
          <aside id="map-live-panel" v-show="mode === 'sharing'" class="user-map-view__live user-map-view__panel"
            :role="isPhone ? 'region' : undefined" aria-label="همراهان"
            tabindex="-1" @keydown.esc="onPanelEscape">
            <LiveCompanionPanel :api="live" :visible="showCompanions" :selected-user-id="selectedCompanionId"
              :broadcast-status="broadcast.view.tone === 'warn' || broadcast.view.tone === 'error' ? broadcast.view : null"
              @update:visible="showCompanions = $event" @select="selectCompanion" @create-share="shareOpen = true" />
            <p v-if="peerSelectionError" class="user-map-view__peer-error" role="status" aria-live="polite">{{ peerSelectionError }}</p>
          </aside>
        </v-card-text>
      </v-card>
    </component>

    <!-- Confirm arrival independently of route editing. Guidance and the route line
         have already stopped; audio is optional and never the only signal. -->
    <v-dialog v-model="arrivalDialogOpen" max-width="24rem" :close-on-back="false"
      aria-labelledby="map-arrival-title" aria-describedby="map-arrival-message"
      @after-enter="focusArrivalDismiss">
      <v-card class="user-map-view__arrival-card" rounded="xl" dir="rtl">
        <v-card-title id="map-arrival-title" class="user-map-view__arrival-title">
          <v-icon icon="mdi-map-marker-check" color="success" aria-hidden="true" /> رسیدن به مقصد
        </v-card-title>
        <v-card-text id="map-arrival-message" role="alert">
          به نزدیکی {{ arrivalDestination ?? 'مقصد' }} رسیدید. راهبری پایان یافت. پیش از توقف یا پیاده‌شدن،
          موقعیت و محیط واقعی را بررسی کنید.
        </v-card-text>
        <v-card-actions class="user-map-view__arrival-actions">
          <v-btn id="map-arrival-dismiss" color="primary" variant="flat" @click="closeArrivalDialog">متوجه شدم</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog :model-value="!!pendingMissionStop" max-width="28rem" :close-on-back="false"
      aria-labelledby="mission-search-stop-title" @update:model-value="(open: boolean) => { if (!open) pendingMissionStop = null; }">
      <v-card dir="rtl" rounded="xl">
        <v-card-title id="mission-search-stop-title">افزودن ایستگاه به مسیر مأموریت؟</v-card-title>
        <v-card-text>
          <bdi dir="auto">{{ pendingMissionStop?.name }}</bdi> فقط به‌عنوان ایستگاه میانی افزوده می‌شود؛ محل حادثه مقصد نهایی می‌ماند.
          <p v-if="missionActive" class="mt-2">اگر راهبری فعال باشد، برای ویرایش مسیر متوقف می‌شود.</p>
          <p v-if="missionActive && !missionShare.mission" role="status" class="mt-2">در انتظار تأیید مأموریت از سرور؛ مسیر تغییر نمی‌کند.</p>
          <p v-if="missionStopError" role="alert" class="text-error">{{ missionStopError }}</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="pendingMissionStop = null">انصراف</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!missionShare.mission" @click="addMissionStop">افزودن ایستگاه میانی</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog :model-value="!!blockedSearchReason" max-width="28rem"
      aria-labelledby="map-search-blocked-title" @update:model-value="(open: boolean) => { if (!open) blockedSearchReason = null; }">
      <v-card dir="rtl" rounded="xl">
        <v-card-title id="map-search-blocked-title">امکان تغییر مقصد نیست</v-card-title>
        <v-card-text role="alert">{{ blockedSearchReason }}</v-card-text>
        <v-card-actions><v-btn color="primary" variant="flat" @click="blockedSearchReason = null">متوجه شدم</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <ShareDialog v-model="shareOpen" :fullscreen="isPhone" @shared="onShareCreated" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { VDialog } from "vuetify/components";
import type { Map as MapLibreMap, MapMovementEvent, Marker } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import UserMissionView from "./UserMissionView.vue";
import { mapModeAvailability, type MapMode } from "@/map/map-mode-policy";
import { workspaceTabQuery } from "@/map/workspace-tab-query";
import type { ShareCreatedResult } from "@/sharing/share-form";
import { shareCreatedMessage } from "@/sharing/share-feedback";
import { useRescuerMissionShareStore } from "@/stores/rescuer-mission-share";
import { useProposalInboxStore } from "@/stores/proposal-inbox";
import HistoryPlaybackPanel from "@/components/map/HistoryPlaybackPanel.vue";
import PlaceSearchPanel from "@/components/map/PlaceSearchPanel.vue";
import { groupSearchResults, mapLabelShift, nextClusterZoom, resultCameraPadding, resultExtent } from "@/map/search-result-markers";
import { clusterAppearance, matchesSelectedSearchDestination, resultAppearance } from "@/map/search-result-presentation";
import { advanceRouteProgress, pointRouteFeatures, pointRouteOverviewPadding, pointRouteOverlayNeedsSync,
  pointRouteSelectionExtent } from "@/map/point-route-preview";
import { createNavigationAlert } from "@/map/navigation-alert";
import { previousRouteIndex } from "@/map/route-choice-snapshot";
import { transportOptions } from "@/map/transport-options";
import PointRouteSheet from "@/components/map/PointRouteSheet.vue";
import PointRouteChoicesSheet from "@/components/map/PointRouteChoicesSheet.vue";
import PointTransportChoicesSheet from "@/components/map/PointTransportChoicesSheet.vue";
import type { RouteChoice, TransportProfile } from "@/api/mission-routing";
import { createHoldToSelect, type HoldPointer } from "@/map/hold-to-select";
import { usePointRoute } from "@/composables/use-point-route";
import { decodeRoutePolyline, formatRouteDistance } from "@/sos/route-preview";
import { currentSpeedKmh, estimateRemainingRouteSeconds, formatRemainingTime, formatRemainingTimeCompact, navigationStatusAnnouncement } from "@/sos/navigation-telemetry";
import { navigationArrowBearing, navigationCameraOffset, navigationFollowZoom, type NavigationCamera } from "@/sos/navigation-follow";
import { createNavigationMarkerMotion, NAVIGATION_MOTION_MS, navigationMotionEase } from "@/sos/navigation-marker-motion";
import CompanionDetailSheet from "@/components/map/CompanionDetailSheet.vue";
import { reversePlace } from "@/api/geocoding";
import { searchUsers } from "@/api/location";
import { avatarInitial } from "@/live/avatar-initial";
import { useReversePlace } from "@/composables/use-reverse-place";
import type { GeocodeResult, ReverseGeocodeResult, UserSearchResult } from "@shared/index";
import { usePlaceSearch } from "@/composables/use-place-search";
import { placeSearchArea } from "@/map/place-search-area";
import LiveCompanionPanel from "@/components/map/LiveCompanionPanel.vue";
import ShareDialog from "@/components/sharing/ShareDialog.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { shareSessionKey } from "@/sharing/share-submission-fence";
import { mapTripSession } from "@/map/trip-session";
import { useHistoryPlayback } from "@/composables/use-history-playback";
import { historyPlaybackStyle } from "@/history/playback";
import { historyCameraKey, historyCameraPadding } from "@/history/camera-padding";
import { planPlaybackRemoval, planPlaybackSync, type PlaybackPaintSnapshot } from "@/history/playback-map-sync";
import { LIVE_BOTTOM_LAYER_ID, liveCompanionsStyle } from "@/live/companion-locations";
import { planOverlayRemoval, planOverlaySync, pointsOverlay, type OverlayOp } from "@/map/overlay-sync";
import { needsOverlayRestore } from "@/map/overlay-restore";
import { useLiveCompanions } from "@/composables/use-live-companions";
import { useOwnMapPosition } from "@/composables/use-own-map-position";
import { useAuthStore } from "@/stores/auth";
import { useBroadcastStore } from "@/stores/broadcast";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
const auth = useAuthStore();
const broadcast = useBroadcastStore();
const missionShare = useRescuerMissionShareStore();
const proposals = useProposalInboxStore();
const route = useRoute();
const router = useRouter();
const workspaceModes: { id: MapMode; label: string; icon: string }[] = [
  { id: "missions", label: "مأموریت‌ها", icon: "mdi-lifebuoy" },
  { id: "trips", label: "سفرها", icon: "mdi-routes" },
  { id: "sharing", label: "اشتراک", icon: "mdi-account-group-outline" },
  { id: "history", label: "تاریخچه", icon: "mdi-map-clock-outline" }
];
const confirmedAcceptance = ref<string | null>(null);
// Both the fullscreen offer review and the inline mission inbox share this store.
// Navigate only on a newly server-confirmed acceptance, never on a failed write,
// a stale account result or each subsequent switch between Sharing and Missions.
watch(() => proposals.acceptedMissionId, (id, previous) => {
  if (!id || id === previous || auth.user?.role !== "user" || route.path !== "/_user/map") return;
  void router.replace({ path: "/_user/map", query: workspaceTabQuery(route.query, "missions") });
}, { flush: "post" });
watch(() => missionShare.mission?.id, (id) => {
  if (id && id === proposals.acceptedMissionId) confirmedAcceptance.value = id;
}, { flush: "sync" });
// Keep the accepted assignment locked until the server verifies it; once a
// confirmed mission ends, an old inbox success banner cannot lock Trips forever.
const missionActive = computed(() => !!missionShare.mission ||
  (!!proposals.acceptedMissionId && confirmedAcceptance.value !== proposals.acceptedMissionId));
// A failed/unfinished assignment read cannot prove it is safe to create a
// trip, but it is not evidence of an active mission either. Keep Trips open;
// selectPlace/hold-to-select still block new routes until verification.
const modeAvailability = computed(() => mapModeAvailability(
  mapTripSession.navigating.value, missionActive.value,
  auth.user?.role !== "user" || missionShare.verified
));
function modeReason(id: MapMode): string {
  const label = workspaceModes.find((item) => item.id === id)?.label ?? id;
  if (id === "missions" && auth.user?.role !== "user") return `${label}؛ فقط برای امدادگر`;
  if (id === "trips" && modeAvailability.value.trips && auth.user?.role === "user" && !missionShare.verified)
    return `${label}؛ مرور آزاد است، ایجاد مسیر پس از تأیید وضعیت مأموریت`;
  if (modeAvailability.value[id]) return label;
  if (mapTripSession.navigating.value) return `${label}؛ در سفر فعال نیست. پیشنهاد مأموریت از زنگ اعلان قابل بررسی است.`;
  if (missionActive.value) return `${label}؛ در مأموریت فعال نیست`;
  return `${label}؛ وضعیت مأموریت هنوز تأیید نشده است`;
}
const requestedMode = computed(() => workspaceModes.find((item) => item.id === route.query.tab)?.id ??
  (missionActive.value ? "missions" : "trips"));
const mode = computed<MapMode>(() => {
  const candidate = requestedMode.value;
  if (modeAvailability.value[candidate] && (candidate !== "missions" || auth.user?.role === "user")) return candidate;
  if (modeAvailability.value.missions && auth.user?.role === "user") return "missions";
  return modeAvailability.value.trips ? "trips" : "sharing";
});
function chooseMode(next: MapMode): void {
  if (!modeAvailability.value[next] || (next === "missions" && auth.user?.role !== "user")) return;
  if (next === mode.value) {
    if (next === "history") void selectTool("history");
    else if (next === "sharing") void selectTool("live");
    return;
  }
  void router.push({ path: "/_user/map", query: workspaceTabQuery(route.query, next) });
}
watch(mode, (next) => {
  if (next !== "sharing") shareSuccess.value = null;
  if (next === "missions") {
    if (mapTripSession.navigating.value) clearPointRoute();
    closeTool(false);
  }
  if (next === "sharing") void selectTool("live");
  else if (next === "history") { void selectTool("history"); frameCamera(); }
  else closeTool(false);
  paintPlayback(); paintLive(); syncPeerAvatars();
  syncOwnMarker(); syncDestinationMarker(); syncRouteOriginMarker(); syncSelectedPlaceMarker(); paintPointRoute();
}, { flush: "post" });
const mapStyleUrl = computed(() => mapStyleForTheme(theme.isDark));
const mapPlaybackSession = computed(() => shareSessionKey(auth.user?.id ?? null, auth.accessToken));

// Phone search, history and companions keep their full-screen dialogs. The
// workspace tabs launch history/companions; Search has one shared map action.
type MapTool = "search" | "history" | "live";
const toolLauncherId = (tool: MapTool): string =>
  tool === "search" ? "map-tool-search" : `map-mode-${tool === "live" ? "sharing" : "history"}`;
const isPhone = useMediaQuery("(max-width: 599px)");
const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
const activeTool = ref<MapTool | null>(null);
const routeDeleteConfirmOpen = ref(false);
const routeChoicesOpen = ref(false);
const transportChoicesOpen = ref(false);
const pointSheetRef = ref<InstanceType<typeof PointRouteSheet> | null>(null);
const shareOpen = ref(false);
const shareSuccess = ref<string | null>(null);
function onShareCreated(result: ShareCreatedResult): void {
  if (!shareOpen.value) return;
  // The server confirmed this grant. Close both the share dialog and its phone
  // companion overlay so the announcement is visible on the map, not behind it.
  shareOpen.value = false;
  if (isPhone.value && activeTool.value === "live") closeTool(false);
  shareSuccess.value = shareCreatedMessage(result);
  // A new outgoing grant can change the device assigned to broadcast; do not start GPS here.
  void broadcast.refreshPriority();
}
watch(shareOpen, (open, previous) => {
  if (open) shareSuccess.value = null;
  if (!open && previous) void nextTick(() => {
    if (shareSuccess.value && isPhone.value) document.getElementById("map-share-success")?.focus({ preventScroll: true });
    else document.getElementById("map-share-location-button")?.focus();
  });
});
watch(() => auth.user?.id, () => { shareSuccess.value = null; });
// A popstate changes Vue Router's history position before route-leave guards run.
// Vuetify's overlay Back hook is not guaranteed to intercept that navigation;
// keep the map visible on the first Back and dismiss just the open tool. Ordinary
// menu/link navigation (a push) must still leave immediately unless a destructive
// confirmation is open.
let mapEntryPosition: number | undefined;
onMounted(() => {
  const position: unknown = window.history.state?.position;
  mapEntryPosition = typeof position === "number" ? position : undefined;
  // The modal no longer mounts LiveBroadcastBar; keep the map share control's
  // multi-device status fresh without starting outgoing location sharing.
  void broadcast.refreshPriority();
});
onBeforeRouteLeave(() => {
  // Signing out must always leave the private map. In particular, a route
  // chooser or delete prompt cannot cancel the login redirect after auth clears.
  if (!auth.isAuthenticated) return;
  // Never abandon a pending destructive choice through a link or browser Back,
  // even when the map was the first history entry or the screen is not a phone.
  if (routeDeleteConfirmOpen.value) { routeDeleteConfirmOpen.value = false; return false; }
  if (routeChoicesOpen.value) { closeRouteChoices(); return false; }
  if (transportChoicesOpen.value) { closeTransportChoices(); return false; }
  const position: unknown = window.history.state?.position;
  if (isPhone.value &&
    (arrivalDialogOpen.value || shareOpen.value || activeTool.value ||
      selectedCompanionId.value || journey.sheetOpen.value) && typeof position === "number" &&
    mapEntryPosition !== undefined && position < mapEntryPosition) {
    if (arrivalDialogOpen.value) closeArrivalDialog();
    else if (shareOpen.value) shareOpen.value = false;
    else if (activeTool.value) closeTool();
    else if (journey.sheetOpen.value) {
      if (!pointSheetRef.value?.returnToPoint()) journey.sheetOpen.value = false;
    } else if (selectedCompanionId.value) removeSelectedCompanion();
    return false;
  }
});

// The desktop hosts are boxless divs; only phones register Vuetify overlays.
const phoneHistoryDialogProps = computed(() => ({
  modelValue: activeTool.value === "history",
  fullscreen: true,
  scrollable: true,
  eager: true,
  // The route-leave guard consumes the first Back; a second Vuetify handler
  // would leave the map altogether rather than close History.
  closeOnBack: false,
  "aria-label": "تاریخچهٔ مسیر"
}));

// Search and workspace tabs share the same dialog state. Normalize an omitted
// selection to null and return focus to the launcher after dismissing a dialog.
async function selectTool(next: MapTool | null | undefined): Promise<void> {
  const selected = next ?? null;
  if (selected === "history" && !modeAvailability.value.history) return;
  if (selected === "history" && mode.value !== "history")
    void router.push({ path: "/_user/map", query: workspaceTabQuery(route.query, "history") });
  if (selected === "live" && mode.value !== "sharing")
    void router.push({ path: "/_user/map", query: workspaceTabQuery(route.query, "sharing") });
  const previous = activeTool.value;
  if (selected === previous) return;
  if (selected) closeNearbyResults();
  activeTool.value = selected;
  if (selected === "history") { historySuppressedAfterRouteClear.value = false; paintPlayback(); }
  await nextTick();
  if (selected) document.getElementById(`map-${selected}-panel`)?.focus();
  else if (previous) document.getElementById(toolLauncherId(previous))?.focus();
}

const phoneSearchDialogProps = computed(() => ({
  modelValue: activeTool.value === "search",
  fullscreen: true,
  scrollable: true,
  eager: true,
  // Router's first-Back guard dismisses this modal; don't traverse history twice.
  closeOnBack: false,
  "aria-label": "جست‌وجوی مکان"
}));

const phoneLiveDialogProps = computed(() => ({
  modelValue: activeTool.value === "live",
  fullscreen: true,
  scrollable: true,
  eager: true,
  // The route-leave guard dismisses the phone modal on Back. Enabling Vuetify's
  // own Back handler too makes both handlers traverse history (skipping the map).
  closeOnBack: false,
  "aria-label": "همراهان"
}));

// Keep Vuetify's dialog models in sync on other close paths.
function onHistoryDialogVisibilityChange(visible: boolean): void {
  if (!visible && activeTool.value === "history") closeTool();
}
function onSearchDialogVisibilityChange(visible: boolean): void {
  if (!visible && activeTool.value === "search") closeTool();
}
function onLiveDialogVisibilityChange(visible: boolean): void {
  if (!visible && activeTool.value === "live") closeTool();
}

function closeTool(restoreFocus = true): void {
  const tool = activeTool.value;
  if (!tool) return;
  // Search is temporary within History/Sharing. Reopen that tab's phone panel
  // on dismissal, but not when a result is selected or a mode switch closes it.
  if (tool === "search" && restoreFocus && isPhone.value && (mode.value === "history" || mode.value === "sharing")) {
    const returnTool = mode.value === "history" ? "history" : "live";
    activeTool.value = returnTool;
    void nextTick(() => document.getElementById(`map-${returnTool}-panel`)?.focus());
    return;
  }
  activeTool.value = null;
  // A search selection may open the route planner immediately afterwards.
  // Avoid moving focus back into the just-closed search dialog in that case.
  if (restoreFocus) void nextTick(() => document.getElementById(toolLauncherId(tool))?.focus());
}

function onPanelEscape(event: KeyboardEvent): void {
  if (!isPhone.value) return;
  event.stopPropagation();
  closeTool();
}

watch(isPhone, (phone) => {
  if (!phone) {
    const wasSearching = activeTool.value === "search";
    activeTool.value = null;
    // The same search panel becomes permanently visible on wide screens.
    if (wasSearching) void nextTick(() => document.getElementById('map-search-panel')?.focus({ preventScroll: true }));
  }
  fittedFor = null;
  frameCamera(); // A phone/tablet switch changes both the canvas and its reserved camera edges.
});

/**
 * History playback, wired to the map.
 *
 * The view owns the composable rather than the panel because the *map* has to follow the cursor, not a
 * control: the panel is a renderer and this file is where a `MapLibreMap` exists.
 */
const playback = useHistoryPlayback({
  accessToken: computed(() => auth.accessToken),
  ownerId: computed(() => auth.user?.id ?? null),
  ensureSession: () => auth.ensureSession(),
  refreshSession: () => auth.refreshSession()
});
const map = shallowRef<MapLibreMap | null>(null);
const workspaceMarker = shallowRef<typeof Marker | null>(null);
const missionWorkspace = ref<InstanceType<typeof UserMissionView> | null>(null);
const pendingMissionStop = shallowRef<GeocodeResult | null>(null);
const missionStopError = ref<string | null>(null);
const blockedSearchReason = ref<string | null>(null);
async function addMissionStop(): Promise<void> {
  const place = pendingMissionStop.value;
  const assignmentId = missionShare.mission?.id;
  if (!place || !assignmentId) return;
  // Make the route editor visible before mutating it, even when the result was
  // selected in Sharing. A changed/ended assignment invalidates this consent.
  if (mode.value !== "missions") await router.push({ path: "/_user/map", query: workspaceTabQuery(route.query, "missions") });
  if (pendingMissionStop.value !== place || mode.value !== "missions" || assignmentId !== missionShare.mission?.id) return;
  if (!missionWorkspace.value?.addSearchWaypoint(place.lat, place.lon)) {
    missionStopError.value = "ایستگاه افزوده نشد؛ مأموریت یا محل حادثه را دوباره بررسی کنید. مقصد حادثه تغییر نکرده است.";
    return;
  }
  pendingMissionStop.value = null;
  missionStopError.value = null;
  chooseMode("missions");
}
watch([() => auth.user?.id, () => missionShare.mission?.id], () => {
  pendingMissionStop.value = null; missionStopError.value = null; blockedSearchReason.value = null;
}, { flush: "sync" });
const own = useOwnMapPosition(computed(() => auth.user?.id ?? null));
let ownMarker: Marker | null = null;
// Animate only the visual arrow: route safety and arrival continue to use raw GPS fixes.
const ownMarkerMotion = createNavigationMarkerMotion(({ lon, lat, bearing }) => {
  ownMarker?.setLngLat([lon, lat]).setRotation(bearing);
});
let markerConstructor: typeof Marker | null = null;
let focusOnNextFix = false;
let automaticFocus = false;
const recenterError = ref<string | null>(null);
const recenterLabel = computed(() => {
  if (recenterError.value) return recenterError.value;
  if (own.error.value) return `${own.error.value} برای تلاش دوباره روی موقعیت من بزنید.`;
  if (!own.position.value) return "نمایش موقعیت من؛ پس از دریافت GPS نقشه روی من مرکز می‌شود";
  return "مرکز کردن نقشه روی موقعیت من";
});

function syncOwnMarker(freshFix = false): void {
  const instance = map.value;
  const fix = own.position.value;
  if (!instance || !fix || !markerConstructor) {
    ownMarkerMotion.reset(); ownMarker?.remove(); ownMarker = null; return;
  }
  const wasGuiding = ownMarker?.getElement().classList.contains("user-map-view__own-marker--navigating") ?? false;
  if (!ownMarker) {
    // An explicit private-GPS target, not MapLibre's default destination pin.
    // Never confuse seeing one's location with opting into outgoing sharing.
    const element = document.createElement("div");
    element.className = "user-map-view__own-marker";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "موقعیت زندهٔ من");
    element.setAttribute("title", "موقعیت من (فقط روی این دستگاه)");
    const icon = document.createElement("span");
    icon.className = "mdi mdi-crosshairs-gps user-map-view__own-marker-icon";
    icon.setAttribute("aria-hidden", "true");
    // The tip is at the top of this viewBox; MapLibre rotates the whole marker relative
    // to the map, so a 90° eastbound segment points right on a north-up map.
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.classList.add("user-map-view__direction-arrow");
    arrow.setAttribute("viewBox", "0 0 48 48");
    arrow.setAttribute("aria-hidden", "true");
    const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
    body.classList.add("user-map-view__direction-arrow__body");
    body.setAttribute("d", "M24 3 L43 41 L24 32 L5 41 Z");
    const accent = document.createElementNS("http://www.w3.org/2000/svg", "path");
    accent.classList.add("user-map-view__direction-arrow__accent");
    accent.setAttribute("d", "M24 10 L32 30 L24 26 Z");
    arrow.append(body, accent);
    element.append(icon, arrow);
    element.addEventListener("click", (event) => event.stopPropagation());
    ownMarker = new markerConstructor({ element, anchor: "center", rotationAlignment: "viewport", pitchAlignment: "viewport" })
      .setLngLat([fix.lon, fix.lat]).addTo(instance);
  }
  const reliableHeading = journey.navigating.value && !journey.navigationPending.value &&
    !journey.replanning.value && !journey.rerouteWaitingForFix.value &&
    fix.accuracy !== null && fix.accuracy <= 80 && journey.routePoints.value.length >= 2;
  // 'map' applies heading - map bearing on every camera move, including a manual compass
  // turn. The static GPS crosshair instead remains upright outside reliable guidance.
  ownMarker.setRotationAlignment(reliableHeading ? "map" : "viewport");
  ownMarkerMotion.move({ lon: fix.lon, lat: fix.lat,
    bearing: reliableHeading ? navigationArrowBearing(fix, journey.routePoints.value, journey.profile.value) : 0 },
    reliableHeading && wasGuiding && !reducedMotion.value, freshFix);
  const element = ownMarker.getElement();
  element.classList.toggle("user-map-view__own-marker--navigating", reliableHeading);
  element.classList.toggle("user-map-view__own-marker--walking", reliableHeading && journey.profile.value === "foot");
  element.classList.toggle("user-map-view__own-marker--mission", mode.value === "missions");
  element.setAttribute("title", mode.value === "missions" ? "موقعیت من روی این دستگاه؛ بدون شروع اشتراک جدید" : "موقعیت من (فقط روی این دستگاه)");
  element.setAttribute("aria-label", mode.value === "missions" ? "موقعیت من روی این دستگاه؛ مستقل از نشانگر اشتراک مأموریت" :
    reliableHeading ? "موقعیت زندهٔ من؛ جهت راهبری" :
      journey.navigating.value ? "موقعیت من؛ در انتظار مسیر و GPS دقیق" : "موقعیت زندهٔ من");
}
function centerOnOwnLocation(initiatedByUser = true): void {
  const instance = map.value;
  if (!instance) return;
  // An explicit recenter should reveal the marker instead of leaving it hidden
  // under a phone dialog. A delayed automatic fix must not close the dialog.
  if (initiatedByUser && isPhone.value && activeTool.value) closeTool(false);
  const fix = own.position.value;
  if (!fix) {
    // The button is also a retry after a denied/unavailable fix and a request to
    // center on the next fix when the watcher is still waiting.
    if (own.active.value) { focusOnNextFix = true; automaticFocus = false; }
    else startOwnLocation(false);
    return;
  }
  const bounds = instance.getMaxBounds();
  if (bounds && !bounds.contains([fix.lon, fix.lat])) {
    // Tiles are installed only for the configured local region. Never claim to
    // center on a point the bounded offline map cannot actually show.
    recenterError.value = "موقعیت من خارج از محدودهٔ نقشهٔ آفلاین است.";
    return;
  }
  recenterError.value = null;
  userControlledCamera.value = true; // A late history fetch must not pan away from the GPS fix.
  if (journey.navigating.value) { resumePointFollowing(); return; }
  instance.flyTo({ center: [fix.lon, fix.lat], zoom: Math.min(16, instance.getMaxZoom()), duration: 700 });
}
// A dialog action closes its full-screen surface before centering the map;
// return keyboard focus to the now-visible map button, not the removed header.
function focusOwnFromDialog(): void {
  centerOnOwnLocation();
  void nextTick(() => document.getElementById("map-recenter")?.focus({ preventScroll: true }));
}
function startOwnLocation(auto: boolean): void {
  focusOnNextFix = true;
  automaticFocus = auto;
  if (!own.start()) { focusOnNextFix = false; automaticFocus = false; }
  else focusOwnIfRequested(); // A native bridge may deliver the first fix synchronously.
}
function focusOwnIfRequested(): void {
  if (!focusOnNextFix || !own.position.value || !map.value) return;
  focusOnNextFix = false;
  // A slow first GPS fix must not undo a search hit or a manual map gesture.
  if (automaticFocus && userControlledCamera.value) { automaticFocus = false; return; }
  automaticFocus = false;
  centerOnOwnLocation(false); // Recenter once, not on every update.
}
watch(() => own.position.value, () => { recenterError.value = null; syncOwnMarker(true); updateRouteProgress(); focusOwnIfRequested(); });
watch(reducedMotion, () => syncOwnMarker()); // A changed accessibility preference stops a running interpolation.
watch(() => own.active.value, (active) => { if (!active) { focusOnNextFix = false; automaticFocus = false; } });
// Start only after the authenticated map is ready. Watch owner as well: the map
// can finish loading before session restoration. A denial is not auto-retried.
watch([map, () => auth.user?.id ?? null], ([instance, ownerId]) => {
  if (!instance || !ownerId || own.active.value || own.error.value) return;
  startOwnLocation(true);
}, { immediate: true });
const reverse = useReversePlace();
const navigationAlert = createNavigationAlert();
const arrivalDialogOpen = ref(false);
const arrivalDestination = ref<string | null>(null);
function closeArrivalDialog(): void { navigationAlert.cancelArrival(); arrivalDialogOpen.value = false; }
function focusArrivalDismiss(): void { document.getElementById("map-arrival-dismiss")?.focus(); }
watch(arrivalDialogOpen, (open) => {
  if (!open) navigationAlert.cancelArrival(); // Includes Escape and overlay dismissals.
  if (!open && auth.user?.id) void nextTick(() => {
    if (auth.user?.id) map.value?.getCanvas().focus({ preventScroll: true });
  });
});
watch(() => auth.user?.id, () => { arrivalDialogOpen.value = false; arrivalDestination.value = null; });
const navigationFollowEnabled = ref(true);
function followNavigationCamera(camera: NavigationCamera): void {
  if (navigationFollowEnabled.value) {
    const instance = map.value;
    if (!instance) return;
    const canvas = instance.getContainer().getBoundingClientRect();
    const bar = document.querySelector('.user-map-view__journey-bar')?.getBoundingClientRect();
    const status = document.querySelector('.user-map-view__navigation-status')?.getBoundingClientRect();
    const sheet = document.getElementById('map-point-route-sheet')?.getBoundingClientRect();
    const top = isPhone.value && journey.navigating.value ? 0 :
      Math.max(0, (bar?.bottom ?? 0) - canvas.top, (status?.bottom ?? 0) - canvas.top);
    // The guidance card is a bottom overlay on all screens now. Reserve its
    // actual covered area only when it intersects the camera target column.
    const centreX = canvas.left + canvas.width / 2;
    const navigationSheet = document.getElementById('map-navigation-sheet')?.getBoundingClientRect();
    const covered = (rect?: DOMRect | null) => !!rect && rect.left <= centreX && rect.right >= centreX && rect.top < canvas.bottom;
    const overlay = covered(sheet) ? sheet : covered(navigationSheet) ? navigationSheet : null;
    const bottom = overlay ? Math.max(56, canvas.bottom - overlay.top + (isPhone.value ? 60 : 16)) : 56;
    const offset = navigationCameraOffset(journey.profile.value, canvas.height, top, bottom);
    const pitch = Math.min(camera.pitch, instance.getMaxPitch());
    const zoom = navigationFollowZoom(journey.profile.value, camera.center[1], canvas.height, top, bottom,
      instance.getMinZoom(), instance.getMaxZoom(), pitch);
    instance.easeTo({ ...camera, duration: NAVIGATION_MOTION_MS, easing: navigationMotionEase, offset, zoom, pitch });
  }
}
const journey = usePointRoute(computed(() => auth.user?.id ?? null), own.position, own.error, reverse,
  followNavigationCamera, undefined,
  () => map.value?.easeTo({ pitch: 0, bearing: 0, duration: 450 }), () => navigationAlert.play());
// Proposals are App-owned; register only a revocable, synchronous stop callback.
// A pending Start with weak GPS is still a trip and must be ended before acceptance.
const unregisterTrip = mapTripSession.register(clearPointRoute);
watch(missionActive, (active) => {
  if (!active) return;
  // Another device may accept an offer while this tab is navigating. Private
  // trip GPS/route cannot continue underneath a newly verified mission.
  if (journey.point.value || journey.navigating.value || journey.navigationPending.value) clearPointRoute();
  pendingMissionStop.value = null;
  closeNearbyResults();
  removeSelectedCompanion();
  paintLive(); paintPlayback(); syncPeerAvatars(); syncSelectedPlaceMarker();
}, { flush: "sync" });
watch([() => journey.navigating.value, () => journey.navigationPending.value], ([active, pending]) => {
  mapTripSession.update(active || pending);
}, { flush: "sync", immediate: true });
// Arrival is a one-time GPS event. Snapshot the destination before removing the
// entire route; a second fix cannot replay the sound or reopen the planner.
watch(() => journey.arrived.value, (arrived) => {
  if (!arrived || !auth.user?.id || !journey.point.value) return;
  arrivalDestination.value = journey.title.value;
  journey.clear();
  arrivalDialogOpen.value = true;
  navigationAlert.playArrival(); // Web Audio may be blocked; the alert remains visible.
}, { flush: "post" });
// The guidance card can be teleported outside the map shell. Measure from its top
// to the viewport bottom (including its safe-area inset), so the map rail and SOS
// stay clear even when content expands or the phone rotates.
watch([isPhone, () => journey.navigating.value, () => journey.sheetOpen.value],
  async (_values, _previous, onCleanup) => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let onResize: (() => void) | undefined;
    onCleanup(() => {
      disposed = true; observer?.disconnect();
      if (onResize) window.removeEventListener("resize", onResize);
      document.documentElement.style.removeProperty("--bb-map-navigation-sheet-height");
    });
    if (!isPhone.value || !journey.navigating.value || journey.sheetOpen.value) return;
    await nextTick();
    if (disposed) return;
    const element = document.getElementById("map-navigation-sheet");
    if (!element) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--bb-map-navigation-sheet-height", `${Math.ceil(window.innerHeight - element.getBoundingClientRect().top)}px`);
      if (navigationFollowEnabled.value && journey.navigating.value) journey.focus();
    };
    update();
    observer = new ResizeObserver(update);
    observer.observe(element);
    onResize = update;
    window.addEventListener("resize", onResize);
  }, { flush: "post" });
// The planner and the route/vehicle choice sheets are mutually exclusive.
// Keep SOS and the map controls ABOVE whichever in-map phone sheet is visible.
// React to async route results and safe-area changes without guessing a height.
function pointSheetId(): string {
  return transportChoicesOpen.value ? "map-point-transport-choices-sheet"
    : routeChoicesOpen.value ? "map-point-route-choices-sheet" : "map-point-route-sheet";
}
function measurePointSheet(): void {
  if (!isPhone.value || !journey.point.value || !journey.sheetOpen.value) return;
  const element = document.getElementById(pointSheetId());
  if (element) document.documentElement.style.setProperty("--bb-map-point-sheet-height",
    `${Math.ceil(element.getBoundingClientRect().height)}px`);
}
watch([isPhone, () => journey.point.value, () => journey.sheetOpen.value, routeChoicesOpen, transportChoicesOpen],
  async (_values, _previous, onCleanup) => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    onCleanup(() => {
      disposed = true; observer?.disconnect();
      document.documentElement.style.removeProperty("--bb-map-point-sheet-height");
    });
    if (!isPhone.value || !journey.point.value || !journey.sheetOpen.value) return;
    await nextTick();
    // The in-map standard sheet renders on the next Vue tick; a second tick
    // also covers a same-frame swap from the planner to the route chooser.
    await nextTick();
    if (disposed) return;
    const element = document.getElementById(pointSheetId());
    if (!element) return;
    measurePointSheet();
    observer = new ResizeObserver(measurePointSheet);
    observer.observe(element);
  }, { flush: "post" });

// Recheck freshness even when the device stops sending fixes silently. No persistent GPS
// samples or speed-limit guesses; stopping guidance tears down the ticker.
const telemetryNow = ref(Date.now());
watch(() => journey.navigating.value, (active, _previous, onCleanup) => {
  if (!active) return;
  telemetryNow.value = Date.now();
  const ticker = setInterval(() => { telemetryNow.value = Date.now(); }, 5_000);
  onCleanup(() => clearInterval(ticker));
}, { immediate: true });
watch(() => own.lastFixAt.value, () => { telemetryNow.value = Date.now(); });
const liveSpeedKmh = computed(() => currentSpeedKmh(own.position.value, own.lastFixAt.value, telemetryNow.value));
const remainingSeconds = computed(() => {
  if (!journey.navigating.value || journey.navigationPending.value || journey.replanning.value ||
    journey.rerouteWaitingForFix.value || journey.gpsWarning.value || journey.remaining.value === null ||
    !journey.selectedRoute.value || !own.position.value || own.lastFixAt.value === null ||
    telemetryNow.value < own.lastFixAt.value || telemetryNow.value - own.lastFixAt.value > 15_000) return null;
  return estimateRemainingRouteSeconds(own.position.value, journey.routePoints.value,
    journey.selectedRoute.value.duration_s, journey.profile.value);
});
// Reverse-geocode the exact request origin only while its route details are open.
// Cancel old reads on reroute, dismissal or account clear; never display a stale origin.
const originReverse = useReversePlace();
watch([() => journey.plannedFrom.value, () => journey.sheetOpen.value], ([origin, open]) => {
  if (!open || !origin) { originReverse.close(); return; }
  const current = originReverse.point.value;
  if (current?.lat === origin.lat && current.lon === origin.lon) return;
  originReverse.select(origin.lat, origin.lon);
}, { flush: "sync" });
// Do not make the changing distance a live region: announce the guidance phase only.
const journeyAnnouncement = computed(() => navigationStatusAnnouncement({
  navigationPending: journey.navigationPending.value,
  calculating: journey.loading.value,
  replanning: journey.replanning.value,
  waitingForFix: journey.rerouteWaitingForFix.value,
  remainingMetres: journey.remaining.value,
  hasPosition: !!own.position.value
}));
const journeyBarLabel = computed(() => {
  if (!journey.navigating.value) return journey.title.value;
  if (journey.navigationPending.value) return journey.loading.value
    ? "در حال محاسبهٔ مسیر…" : "در انتظار GPS برای محاسبهٔ مسیر…";
  if (journey.replanning.value) return "در حال محاسبهٔ مسیر تازه…";
  if (journey.rerouteWaitingForFix.value) return "منتظر GPS دقیق برای مسیر تازه…";
  if (journey.remaining.value === null) return own.position.value
    ? "GPS دقیق نیست؛ فاصلهٔ باقیمانده نامشخص است" : "در انتظار GPS؛ موقعیت زنده در دسترس نیست";
  return `فاصلهٔ مستقیم تا مقصد: ${formatRouteDistance(journey.remaining.value)}`;
});
let destinationMarker: Marker | null = null;
let routeOriginMarker: Marker | null = null;
let detachHold: (() => void) | null = null;
const ROUTE_SOURCE = "user-selected-destination-route";
const ROUTE_LAYER = "user-selected-destination-route-line";
const ROUTE_ALT_LAYER = "user-selected-destination-route-alternatives";
const ROUTE_COMPLETED_LAYER = "user-selected-destination-route-completed";
let routePaintDeferred = false;
const routeGeometries = computed(() => journey.routes.value.map((route) => decodeRoutePolyline(route.polyline)));
let progressRoute: RouteChoice | null = null;
let completedRouteMetres = 0;
let routeChoiceSnapshot: { routes: typeof journey.routes.value; index: number } | null = null;
watch(() => journey.routes.value, (routes) => {
  // A newly calculated batch has its own default route. Treat that as the
  // cancel baseline before previewing alternatives from the fresh response.
  if (routeChoicesOpen.value) routeChoiceSnapshot = { routes, index: journey.index.value };
}, { flush: "post" });
function openRouteChoices(): void {
  if (routeChoicesOpen.value) { closeRouteChoices(); return; }
  if (!journey.point.value || routeDeleteConfirmOpen.value) return;
  transportChoicesOpen.value = false; // Only one nonmodal choice sheet may cover the planner.
  // Editing an active route pauses guidance explicitly; no mid-trip silent switch.
  if (journey.navigating.value) journey.editNavigation();
  journey.sheetOpen.value = true;
  journey.routesVisible.value = true;
  routeChoiceSnapshot = { routes: journey.routes.value, index: journey.index.value };
  routeChoicesOpen.value = true;
  void nextTick(() => {
    const selected = document.querySelector<HTMLElement>('.point-route-choices__card[aria-pressed="true"]') ??
      document.querySelector<HTMLElement>('.point-route-choices__card') ??
      document.getElementById('map-point-route-choices-sheet');
    selected?.focus({ preventScroll: true });
  });
}
function closeRouteChoices(): void {
  if (!routeChoicesOpen.value) return;
  routeChoicesOpen.value = false;
  // Back/close cancels the preview, but never restores an old index into a
  // replaced route batch (e.g. after GPS or connection recovery).
  const previous = previousRouteIndex(routeChoiceSnapshot, journey.routes.value);
  routeChoiceSnapshot = null;
  if (previous !== null) journey.choose(previous);
  if (!journey.point.value) return;
  journey.sheetOpen.value = true;
  void nextTick(() => document.getElementById('map-point-route-sheet')?.focus({ preventScroll: true }));
}
function selectPointRoute(index: number): void {
  if (!routeChoicesOpen.value || !journey.point.value || !journey.routes.value[index] ||
    !Number.isInteger(index)) return;
  journey.choose(index); // Preview the green line and metrics without dismissing the chooser.
}
function confirmPointRoute(): void {
  if (!routeChoicesOpen.value || !journey.point.value || !journey.selectedRoute.value ||
    journey.loading.value) return;
  routeChoiceSnapshot = null; // Accept the preview; close without restoring the old index.
  closeRouteChoices();
}
function openTransportChoices(): void {
  if (!journey.point.value || !journey.sheetOpen.value || routeDeleteConfirmOpen.value) return;
  if (routeChoicesOpen.value) closeRouteChoices();
  transportChoicesOpen.value = true;
  void nextTick(() => {
    const selected = document.querySelector<HTMLElement>('.point-transport-choices__card[aria-pressed="true"]') ??
      document.getElementById('map-point-transport-choices-sheet');
    selected?.focus({ preventScroll: true });
  });
}
function closeTransportChoices(): void {
  if (!transportChoicesOpen.value) return;
  transportChoicesOpen.value = false;
  if (!journey.point.value) return;
  journey.sheetOpen.value = true;
  void nextTick(() => document.getElementById('map-point-route-sheet')?.focus({ preventScroll: true }));
}
function confirmTransportChoice(mode: TransportProfile): void {
  if (!transportChoicesOpen.value || !journey.point.value ||
    !transportOptions.some((option) => option.value === mode)) return;
  // A draft never starts a routing request. Accepting a different mode cancels
  // the old route and calculates new alternatives through usePointRoute.
  if (mode !== journey.profile.value) journey.changeProfile(mode);
  closeTransportChoices();
}
function openRouteSearch(): void { void selectTool("search"); }
function backToTravelPlan(): void {
  journey.editNavigation(); // Pauses guidance before editing the route or transport.
  void nextTick(() => document.getElementById("map-point-route-sheet")?.focus({ preventScroll: true }));
}
function clearPointRoute(): void {
  routeChoicesOpen.value = false;
  transportChoicesOpen.value = false;
  routeChoiceSnapshot = null;
  journey.clear(); // Also cancels any in-flight route/replan and removes both endpoint pins.
  focusDestinationMarker();
}
function focusDestinationMarker(): void {
  void nextTick(() => (destinationMarker?.getElement() ?? map.value?.getCanvas())?.focus({ preventScroll: true }));
}
const placeSearch = usePlaceSearch({
  area: (scope) => {
    // Mission cameras are intentionally unbounded; search its visible extent
    // instead of disabling the shared widget when getMaxBounds() is null.
    const library = map.value?.getMaxBounds() ?? map.value?.getBounds() ?? null;
    return placeSearchArea(library, scope === "viewport" ? map.value?.getBounds() ?? null : library);
  }
});
// Confirmed X, Stop/reset and arrival all clear the route through different
// paths. Drop the old search highlight only when the route actually settles at
// no destination; select() briefly clears before installing a new point.
watch(() => journey.point.value, (point) => {
  if (!point) placeSearch.deselect();
});
let fittedFor: string | null = null;
const userControlledCamera = ref(false);
// A removed navigation line must not appear to survive because the teal history track
// immediately repaints underneath it. History remains available on explicit request.
const historySuppressedAfterRouteClear = ref(false);
let selectedPlaceMarker: Marker | null = null;
const resultMarkers = new Map<string, Marker>();
const resultClusterMarkers = new Map<string, Marker>();
const showAllResultsOnMap = placeSearch.mapActive;
const nearbyResultIds = ref<string[]>([]);
const nearbyPlaces = computed(() => showAllResultsOnMap.value ? nearbyResultIds.value
  .map(id => placeSearch.mapResults.value.find(hit => hit.placeId === id))
  .filter((hit): hit is GeocodeResult => !!hit) : []);
let nearbyReturnFocus: HTMLElement | null = null;
let nearbyFocusGeneration = 0;
const clusterZoomAnnouncement = ref("");
let clusterKeyboardFocus: { button: HTMLElement; ids: string[]; instance: MapLibreMap } | null = null;
function closeNearbyResults(restoreFocus = false): void {
  nearbyResultIds.value = [];
  const target = nearbyReturnFocus;
  nearbyReturnFocus = null;
  const generation = ++nearbyFocusGeneration;
  if (restoreFocus) void nextTick(() => {
    // A selection or tool switch can dismiss this chooser again before focus returns.
    if (generation !== nearbyFocusGeneration) return;
    if (target?.isConnected) target.focus();
    else (document.getElementById("map-tool-search") ?? document.getElementById("map-search-panel"))?.focus();
  });
}
function openNearbyResults(ids: string[], button: HTMLElement): void {
  if (!showAllResultsOnMap.value || ids.length < 2 ||
      ids.some(id => !placeSearch.mapResults.value.some(hit => hit.placeId === id))) return;
  nearbyFocusGeneration++;
  nearbyResultIds.value = ids;
  nearbyReturnFocus = button;
  void nextTick(() => document.getElementById("map-nearby-results")?.focus());
}
function activateResultCluster(ids: string[], button: HTMLElement, keyboard: boolean): void {
  const instance = map.value;
  const key = JSON.stringify(ids);
  const marker = resultClusterMarkers.get(key);
  // A camera move, query change or map replacement may have invalidated this button.
  if (!instance || !auth.user?.id || !showAllResultsOnMap.value ||
      !marker || marker.getElement() !== button ||
      ids.some(id => !placeSearch.mapResults.value.some(hit => hit.placeId === id))) return;
  const zoom = nextClusterZoom(instance.getZoom(), instance.getMaxZoom());
  if (zoom === null) {
    openNearbyResults(ids, button);
    return;
  }
  const center = marker.getLngLat(); // Anchor is an actual place nearest the group's screen center.
  const bounds = instance.getMaxBounds();
  if (bounds && !bounds.contains(center)) return;
  closeNearbyResults();
  clusterKeyboardFocus = keyboard ? { button, ids, instance } : null;
  clusterZoomAnnouncement.value = `بزرگ‌نمایی روی ${ids.length.toLocaleString("fa-IR")} مکان نزدیک؛ سطح ${zoom.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}`;
  userControlledCamera.value = true;
  if (journey.navigating.value) navigationFollowEnabled.value = false;
  instance.easeTo({ center: [center.lng, center.lat], zoom, duration: 450 }, { placeSearchSelection: true });
}
function restoreClusterKeyboardFocus(): void {
  const pending = clusterKeyboardFocus;
  clusterKeyboardFocus = null;
  if (!pending) return;
  void nextTick(() => {
    if (map.value !== pending.instance || pending.button.isConnected || document.activeElement !== document.body) return;
    const firstVisible = pending.ids.map(id => resultMarkers.get(id)?.getElement()).find(element => element?.isConnected);
    (firstVisible ?? pending.instance.getCanvas()).focus({ preventScroll: true });
  });
}
function chooseNearbyResult(place: GeocodeResult): void {
  // A viewport change may have replaced the snapshot after the chooser opened.
  const current = placeSearch.mapResults.value.find(hit => hit.placeId === place.placeId);
  if (!current || current !== place) return;
  closeNearbyResults();
  selectPlace(current, true);
}
// Only an explicit Show All request during guidance exposes POI pins. A follow
// restart hides them again so they cannot clutter the live route or linger.
const showNavigationSearchResults = ref(false);
function clearResultMarkers(): void {
  clusterKeyboardFocus = null;
  clusterZoomAnnouncement.value = "";
  for (const marker of resultMarkers.values()) marker.remove();
  resultMarkers.clear();
  for (const marker of resultClusterMarkers.values()) marker.remove();
  resultClusterMarkers.clear();
  closeNearbyResults();
}
function positionResultTooltip(button: HTMLElement, instance: MapLibreMap): void {
  const tooltip = button.querySelector<HTMLElement>(".user-map-view__result-marker__tooltip");
  if (!tooltip) return;
  const canvas = instance.getCanvas().getBoundingClientRect();
  // The map viewport (not the whole browser) clips markers. Keep long titles
  // readable at its edges without moving or resizing the pin itself.
  button.style.setProperty("--result-tooltip-map-width", `${Math.max(44, canvas.width - 16)}px`);
  button.classList.remove("user-map-view__result-marker--tooltip-below");
  button.style.removeProperty("--result-tooltip-shift");
  if (tooltip.getBoundingClientRect().top < canvas.top + 8)
    button.classList.add("user-map-view__result-marker--tooltip-below");
  const rect = tooltip.getBoundingClientRect();
  const shift = mapLabelShift(rect.left, rect.right, canvas.left, canvas.right);
  button.style.setProperty("--result-tooltip-shift", `${shift}px`);
}
function positionSelectedPlaceLabel(marker: Marker | null, instance: MapLibreMap): void {
  if (!marker) return;
  const element = marker.getElement();
  const label = element.querySelector<HTMLElement>(".user-map-view__selected-place-label");
  if (!label || label.hidden) return;
  const canvas = instance.getCanvas().getBoundingClientRect();
  element.style.setProperty("--selected-label-map-width", `${Math.max(44, canvas.width - 16)}px`);
  element.classList.remove("user-map-view__selected-place--label-below");
  element.style.removeProperty("--selected-label-shift");
  if (label.getBoundingClientRect().top < canvas.top + 8)
    element.classList.add("user-map-view__selected-place--label-below");
  const rect = label.getBoundingClientRect();
  element.style.setProperty("--selected-label-shift", `${mapLabelShift(rect.left, rect.right, canvas.left, canvas.right)}px`);
}
function positionSelectedPlaceLabels(): void {
  const instance = map.value;
  if (!instance) return;
  positionSelectedPlaceLabel(selectedPlaceMarker, instance);
  if (isSelectedSearchDestination.value && !journey.navigating.value)
    positionSelectedPlaceLabel(destinationMarker, instance);
}
function syncResultMarkers(): void {
  const instance = map.value;
  const places = showAllResultsOnMap.value && (!journey.navigating.value || showNavigationSearchResults.value) &&
    instance && markerConstructor && auth.user?.id
    ? placeSearch.mapResults.value : [];
  // The selected result has a named callout or an amber route pin, except in
  // the explicit navigation overview where it is still a search result.
  const excludedId = journey.navigating.value && showNavigationSearchResults.value && !isSelectedSearchDestination.value
    ? null : placeSearch.selectedPlaceId.value;
  const visiblePlaces = places.filter(place => place.placeId !== excludedId);
  const rem = typeof document === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  // Compact icon pins occupy ~48px; count bubbles are 54px. Only genuinely
  // close hits should collapse, not every pair of once-wide text callouts.
  const chipWidth = Math.max(56, rem * 3.5);
  const chipHeight = chipWidth;
  const groups = instance ? groupSearchResults(visiblePlaces,
    place => instance.project([place.lon, place.lat]), chipWidth, chipHeight) : [];
  const singles = new Set(groups.filter(group => group.length === 1).map(group => group[0]!.placeId));
  const clusters = new Set(groups.filter(group => group.length > 1).map(group => JSON.stringify(group.map(hit => hit.placeId))));
  for (const [id, marker] of resultMarkers) {
    if (!singles.has(id)) { marker.remove(); resultMarkers.delete(id); }
  }
  for (const [key, marker] of resultClusterMarkers) {
    if (!clusters.has(key)) { marker.remove(); resultClusterMarkers.delete(key); }
  }
  if (nearbyResultIds.value.length && !groups.some(group => group.length > 1 &&
      JSON.stringify(group.map(hit => hit.placeId)) === JSON.stringify(nearbyResultIds.value))) closeNearbyResults(true);
  if (!instance || !markerConstructor) return;
  for (const group of groups) {
    if (group.length > 1) {
      const key = JSON.stringify(group.map(hit => hit.placeId));
      // Place the count on an actual result nearest the screen-space center,
      // not at an invented coordinate or the far end of a collision chain.
      const points = group.map(hit => instance.project([hit.lon, hit.lat]));
      const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length,
        y: sum.y + point.y / points.length }), { x: 0, y: 0 });
      const anchorIndex = points.reduce((best, point, index) =>
        Math.hypot(point.x - center.x, point.y - center.y) <
        Math.hypot(points[best]!.x - center.x, points[best]!.y - center.y) ? index : best, 0);
      const place = group[anchorIndex]!;
      let marker = resultClusterMarkers.get(key);
      if (!marker) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "user-map-view__result-cluster";
        button.dir = "rtl";
        const count = document.createElement("span");
        count.className = "user-map-view__result-cluster__count";
        count.setAttribute("aria-hidden", "true");
        button.append(count);
        button.addEventListener("click", event => {
          event.stopPropagation();
          activateResultCluster(group.map(hit => hit.placeId), button, event.detail === 0);
        });
        button.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        });
        marker = new markerConstructor({ element: button, anchor: "bottom", offset: [0, -6] })
          .setLngLat([place.lon, place.lat]).addTo(instance);
        resultClusterMarkers.set(key, marker);
      } else marker.setLngLat([place.lon, place.lat]);
      const button = marker.getElement();
      const canZoom = nextClusterZoom(instance.getZoom(), instance.getMaxZoom()) !== null;
      button.setAttribute("aria-label", `${group.length.toLocaleString("fa-IR")} نتیجهٔ نزدیک؛ ${canZoom ? "بزرگ‌نمایی روی مکان‌ها" : "نمایش فهرست مکان‌ها"}`);
      if (canZoom) {
        button.removeAttribute("aria-haspopup");
        button.removeAttribute("aria-controls");
      } else {
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-controls", "map-nearby-results");
      }
      const count = button.querySelector<HTMLElement>(".user-map-view__result-cluster__count");
      if (count) count.textContent = `+${group.length.toLocaleString("fa-IR")}`;
      button.style.setProperty("--result-color", clusterAppearance(group).color);
      continue;
    }
    const place = group[0]!;
    let marker = resultMarkers.get(place.placeId);
    if (!marker) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "user-map-view__result-marker";
      button.dir = "rtl";
      button.setAttribute("aria-controls", "map-point-route-sheet");
      const icon = document.createElement("span");
      icon.className = "user-map-view__result-marker__icon mdi";
      icon.setAttribute("aria-hidden", "true");
      const tooltip = document.createElement("bdi");
      tooltip.className = "user-map-view__result-marker__tooltip";
      tooltip.dir = "auto";
      tooltip.setAttribute("aria-hidden", "true"); // The button already names the place for assistive technology.
      button.append(icon, tooltip);
      button.addEventListener("pointerenter", () => positionResultTooltip(button, instance));
      button.addEventListener("focus", () => positionResultTooltip(button, instance));
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        // Never act on a captured hit after a viewport request invalidated it.
        const currentPlace = placeSearch.mapResults.value.find(hit => hit.placeId === place.placeId);
        if (showAllResultsOnMap.value && currentPlace) selectPlace(currentPlace, true);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }); // Native button activation; Tab still moves focus.
      marker = new markerConstructor({ element: button, anchor: "bottom", offset: [0, -6] })
        .setLngLat([place.lon, place.lat]).addTo(instance);
      resultMarkers.set(place.placeId, marker);
    } else marker.setLngLat([place.lon, place.lat]);
    const button = marker.getElement();
    const appearance = resultAppearance(place);
    button.style.setProperty("--result-color", appearance.color);
    button.setAttribute("aria-label", `${appearance.label}: ${place.name}، ${place.address}؛ انتخاب مقصد`);
    const icon = button.querySelector<HTMLElement>(".user-map-view__result-marker__icon");
    if (icon) icon.className = `user-map-view__result-marker__icon mdi ${appearance.icon}`;
    const tooltip = button.querySelector<HTMLElement>(".user-map-view__result-marker__tooltip");
    if (tooltip) tooltip.textContent = place.name; // No address or other details in the hover label.
    if (button.matches(":hover, :focus-visible")) positionResultTooltip(button, instance);
  }
}
async function showAllSearchResults(): Promise<void> {
  const instance = map.value;
  if (!instance || !markerConstructor || !auth.user?.id) return;
  const bounds = instance.getMaxBounds();
  if (bounds && placeSearch.results.value.some(place => !bounds.contains([place.lon, place.lat]))) return;
  if (!placeSearch.showOnMap()) return;
  closeNearbyResults();
  const places = placeSearch.mapResults.value;
  if (bounds && places.some(place => !bounds.contains([place.lon, place.lat]))) return;
  const extent = resultExtent(places);
  if (!extent) return;
  if (journey.navigating.value) showNavigationSearchResults.value = true;
  syncResultMarkers();
  userControlledCamera.value = true;
  if (journey.navigating.value) {
    navigationFollowEnabled.value = false; // Keep the result overview until the user explicitly resumes following.
    if (isPhone.value && activeTool.value === "search") closeTool(false);
    await nextTick(); // Fit to the compact sheet, not the tall search-results surface.
    if (map.value !== instance || !journey.navigating.value) return;
  }
  const container = instance.getContainer();
  const padding = resultCameraPadding(container.clientWidth, container.clientHeight, isPhone.value);
  if (isPhone.value && journey.navigating.value) {
    const sheet = document.getElementById("map-navigation-sheet")?.getBoundingClientRect();
    if (sheet) padding.bottom = Math.min(container.clientHeight - padding.top - 32,
      Math.max(padding.bottom, container.getBoundingClientRect().bottom - sheet.top + 60));
  }
  instance.fitBounds(extent, {
    padding,
    maxZoom: 15, duration: 700
  }, { placeSearchSelection: true }); // Framing must not requery its own viewport.
  if (isPhone.value && activeTool.value === "search") closeTool(false);
}
const selectedSearchPlace = computed(() => placeSearch.results.value.find(
  result => result.placeId === placeSearch.selectedPlaceId.value) ??
  placeSearch.mapResults.value.find(result => result.placeId === placeSearch.selectedPlaceId.value) ?? null);
// The route pin owns this OSM place at the same coordinates even when a later
// search refresh changes its name/address/category. The route retains its own
// selected-place snapshot; never stack a second pin over the same destination.
const isSelectedSearchDestination = computed(() => matchesSelectedSearchDestination(
  selectedSearchPlace.value, journey.knownPlace.value, journey.point.value));

function openSelectedPlaceRoute(): void {
  if (selectedSearchPlace.value) selectPlace(selectedSearchPlace.value, true);
}
function syncSelectedPlaceMarker(): void {
  const instance = map.value;
  // The amber route pin owns this POI during navigation; do not stack two pins.
  const place = journey.navigating.value ? null : isSelectedSearchDestination.value ? null : selectedSearchPlace.value;
  if (!instance || !markerConstructor || !place) {
    selectedPlaceMarker?.remove();
    selectedPlaceMarker = null;
    return;
  }
  // Selected POI stays distinct from the optional set of category result pins.
  // Marker is supplied by MapCanvas after its lazy MapLibre import; no eager map chunk here.
  if (!selectedPlaceMarker) {
    selectedPlaceMarker = new markerConstructor({ color: "#dc483e" })
      .setLngLat([place.lon, place.lat]).addTo(instance);
    const element = selectedPlaceMarker.getElement();
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.classList.add("user-map-view__selected-place");
    const label = document.createElement("bdi");
    label.className = "user-map-view__selected-place-label";
    label.dir = "auto";
    element.append(label);
    element.addEventListener("click", (event) => { event.stopPropagation(); openSelectedPlaceRoute(); });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); event.stopPropagation(); openSelectedPlaceRoute();
    });
  } else selectedPlaceMarker.setLngLat([place.lon, place.lat]);
  const element = selectedPlaceMarker.getElement();
  const station = !!missionShare.mission;
  const awaitingMission = missionActive.value && !station;
  const exploring = mode.value === "missions" && !missionActive.value;
  const blockedTrip = !station && !awaitingMission && !exploring &&
    (journey.navigating.value || journey.navigationPending.value || (auth.user?.role === "user" && !missionShare.verified));
  const controls = station || awaitingMission ? "mission-search-stop-title" :
    exploring || blockedTrip ? null : "map-point-route-sheet";
  if (controls) element.setAttribute("aria-controls", controls);
  else element.removeAttribute("aria-controls");
  element.setAttribute("aria-label", `مکان انتخاب‌شده: ${place.name}؛ ${station ? "پیشنهاد ایستگاه میانی" :
    awaitingMission ? "در انتظار تأیید مأموریت" : exploring ? "نمایش مکان روی نقشه" :
      blockedTrip ? "تغییر مقصد فعلاً ممکن نیست" : "نمایش مسیر"}`);
  // DOM text, never HTML or a hover-only/native tooltip.
  const label = selectedPlaceMarker.getElement().querySelector<HTMLElement>(".user-map-view__selected-place-label");
  if (label) label.textContent = place.name;
  positionSelectedPlaceLabel(selectedPlaceMarker, instance);
}
watch(() => isSelectedSearchDestination.value, () => { syncSelectedPlaceMarker(); syncDestinationMarker(); });
watch([() => missionShare.verified, () => journey.navigating.value, () => journey.navigationPending.value],
  syncSelectedPlaceMarker, { flush: "sync" });
watch(() => placeSearch.selectedPlaceId.value, () => {
  syncSelectedPlaceMarker();
  syncDestinationMarker();
  syncResultMarkers();
}, { flush: "sync" });
watch(() => placeSearch.mapResults.value, () => {
  syncResultMarkers();
  syncSelectedPlaceMarker();
}, { flush: "sync" });
watch(() => placeSearch.results.value, syncSelectedPlaceMarker, { flush: "sync" });

function selectPlace(place: GeocodeResult, fromMap = false): void {
  const instance = map.value;
  if (!instance) return;
  // A map restricted to an installed region would silently clamp a hit outside that region.
  const bounds = instance.getMaxBounds();
  if (bounds && !bounds.contains([place.lon, place.lat])) return;
  // A prior result with the same ID is not proof that this captured card is current.
  const current = placeSearch.results.value.find(hit => hit.placeId === place.placeId) ??
    (showAllResultsOnMap.value ? placeSearch.mapResults.value.find(hit => hit.placeId === place.placeId) : null);
  if (current !== place) return;
  // Search must not clear an active/pending trip (select() calls clear()), or
  // create a personal trip before the assignment read has verified its state.
  // Keep the current route and camera unchanged; the dialog explains recovery.
  if (!missionActive.value && mode.value !== "missions" && auth.user?.role === "user" && !missionShare.verified) {
    blockedSearchReason.value = "وضعیت مأموریت هنوز از سرور تأیید نشده است. پس از تأیید، مکان را دوباره انتخاب کنید؛ سفر یا مسیر فعلی تغییر نکرده است.";
    return;
  }
  if (!missionActive.value && mode.value !== "missions" && (journey.navigating.value || journey.navigationPending.value)) {
    blockedSearchReason.value = "سفر فعلی فعال است. برای تغییر مقصد، ابتدا از بخش سفرها «پایان سفر» را انتخاب کنید؛ مسیر فعلی حفظ شده است.";
    return;
  }
  if (!placeSearch.select(place)) return;
  closeNearbyResults();
  userControlledCamera.value = true;
  // MapLibre forwards eventData to moveend. This camera flight must keep the other search
  // results selectable; an actual pan/zoom afterwards will refresh the visible-bbox search.
  // Leave the selected pin in the visible map area above the compact route panel.
  const offsetY = isPhone.value ? -Math.min(150, Math.round(window.innerHeight * 0.22)) : 0;
  // A marker tap keeps the user's zoom; list selection still zooms in explicitly.
  const zoom = fromMap ? instance.getZoom() : Math.min(16, instance.getMaxZoom());
  instance.flyTo({ center: [place.lon, place.lat], zoom, offset: [0, offsetY], duration: 700 },
    { placeSearchSelection: true });
  // Dismiss the full-screen search before opening route choices over the map.
  // Keep results mounted; a later query refresh must not change this destination.
  if (isPhone.value && activeTool.value === "search") closeTool(false);
  removeSelectedCompanion();
  if (missionActive.value || mode.value === "missions") {
    // With no assignment, Search is still useful for exploring the shared map;
    // do not open a waypoint confirmation whose action cannot be taken.
    if (!missionActive.value && !missionShare.mission) return;
    // A search result can only propose a stop, never replace the incident.
    // An explicit confirmation controls every mutation of the mission route.
    pendingMissionStop.value = place;
    missionStopError.value = null;
    return;
  }
  journey.select({ lat: place.lat, lon: place.lon }, place);
  // History and Sharing have no trip planner. A non-mission place result opens
  // Trips explicitly rather than leaving a selected destination behind a hidden sheet.
  const changeTab = mode.value !== "trips";
  const tripReady = changeTab
    ? router.push({ path: "/_user/map", query: workspaceTabQuery(route.query, "trips") })
    : Promise.resolve();
  // The source marker or cluster dialog disappears as soon as this result is
  // selected. Do not strand keyboard focus on body, and never steal it if a
  // different destination or map replaces this one before the sheet renders.
  if (fromMap || changeTab) void tripReady.then(() => nextTick(() => {
    if (map.value === instance && mode.value === "trips" && journey.sheetOpen.value &&
        matchesSelectedSearchDestination(place, journey.knownPlace.value, journey.point.value))
      document.getElementById("map-point-route-sheet")?.focus({ preventScroll: true });
  }));
}

const playbackStyle = computed(() => historyPlaybackStyle(theme.isDark));

/**
 * Live companion markers (T2.1.8): the peer positions the socket hands us, painted from the same planner
 * playback uses so the two overlays agree on ordering and on teardown.
 */
const live = useLiveCompanions({
  accessToken: computed(() => auth.accessToken),
  ensureSession: () => auth.refreshSession(),
  // The server echoes an accepted fix into the sender's own room, so without our own id a user who is
  // both broadcasting and receiving would draw themselves as one of their own companions.
  ownUserId: computed(() => auth.user?.id ?? null)
});
const liveStyle = computed(() => liveCompanionsStyle(theme.isDark));
const showCompanions = ref(true);
const emptyCompanionOverlay = pointsOverlay([]);
const selectedCompanionId = ref<string | null>(null);
const peerSelectionError = ref<string | null>(null);
// This is a selection of an active inbound grant, not an arbitrary public-search result.
// Never retain a peer's profile/address after that grant or the account goes away.
const selectedCompanion = computed(() => {
  const userId = selectedCompanionId.value;
  return userId && showCompanions.value && live.registry.value[userId]
    ? live.peers.value.find((peer) => peer.userId === userId) ?? null : null;
});
const selectedObservedAtMs = computed(() => selectedCompanionId.value
  ? live.registry.value[selectedCompanionId.value]?.fix?.observedAtMs ?? null : null);
const selectedProfile = shallowRef<UserSearchResult | null>(null);
const selectedPlace = shallowRef<ReverseGeocodeResult | null>(null);
const profileLoading = ref(false);
const profileFailed = ref(false);
const placeLoading = ref(false);
const placeFailed = ref(false);
let profileController: AbortController | null = null;
let placeController: AbortController | null = null;
const peerMarkers = new Map<string, Marker>();

function removeSelectedCompanion(): void {
  selectedCompanionId.value = null;
  for (const marker of peerMarkers.values()) {
    marker.getElement().setAttribute("aria-pressed", "false");
    marker.getElement().setAttribute("aria-expanded", "false");
    marker.getElement().classList.remove("user-map-view__peer-avatar--selected");
  }
  profileController?.abort();
  profileController = null;
  placeController?.abort();
  placeController = null;
  selectedProfile.value = null;
  selectedPlace.value = null;
  profileLoading.value = false;
  placeLoading.value = false;
  profileFailed.value = false;
  placeFailed.value = false;
}

function syncSelectedCompanion(): void {
  const userId = selectedCompanionId.value;
  if (!userId) return;
  if (!live.registry.value[userId] || !live.peers.value.some((peer) => peer.userId === userId) ||
      !showCompanions.value || !map.value || !auth.user?.id) removeSelectedCompanion();
}

/** An ID match is mandatory: search is public and the result order/name is not an authorization grant. */
async function loadSelectedProfile(): Promise<void> {
  profileController?.abort();
  profileController = null;
  selectedProfile.value = null;
  profileFailed.value = false;
  profileLoading.value = false;
  const peer = selectedCompanion.value;
  const userId = peer?.userId;
  const token = auth.accessToken;
  if (!peer || !userId || !token || peer.name.length < 2 || peer.name.length > 30) return;
  const controller = new AbortController();
  profileController = controller;
  profileLoading.value = true;
  try {
    const result = await searchUsers({ q: peer.name, sort: "username", limit: 20 }, token, controller.signal);
    if (controller !== profileController || userId !== selectedCompanionId.value ||
        !live.registry.value[userId] || token !== auth.accessToken) return;
    selectedProfile.value = result.items.find((item) => item.id === userId) ?? null;
  } catch {
    if (controller === profileController && userId === selectedCompanionId.value &&
        live.registry.value[userId] && !controller.signal.aborted) profileFailed.value = true;
  } finally {
    if (controller === profileController) { profileController = null; profileLoading.value = false; }
  }
}

/** Address comes only from the installed same-origin map gateway, never an external browser API. */
async function loadSelectedPlace(): Promise<void> {
  placeController?.abort();
  placeController = null;
  selectedPlace.value = null;
  placeFailed.value = false;
  placeLoading.value = false;
  const peer = selectedCompanion.value;
  const userId = peer?.userId;
  if (!peer || !userId) return;
  const position = peer.position;
  const controller = new AbortController();
  placeController = controller;
  placeLoading.value = true;
  try {
    const address = await reversePlace({ lat: peer.position[1], lon: peer.position[0] }, controller.signal);
    const current = selectedCompanion.value;
    if (controller !== placeController || current?.userId !== userId ||
        current.position[0] !== position[0] || current.position[1] !== position[1]) return;
    selectedPlace.value = address;
  } catch {
    if (controller === placeController && selectedCompanion.value?.userId === userId &&
        !controller.signal.aborted) placeFailed.value = true;
  } finally {
    if (controller === placeController) { placeController = null; placeLoading.value = false; }
  }
}

// An age-only tick does not re-fetch an address. A new fix at a new coordinate
// cancels the previous lookup; a changed public username also refreshes its exact-ID match.
watch(() => selectedCompanion.value && `${selectedCompanion.value.userId}:${selectedCompanion.value.name}`,
  () => { void loadSelectedProfile(); }, { flush: "sync" });
watch(() => selectedCompanion.value && `${selectedCompanion.value.userId}:${selectedCompanion.value.position.join(",")}`,
  () => { void loadSelectedPlace(); }, { flush: "sync" });
watch(() => auth.accessToken, () => {
  if (!auth.accessToken || !auth.user?.id) removeSelectedCompanion();
  else if (selectedCompanionId.value) void loadSelectedProfile();
}, { flush: "sync" });

/** MapLibre DOM markers keep a 44px focus/tap target; changing a fix moves rather than rebuilds it. */
function syncPeerAvatars(): void {
  const instance = map.value;
  const permitted = instance && markerConstructor && showCompanions.value && (mode.value === "sharing" || !missionActive.value)
    ? live.mapPeers.value : [];
  const ids = new Set(permitted.map((peer) => peer.userId));
  for (const [id, marker] of peerMarkers) {
    if (ids.has(id)) continue;
    marker.remove();
    peerMarkers.delete(id);
  }
  if (!instance || !markerConstructor) return;
  for (const peer of permitted) {
    let marker = peerMarkers.get(peer.userId);
    if (!marker) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", "companion-detail-sheet");
      button.className = "user-map-view__peer-avatar";
      button.dataset.userId = peer.userId;
      const avatar = document.createElement("span");
      avatar.className = "user-map-view__peer-avatar-face";
      avatar.setAttribute("aria-hidden", "true");
      button.append(avatar);
      button.addEventListener("click", (event) => {
        event.stopPropagation(); // Don't reverse-geocode a companion tap as a map click.
        selectCompanion(peer.userId, false);
      });
      marker = new markerConstructor({ element: button, anchor: "center" })
        .setLngLat(peer.position).addTo(instance);
      peerMarkers.set(peer.userId, marker);
    }
    const button = marker.getElement();
    const face = button.firstElementChild;
    if (face) face.textContent = avatarInitial(peer.name);
    button.setAttribute("aria-label", `اطلاعات همراه ${peer.name}؛ ${peer.stale ? "موقعیت قدیمی" : "موقعیت تازه"}`);
    button.setAttribute("title", peer.name);
    button.setAttribute("aria-pressed", String(selectedCompanionId.value === peer.userId));
    button.setAttribute("aria-expanded", String(selectedCompanionId.value === peer.userId));
    button.classList.toggle("user-map-view__peer-avatar--stale", peer.stale);
    button.classList.toggle("user-map-view__peer-avatar--selected", selectedCompanionId.value === peer.userId);
    const current = marker.getLngLat();
    if (current.lng !== peer.position[0] || current.lat !== peer.position[1]) marker.setLngLat(peer.position);
  }
}

function selectCompanion(userId: string, centerMap = true): void {
  const instance = map.value;
  const authorized = live.registry.value[userId];
  const peer = live.peers.value.find((candidate) => candidate.userId === userId);
  if (!instance || !authorized || !peer || !auth.user?.id) return;
  const bounds = instance.getMaxBounds();
  // The sheet still gives useful coordinates for a valid shared fix outside an installed region.
  if (centerMap && bounds && !bounds.contains(peer.position)) {
    peerSelectionError.value = "موقعیت این همراه خارج از محدودهٔ نقشهٔ آفلاین است.";
  } else peerSelectionError.value = null;
  showCompanions.value = true;
  if (selectedCompanionId.value !== userId) removeSelectedCompanion();
  selectedCompanionId.value = userId;
  syncPeerAvatars();
  if (centerMap && (!bounds || bounds.contains(peer.position))) {
    userControlledCamera.value = true;
    instance.flyTo({ center: peer.position, zoom: Math.min(15, instance.getMaxZoom()), duration: 700 });
  }
  if (isPhone.value && activeTool.value === "live") closeTool(false);
}

watch(showCompanions, (visible) => { if (!visible) removeSelectedCompanion(); paintLive(); syncPeerAvatars(); }, { flush: "sync" });
watch(() => live.registry.value, syncSelectedCompanion, { flush: "sync" });
watch(() => live.mapPeers.value, syncPeerAvatars, { flush: "sync" });
watch(() => auth.user?.id, () => {
  removeSelectedCompanion(); placeSearch.clear();
  peerSelectionError.value = null; showCompanions.value = true;
}, { flush: "sync" });

/**
 * The maplibre calls the plan asked for, and nothing else. `data` and the layer spec cross a boundary
 * whose types come from a package (`@types/geojson`) this workspace does not resolve, so the values are
 * cast here once; the shapes themselves are pinned in `history/playback.test.ts` and
 * `live/companion-locations.test.ts`.
 */
type GeoJsonTarget = { setData(data: unknown): unknown };

function applyOp(instance: MapLibreMap, op: OverlayOp): void {
  switch (op.op) {
    case "addSource":
      instance.addSource(op.id, { type: "geojson", data: op.data } as Parameters<MapLibreMap["addSource"]>[1]);
      break;
    case "setData":
      (instance.getSource(op.id) as GeoJsonTarget | undefined)?.setData(op.data);
      break;
    case "addLayer":
      instance.addLayer(op.layer as Parameters<MapLibreMap["addLayer"]>[0], op.beforeId);
      break;
    case "setPaintProperty":
      // maplibre narrows the property name to its own union of known paint keys; the descriptor's keys
      // are literals pinned in `history/playback.test.ts`, so the call site widens the name, not the value.
      const setPaint = instance.setPaintProperty.bind(instance) as (layerId: string, key: string, value: unknown) => void;
      for (const [key, value] of Object.entries(op.paint)) setPaint(op.id, key, value);
      break;
    case "removeLayer":
      instance.removeLayer(op.id);
      break;
    case "removeSource":
      instance.removeSource(op.id);
      break;
  }
}

function mapState(instance: MapLibreMap) {
  return {
    styleLoaded: Boolean(instance.isStyleLoaded()),
    hasSource: (id: string) => Boolean(instance.getSource(id)),
    hasLayer: (id: string) => Boolean(instance.getLayer(id))
  };
}

function paintLive(): void {
  const instance = map.value;
  if (!instance) return;
  // The live overlay owns the top of the stack, so it names no `beforeLayerId`: appending is the only
  // order that does not depend on a layer the base style might not declare.
  for (const op of planOverlaySync(mapState(instance), liveStyle.value, () => showCompanions.value && (mode.value === "sharing" || !missionActive.value)
    ? live.overlay.value : emptyCompanionOverlay)) applyOp(instance, op);
}

function playbackMapState(instance: MapLibreMap) {
  const state = mapState(instance);
  // Only name a layer maplibre can actually find: an unknown `beforeId` throws, and during the first
  // paint after a theme switch the markers may not be re-added yet. Painted without it, playback sits on
  // top for one frame instead of the map refusing to paint at all.
  return instance.getLayer(LIVE_BOTTOM_LAYER_ID) ? { ...state, beforeLayerId: LIVE_BOTTOM_LAYER_ID } : state;
}

let lastPlaybackPaint: PlaybackPaintSnapshot | null = null;
function paintPlayback(): void {
  const instance = map.value;
  if (!instance) return;
  // Route planning owns the map while a destination is selected; a historical track
  // behind the live route is misleading. The history panel's data remains intact.
  if (mode.value !== "history" || journey.point.value || historySuppressedAfterRouteClear.value) {
    lastPlaybackPaint = null;
    for (const op of planPlaybackRemoval(mapState(instance), playbackStyle.value)) applyOp(instance, op);
    return;
  }
  const state = playbackMapState(instance);
  const style = playbackStyle.value;
  const frame = playback.frame.value;
  for (const op of planPlaybackSync(state, style, frame, lastPlaybackPaint)) applyOp(instance, op);
  if (state.styleLoaded) lastPlaybackPaint = { style, frame };
}

function frameCamera(): void {
  const instance = map.value;
  const track = playback.frames.value;
  if (!instance || mode.value !== "history" || journey.point.value || track.length === 0 || userControlledCamera.value) return;
  const compact = window.matchMedia("(max-width: 1023px)").matches;
  const bounds = playback.boundsForMap.value;
  // The canvas may shrink within one breakpoint (e.g. phone rotation), and a
  // refreshed history can have new geometry with the same timestamps/count.
  const padding = historyCameraPadding(compact, isPhone.value ? window.innerHeight : undefined);
  const canvas = instance.getCanvas();
  const key = historyCameraKey(track, bounds, padding,
    { width: canvas.clientWidth, height: canvas.clientHeight });
  if (fittedFor === key) return;
  fittedFor = key;
  if (bounds) {
    // Tablet controls are in flow; phone chrome and SOS sit over the full-screen canvas.
    instance.fitBounds(bounds, { padding, maxZoom: 15, duration: 700 });
    return;
  }
  const only = track[0]!;
  instance.easeTo({ center: [only.lon, only.lat], duration: 500 });
}

function showTrack(): void {
  // Stop any in-flight gesture/inertia first: its moveend still carries the original DOM event.
  // Otherwise it can immediately mark the just-restored track as user-controlled again.
  map.value?.stop();
  historySuppressedAfterRouteClear.value = false;
  paintPlayback();
  userControlledCamera.value = false;
  fittedFor = null;
  frameCamera();
  if (isPhone.value && activeTool.value === "history") closeTool();
}

function repaintOverlays(): void {
  const instance = map.value;
  if (!instance) return;
  const routeActive = !!journey.point.value && journey.routesVisible.value && !!journey.selectedRoute.value;
  if (routePaintDeferred || pointRouteOverlayNeedsSync(routeActive, !!instance.getLayer(ROUTE_LAYER),
    !!instance.getLayer(ROUTE_ALT_LAYER), !!instance.getLayer(ROUTE_COMPLETED_LAYER),
    !!instance.getSource(ROUTE_SOURCE))) paintPointRoute();
  const state = mapState(instance);
  const styles = journey.point.value || historySuppressedAfterRouteClear.value
    ? [liveStyle.value] : [liveStyle.value, playbackStyle.value];
  // `setData`/`setPaintProperty` from paintLive/paintPlayback can themselves trigger styledata
  // and then idle. Event-driven writes must be restore-only, or an unchanged map repaints forever.
  if (!needsOverlayRestore(state, styles.flatMap((style) => style.sources.map((source) => source.id)),
    styles.flatMap((style) => style.layers.map((layer) => layer.id)))) return;
  paintLive();
  paintPlayback();
}

function syncDestinationMarker(): void {
  const instance = map.value, point = journey.point.value;
  if (!instance || !markerConstructor || !point || mode.value === "missions" || missionActive.value) { destinationMarker?.remove(); destinationMarker = null; return; }
  if (!destinationMarker) {
    // The existing amber route pin owns a selected POI; do not stack two pins.
    destinationMarker = new markerConstructor({ color: "#d97706" }).setLngLat([point.lon, point.lat]).addTo(instance);
    const element = destinationMarker.getElement();
    element.classList.add("user-map-view__destination-marker");
    element.setAttribute("role", "button"); element.setAttribute("tabindex", "0");
    element.setAttribute("aria-controls", "map-point-route-sheet");
    element.classList.add("user-map-view__selected-place");
    const label = document.createElement("bdi");
    label.className = "user-map-view__selected-place-label";
    label.dir = "auto";
    element.append(label);
    element.addEventListener("click", (event) => { event.stopPropagation(); journey.sheetOpen.value = true; });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); event.stopPropagation(); journey.sheetOpen.value = true;
    });
  } else destinationMarker.setLngLat([point.lon, point.lat]);
  destinationMarker.getElement().setAttribute("aria-label", `مقصد انتخاب‌شده: ${journey.title.value}؛ نمایش جزئیات مسیر`);
  const element = destinationMarker.getElement();
  const label = element.querySelector<HTMLElement>(".user-map-view__selected-place-label");
  const namedSearch = isSelectedSearchDestination.value && !journey.navigating.value;
  if (label) { label.hidden = !namedSearch; label.textContent = namedSearch ? journey.title.value : ""; }
  if (namedSearch) positionSelectedPlaceLabel(destinationMarker, instance);
  // No native hover tooltip on a selected search result.
  if (namedSearch) element.removeAttribute("title");
  else element.setAttribute("title", journey.title.value);
}
function syncRouteOriginMarker(): void {
  const instance = map.value, origin = journey.plannedFrom.value;
  if (!instance || !markerConstructor || !origin || mode.value === "missions" || missionActive.value || !journey.selectedRoute.value || !journey.routesVisible.value ||
    journey.navigating.value || journey.navigationPending.value || journey.replanning.value || journey.rerouteWaitingForFix.value) {
    routeOriginMarker?.remove(); routeOriginMarker = null; return;
  }
  if (!routeOriginMarker) {
    const element = document.createElement("div");
    element.className = "user-map-view__route-origin";
    element.setAttribute("role", "img"); element.setAttribute("aria-label", "مبدأ مسیر انتخابی");
    const label = document.createElement("span"); label.textContent = "A"; element.append(label);
    routeOriginMarker = new markerConstructor({ element, anchor: "center" })
      .setLngLat([origin.lon, origin.lat]).addTo(instance);
  } else routeOriginMarker.setLngLat([origin.lon, origin.lat]);
}
function paintPointRoute(): void {
  const instance = map.value;
  if (!instance) return;
  if (!instance.isStyleLoaded()) { routePaintDeferred = true; return; }
  routePaintDeferred = false;
  const geometries = mode.value !== "missions" && !missionActive.value && journey.point.value && journey.routesVisible.value ? routeGeometries.value : [];
  if (!geometries.length) {
    if (instance.getLayer(ROUTE_LAYER)) instance.removeLayer(ROUTE_LAYER);
    if (instance.getLayer(ROUTE_COMPLETED_LAYER)) instance.removeLayer(ROUTE_COMPLETED_LAYER);
    if (instance.getLayer(ROUTE_ALT_LAYER)) instance.removeLayer(ROUTE_ALT_LAYER);
    if (instance.getSource(ROUTE_SOURCE)) instance.removeSource(ROUTE_SOURCE);
    return;
  }
  const features = journey.navigationPending.value || journey.replanning.value || journey.rerouteWaitingForFix.value ? [] :
    pointRouteFeatures(geometries, journey.index.value, journey.navigating.value, completedRouteMetres);
  const data = { type: "FeatureCollection", features } as const;
  const source = instance.getSource(ROUTE_SOURCE) as { setData(data: unknown): void } | undefined;
  if (source) source.setData(data);
  else instance.addSource(ROUTE_SOURCE, { type: "geojson", data } as Parameters<MapLibreMap["addSource"]>[1]);
  if (!instance.getLayer(ROUTE_ALT_LAYER)) instance.addLayer({ id: ROUTE_ALT_LAYER, source: ROUTE_SOURCE,
    type: "line", filter: ["==", ["get", "selected"], false],
    paint: { "line-color": "#a95010", "line-width": 6, "line-opacity": .8 } });
  if (!instance.getLayer(ROUTE_COMPLETED_LAYER)) instance.addLayer({ id: ROUTE_COMPLETED_LAYER, source: ROUTE_SOURCE,
    type: "line", filter: ["==", ["get", "completed"], true],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#82949e", "line-width": 5, "line-opacity": .55 }
  }, instance.getLayer(ROUTE_LAYER) ? ROUTE_LAYER : undefined);
  if (!instance.getLayer(ROUTE_LAYER)) instance.addLayer({ id: ROUTE_LAYER, source: ROUTE_SOURCE,
    type: "line", filter: ["all", ["==", ["get", "selected"], true], ["==", ["get", "completed"], false]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#0d7770", "line-width": 8, "line-opacity": .98 } });
}
/** GPS updates only advance the completed line on the same selected route. Weak,
 * missing or off-route fixes retain the last trustworthy progress, not a guess. */
function updateRouteProgress(): void {
  const route = journey.selectedRoute.value;
  if (route !== progressRoute) { progressRoute = route; completedRouteMetres = 0; }
  if (!route || !journey.navigating.value || journey.navigationPending.value ||
    journey.replanning.value || journey.rerouteWaitingForFix.value) return;
  const next = advanceRouteProgress(journey.routePoints.value, own.position.value, completedRouteMetres);
  if (next > completedRouteMetres) {
    completedRouteMetres = next;
    paintPointRoute();
  }
}
function onAlternativeRouteClick(event: { features?: Array<{ properties?: { index?: unknown } }> }): void {
  if (journey.navigating.value || !journey.sheetOpen.value || !journey.routesVisible.value) return;
  const index = Number(event.features?.[0]?.properties?.index);
  if (!Number.isInteger(index) || !journey.routes.value[index]) return;
  // A map-line tap previews the alternative through the same explicit
  // confirmation flow as a card tap; it must not silently commit a new route.
  if (!routeChoicesOpen.value) openRouteChoices();
  selectPointRoute(index);
}

function attachHold(instance: MapLibreMap): () => void {
  const canvas = instance.getCanvasContainer();
  // DOM markers are siblings of the map canvas inside this container. Listen on
  // the drawing surface so a long press on a result/route marker cannot choose
  // the unrelated point behind that interactive marker.
  const surface = instance.getCanvas();
  let suppressContextUntil = 0;
  const hold = createHoldToSelect((x, y, type) => {
    if (type === "touch") suppressContextUntil = Date.now() + 900; // Native contextmenu can follow the timer.
    // A long press edits the Trips planner only. In Sharing/History it would
    // create an invisible personal route under the current workspace.
    if (!auth.user?.id || missionActive.value || mode.value !== "trips" ||
      (auth.user.role === "user" && !missionShare.verified) ||
      journey.navigating.value || journey.navigationPending.value || map.value !== instance) return;
    const rect = canvas.getBoundingClientRect();
    const location = instance.unproject([x - rect.left, y - rect.top]);
    const bounds = instance.getMaxBounds();
    if (bounds && !bounds.contains(location)) return;
    if (isPhone.value && activeTool.value) closeTool(false);
    removeSelectedCompanion();
    userControlledCamera.value = true;
    // A hold uses the held coordinates, not the last gesture's camera center.
    // Preserve the user's zoom; the selected pin lands in the exact map center.
    routeChoicesOpen.value = false;
    closeNearbyResults(); // A maximum-zoom chooser must not cover the new point's route sheet.
    placeSearch.deselect();
    journey.select({ lat: location.lat, lon: location.lng });
    const point = journey.point.value;
    instance.easeTo({ center: [location.lng, location.lat], duration: 450 }, { placeSearchSelection: true });
    if (point) void nextTick(() => {
      if (map.value === instance && journey.sheetOpen.value && journey.point.value === point)
        document.getElementById("map-point-route-sheet")?.focus({ preventScroll: true });
    });
  });
  const pointer = (event: PointerEvent): HoldPointer => ({ id: event.pointerId, x: event.clientX, y: event.clientY,
    button: event.button, primary: event.isPrimary, type: event.pointerType });
  // A hold must use the same camera frame for pointerdown and unprojection.
  // Reject a hold during a flight and cancel one as soon as any pan/zoom begins,
  // even if pointer movement stayed inside the touch-jitter tolerance.
  const down = (event: PointerEvent) => {
    if (!journey.navigating.value && !instance.isMoving()) hold.down(pointer(event));
  };
  // Markers and map controls are siblings of the canvas. A second finger on
  // one of them must cancel a canvas hold without starting a hold of its own.
  const outsideDown = (event: PointerEvent) => {
    if (event.target !== surface) hold.cancel();
  };
  const move = (event: PointerEvent) => hold.move(pointer(event));
  const up = (event: PointerEvent) => hold.up(event.pointerId);
  const context = (event: Event) => { if (hold.isTouchPending() || Date.now() < suppressContextUntil) event.preventDefault(); };
  surface.addEventListener("pointerdown", down);
  instance.on("movestart", hold.cancel);
  window.addEventListener("pointerdown", outsideDown);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("blur", hold.cancel);
  surface.addEventListener("contextmenu", context);
  return () => {
    hold.cancel(); surface.removeEventListener("pointerdown", down);
    instance.off("movestart", hold.cancel);
    window.removeEventListener("pointerdown", outsideDown);
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up); window.removeEventListener("blur", hold.cancel);
    surface.removeEventListener("contextmenu", context);
  };
}
function resumePointFollowing(): void {
  if (!journey.navigating.value) return;
  showNavigationSearchResults.value = false;
  syncResultMarkers();
  navigationFollowEnabled.value = true;
  journey.focus();
}
function startPointNavigation(): void {
  const fix = own.position.value, bounds = map.value?.getMaxBounds();
  if (fix && fix.accuracy !== null && fix.accuracy <= 80 && bounds && !bounds.contains([fix.lon, fix.lat])) {
    journey.error.value = "موقعیت شما خارج از محدودهٔ نقشهٔ آفلاین است؛ راهبری روی این نقشه ممکن نیست.";
    return;
  }
  navigationFollowEnabled.value = true;
  if (journey.start()) {
    navigationAlert.cancelArrival(); // A new trip cannot inherit a queued chime.
    navigationAlert.arm();
    userControlledCamera.value = true;
    syncOwnMarker();
    void nextTick(() => (document.getElementById('map-tool-search') ?? document.getElementById('map-navigation-sheet'))?.focus());
  }
}
watch(() => journey.point.value, (next, previous) => {
  if (!next && previous) historySuppressedAfterRouteClear.value = true;
  if (next !== previous) { routeChoicesOpen.value = false; transportChoicesOpen.value = false; routeChoiceSnapshot = null; }
  syncDestinationMarker(); syncRouteOriginMarker(); paintPlayback(); paintPointRoute();
}, { flush: "sync" });
watch(() => journey.title.value, syncDestinationMarker);
function onNavigationSheetLayoutChange(): void {
  if (journey.navigating.value && navigationFollowEnabled.value) journey.focus();
}
function onPointRouteLayoutChange(): void {
  measurePointSheet();
  if (journey.navigating.value) {
    if (navigationFollowEnabled.value) journey.focus();
  } else fitPointRoute();
}
function fitPointRoute(): void {
  const instance = map.value, to = journey.point.value;
  if (!instance || !to || !journey.selectedRoute.value || !journey.routesVisible.value || journey.navigating.value) return;
  const from = journey.plannedFrom.value;
  const extent = pointRouteSelectionExtent(journey.routePoints.value,
    from ? [from.lon, from.lat] : null, [to.lon, to.lat]);
  if (!extent) return;
  const canvas = instance.getContainer().getBoundingClientRect();
  const sheet = document.getElementById(pointSheetId())?.getBoundingClientRect() ?? null;
  const padding = pointRouteOverviewPadding(canvas, sheet);
  instance.fitBounds(extent,
    { padding, maxZoom: instance.getMaxZoom(), duration: 500 },
    { placeSearchSelection: true });
  userControlledCamera.value = true;
}
watch([routeChoicesOpen, transportChoicesOpen], async () => { await nextTick(); fitPointRoute(); });
watch(() => journey.selectedRoute.value, () => { syncOwnMarker(); syncRouteOriginMarker(); updateRouteProgress(); paintPointRoute(); void nextTick(fitPointRoute); });
watch(() => journey.routesVisible.value, () => { syncRouteOriginMarker(); paintPointRoute(); void nextTick(fitPointRoute); });
watch([() => journey.navigationPending.value, () => journey.replanning.value, () => journey.rerouteWaitingForFix.value],
  () => { syncOwnMarker(); syncRouteOriginMarker(); updateRouteProgress(); paintPointRoute(); }, { flush: "sync" });
watch(() => journey.sheetOpen.value, async () => {
  if (!journey.navigating.value || !navigationFollowEnabled.value) return;
  await nextTick(); // The compact bar and bottom sheet exchange DOM positions.
  if (journey.navigating.value && navigationFollowEnabled.value) journey.focus();
});
watch(() => journey.navigating.value, (active) => {
  syncDestinationMarker(); // A named search callout belongs to planning, not active guidance.
  progressRoute = null; completedRouteMetres = 0;
  if (active) updateRouteProgress();
  showNavigationSearchResults.value = false;
  if (active && activeTool.value) closeTool(false);
  if (!active) {
    navigationFollowEnabled.value = true;
    // The camera may have travelled far while following GPS. Prune old POIs once,
    // but never launch a geocoder request on every navigation frame.
    if (showAllResultsOnMap.value) placeSearch.pruneForViewport(showAllResultsOnMap.value, false);
  } else void nextTick(onNavigationSheetLayoutChange);
  syncResultMarkers(); syncSelectedPlaceMarker();
  syncOwnMarker(); syncRouteOriginMarker(); paintPointRoute();
});

function markUserCameraMove(event: MapMovementEvent): void {
  // MapLibre forwards originalEvent from drag/wheel/keyboard gestures and its zoom controls,
  // but not from our fitBounds/easeTo. Mark intent at movestart so a history read that finishes
  // while the user is still dragging cannot snap the camera back to the track.
  if (event.originalEvent) {
    userControlledCamera.value = true;
    if (journey.navigating.value) navigationFollowEnabled.value = false;
  }
}

function onMapMoving(event: MapMovementEvent): void {
  if (journey.navigating.value) return; // GPS-follow flights must never trigger a geocoder read.
  if ("placeSearchSelection" in event && event.placeSearchSelection === true) return;
  placeSearch.pruneForViewport(!!event.originalEvent || showAllResultsOnMap.value);
}

function onMapMoveEnd(event: MapMovementEvent): void {
  markUserCameraMove(event); // Also cover gestures whose start preceded this listener.
  // Screen-space collisions change with zoom, pan, fitBounds and flyTo, even
  // when the search snapshot itself did not change.
  syncResultMarkers();
  positionSelectedPlaceLabels();
  restoreClusterKeyboardFocus();
  if (journey.navigating.value) return;
  // Choosing a search hit already marks the camera as user-chosen, but its own flyTo must not
  // discard the other hits. A subsequent physical map move can refresh the visible-bbox list.
  if ("placeSearchSelection" in event && event.placeSearchSelection === true) {
    // The flight must not search again, but a zoomed-in camera must not retain
    // unrelated out-of-bbox POIs in the list or on the map.
    placeSearch.pruneForViewport(showAllResultsOnMap.value, false);
    return;
  }
  const followViewport = !!event.originalEvent || showAllResultsOnMap.value;
  placeSearch.pruneForViewport(followViewport);
  placeSearch.refreshForViewport(followViewport);
}

function onMapCoverageChanged(instance: MapLibreMap): void {
  if (map.value !== instance) return;
  placeSearch.refreshForAreaChange();
}

function onMapResize(): void {
  syncResultMarkers();
  positionSelectedPlaceLabels();
  frameCamera();
  if (journey.navigating.value && navigationFollowEnabled.value) journey.focus();
  else if (journey.sheetOpen.value) fitPointRoute();
}
function onMapReady(instance: MapLibreMap, MarkerClass: typeof Marker): void {
  // A replacement or reloaded basemap may carry new sources under familiar IDs.
  lastPlaybackPaint = null;
  if (map.value !== instance) {
    fittedFor = null; // The new MapLibre instance has not received this track's camera fit.
    userControlledCamera.value = false; // A gesture on the old instance cannot control the new one.
    map.value?.off("click", ROUTE_ALT_LAYER, onAlternativeRouteClick);
    detachHold?.(); detachHold = null;
    ownMarkerMotion.reset(); ownMarker?.remove(); ownMarker = null;
    destinationMarker?.remove(); destinationMarker = null;
    routeOriginMarker?.remove(); routeOriginMarker = null;
    selectedPlaceMarker?.remove(); selectedPlaceMarker = null;
    clearResultMarkers();
  }
  if (map.value !== instance) {
    for (const marker of peerMarkers.values()) marker.remove();
    peerMarkers.clear();
    removeSelectedCompanion();
  }
  markerConstructor = MarkerClass;
  map.value = instance;
  workspaceMarker.value = MarkerClass;
  // A theme change calls `setStyle`, whose diff drops layers the new style does not declare — so every
  // `ready` (and every `styledata`/`idle` after an async style reload) re-ensures the overlay instead
  // of assuming it is still there. Live markers go first because playback asks to be inserted beneath them.
  instance.on("styledata", repaintOverlays);
  instance.on("idle", repaintOverlays);
  detachHold = attachHold(instance);
  instance.on("movestart", markUserCameraMove);
  instance.on("move", onMapMoving);
  instance.on("moveend", onMapMoveEnd);
  instance.on("resize", onMapResize);
  paintLive();
  paintPlayback();
  paintPointRoute();
  instance.on("click", ROUTE_ALT_LAYER, onAlternativeRouteClick);
  syncOwnMarker();
  syncDestinationMarker();
  syncRouteOriginMarker();
  syncSelectedPlaceMarker();
  syncResultMarkers();
  syncPeerAvatars();
  frameCamera();
  if (journey.sheetOpen.value && journey.selectedRoute.value) void nextTick(fitPointRoute);
  focusOwnIfRequested();
}

watch(() => playback.frame.value, paintPlayback);
watch(() => playbackStyle.value, () => {
  lastPlaybackPaint = null;
  paintLive();
  paintPlayback();
});
watch(() => live.overlay.value, paintLive);
// The overlay already changes when peers arrive or leave; a second peer-count watcher would
// duplicate MapLibre setData on those updates. An age-only tick updates the status panel, not
// map GeoJSON. Updates never move the camera; selecting a peer explicitly can.
watch(
  () => playback.frames.value,
  () => {
    paintPlayback();
    frameCamera();
  }
);
// A fresh login needs a fresh own-history read, but a bearer rotated within the *same* JWT
// session must not reset a selected grant, playback cursor or timer. Follow the account/session
// boundary instead of the raw token; clear the old overlay synchronously on logout/mismatch.
watch(
  mapPlaybackSession,
  (next, previous) => {
    if (next === previous) return;
    fittedFor = null;
    if (!next) playback.points.value = [];
    else void playback.selectPreset(playback.presetDays.value || 7);
  },
  { flush: "sync" }
);

onBeforeUnmount(() => {
  unregisterTrip();
  document.documentElement.style.removeProperty("--bb-map-navigation-sheet-height");
  document.documentElement.style.removeProperty("--bb-map-point-sheet-height");
  // `map.value` is cleared first: Vue runs a parent's `beforeUnmount` before the child's, so the map is
  // still alive here and nothing else can paint after this point.
  const instance = map.value;
  map.value = null;
  workspaceMarker.value = null;
  markerConstructor = null;
  own.stop();
  navigationAlert.dispose();
  removeSelectedCompanion();
  for (const marker of peerMarkers.values()) marker.remove();
  peerMarkers.clear();
  ownMarkerMotion.reset();
  ownMarker?.remove();
  ownMarker = null;
  destinationMarker?.remove(); destinationMarker = null;
  routeOriginMarker?.remove(); routeOriginMarker = null;
  selectedPlaceMarker?.remove();
  selectedPlaceMarker = null;
  clearResultMarkers();
  detachHold?.(); detachHold = null;
  if (instance) {
    instance.off("click", ROUTE_ALT_LAYER, onAlternativeRouteClick);
    instance.off("styledata", repaintOverlays);
    instance.off("idle", repaintOverlays);
    instance.off("movestart", markUserCameraMove);
    instance.off("move", onMapMoving);
    instance.off("moveend", onMapMoveEnd);
    instance.off("resize", onMapResize);
    for (const op of planPlaybackRemoval(mapState(instance), playbackStyle.value)) applyOp(instance, op);
    for (const op of planOverlayRemoval(mapState(instance), liveStyle.value)) applyOp(instance, op);
  }
});

// The first paint for a verified login: without this the map is empty until they touch a chip.
if (mapPlaybackSession.value) void playback.selectPreset(playback.presetDays.value);
</script>

<style scoped>
.user-map-view {
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background: #e8efec;
  isolation: isolate;
}

.user-map-view__modes {
  position: absolute; z-index: 10; top: calc(.75rem + env(safe-area-inset-top, 0px));
  left: 50%; transform: translateX(-50%); display: flex; gap: .2rem;
  padding: .25rem; border: 1px solid var(--bb-color-outline); border-radius: 1.1rem;
  background: rgba(var(--v-theme-surface), .97); box-shadow: var(--bb-shadow-overlay);
  max-width: calc(100% - 8.5rem); overflow: hidden;
}
.user-map-view__modes button { display: flex; align-items: center; justify-content: center; gap: .35rem;
  min-height: 44px; min-width: 44px; padding: .35rem .65rem; border: 0; border-radius: .85rem;
  background: transparent; color: rgb(var(--v-theme-on-surface)); font: 700 .82rem/1.2 var(--bb-font-family, "Vazirmatn", sans-serif);
  white-space: nowrap; cursor: pointer; }
.user-map-view__modes .user-map-view__mode--active { background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); }
.user-map-view__modes button:disabled { opacity: .42; cursor: not-allowed; }
.user-map-view__modes button:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
/* Confirm the actual server write after the share sheet closes. An opaque
   surface remains readable over light/dark tiles, without hiding in a phone
   companion dialog or disappearing before assistive technology announces it. */
.user-map-view__share-success { position: fixed; z-index: 15;
  top: calc(5rem + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
  width: min(28rem, calc(100vw - 1.5rem)); max-height: min(40dvh, 12rem); overflow-y: auto;
  border: 1px solid rgb(var(--v-theme-success)); border-inline-start-width: 4px;
  background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)) !important;
  box-shadow: var(--bb-shadow-overlay); pointer-events: auto; }
.user-map-view__share-success :deep(.v-alert__underlay) { display: none; }
.user-map-view__share-success :deep(.v-alert__prepend) { color: rgb(var(--v-theme-success)); }
.user-map-view__share-success:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
@media (max-width: 700px) {
  .user-map-view__modes { max-width: calc(100% - 7.8rem); gap: 0; padding: .15rem; }
  .user-map-view__modes button { padding: 0; }
  .user-map-view__modes button span { position: absolute; width: 1px; height: 1px; padding: 0;
    margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
}
.user-map-view__search-map-actions { display: none; }

/* Compact category pins leave the map visible; the selected pin alone has a
   persistent name. Photon names and addresses remain in each button's aria-label. */
:global(.user-map-view .user-map-view__route-origin) {
  display: grid; place-items: center; width: 32px; height: 32px; border: 3px solid #fff;
  border-radius: 50%; color: #fff;
  background: #2563eb; box-shadow: 0 2px 9px rgba(4, 24, 40, .5); font-weight: 900;
}
:global(.user-map-view .user-map-view__result-marker) {
  display: grid; place-items: center; width: 48px; height: 48px; padding: 0;
  border: 3px solid #fff; border-radius: 16px 16px 16px 5px;
  background: var(--result-color, #475569); color: #fff;
  box-shadow: 0 4px 12px rgba(3, 29, 31, .34), 0 0 0 1px rgba(5, 31, 44, .12);
  cursor: pointer; touch-action: manipulation;
  font-family: var(--bb-font-family, "Vazirmatn", "Segoe UI", Tahoma, sans-serif);
  font-synthesis: none; letter-spacing: normal;
}
:global(.user-map-view .user-map-view__result-marker__icon) { font-size: 1.55rem; line-height: 1; }
/* A title-only label lives outside the fixed 48px pin. No native browser title
   tooltip (which cannot use the app's Persian font) and no hover hitbox change. */
:global(.user-map-view .user-map-view__result-marker__tooltip) {
  position: absolute; bottom: calc(100% + .5rem); left: 50%;
  transform: translateX(calc(-50% + var(--result-tooltip-shift, 0px)));
  display: block; width: max-content;
  max-width: min(16rem, calc(100vw - 2rem), var(--result-tooltip-map-width, 16rem));
  padding: .35rem .7rem; border: 1px solid rgba(var(--v-theme-on-surface), .16);
  border-radius: .75rem; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 4px 14px rgba(3, 29, 31, .24);
  font: 700 .9rem/1.5 var(--bb-font-family, "Vazirmatn", "Segoe UI", Tahoma, sans-serif);
  letter-spacing: normal; text-align: center; white-space: normal; overflow-wrap: anywhere;
  visibility: hidden; opacity: 0; pointer-events: none;
}
:global(.user-map-view .user-map-view__result-marker--tooltip-below .user-map-view__result-marker__tooltip) {
  top: calc(100% + .5rem); bottom: auto;
}
@media (hover: hover) {
  :global(.user-map-view .user-map-view__result-marker:hover) { z-index: 4; }
  :global(.user-map-view .user-map-view__result-marker:hover .user-map-view__result-marker__tooltip) {
    visibility: visible; opacity: 1;
  }
}
:global(.user-map-view .user-map-view__result-marker:focus-visible) { z-index: 4; }
:global(.user-map-view .user-map-view__result-marker:focus-visible .user-map-view__result-marker__tooltip) {
  visibility: visible; opacity: 1;
}
:global(.user-map-view .user-map-view__result-marker:focus-visible),
:global(.user-map-view .user-map-view__selected-place:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px;
}
:global(.user-map-view .user-map-view__selected-place) { cursor: pointer; z-index: 3; }
:global(.user-map-view .user-map-view__selected-place-label:not([hidden])) {
  position: absolute; bottom: calc(100% + .45rem); left: 50%;
  transform: translateX(calc(-50% + var(--selected-label-shift, 0px)));
  display: block; width: max-content;
  max-width: min(15rem, calc(100vw - 2rem), var(--selected-label-map-width, 15rem));
  padding: .45rem .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border: 1px solid rgba(var(--v-theme-on-surface), .16); border-radius: .8rem;
  background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 5px 18px rgba(3, 29, 31, .28); pointer-events: none;
  font: 700 .9rem/1.5 var(--bb-font-family, "Vazirmatn", "Segoe UI", Tahoma, sans-serif);
}
:global(.user-map-view .user-map-view__selected-place--label-below .user-map-view__selected-place-label:not([hidden])) {
  top: calc(100% + .45rem); bottom: auto;
}
@media (forced-colors: active) {
  :global(.user-map-view .user-map-view__result-marker),
  :global(.user-map-view .user-map-view__selected-place-label),
  :global(.user-map-view .user-map-view__result-marker__tooltip) { border-color: CanvasText; background: Canvas; color: CanvasText; box-shadow: none; }
}

/* Count bubbles correspond to actual overlapping hits. The chooser retains
   every place, including different places at identical coordinates. */
:global(.user-map-view .user-map-view__result-cluster) {
  display: grid; place-items: center; width: 54px; height: 54px; padding: 0;
  border: 3px solid #fff; border-radius: 50%;
  background: var(--result-color, #4059a9); color: #fff;
  box-shadow: 0 4px 14px rgba(3, 29, 31, .3), 0 0 0 5px color-mix(in srgb, var(--result-color, #4059a9) 25%, transparent);
  cursor: pointer; touch-action: manipulation;
  font-family: var(--bb-font-family, "Vazirmatn", "Segoe UI", Tahoma, sans-serif);
  font-size: 1rem; font-weight: 800; letter-spacing: normal;
}
:global(.user-map-view .user-map-view__result-cluster__count) { font-variant-numeric: tabular-nums; }
:global(.user-map-view .user-map-view__result-cluster:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 6px;
}
.user-map-view__nearby-results {
  position: absolute; z-index: 8; top: calc(5rem + env(safe-area-inset-top, 0px));
  left: 50%; transform: translateX(-50%); width: min(22rem, calc(100vw - 1.5rem));
  max-height: min(55dvh, 24rem); display: flex; flex-direction: column;
  border: 1px solid rgba(var(--v-theme-on-surface), .2); border-radius: 1rem;
  background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay); font-family: var(--bb-font-family, "Vazirmatn", Tahoma, sans-serif);
  direction: rtl;
}
.user-map-view__nearby-results:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); }
.user-map-view__nearby-header { display: flex; align-items: center; justify-content: space-between;
  gap: .5rem; padding: .45rem .75rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.user-map-view__nearby-header h2 { margin: 0; font-size: 1rem; font-weight: 700; }
.user-map-view__nearby-header button { width: 44px; height: 44px; border: 0; border-radius: .7rem;
  background: transparent; cursor: pointer; color: inherit; font: inherit; }
.user-map-view__nearby-list { margin: 0; padding: .25rem; overflow-y: auto; list-style: none; }
.user-map-view__nearby-list button { display: flex; align-items: center; width: 100%; min-height: 52px; gap: .65rem;
  padding: .45rem .6rem; border: 0; border-radius: .75rem; background: transparent;
  text-align: start; color: inherit; font: inherit; cursor: pointer; }
.user-map-view__nearby-icon { display: grid; place-items: center; flex: 0 0 36px; height: 36px;
  border-radius: .7rem; background: var(--result-color, #475569); color: #fff; }
.user-map-view__nearby-copy { display: grid; min-width: 0; gap: .1rem; }
.user-map-view__nearby-list button:focus-visible,
.user-map-view__nearby-header button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); }
.user-map-view__nearby-name { font-size: .875rem; font-weight: 700; overflow-wrap: anywhere; }
.user-map-view__nearby-address { font-size: .8rem; opacity: .8; overflow-wrap: anywhere; }
@media (forced-colors: active) {
  :global(.user-map-view .user-map-view__result-cluster),
  .user-map-view__nearby-results { border-color: CanvasText; box-shadow: none; }
  :global(.user-map-view .user-map-view__result-cluster__count) { background: Highlight; color: HighlightText; }
}

/* Without boxes, desktop absolute offsets and tablet flex order stay unchanged. */
.user-map-view__search-dialog:not(.v-overlay), .user-map-view__history-dialog:not(.v-overlay),
.user-map-view__live-dialog:not(.v-overlay) { display: contents; }
.user-map-view__search-surface, .user-map-view__search-body,
.user-map-view__history-surface, .user-map-view__history-body,
.user-map-view__live-surface, .user-map-view__live-body { display: contents !important; }
.user-map-view__peer-error { color: rgb(var(--v-theme-error)); margin: 0.5rem 0; }
:global(.user-map-view .user-map-view__peer-avatar) {
  display: grid; place-items: center; width: 44px; height: 44px;
  padding: 0; border: 0; border-radius: 50%; background: transparent;
  appearance: none; cursor: pointer;
}
:global(.user-map-view .user-map-view__peer-avatar-face) {
  display: grid; place-items: center; width: 32px; height: 32px;
  border: 3px solid rgb(var(--v-theme-surface)); border-radius: 50%;
  color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary));
  box-shadow: 0 2px 7px rgba(3, 29, 31, 0.4);
  font-size: 0.82rem; font-weight: 800; line-height: 1; text-transform: none;
}
:global(.user-map-view .user-map-view__peer-avatar--stale .user-map-view__peer-avatar-face) { background: #526b6b; color: #fff; }
:global(.user-map-view .user-map-view__peer-avatar--selected .user-map-view__peer-avatar-face) { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
:global(.user-map-view .user-map-view__peer-avatar:focus-visible) { outline: 3px solid #f0a127; outline-offset: 2px; }

/* Arrival acknowledgement stays readable above the map and safe-area home indicator. */
.user-map-view__arrival-title { display: flex; align-items: center; gap: .5rem;
  white-space: normal; overflow-wrap: anywhere; font-weight: 800; }
.user-map-view__arrival-card :deep(.v-card-text) { line-height: 1.7; overflow-wrap: anywhere; }
.user-map-view__arrival-actions { padding: .5rem .75rem calc(.75rem + env(safe-area-inset-bottom, 0px)); }
.user-map-view__arrival-actions :deep(.v-btn) { min-height: 44px; }

/* One nonmodal guidance card with identical content on every screen size. */
.user-map-view__journey-stack { position: fixed; z-index: 7; left: 50%; transform: translateX(-50%);
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); width: min(36rem, calc(100vw - 1.5rem)); pointer-events: none; }
.user-map-view__journey-content { display: flex; flex-direction: column; gap: .4rem; max-height: min(72dvh, 36rem);
  overflow-y: auto; overscroll-behavior: contain; padding: .7rem .75rem; pointer-events: auto; }
.user-map-view__journey-bar { display: grid; grid-template-columns: 38px minmax(0, 1fr);
  align-items: center; column-gap: .65rem; row-gap: .55rem; color: rgb(var(--v-theme-on-surface)); }
.user-map-view__journey-emblem { display: grid; place-items: center; width: 38px; height: 38px;
  border-radius: 12px; color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }
.user-map-view__journey-heading { display: grid; min-width: 0; gap: .05rem; }
.user-map-view__journey-heading small { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: .8rem; font-weight: 800; color: rgb(var(--v-theme-primary)); }
.user-map-view__navigation-status { display: grid; gap: .35rem; pointer-events: none; }
.user-map-view__gps-warning, .user-map-view__reroute-status { margin: 0; padding: .55rem .85rem;
  border: 1px solid rgba(var(--v-theme-on-warning), .2); border-radius: var(--bb-radius-nested, 16px);
  font-size: .83rem; line-height: 1.5;
  color: rgb(var(--v-theme-on-warning)); background: rgb(var(--v-theme-warning)); }
.user-map-view__gps-warning { display: flex; align-items: flex-start; gap: .4rem; }
.user-map-view__gps-warning .v-icon { flex: 0 0 auto; margin-top: .12rem; }
.user-map-view__journey-label { display: block; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: .91rem; font-weight: 800; }
/* ETA leads; speed is a GPS observation and the legal limit is explicitly unknown.
   All three remain in one glanceable row, even on narrow phones. */
.user-map-view__telemetry { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1.35fr) repeat(2, minmax(0, 1fr));
  gap: .4rem; margin: 0; }
.user-map-view__telemetry-item { min-width: 0; display: flex; flex-direction: column; align-items: center;
  gap: .05rem; padding: .48rem .2rem; border: 1px solid rgba(var(--v-theme-on-surface), .1);
  border-radius: var(--bb-radius-nested, 16px); background: rgba(var(--v-theme-on-surface), .035); text-align: center; }
.user-map-view__telemetry-item--eta { border-color: rgba(var(--v-theme-primary), .28);
  background: rgba(var(--v-theme-primary), .1); }
.user-map-view__telemetry-item dt { display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
  gap: .2rem; font-size: .8rem; line-height: 1.25; font-weight: 700; }
.user-map-view__telemetry-item dt .v-icon { color: rgb(var(--v-theme-primary)); }
.user-map-view__telemetry-item dd { margin: 0; font-size: 1.16rem; line-height: 1.3; font-weight: 900;
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.user-map-view__telemetry-item--eta dd { color: rgb(var(--v-theme-primary)); font-size: 1.35rem; }
.user-map-view__telemetry-item small { font-size: .8rem; line-height: 1.25; opacity: .78; overflow-wrap: anywhere; }
.user-map-view__telemetry-unit { display: none; }
.user-map-view__telemetry-item--unknown { background: rgba(var(--v-theme-on-surface), .04); }
.user-map-view__telemetry-item--unknown dd { opacity: .7; }
.user-map-view__journey-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .45rem;
  padding-top: .55rem; border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.user-map-view__journey-actions > :first-child,
.user-map-view__journey-actions > :last-child { flex: 1 0 auto; }
.user-map-view__journey-actions :deep(.v-btn) { min-height: 46px; min-width: 44px; height: auto;
  padding-inline: .5rem; border-radius: 14px !important; font-weight: 800; }
.user-map-view__journey-actions :deep(.v-btn__content) { white-space: nowrap; text-align: center; }
.user-map-view__journey-actions :deep(.v-btn:focus-visible) { outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 2px; }
@media (min-width: 600px) and (max-width: 1023px) {
  /* The same card, parked beside rather than over the SOS/map action rail. */
  .user-map-view__journey-stack { left: calc(.75rem + env(safe-area-inset-left, 0px)); transform: none;
    width: min(30rem, calc(100vw - 7.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); }
}
:global(.user-map-view__destination-marker:focus-visible) { outline: 3px solid #f0a127; outline-offset: 2px; }
/* Private GPS halo is decorative, not an accuracy radius. The idle crosshair stays
 * screen-upright; the SVG arrow is rotated by MapLibre against the route bearing. */
:global(.user-map-view .user-map-view__own-marker) {
  display: grid; place-items: center; width: 48px; height: 48px;
  border-radius: 50%; background: rgba(var(--v-theme-primary), .22);
  cursor: default;
}
:global(.user-map-view .user-map-view__own-marker--mission) {
  border: 2px dashed rgb(var(--v-theme-primary)); background: rgb(var(--v-theme-surface));
}
:global(.user-map-view .user-map-view__own-marker-icon) {
  display: grid; place-items: center; width: 32px; height: 32px;
  border: 3px solid rgb(var(--v-theme-on-primary)); border-radius: 50%;
  color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary));
  box-shadow: 0 2px 8px rgba(13, 48, 46, .4); font-size: 18px;
}
:global(.user-map-view .user-map-view__direction-arrow) { display: none; }
:global(.user-map-view .user-map-view__own-marker--navigating) {
  width: 60px; height: 60px; background: rgba(var(--v-theme-primary), .24);
}
:global(.user-map-view .user-map-view__own-marker--navigating .user-map-view__own-marker-icon) { display: none; }
:global(.user-map-view .user-map-view__own-marker--navigating .user-map-view__direction-arrow) {
  display: block; width: 48px; height: 48px;
  filter: drop-shadow(0 4px 3px rgba(13, 48, 46, .5));
}
:global(.user-map-view .user-map-view__direction-arrow__body) {
  fill: rgb(var(--v-theme-primary)); stroke: rgb(var(--v-theme-on-primary));
  stroke-width: 2.5; stroke-linejoin: round;
}
:global(.user-map-view .user-map-view__direction-arrow__accent) { fill: rgb(var(--v-theme-secondary)); }
/* Walking remains flat, without a vehicle-style raised shadow. */
:global(.user-map-view .user-map-view__own-marker--walking .user-map-view__direction-arrow) {
  transform: none; filter: drop-shadow(0 2px 2px rgba(13, 48, 46, .4));
}
@media (forced-colors: active) {
  :global(.user-map-view .user-map-view__own-marker-icon) { border-color: CanvasText; background: Highlight; color: HighlightText; }
  :global(.user-map-view .user-map-view__direction-arrow__body) { fill: Highlight; stroke: HighlightText; }
  :global(.user-map-view .user-map-view__direction-arrow__accent) { fill: HighlightText; }
  :global(.user-map-view .user-map-view__peer-avatar-face) { border-color: CanvasText; background: Highlight; color: HighlightText; }
}


.user-map-view__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
}

/* MapCanvas provides the shared native 48px compass button; position it in
 * this view's physical-right SOS/share/recenter rail. */
.user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
  position: fixed;
  z-index: 6;
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  /* MapLibre may use a different text direction than the surrounding RTL UI.
     Anchor its control to a physical edge, not an inherited inline-start. */
  right: 1.25rem;
  inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 7rem);
  width: 48px;
}
/* Keep MapLibre's scale visible beside, rather than underneath, the bottom-left
 * companions card. Its own bottom-left control slot is still used on narrow maps. */
.user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
  left: calc(27rem + env(safe-area-inset-left, 0px));
}

.user-map-view__search {
  position: absolute;
  z-index: 3;
  /* Leave the physical top-left corner free for the map-only sidebar launcher. */
  inset-block-start: calc(5rem + env(safe-area-inset-top, 0px));
  inset-inline-end: 1rem;
  width: min(25rem, calc(100% - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* The card owns the scrollbar; never paint a result or its scrollbar outside its border. */
  max-height: calc(100dvh - 6rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  overflow: visible;
}
:global(.user-map-view__search .place-search.v-card) {
  max-height: calc(100dvh - 6rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  overflow: hidden;
}
:global(.user-map-view__live .live-companions__peers) { max-height: none; overflow: visible; }

.user-map-view__playback {
  position: absolute;
  z-index: 2;
  /* The right-hand notifications launcher needs its own 48px hit area. */
  inset-block-start: calc(5rem + env(safe-area-inset-top, 0px));
  inset-inline-start: 1rem;
  width: min(24rem, calc(100% - 2rem));
  /* Keep History clear of the compact Location/SOS/compass/Broadcast rail. */
  inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 14.5rem);
  overflow-y: auto;
  pointer-events: none;
}

/* A compact 48px-step right rail: Location, SOS, compass, then optional
 * Broadcast. Mission frame inserts one more step below Broadcast. */
.user-map-view__recenter, .user-map-view__share {
  position: fixed;
  z-index: 6;
  inset-inline-start: 1.25rem;
  inset-block-end: max(1.25rem, env(safe-area-inset-bottom, 0px));
  width: 48px;
  height: 48px;
  min-width: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 50%;
  box-shadow: var(--bb-shadow-overlay);
}
.user-map-view__share { inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 10.5rem); }
@media (min-width: 600px) {
  /* Framing an active mission gets its own slot above the compass. Only then
     lift Broadcast another step; the remaining tabs keep an even four-button rail. */
  .user-map-view--mission-steps:has(.mission-desk__map-focus--pair) .user-map-view__share {
    inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 14rem);
  }
}
/* Off is neutral rather than another green/teal fill; the outline remains
 * visible over both pale map tiles and the dark raised surface. */
.user-map-view__share--idle { border-color: var(--bb-color-outline); }
.user-map-view__recenter:focus-visible, .user-map-view__share:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px;
}

/* The live card sits at the physical bottom-left in this RTL page. Leave the
 * opposite edge free for the fixed SOS, sharing and recenter actions. */
.user-map-view__live {
  position: absolute;
  z-index: 2;
  inset-block-end: calc(1rem + env(safe-area-inset-bottom, 0px));
  inset-inline-end: calc(1rem + env(safe-area-inset-left, 0px));
  width: min(26rem, calc(100% - 2rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  max-height: calc(100dvh - 7rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.user-map-view__live :deep(.live-companions) { flex-shrink: 0; }

/* At narrow/tablet widths, side panels would overlap each other and cover the map.
 * Stack them in page flow instead; keep a definite canvas height for MapLibre. */
@media (max-width: 1023px) {
  .user-map-view {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    height: auto;
    min-height: 100dvh;
    padding: calc(4.5rem + env(safe-area-inset-top, 0px)) 0.65rem 0.65rem;
    overflow: visible;
  }

  .user-map-view > .user-map-view__canvas {
    position: relative;
    order: 2;
    flex: 0 0 auto;
    height: clamp(20rem, 55dvh, 32rem);
    min-height: 20rem;
    border-radius: var(--bb-radius-nested, 16px);
  }

  /* The map scale returns to its own edge; the compass stays in the action rail. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) { left: 0; }

  .user-map-view__search,
  .user-map-view__playback,
  .user-map-view__live {
    position: static;
    width: 100%;
    max-height: none;
    overflow: visible;
    pointer-events: auto;
  }

  .user-map-view__search { order: 1; }
  .user-map-view__playback { order: 3; }
  .user-map-view__live { order: 4; }
}

/* Tablet map controls must stay on their map, not float over cards farther
 * down the document. Keep the same viewport map as desktop; narrow the two
 * persistent side panels and give Sharing's upper Search and lower list their
 * own scroll regions. The right side remains clear for SOS and map actions. */
@media (min-width: 600px) and (max-width: 1023px) {
  .user-map-view {
    position: fixed; inset: 0; z-index: 1; display: block;
    width: 100%; height: 100dvh; min-height: 0; padding: 0; overflow: hidden;
  }
  .user-map-view > .user-map-view__canvas {
    position: absolute; inset: 0; width: 100%; height: 100%;
    min-height: 0; border-radius: 0;
  }
  .user-map-view__search, .user-map-view__playback, .user-map-view__live {
    position: absolute;
    width: min(25rem, calc(50vw - 1.5rem));
    overflow-y: auto; overscroll-behavior: contain;
  }
  .user-map-view__search {
    inset-block-start: calc(5rem + env(safe-area-inset-top, 0px));
    inset-inline-end: 1rem; max-height: calc((100dvh - 8rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2);
    overflow: visible;
  }
  :global(.user-map-view__search .place-search.v-card) {
    max-height: calc((100dvh - 8rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2);
  }
  .user-map-view__live {
    inset-block-start: auto; inset-block-end: calc(1rem + env(safe-area-inset-bottom, 0px));
    inset-inline-end: 1rem; max-height: calc((100dvh - 8rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2);
  }
  .user-map-view__playback {
    inset-block-start: calc(5rem + env(safe-area-inset-top, 0px));
    inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 14.5rem);
    inset-inline-start: 1rem;
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    left: calc(50vw + env(safe-area-inset-left, 0px));
  }
}

/* Phone map: edge-to-edge behind a single top-left menu launcher, not a bar or
 * stacked cards. Fullscreen tools keep their own scrolling content and close actions. */
@media (max-width: 599px) {
  /* Leave the journey label a full row even on narrow phones; the controls wrap separately. */
  .user-map-view__reroute-status { top: calc(12.5rem + env(safe-area-inset-top, 0px)); }
  /* Guidance is a bottom dock on phones, not a floating card with a strip of
     unusable map below it. The inset belongs inside the scrollable surface so
     actions remain clear of the home indicator without opening a visual gap. */
  .user-map-view__journey-stack { left: 0; right: 0;
    transform: none; bottom: 0; width: auto; }
  /* Reserve the two 48px map-action rows and tabs above the measured dock. */
  .user-map-view__journey-content.bb-map-navigation-card {
    max-height: min(72dvh, 36rem, max(7rem, calc(100dvh - 12.25rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))));
    padding: .65rem .75rem calc(.65rem + env(safe-area-inset-bottom, 0px));
    border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0 !important; }
  /* Keep three named, glanceable values in one row. The full GPS/ETA caveats
     remain in the accessible labels; an unknown limit never resembles a number. */
  .user-map-view__telemetry { gap: 0; padding: .2rem; border: 1px solid rgba(var(--v-theme-on-surface), .1);
    border-radius: var(--bb-radius-nested, 16px); background: rgba(var(--v-theme-on-surface), .035); }
  .user-map-view__telemetry-item { border: 0; border-radius: 0; background: transparent;
    gap: .1rem; padding: .2rem .1rem; }
  .user-map-view__telemetry-item--eta { border-radius: 12px; background: rgba(var(--v-theme-primary), .13); }
  .user-map-view__telemetry-item + .user-map-view__telemetry-item { border-inline-start: 1px solid rgba(var(--v-theme-on-surface), .12); }
  .user-map-view__telemetry-item dt { font-size: .8rem; }
  .user-map-view__telemetry-item dd { font-size: 1.2rem; line-height: 1.25; overflow-wrap: normal; }
  .user-map-view__telemetry-item small { display: none; }
  .user-map-view__telemetry-unit { display: block; font-size: .8rem; line-height: 1; opacity: .8; direction: ltr; }
  .user-map-view__telemetry-item--unknown dd { display: grid; place-items: center;
    width: 2rem; height: 2rem; border: 2px solid rgba(var(--v-theme-on-surface), .55); border-radius: 50%; }
  /* The shared two-row rail below follows the measured trip sheet. Keep
     MapLibre's scale above guidance, not underneath its bottom dock. */
  .user-map-view--navigating .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: calc(var(--bb-map-navigation-sheet-height, 15rem) + 4rem);
  }
  .user-map-view__search-map-actions {
    position: fixed; z-index: 6;
    top: calc(8rem + env(safe-area-inset-top, 0px)); left: calc(0.75rem + env(safe-area-inset-left, 0px));
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem;
    max-width: min(9.75rem, calc(100vw - 11rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); pointer-events: auto;
  }
  .user-map-view__search-map-actions :deep(.v-btn) {
    min-height: 44px; height: auto; max-width: 100%; padding-inline: 0.55rem;
  }
  .user-map-view__search-map-actions :deep(.v-btn__content) {
    white-space: normal; text-align: center; font-size: 0.82rem; line-height: 1.2;
  }
  .user-map-view__search-map-actions > span {
    padding: 0.2rem 0.4rem; border-radius: 0.5rem;
    color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface));
    font-size: 0.82rem; line-height: 1.35;
  }
  /* These are three independent dialogs but share one phone layout. VCard is
   * required by Vuetify; the reusable map-side widgets are flattened *only*
   * inside the dialogs so there is one padded surface and one scrollbar. */
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content) {
    margin: 0; width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh;
  }
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content > .v-card) {
    display: flex !important; flex-direction: column; height: 100%; min-height: 0;
    overflow: hidden; background: rgb(var(--v-theme-surface)); border-radius: 0 !important;
  }
  /* Vuetify's dialog > overlay > card rules normally apply 24px of padding
   * and make the outer card scroll. Match that structure to override it rather
   * than relying on CSS import order or shrinking any child controls. */
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content > .v-card > .v-card-title) {
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    min-height: 56px;
    padding: calc(0.5rem + env(safe-area-inset-top, 0px))
      calc(1rem + env(safe-area-inset-right, 0px)) 0.5rem
      calc(1rem + env(safe-area-inset-left, 0px));
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  }
  :global(:is(.user-map-view__search-title h2, .user-map-view__history-title h2, .user-map-view__live-title h2)) {
    min-width: 0; margin: 0; font-size: 1rem; font-weight: 800; line-height: 1.4;
  }
  .user-map-view__dialog-actions { display: flex; align-items: center; gap: .25rem; flex: none; }
  :global(:is(.user-map-view__search-title .v-btn, .user-map-view__history-title .v-btn,
    .user-map-view__live-title .v-btn)) { min-width: 44px; min-height: 44px; }
  :global(:is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content > .v-card > .v-card-text) {
    display: block !important; flex: 1 1 auto; min-height: 0;
    padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    padding-left: calc(1rem + env(safe-area-inset-left, 0px));
    padding-right: calc(1rem + env(safe-area-inset-right, 0px));
    overflow-y: auto; overscroll-behavior: contain;
  }
  :global(.user-map-view__search-dialog.v-dialog > .v-overlay__content > .v-card > .v-card-text.user-map-view__search-body) { overflow: hidden; }
  :global(.user-map-view__search-dialog .user-map-view__search) {
    position: static; width: 100%; height: 100%; min-height: 0; max-height: none;
    display: flex; flex-direction: column; overflow: hidden;
  }
  :global(.user-map-view__history-dialog .user-map-view__playback) {
    position: static; width: 100%; max-height: none; overflow: visible; pointer-events: auto;
  }
  :global(.user-map-view__live-dialog .user-map-view__live) {
    position: static; width: 100%; display: flex; flex-direction: column; gap: 0.75rem;
  }
  :global(:is(.user-map-view__search-dialog .place-search.v-card,
    .user-map-view__history-dialog .history-playback.v-card,
    .user-map-view__live-dialog .live-companions.v-card)) {
    width: 100%; padding: 0; border: 0; border-radius: 0 !important;
    overflow: visible; background: transparent; backdrop-filter: none; box-shadow: none !important;
  }
  /* Preserve the stand-alone map cards at >=600px, but not their duplicate
   * headings/shadows/padding inside the phone's already-titled modal surface. */
  :global(:is(.user-map-view__search-dialog .place-search__headline,
    .user-map-view__history-dialog .history-playback__title-block h2,
    .user-map-view__live-dialog .live-companions__title-block h2)) { display: none; }
  :global(.user-map-view__search-dialog .place-search.v-card) {
    height: 100%; min-height: 0; max-height: 100%; display: flex; flex-direction: column; overflow: hidden;
  }
  :global(.user-map-view__search-dialog .place-search__content) {
    flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto; overscroll-behavior: contain;
  }
  :global(.user-map-view__history-dialog .history-playback) { max-height: none !important; overflow: visible; }
  :global(.user-map-view__history-dialog .history-playback .history-playback__body) {
    margin-top: 0.75rem; padding-top: 0; border-top: 0; gap: 0.75rem;
  }
  :global(.user-map-view__history-dialog .history-playback :is(.history-playback__source,
    .history-playback__grants, .history-playback__range, .history-playback__transport)) {
    padding: 0; border: 0; border-radius: 0; background: transparent;
  }
  :global(.user-map-view__live-dialog .live-companions .live-companions__peers) { max-height: none; overflow: visible; }

  .user-map-view {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: block;
    width: 100%;
    height: 100dvh;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .user-map-view > .user-map-view__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: 0;
  }

  /* On phones the compass sits in the upper row beside sharing and SOS. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    right: calc(0.75rem + env(safe-area-inset-right, 0px));
    left: auto;
    inset-block-end: calc(4.25rem + env(safe-area-inset-bottom, 0px));
  }
  /* The mission overlay is a sibling of MapCanvas: its scoped compass rules
   * cannot reach this shared canvas. Match its focus-button rail here. */
  .user-map-view--mission-active .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    right: calc(4.25rem + env(safe-area-inset-right, 0px));
    left: auto; top: auto;
    bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));
  }
  /* Preserve MapLibre's attribution above the lower map edge and below the menu
   * launcher, never buried beneath an open tool or the SOS pill. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
  }
  /* Whether the key is open or closed, mission progress and the two lower-left
     launchers occupy the map bottom. Keep scale on exposed map above them. */
  .user-map-view--mission-active .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: auto; top: calc(8.5rem + env(safe-area-inset-top, 0px));
    left: calc(.75rem + env(safe-area-inset-left, 0px));
  }
  /* The compact planner occupies the scale's normal phone position. Keep the
     scale on the visible map, clear of both the planner and the attribution. */
  .user-map-view--route-preview .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {
    bottom: auto; top: calc(8.5rem + env(safe-area-inset-top, 0px));
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right) {
    top: calc(4.5rem + env(safe-area-inset-top, 0px));
    bottom: auto;
    left: calc(0.25rem + env(safe-area-inset-left, 0px));
    right: auto;
  }
  /* The map's real OSM/OpenMapTiles credit is much wider than a compact phone.
   * Include its built-in padding in the cap, so its expanded text wraps beside
   * (not over) the app rail and remains fully readable. */
  .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib) {
    box-sizing: border-box;
    max-width: calc(100vw - 11.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
    margin: 0;
  }

  .user-map-view__recenter, .user-map-view__share {
    inset-inline-start: calc(0.75rem + env(safe-area-inset-right, 0px));
  }
  /* Search/Location are the lower row; SOS and compass sit above them.
     General Broadcast gets a dedicated row above every other icon. */
  .user-map-view__recenter { inset-block-end: calc(.75rem + env(safe-area-inset-bottom, 0px)); }
  .user-map-view__share {
    inset-inline-start: calc(.75rem + env(safe-area-inset-right, 0px));
    inset-block-end: calc(7.75rem + env(safe-area-inset-bottom, 0px));
  }
  .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    right: calc(7.75rem + env(safe-area-inset-right, 0px));
  }
  /* In idle Missions the hero/error card occupies the top of the map. Keep
     Broadcast in the bottom-right rail above SOS, never over the briefing. */
  .user-map-view--mission-idle .user-map-view__share {
    top: auto; bottom: calc(7.75rem + env(safe-area-inset-bottom, 0px));
    right: calc(.75rem + env(safe-area-inset-right, 0px)); left: auto;
  }
  /* Attribution remains reachable, but its collapsed info button must not
     protrude from behind the idle briefing's physical-left edge. */
  .user-map-view--mission-idle .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right) {
    top: auto; bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));
    left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
  }
  .user-map-view--mission-active .user-map-view__share {
    inset-inline-start: calc(.75rem + env(safe-area-inset-right, 0px));
    inset-block-end: calc(9.25rem + env(safe-area-inset-bottom, 0px));
  }

  /* One 48px Search action below SOS; keep map and tab controls unobscured. */
  .user-map-view__search-action {
    position: fixed; z-index: 8;
    inset-inline-start: calc(4.25rem + env(safe-area-inset-right, 0px));
    inset-block-end: calc(.75rem + env(safe-area-inset-bottom, 0px));
    width: 48px; min-width: 48px; height: 48px; border-radius: 50%;
    box-shadow: var(--bb-shadow-overlay);
  }
  .user-map-view__search-action:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
  .user-map-view--mission-steps .user-map-view__search-action {
    inset-block-end: calc(var(--bb-map-mission-sheet-height, 15rem) + .5rem);
  }

  .user-map-view__panel {
    position: static;
    width: 100%;
    max-height: none;
    overflow: visible;
    /* The Vuetify content is the scrollable/card surface, not each aside. */
    pointer-events: auto;
  }
  .user-map-view__panel:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
  .user-map-view__search, .user-map-view__playback, .user-map-view__live {
    pointer-events: auto;
  }
}

@media (max-width: 599px) {
  /* Every trip sheet uses the same two-row rail as active Missions.
     The measured sheet height includes safe-area padding exactly once. */
  .user-map-view--route-preview .user-map-view__recenter,
  .user-map-view--route-preview .user-map-view__search-action,
  .user-map-view--navigating .user-map-view__recenter,
  .user-map-view--navigating .user-map-view__search-action {
    top: auto; bottom: calc(var(--bb-map-action-sheet-height) + .5rem);
  }
  .user-map-view--route-preview { --bb-map-action-sheet-height: var(--bb-map-point-sheet-height, 48dvh); }
  .user-map-view--navigating { --bb-map-action-sheet-height: var(--bb-map-navigation-sheet-height, 15rem); }
  .user-map-view--route-preview .user-map-view__canvas :deep(.maplibregl-ctrl-top-right),
  .user-map-view--navigating .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    top: auto; bottom: calc(var(--bb-map-action-sheet-height) + 4rem);
  }
  .user-map-view--route-preview .user-map-view__share,
  .user-map-view--navigating .user-map-view__share {
    top: auto; bottom: calc(var(--bb-map-action-sheet-height) + 7.5rem);
  }
  .user-map-view--route-preview .user-map-view__recenter,
  .user-map-view--navigating .user-map-view__recenter {
    right: calc(.75rem + env(safe-area-inset-right, 0px)); left: auto;
  }
  .user-map-view--route-preview .user-map-view__share,
  .user-map-view--navigating .user-map-view__share {
    right: calc(.75rem + env(safe-area-inset-right, 0px)); left: auto;
  }
  .user-map-view--route-preview .user-map-view__canvas :deep(.maplibregl-ctrl-top-right),
  .user-map-view--navigating .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    right: calc(7.75rem + env(safe-area-inset-right, 0px)); left: auto;
  }
}

@media (max-width: 599px) {
  /* The shared compass takes the upper row beside SOS; optional route
     framing sits farther left, while Location stays at the bottom-right. */
  .user-map-view--mission-active.user-map-view--mission-steps
    .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {
    top: auto; bottom: calc(var(--bb-map-mission-sheet-height, 15rem) + 4rem);
    right: calc(4.25rem + env(safe-area-inset-right, 0px)); left: auto;
  }
  .user-map-view--mission-active.user-map-view--mission-steps .user-map-view__share {
    top: auto; bottom: calc(var(--bb-map-mission-sheet-height, 15rem) + 7.5rem);
    right: calc(.75rem + env(safe-area-inset-right, 0px)); left: auto;
  }
}
@media (max-width: 599px) and (max-height: 420px) {
  /* A trip dock plus three vertical rows cannot fit below the tabs in
     landscape. Keep Broadcast slightly above and beside the compass. */
  .user-map-view--route-preview .user-map-view__share,
  .user-map-view--navigating .user-map-view__share {
    bottom: calc(var(--bb-map-action-sheet-height) + 4.5rem);
    right: calc(11.25rem + env(safe-area-inset-right, 0px)); left: auto;
  }
}
@media (max-width: 599px) and (max-height: 560px) {
  /* Leave the mode tabs free when a tall steps dock meets a short screen.
     Spread the upper actions horizontally rather than stacking over the tabs. */
  .user-map-view--mission-steps .user-map-view__share {
    bottom: min(calc(var(--bb-map-mission-sheet-height, 15rem) + 7.5rem),
      calc(100dvh - 7.5rem - env(safe-area-inset-top, 0px)));
    right: calc(7.75rem + env(safe-area-inset-right, 0px)); left: auto;
  }
  .user-map-view--mission-steps:has(.mission-desk__map-focus--pair) .user-map-view__share {
    right: calc(11.25rem + env(safe-area-inset-right, 0px));
  }
}

:global(:root.dark .user-map-view) { background: var(--bb-color-background); }

@media (min-width: 600px) {
  :global(:root.dark .user-map-view__telemetry-item) {
    background: var(--bb-color-inset);
    border-color: var(--bb-color-outline);
  }
  :global(:root.dark .user-map-view__telemetry-item--eta) {
    background: rgba(var(--v-theme-primary), .17);
    border-color: rgb(var(--v-theme-primary));
  }
}
@media (max-width: 599px) {
  :global(:root.dark .user-map-view__telemetry) {
    background: var(--bb-color-inset);
    border-color: var(--bb-color-outline);
  }
  :global(:root.dark .user-map-view__telemetry-item + .user-map-view__telemetry-item) {
    border-inline-start-color: var(--bb-color-outline);
  }
}
/* Mission controls own this map only in Missions mode. Do not leave hidden
   personal route/companion/history controls keyboard-accessible behind them. */
.user-map-view--mission .user-map-view__journey-stack,
.user-map-view--mission .user-map-view__playback,
.user-map-view--mission .user-map-view__live { display: none !important; }
.user-map-view--mission .user-map-view__search { z-index: 7; }
</style>
