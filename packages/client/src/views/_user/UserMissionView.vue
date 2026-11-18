<template>
  <main class="mission-desk" :class="{ 'mission-desk--embedded': embedded, 'mission-desk--active': desk.activeMission.value,
    'mission-desk--terminal-hold': !!desk.terminalHold.value,
    'mission-desk--tool-open': !!desk.activeMission.value && !!activeTool,
    'mission-desk--steps-visible': !!desk.activeMission.value && !desk.terminalHold.value && !activeTool,
    'mission-desk--steps-guidance': !!desk.activeMission.value && !desk.terminalHold.value && !activeTool &&
      (navigation.active.value || !!routing.error.value || !!navigation.error.value),
    'mission-desk--route-open': !!desk.activeMission.value && activeTool === 'route' && routeSection !== 'transport' }" dir="rtl" @keydown.esc="dismissTool">
    <!-- The map workspace owns the persistent public canvas even while idle. -->
    <div class="mission-desk__shell">
      <header v-if="!desk.activeMission.value && (!embedded || desk.error.value)" class="mission-hero">
        <span class="mission-hero__eyebrow"><v-icon icon="mdi-lifebuoy" size="18" /> میز مأموریت امدادگر</span>
        <h1>{{ missionHeadline }}</h1>
        <p>{{ missionIntro }}</p>
        <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-refresh" :loading="desk.loading.value"
          @click="desk.load()">تازه‌سازی</v-btn>
        <div class="mission-hero__glow" aria-hidden="true" />
      </header>

      <v-alert v-if="desk.cancelledMissionId.value && !embedded" type="info" variant="tonal" rounded="lg" class="mission-desk__outcome mt-6" role="status">
        مأموریت لغو شد. مرکز امداد برای جایگزینی امدادگر مطلع شده است.
      </v-alert>
      <v-alert v-if="desk.completedMissionId.value && !embedded" type="success" variant="tonal" rounded="lg" class="mission-desk__outcome mt-6" role="status">
        امدادرسانی پایان یافت و وضعیت مأموریت در سرور ثبت شد.
      </v-alert>
      <section v-if="desk.terminalHold.value" class="mission-desk__terminal-alert" role="alert"
        aria-labelledby="mission-terminal-title" dir="rtl">
        <div class="mission-desk__terminal-heading">
          <v-icon icon="mdi-shield-alert-outline" size="24" aria-hidden="true" />
          <div>
            <strong id="mission-terminal-title">پایان مأموریت گزارش شد · در انتظار تأیید سرور</strong>
            <p>راهبری متوقف است. تا تأیید وضعیت، تغییر مرحله و لغو ممکن نیست.</p>
          </div>
        </div>
        <p v-if="desk.error.value" class="mission-desk__terminal-error">{{ desk.error.value }}</p>
        <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-refresh"
          :loading="desk.loading.value" @click="desk.load()">بررسی دوبارهٔ وضعیت</v-btn>
      </section>
      <v-alert v-else-if="desk.error.value" type="error" variant="tonal" rounded="lg" class="mission-desk__load-alert mt-6" role="alert">
        {{ desk.error.value }}
        <v-btn class="ms-2" size="small" variant="text" @click="desk.load()">تلاش دوباره</v-btn>
      </v-alert>
      <v-skeleton-loader v-if="desk.loading.value && !desk.missions.value.length" type="article, actions" class="mission-desk__card" />
      <section v-else-if="!desk.activeMission.value && !desk.error.value" class="mission-desk__empty">
        <v-alert v-if="embedded && desk.cancelledMissionId.value" type="success" variant="tonal" rounded="lg"
          class="mission-desk__inline-outcome" role="status">لغو مأموریت در سرور ثبت شد؛ مرکز امداد برای جایگزینی امدادگر مطلع شد.</v-alert>
        <v-alert v-else-if="embedded && desk.completedMissionId.value" type="success" variant="tonal" rounded="lg"
          class="mission-desk__inline-outcome" role="status">پایان امدادرسانی در سرور ثبت شد.</v-alert>
        <div class="mission-desk__empty-icon"><v-icon icon="mdi-check-decagram-outline" size="36" /></div>
        <h3>در حال حاضر مأموریت فعالی ندارید</h3>
        <p>پیشنهادهای دریافتی و جزئیات پذیرش در همین زبانه در دسترس‌اند.</p>
        <ProposalInboxContent :selected-offer-id="null" />
      </section>
      <div v-if="desk.activeMission.value" id="mission-workspace" class="mission-desk__workspace">
        <MissionLivePanel :mission="desk.activeMission.value" fullscreen :room-open="activeTool === 'team'"
          :visible="visible" :external-canvas="embedded" :external-map="externalMap" :external-marker="externalMarker"
          :route-active="routing.visible.value || navigation.active.value" @ready="onRouteMapReady"
          @close-room="closeTool('team')" @sharing-change="teamSharing = $event"
          @mission-ended="onMissionEnded" @camera-selected="pauseGuidanceFollow">
          <template #map-actions>
            <div v-if="pickingWaypoint" class="mission-desk__map-hint" role="status">
              برای افزودن ایستگاه روی نقشه بزنید.
              <span v-if="waypointError" role="alert" class="text-error">{{ waypointError }}</span>
              <button id="mission-cancel-waypoint" type="button" @click="cancelWaypointPick">لغو انتخاب</button>
            </div>
          </template>
          <template #route-planner>
            <v-card v-show="routing.visible.value && activeTool === 'route' && routeSection !== 'transport'" id="mission-route-panel"
              tag="section" elevation="3" rounded="xl" class="mission-route bb-map-navigation-card bb-floating-card"
              :class="{ 'mission-route--editor': routeSection !== 'plan' }"
              aria-label="برنامه‌ریزی مسیر مأموریت" tabindex="-1">
              <header class="mission-route__header">
                <span class="mission-route__emblem" aria-hidden="true"><v-icon :icon="routeSection === 'plan' ? 'mdi-map-marker-path' : routeSection === 'transport' ? 'mdi-car-multiple' : 'mdi-routes'" /></span>
                <div class="mission-route__heading">
                  <small>مأموریت فعال · {{ routeSection === 'plan' ? 'برنامه‌ریزی سفر' : routeSection === 'stops' ? 'ایستگاه‌های میانی' : routeSection === 'transport' ? 'انتخاب وسیله' : 'انتخاب مسیر' }}</small>
                  <h2>{{ routeSection === 'plan' ? 'مسیر تا محل حادثه' : routeSection === 'stops' ? 'ویرایش ایستگاه‌ها' : routeSection === 'transport' ? 'وسیلهٔ حرکت' : 'مسیرهای پیشنهادی' }}</h2>
                </div>
                <v-btn v-if="navigation.active.value" icon="mdi-stop-circle-outline" variant="tonal" color="error"
                  aria-label="توقف راهبری" title="توقف راهبری" @click="stopGuidance" />
                <v-btn v-if="routeSection !== 'plan'" icon="mdi-arrow-right" variant="text" color="primary"
                  aria-label="بازگشت به برنامهٔ سفر" @click="closeRouteSection()" />
                <v-btn icon="mdi-close" variant="text" aria-label="بستن پنل مسیر؛ مسیر روی نقشه می‌ماند" @click="closeTool('route')" />
              </header>
              <div class="mission-route__body" :class="`mission-route__body--${routeSection}`">
              <v-progress-linear v-if="routing.targetLoading.value" indeterminate color="primary" aria-label="دریافت محل حادثه" />
              <v-alert v-if="routing.error.value" class="my-3" type="warning" variant="tonal" role="alert">
                {{ routing.error.value }}
                <v-btn v-if="!routing.target.value" size="small" variant="text" @click="routing.open()">تلاش دوباره</v-btn>
              </v-alert>
              <template v-if="routing.target.value">
                <v-alert v-if="routeSection === 'plan' && navigation.error.value" type="warning" variant="tonal" role="alert" class="my-3">
                  {{ navigation.error.value }}
                </v-alert>
                <section v-if="routeSection === 'plan'" class="mission-route__decision" aria-label="گام بعدی مسیر">
                  <template v-if="routing.selectedRoute.value">
                    <div class="mission-route__decision-heading">
                      <v-icon icon="mdi-map-check-outline" size="22" aria-hidden="true" />
                      <div><strong>مسیر آماده است</strong><small>{{ transportProfiles.find(item => item.value === routing.profile.value)?.title }} · مسیر {{ (routing.selectedIndex.value + 1).toLocaleString('fa-IR') }} از {{ routing.routes.value.length.toLocaleString('fa-IR') }}</small></div>
                    </div>
                    <div class="mission-route__metrics" aria-label="برآورد سفر">
                      <div><span>مسافت</span><strong>{{ formatRouteDistance(routing.selectedRoute.value.distance_m) }}</strong></div>
                      <div><span>زمان تقریبی سفر</span><strong>{{ formatRouteDuration(routing.selectedRoute.value.duration_s) }}</strong></div>
                    </div>
                    <div class="mission-route__navigation">
                      <v-btn v-if="!navigation.active.value" color="primary" variant="flat" rounded="lg"
                        prepend-icon="mdi-navigation" :disabled="!mapReady" @click="startGuidance">شروع راهبری</v-btn>
                      <v-btn v-else color="error" variant="tonal" rounded="lg" prepend-icon="mdi-stop-circle-outline"
                        @click="stopGuidance">توقف راهبری</v-btn>
                      <p v-if="navigation.active.value" role="status" class="text-caption mb-0">
                        {{ !navigation.fix.value ? 'در انتظار موقعیت تازهٔ GPS…' : followingGps ? 'دوربین نقشه موقعیت شما را دنبال می‌کند؛ مسیر را با محیط واقعی تطبیق دهید.' : 'دوربین روی نمای انتخابی شماست؛ برای دنبال‌کردن دوبارهٔ GPS، دکمهٔ موقعیت را بزنید.' }}
                      </p>
                    </div>
                  </template>
                  <template v-else>
                    <div class="mission-route__decision-heading">
                      <v-icon icon="mdi-map-marker-path" size="22" aria-hidden="true" />
                      <div><strong>گام بعدی: دریافت مسیر</strong><small>مبدأ فقط پس از درخواست شما از GPS گرفته می‌شود.</small></div>
                    </div>
                    <v-btn color="primary" variant="flat" rounded="lg" :loading="routing.loading.value" :disabled="navigation.active.value"
                      @click="routing.findRoutes()">{{ routing.from.value ? 'محاسبهٔ دوبارهٔ مسیر' : 'دریافت موقعیت و مسیر' }}</v-btn>
                  </template>
                </section>
                <details v-if="routeSection === 'plan'" class="mission-route__route-details">
                  <summary>وسیله، مسیر، ایستگاه‌ها و جزئیات <v-icon icon="mdi-chevron-down" size="18" aria-hidden="true" /></summary>
                  <div class="mission-route__route-details-body">
                    <div v-if="routeSection === 'plan'" class="mission-route__section-links" role="group" aria-label="تنظیمات مسیر">
                  <button type="button" :disabled="navigation.active.value" @click="openTransportSection"><v-icon icon="mdi-car-multiple" /><span><strong>وسیله</strong><small>{{ transportProfiles.find(item => item.value === routing.profile.value)?.title }}</small></span><v-icon icon="mdi-chevron-left" /></button>
                  <button type="button" :disabled="!routing.routes.value.length || navigation.active.value" @click="openAlternativesSection"><v-icon icon="mdi-routes" /><span><strong>مسیرها</strong><small>{{ routing.routes.value.length ? `مسیر ${(routing.selectedIndex.value + 1).toLocaleString('fa-IR')} از ${routing.routes.value.length.toLocaleString('fa-IR')}` : 'پس از دریافت مسیر' }}</small></span><v-icon icon="mdi-chevron-left" /></button>
                  <button type="button" :disabled="navigation.active.value" @click="openStopsSection"><v-icon icon="mdi-map-marker-plus-outline" /><span><strong>ایستگاه‌ها</strong><small>{{ routing.via.value.length ? `${routing.via.value.length.toLocaleString('fa-IR')} مورد` : 'اختیاری' }}</small></span><v-icon icon="mdi-chevron-left" /></button>
                </div>

                <div v-if="routeSection === 'plan'" class="mission-route__endpoints" role="group" aria-label="مبدأ و مقصد">
                  <div class="mission-route__endpoint">
                    <span class="mission-route__endpoint-mark" aria-hidden="true" />
                    <div class="mission-route__endpoint-copy">
                      <span><strong>مبدأ</strong> <small>موقعیت مسیر؛ نه موقعیت زنده</small></span>
                      <bdi v-if="routing.from.value" dir="ltr">{{ routing.from.value.lat.toFixed(5) }}, {{ routing.from.value.lon.toFixed(5) }}</bdi>
                      <span v-else class="mission-route__endpoint-pending">پس از دریافت موقعیت مشخص می‌شود</span>
                    </div>
                  </div>
                  <div class="mission-route__endpoint">
                    <span class="mission-route__endpoint-mark mission-route__endpoint-mark--incident" aria-hidden="true">!</span>
                    <div class="mission-route__endpoint-copy">
                      <span><strong>محل حادثه</strong> <small>مقصد نهایی · ثابت</small></span>
                      <bdi dir="ltr">{{ routing.target.value.incident.lat.toFixed(5) }}, {{ routing.target.value.incident.lon.toFixed(5) }}</bdi>
                    </div>
                  </div>
                </div>
                <div v-if="routeSection === 'plan' && routing.from.value && !navigation.active.value" class="mission-route__route-actions">
                  <v-btn v-if="routing.selectedRoute.value" color="primary" variant="tonal" rounded="lg"
                    :disabled="routing.loading.value" @click="routing.findRoutes()">محاسبهٔ دوبارهٔ مسیر</v-btn>
                  <v-btn color="primary" variant="tonal" rounded="lg"
                    :disabled="routing.loading.value" @click="routing.findRoutes(true)">به‌روزرسانی مبدأ</v-btn>
                </div>
                <v-btn v-if="(routing.from.value || routing.via.value.length) && !navigation.active.value"
                  variant="text" color="error" prepend-icon="mdi-delete-outline"
                  :disabled="!routing.target.value || routing.targetLoading.value"
                  @click="routeDeleteConfirmOpen = true">پاک‌کردن برنامهٔ مسیر</v-btn>
                <div v-if="routeSection === 'plan' && routing.routes.value.length" class="mission-route__step-control" role="group" aria-label="مراحل مسیر پیشنهادی">
                  <v-slider :model-value="routing.step.value" :min="0" :max="routing.via.value.length + 1" :step="1"
                    label="نمایش ایستگاه روی نقشه" thumb-label="always" :disabled="navigation.active.value"
                    @update:model-value="focusRouteStep(Number($event))" />
                  <p role="status">{{ currentStopLabel }}</p>
                </div>
                  </div>
                </details>
                <section v-if="routeSection === 'stops'" class="mission-route__stops" aria-label="ویرایش ایستگاه‌های میانی">
                  <p class="mission-route__help">حداکثر ۶ ایستگاه؛ محل حادثه مقصد نهایی می‌ماند.</p>
                  <div class="mission-route__stops-body">
                    <v-btn variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-map-marker-plus-outline"
                      class="mission-route__map-stop" :disabled="navigation.active.value || routing.via.value.length >= 6 || !mapReady || !routing.target.value"
                      :aria-pressed="pickingWaypoint" @click="toggleWaypointPick">
                      {{ pickingWaypoint ? 'لغو انتخاب روی نقشه' : 'افزودن نقطه از نقشه' }}
                    </v-btn>
                    <details class="mission-route__manual">
                      <summary>ورود دستی مختصات <v-icon icon="mdi-chevron-down" size="18" aria-hidden="true" /></summary>
                      <div class="mission-route__manual-fields">
                        <v-text-field v-model="waypointLat" type="number" inputmode="decimal" label="عرض (°)" aria-label="عرض جغرافیایی ایستگاه"
                          density="compact" variant="outlined" hide-details class="mission-route__coordinate" />
                        <v-text-field v-model="waypointLon" type="number" inputmode="decimal" label="طول (°)" aria-label="طول جغرافیایی ایستگاه"
                          density="compact" variant="outlined" hide-details class="mission-route__coordinate" />
                        <v-btn variant="tonal" color="primary" rounded="lg" :disabled="navigation.active.value || routing.via.value.length >= 6"
                          @click="addTypedWaypoint">افزودن مختصات</v-btn>
                      </div>
                    </details>
                    <p v-if="waypointError" role="alert" class="mission-route__error text-error">{{ waypointError }}</p>
                    <ol v-if="routing.via.value.length" class="mission-route__stop-list">
                      <li v-for="(point, index) in routing.via.value" :key="`${point.lat},${point.lon},${index}`"
                        draggable="true" @dragstart="onWaypointDrag(index, $event)" @dragover.prevent
                        @drop.prevent="onWaypointDrop(index)" @dragend="draggingWaypoint = null">
                        <span>ایستگاه {{ (index + 1).toLocaleString('fa-IR') }}: <bdi dir="ltr">{{ point.lat.toFixed(5) }}, {{ point.lon.toFixed(5) }}</bdi></span>
                        <div class="d-flex ga-1">
                          <v-btn icon="mdi-arrow-up" size="small" variant="text" :disabled="navigation.active.value || index === 0"
                            :aria-label="`جابه‌جایی ایستگاه ${index + 1} به قبل`" @click="routing.moveWaypoint(index, index - 1)" />
                          <v-btn icon="mdi-arrow-down" size="small" variant="text" :disabled="navigation.active.value || index === routing.via.value.length - 1"
                            :aria-label="`جابه‌جایی ایستگاه ${index + 1} به بعد`" @click="routing.moveWaypoint(index, index + 1)" />
                          <v-btn icon="mdi-close" size="small" variant="text" :disabled="navigation.active.value"
                            :aria-label="`حذف ایستگاه ${index + 1}`" @click="routing.removeWaypoint(index)" />
                        </div>
                      </li>
                    </ol>
                    <v-switch v-if="routing.via.value.length" :model-value="routing.optimize.value" label="بهینه‌سازی ترتیب ایستگاه‌ها"
                      :disabled="navigation.active.value" hide-details color="primary" density="compact" class="mission-route__optimize"
                      @update:model-value="routing.setOptimize(Boolean($event))" />
                  </div>
                </section>
                <p v-if="routeSection === 'alternatives'" class="mission-route__preview-note" role="status">
                  لمس هر مسیر فقط پیش‌نمایش آن را روی نقشه نشان می‌دهد؛ برای نگه‌داشتن آن، «تأیید این مسیر» را بزنید. بازگشت، مسیر قبلی را نگه می‌دارد.
                </p>
                <div v-if="routeSection === 'alternatives' && routing.routes.value.length" class="mission-route__choices" role="group" aria-label="انتخاب مسیر پیشنهادی">
                  <button v-for="(choice, index) in routing.routes.value" :key="index" type="button"
                    class="mission-route__choice" :class="{ 'mission-route__choice--selected': routing.selectedIndex.value === index }"
                    :aria-pressed="routing.selectedIndex.value === index" :disabled="navigation.active.value" @click="previewAlternative(index)">
                    <strong>مسیر {{ (index + 1).toLocaleString('fa-IR') }}</strong>
                    <span>{{ formatRouteDistance(choice.distance_m) }} · {{ formatRouteDuration(choice.duration_s) }}</span>
                    <small v-if="choice.elevation">صعود تخمینی: {{ Math.round(choice.elevation.gain_m).toLocaleString('fa-IR') }} متر · نزول تخمینی: {{ Math.round(choice.elevation.loss_m).toLocaleString('fa-IR') }} متر</small>
                    <small v-else>ارتفاع: دادهٔ آفلاین برای تمام این مسیر موجود نیست.</small>
                    <span v-if="elevationCharts[index]" class="mission-route__elevation-chart">
                      <svg viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="elevationCharts[index]?.area" class="mission-route__elevation-area" />
                        <path :d="elevationCharts[index]?.line" class="mission-route__elevation-line" />
                      </svg>
                      <small>{{ elevationCharts[index]?.range }} · چپ: شروع، راست: مقصد</small>
                      <span class="sr-only">{{ elevationCharts[index]?.description }}</span>
                    </span>
                  </button>
                </div>
                <p v-if="routeSection === 'alternatives' && routing.routes.value.some(choice => choice.elevation)" class="text-caption mt-2">
                  ارتفاع تقریبی از داده‌های محلی Mapzen/Tilezen محاسبه شده است؛ برای تصمیم ایمنی در مسیر به تنهایی کافی نیست.
                  <a href="/terrain-attribution.html" target="_blank" rel="noopener noreferrer">منابع و حق انتساب داده‌های ارتفاع (آفلاین)</a>
                </p>
                <div v-if="routeSection === 'alternatives'" class="mission-route__navigation">
                  <v-btn color="primary" variant="flat" rounded="lg" @click="acceptAlternative">تأیید این مسیر</v-btn>
                  <v-btn color="primary" variant="text" rounded="lg" @click="closeRouteSection()">بازگشت بدون تغییر</v-btn>
                </div>
                <p v-if="routeSection === 'plan' && routing.routes.value.length === 1" class="text-caption mt-2" role="status">
                  برای این وسیله فقط یک مسیر در شبکهٔ راه‌های محلی پیدا شد؛ وجود چند مسیر تضمین نمی‌شود.
                </p>
              </template>
              </div>
            </v-card>
          </template>
        </MissionLivePanel>
        <PointTransportChoicesSheet :mission-id="desk.activeMission.value.id" :mission-profile="routing.profile.value"
          :open="activeTool === 'route' && routeSection === 'transport'" :show-search="false"
          @confirm="confirmMissionTransport" @close="closeRouteSection()" />
        <v-alert v-if="routeSaveWarning && !desk.terminalHold.value" type="warning" variant="tonal" role="alert">
          {{ routeSaveWarning }}
        </v-alert>
        <div v-if="!desk.terminalHold.value && activeTool !== 'route' && (routing.error.value || navigation.error.value)"
          class="mission-desk__guidance mission-desk__guidance--warning" role="alert">
          <span>{{ routing.error.value || navigation.error.value }}</span>
          <v-btn v-if="!desk.terminalHold.value && !desk.error.value && !desk.loading.value" size="small" variant="tonal"
            @click="openRouteWorkspace">بررسی مسیر</v-btn>
          <v-btn v-if="navigation.active.value" size="small" variant="tonal" color="error"
            @click="stopGuidance">توقف</v-btn>
          <v-btn v-else-if="!routing.error.value" icon="mdi-close" size="small" variant="text"
            aria-label="بستن هشدار راهبری" @click="navigation.dismissError()" />
        </div>
        <div v-else-if="navigation.active.value" class="mission-desk__guidance mission-desk__guidance--active" role="status">
          <span class="mission-desk__guidance-symbol" aria-hidden="true"><v-icon icon="mdi-navigation-variant" /></span>
          <div class="mission-desk__guidance-copy">
            <strong>{{ !navigation.fix.value ? 'راهبری فعال · در انتظار GPS' : followingGps ? 'راهبری GPS فعال است' : 'دنبال‌کردن نقشه متوقف است' }}</strong>
            <small v-if="incidentDistance !== null" class="mission-desk__direct-distance" aria-live="off"
              :aria-label="`فاصلهٔ مستقیم تقریبی تا محل حادثه: ${formatRouteDistance(incidentDistance)}`">
              <bdi>{{ formatRouteDistance(incidentDistance) }}</bdi> · مستقیم تا حادثه (تقریبی)
            </small>
            <small v-if="routing.selectedRoute.value" class="mission-desk__planned-distance">{{ formatRouteDistance(routing.selectedRoute.value.distance_m) }} مسیر برنامه‌ریزی‌شده · زمان رسیدن زنده در دسترس نیست</small>
          </div>
          <v-btn size="small" variant="tonal" color="error" @click="stopGuidance">توقف راهبری</v-btn>
        </div>
        <div v-show="!pickingWaypoint && activeTool !== 'status' && activeTool !== 'team'"
          class="mission-desk__map-focus" :class="{ 'mission-desk__map-focus--pair': routing.visible.value && !!routing.target.value }"
          role="group" aria-label="کنترل‌های نمای نقشهٔ مأموریت">
          <v-btn :icon="ownFocus.icon" :color="ownFocus.color" variant="flat"
            :aria-label="ownFocus.label" :title="ownFocus.label"
            :aria-pressed="navigation.active.value ? followingGps : undefined" :disabled="!mapReady"
            @click="navigation.active.value ? resumeGuidanceFollow() : emit('focus-own')" />
          <v-btn v-if="routing.visible.value && routing.target.value" class="mission-desk__frame-action"
            icon="mdi-fit-to-screen" color="primary" variant="flat"
            aria-label="نمایش محل حادثه و مسیر مأموریت" title="نمایش محل حادثه و مسیر مأموریت"
            :disabled="!mapReady || !!desk.terminalHold.value" @click="frameMissionRoute" />
        </div>
        <div v-if="!desk.terminalHold.value && (!activeTool || activeTool === 'status')"
          id="mission-steps-stack" class="mission-desk__bottom-stack" :class="{ 'mission-desk__bottom-stack--information': activeTool === 'status' }">
          <section v-if="legendOpen" id="mission-map-legend" class="mission-desk__map-legend bb-floating-card"
            aria-labelledby="mission-map-legend-title" dir="rtl" tabindex="-1">
            <h2 id="mission-map-legend-title">راهنمای نقشه</h2>
            <ul class="mission-desk__map-legend-body" aria-label="راهنمای نشانگرها">
              <li><i class="mission-desk__legend-symbol mission-desk__legend-symbol--incident" aria-hidden="true">!</i> حادثه</li>
              <li><i class="mission-desk__legend-symbol mission-desk__legend-symbol--origin" aria-hidden="true" /> مبدأ مسیر</li>
              <li><i class="mission-desk__legend-symbol mission-desk__legend-symbol--stop" aria-hidden="true" /> ایستگاه</li>
              <li><i class="mission-desk__legend-symbol mission-desk__legend-symbol--requester" aria-hidden="true" /> درخواست‌کننده</li>
              <li><i class="mission-desk__legend-symbol mission-desk__legend-symbol--rescuer" aria-hidden="true" /> امدادگر</li>
              <li><i class="mission-desk__legend-symbol mission-desk__legend-symbol--admin" aria-hidden="true" /> مدیر مرکز</li>
            </ul>
            <small>مبدأ مسیر زنده نیست؛ تازگی موقعیت‌های اشتراکی را بررسی کنید.</small>
          </section>
          <MissionStatusPanel v-if="activeTool === 'status'" :desk="desk" :visible="visible"
            @close="closeTool('status')" />
          <div v-else class="mission-desk__bottom-panel">
            <div class="mission-desk__map-cards">
              <MissionMapCards :desk="desk" :steps="steps" :active-step="activeStep" :team-sharing="teamSharing"
                :current-status-label="currentStatusLabel" :next-status-label="nextStatusLabel">
                <template #team>
                  <div class="mission-desk__header-actions">
                    <v-btn id="mission-tool-team" class="mission-desk__team-action" icon="mdi-account-group-outline" variant="tonal" size="small"
                      aria-label="نمایش اعضای مأموریت" title="نمایش اعضای مأموریت"
                      aria-controls="mission-team-panel" :aria-expanded="false" @click="toggleTool('team')" />
                    <v-btn id="mission-tool-route" class="mission-desk__route-action" icon="mdi-routes" variant="tonal" size="small"
                      :color="routeCue.tone === 'warning' ? 'warning' : 'primary'"
                      :class="{ 'mission-desk__route-action--warning': routeCue.tone === 'warning', 'mission-desk__route-action--ready': routeCue.tone === 'ready' }"
                      :aria-label="`مسیر مأموریت: ${routeCue.label}؛ باز کردن پنل مسیر`"
                      :title="`مسیر مأموریت: ${routeCue.label}`"
                      :aria-expanded="activeTool === 'route'" aria-controls="mission-route-panel"
                      :disabled="!!desk.terminalHold.value || !!desk.error.value || desk.loading.value"
                      @click="toggleTool('route')" />
                  </div>
                </template>
              </MissionMapCards>
            </div>
          </div>
        </div>
        <v-btn v-show="!desk.terminalHold.value && (!activeTool || activeTool === 'status')"
          id="mission-tool-legend" class="mission-desk__legend-action" icon="mdi-map-outline"
          :color="legendOpen ? 'primary' : 'surface'" variant="flat"
          :aria-label="legendOpen ? 'بستن راهنمای نقشه' : 'نمایش راهنمای نقشه'"
          :title="legendOpen ? 'بستن راهنمای نقشه' : 'راهنمای نقشه'"
          :aria-expanded="legendOpen" aria-controls="mission-map-legend" @click="toggleLegend" />
        <v-btn id="mission-tool-status" class="mission-desk__info-action" icon="mdi-information-outline"
          :color="activeTool === 'status' ? 'primary' : 'surface'" variant="flat"
          :aria-label="activeTool === 'status' ? 'بستن اطلاعات مأموریت' : 'نمایش اطلاعات مأموریت'"
          :title="activeTool === 'status' ? 'بستن اطلاعات مأموریت' : 'اطلاعات مأموریت'"
          :aria-expanded="activeTool === 'status'" aria-controls="mission-status-panel"
          @click="toggleTool('status')" />
      </div>
    </div>

    <v-dialog v-model="routeDeleteConfirmOpen" max-width="24rem" :close-on-back="false"
      aria-labelledby="mission-route-delete-title" @keydown.esc.stop="routeDeleteConfirmOpen = false">
      <v-card class="bb-floating-card" rounded="xl" dir="rtl">
        <v-card-title id="mission-route-delete-title">برنامهٔ مسیر پاک شود؟</v-card-title>
        <v-card-text>فقط مسیر، مبدأ و ایستگاه‌های میانی پاک می‌شوند؛ محل حادثه و مأموریت حذف نمی‌شوند.</v-card-text>
        <v-card-actions>
          <v-btn variant="tonal" color="primary" @click="routeDeleteConfirmOpen = false">انصراف</v-btn>
          <v-btn color="error" variant="flat" @click="resetRoutePlan">پاک کردن مسیر</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog :model-value="desk.cancellationOpen.value" max-width="510" scrollable :persistent="desk.cancelling.value"
      @update:model-value="(visible: boolean) => { if (!visible) desk.dismissCancellation(); }">
      <v-card rounded="xl" class="pa-2" dir="rtl">
        <v-card-title class="text-wrap">واقعاً قادر به ادامهٔ مأموریت نیستید؟</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" rounded="lg" class="mb-5">
            این اقدام را فقط در شرایط ضروری انجام دهید. پس از ثبت، مأموریت به مرکز امداد ارجاع می‌شود تا امدادگر جایگزین پیدا شود.
          </v-alert>
          <v-alert v-if="desk.missionChanged.value" type="warning" variant="tonal" role="alert" class="mb-4">
            مأموریت فعال تغییر کرده است. این تأیید برای مأموریت قبلی بود؛ فرم را ببندید و مأموریت فعلی را دوباره بررسی کنید.
          </v-alert>
          <v-progress-linear v-if="desk.reasonLoading.value && !desk.missionChanged.value" indeterminate color="primary" aria-label="دریافت دلایل لغو" class="mb-4" />
          <v-alert v-if="desk.cancellationError.value && !desk.missionChanged.value" type="error" variant="tonal" role="alert" class="mb-4">
            {{ desk.cancellationError.value }}
          </v-alert>
          <v-alert v-if="desk.cancellationNeedsRefresh.value && !desk.missionChanged.value" type="warning" variant="tonal" role="alert" class="mb-4">
            پیش از ثبت دوبارهٔ لغو، وضعیت مأموریت را از سرور بررسی کنید.
            <span v-if="desk.error.value">{{ desk.error.value }}</span>
            <v-btn size="small" variant="text" :loading="desk.loading.value" @click="desk.load()">تازه‌سازی وضعیت</v-btn>
          </v-alert>
          <v-btn v-if="desk.cancellationError.value && !desk.reasons.value.length && !desk.missionChanged.value" variant="tonal" color="primary"
            :disabled="desk.reasonLoading.value" @click="desk.showCancellation()">دریافت دوبارهٔ دلایل</v-btn>
          <v-radio-group v-if="desk.reasons.value.length && !desk.missionChanged.value" v-model="desk.reasonId.value" label="دلیل ناتوانی در ادامه"
            :disabled="desk.cancelling.value" hide-details>
            <v-radio v-for="reason in desk.reasons.value" :key="reason.id" :label="reason.labelFa || reason.label" :value="reason.id" />
          </v-radio-group>
          <v-textarea v-if="!desk.missionChanged.value && desk.selectedReason.value?.requiresCustomText" v-model="desk.customReason.value"
            label="توضیح (۱۰ تا ۲۰۰ نویسه)" hint="دلیل «سایر» برای بررسی مدیر علامت‌گذاری می‌شود."
            persistent-hint counter="200" maxlength="200" variant="outlined" rows="2" :disabled="desk.cancelling.value" />
          <p class="mission-desk__limit">حداکثر ۳ لغو در هر ساعت؛ از استفادهٔ غیرضروری خودداری کنید.</p>
        </v-card-text>
        <v-card-actions class="mission-cancel-actions">
          <v-spacer />
          <v-btn variant="text" :disabled="desk.cancelling.value" @click="desk.dismissCancellation()">ادامهٔ مأموریت</v-btn>
          <v-btn color="error" variant="flat" rounded="lg" :loading="desk.cancelling.value"
            :disabled="!desk.canCancel.value" @click="desk.confirmCancellation()">ثبت ناتوانی و آگاه‌سازی مرکز</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRouteNavigation } from "@/composables/use-route-navigation";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, MapMovementEvent, Marker } from "maplibre-gl";
import MissionLivePanel from "@/components/mission/MissionLivePanel.vue";
import MissionStatusPanel from "@/components/mission/MissionStatusPanel.vue";
import MissionMapCards from "@/components/mission/MissionMapCards.vue";
import ProposalInboxContent from "@/components/shell/ProposalInboxContent.vue";
import PointTransportChoicesSheet from "@/components/map/PointTransportChoicesSheet.vue";
import { useMissionRoutes } from "@/composables/use-mission-routes";
import { saveSuggestedMissionRoute } from "@/api/mission";
import { createMissionRouteWorkspace, type RouteWorkspaceSection } from "@/mission/route-workspace";
import { missionMapCamera, missionRouteStop } from "@/sos/mission-map";
import { incidentDistanceMetres } from "@/mission/incident-distance";
import { missionRouteCue } from "@/mission/route-cue";
import { formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
import { useMissionRouteGeometry } from "@/sos/mission-route-geometry";
import { useRouteElevationCharts } from "@/sos/route-elevation-charts";
import { needsOverlayRestore } from "@/map/overlay-restore";
import type { RouteChoice, TransportProfile } from "@/api/mission-routing";
import { useMissionDesk } from "@/composables/use-mission-desk";
import { decodeAccessTokenClaims } from "@/composables/device-identity";
import { useAuthStore } from "@/stores/auth";
import { useProposalInboxStore } from "@/stores/proposal-inbox";
import { useRescuerMissionShareStore } from "@/stores/rescuer-mission-share";

// Standalone support is retained only while old bookmarks migrate; the map
// workspace passes its existing MapCanvas and Marker constructor here.
const props = withDefaults(defineProps<{
  embedded?: boolean; visible?: boolean; externalMap?: MapLibreMap | null; externalMarker?: typeof Marker | null;
  ownRecenterLabel?: string; ownLocationError?: boolean;
}>(), { embedded: false, visible: true, ownRecenterLabel: "نمایش موقعیت من روی نقشه", ownLocationError: false });
const emit = defineEmits<{ "focus-own": [] }>();
const auth = useAuthStore();
const inbox = useProposalInboxStore();
const assignment = useRescuerMissionShareStore();
watch(() => assignment.mission?.id, (id) => { if (id) void desk.load(); }, { flush: "post" });
// The workspace remains mounted through offer acceptance; the desk no longer
// relies on a route remount to fetch the newly committed assignment.
watch(() => inbox.acceptedMissionId, (id) => { if (id) void desk.load(); }, { flush: "post" });
const desk = useMissionDesk(computed(() => auth.accessToken), computed(() => auth.user?.id ?? null),
  () => auth.ensureSession());
const routing = useMissionRoutes(computed(() => auth.accessToken), computed(() => auth.user?.id ?? null),
  computed(() => desk.activeMission.value?.id ?? null), () => auth.ensureSession());
const transportProfiles = [
  { title: "خودرو", value: "car" },
  { title: "دوچرخه", value: "bicycle" },
  { title: "پیاده", value: "foot" }
] satisfies { title: string; value: TransportProfile }[];
const missionHeadline = computed(() => {
  if (desk.error.value) return "وضعیت تازهٔ مأموریت تأیید نشد.";
  if (desk.activeMission.value) return "کمک در جریان است.";
  if (desk.loading.value) return "در حال بررسی مأموریت…";
  if (desk.cancelledMissionId.value) return "مرکز امداد مطلع شد.";
  if (desk.completedMissionId.value) return "امدادرسانی ثبت شد.";
  return "مأموریت فعالی ندارید.";
});
const missionIntro = computed(() => {
  if (desk.error.value) return "آخرین اطلاعات ممکن است قدیمی باشد؛ برای تأیید وضعیت از سرور دوباره تلاش کنید.";
  if (desk.activeMission.value) return "پیشرفت مأموریت را دنبال کنید. اگر واقعاً قادر به ادامه نیستید، مرکز امداد را از همین‌جا باخبر کنید.";
  if (desk.loading.value) return "در حال دریافت آخرین وضعیت از سرور…";
  if (desk.cancelledMissionId.value) return "مأموریت قبلی برای یافتن امدادگر جایگزین به مرکز ارجاع شد.";
  if (desk.completedMissionId.value) return "پایان مأموریت در سرور تأیید شد. برای مأموریت بعدی پیشنهادها را بررسی کنید.";
  return "برای پذیرفتن مأموریت تازه، پیشنهادهای دریافتی را بررسی کنید.";
});
const mapReady = ref(false);
const followingGps = ref(true);
const teamSharing = ref(false);
const activeTool = ref<"status" | "route" | "team" | null>(null);
const legendOpen = ref(false);
function toggleLegend(): void {
  legendOpen.value = !legendOpen.value;
  const target = legendOpen.value ? "mission-map-legend" : "mission-tool-legend";
  void nextTick(() => document.getElementById(target)?.focus({ preventScroll: true }));
}
watch(activeTool, (tool) => { if (tool === "route" || tool === "team") legendOpen.value = false; });
watch(() => desk.terminalHold.value, (held) => { if (held) legendOpen.value = false; });
// Match the Navigate tab's bottom sheet. Its content and legend can grow, so
// measure their actual viewport height before positioning the external SOS,
// Search and in-map icon rails. Clear the shared variable on every exit path.
watch([() => props.visible, () => desk.activeMission.value?.id, activeTool,
  () => desk.terminalHold.value, legendOpen], async (_values, _previous, onCleanup) => {
  let disposed = false;
  let observer: ResizeObserver | undefined;
  let onResize: (() => void) | undefined;
  onCleanup(() => {
    disposed = true;
    observer?.disconnect();
    if (onResize) window.removeEventListener("resize", onResize);
    document.documentElement.style.removeProperty("--bb-map-mission-sheet-height");
  });
  if (!props.visible || !desk.activeMission.value || desk.terminalHold.value || activeTool.value) return;
  await nextTick();
  if (disposed) return;
  const element = document.getElementById("mission-steps-stack");
  if (!element) return;
  const update = () => document.documentElement.style.setProperty("--bb-map-mission-sheet-height",
    `${Math.ceil(window.innerHeight - element.getBoundingClientRect().top)}px`);
  update();
  observer = new ResizeObserver(update);
  observer.observe(element);
  onResize = update;
  window.addEventListener("resize", onResize);
}, { flush: "post" });
// Like the companion map, planning, transport and alternatives are separate views.
// The chooser snapshots the selected route: tapping previews, Accept commits, Back restores.
const routeWorkspace = createMissionRouteWorkspace((index) => routing.selectRoute(index));
const routeSection = ref<RouteWorkspaceSection | "stops">("plan");
const routeDeleteConfirmOpen = ref(false);
function closeRouteSection(restore = true): void {
  if (restore) routeWorkspace.close(); else routeWorkspace.reset();
  routeSection.value = "plan";
  if (restore) void nextTick(() => {
    if (activeTool.value === "route") document.getElementById("mission-route-panel")?.focus({ preventScroll: true });
  });
}
function openStopsSection(): void {
  if (navigation.active.value || !routing.target.value) return;
  routeSection.value = "stops";
  void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
}
function openTransportSection(): void {
  if (navigation.active.value || !routing.target.value) return;
  routeWorkspace.openTransport(); routeSection.value = routeWorkspace.section;
  void nextTick(() => document.getElementById("map-point-transport-choices-sheet")?.focus({ preventScroll: true }));
}
function openAlternativesSection(): void {
  if (!routing.routes.value.length || navigation.active.value) return;
  routeWorkspace.openAlternatives(routing.selectedIndex.value);
  routeSection.value = routeWorkspace.section;
  void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
}
function previewAlternative(index: number): void {
  routeWorkspace.preview(index, routing.routes.value.length);
}
function acceptAlternative(): void {
  routeWorkspace.accept(); routeSection.value = routeWorkspace.section;
  void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
}
watch(routing.routes, () => {
  // Editing a stop invalidates the route preview, but must not close the stop
  // editor mid-click (otherwise a second stop or reorder becomes impossible).
  if (routeSection.value === "stops") { routeWorkspace.reset(); return; }
  closeRouteSection(false);
}, { flush: "sync" });

const pickingWaypoint = ref(false);
const waypointLat = ref("");
const waypointLon = ref("");
const waypointError = ref("");
let draggingWaypoint: number | null = null;
const currentStopLabel = computed(() => {
  const stops = routing.order.value.length ? routing.order.value :
    Array.from({ length: routing.via.value.length + 2 }, (_, index) => index);
  const inputIndex = stops[routing.step.value];
  if (inputIndex === 0) return "A: موقعیت شروع";
  if (inputIndex === routing.via.value.length + 1) return "مقصد نهایی: محل حادثه";
  return `ایستگاه ${inputIndex}: ${routing.via.value[inputIndex! - 1]?.lat.toFixed(5)}, ${routing.via.value[inputIndex! - 1]?.lon.toFixed(5)}`;
});
function focusRouteStep(index: number): void {
  if (!routing.selectedRoute.value || navigation.active.value || !routeMap ||
      !Number.isInteger(index) || index < 0 || index > routing.via.value.length + 1) return;
  routing.selectStep(index);
  const incident = routing.target.value?.incident;
  if (!incident) return;
  const point = missionRouteStop(incident, routing.from.value, routing.via.value,
    routing.order.value, routing.step.value);
  if (!point) return;
  highlightRouteStop();
  routeMap.easeTo({ center: [point.lon, point.lat], zoom: Math.max(14, Math.min(routeMap.getZoom(), 15)), duration: 450 });
}
// Shared map search proposes a stop, never a new incident. The parent requires
// a second explicit confirmation; guidance is stopped before altering its route.
function addSearchWaypoint(lat: number, lon: number): boolean {
  if (!desk.activeMission.value || desk.error.value || desk.terminalHold.value || !routing.target.value ||
    routing.via.value.length >= 6 || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lon) || lon < -180 || lon > 180) return false;
  if (navigation.active.value) stopGuidance();
  const added = routing.addWaypoint({ lat, lon });
  if (added) openRouteWorkspace();
  return added;
}
defineExpose({ addSearchWaypoint, hasActiveMission: computed(() => !!desk.activeMission.value),
  hasOpenMapTool: computed(() => !!desk.activeMission.value && !!activeTool.value),
  hasStepsSheet: computed(() => !!desk.activeMission.value && !desk.terminalHold.value && !activeTool.value),
  hasMapLegend: computed(() => legendOpen.value && !desk.terminalHold.value &&
    (!activeTool.value || activeTool.value === 'status')) });
function addTypedWaypoint(): void {
  const lat = Number(waypointLat.value);
  const lon = Number(waypointLon.value);
  if (!waypointLat.value.trim() || !waypointLon.value.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    waypointError.value = "مختصات معتبر WGS84 وارد کنید.";
    return;
  }
  if (!routing.addWaypoint({ lat, lon })) {
    waypointError.value = "ایستگاه افزوده نشد؛ وضعیت مأموریت و تعداد ایستگاه‌ها را بررسی کنید.";
    return;
  }
  waypointError.value = "";
  waypointLat.value = "";
  waypointLon.value = "";
}
function openRouteWorkspace(): void {
  if (desk.loading.value || desk.error.value || desk.terminalHold.value) return;
  // The private incident read does not request GPS or publish location.
  if (!routing.visible.value) void routing.open();
  activeTool.value = "route";
  void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
}
function toggleTool(tool: "status" | "route" | "team"): void {
  if (routeDeleteConfirmOpen.value) return;
  if (pickingWaypoint.value) pickingWaypoint.value = false;
  if (activeTool.value === tool) { closeTool(tool); return; }
  if (tool === "route") { openRouteWorkspace(); return; }
  if (activeTool.value === "route") closeRouteSection();
  activeTool.value = tool;
  void nextTick(() => document.getElementById(`mission-${tool}-panel`)?.focus({ preventScroll: true }));
}
function closeTool(tool: "status" | "route" | "team"): void {
  if (tool === "route") closeRouteSection();
  const focusTarget = `mission-tool-${tool}`;
  activeTool.value = null;
  void nextTick(() => document.getElementById(focusTarget)?.focus({ preventScroll: true }));
}
function dismissTool(): void {
  if (routeDeleteConfirmOpen.value) { routeDeleteConfirmOpen.value = false; return; }
  if (pickingWaypoint.value) { cancelWaypointPick(); return; }
  if (activeTool.value === "route" && routeSection.value !== "plan") { closeRouteSection(); return; }
  if (legendOpen.value) { toggleLegend(); return; }
  if (activeTool.value) closeTool(activeTool.value);
}
function resetRoutePlan(): void {
  routeDeleteConfirmOpen.value = false;
  if (navigation.active.value || !routing.target.value) return;
  // Clearing the proposed route must not also remove the incident from the map.
  routing.clearPlan();
  pickingWaypoint.value = false;
  waypointError.value = "";
  closeTool("route");
}
const routeSaveWarning = ref<string | null>(null);
function startGuidance(): void {
  // A denied/unavailable GPS watch must leave the route and its error visible.
  followingGps.value = true;
  const missionId = desk.activeMission.value?.id;
  const selected = routing.selectedRoute.value;
  const profile = routing.profile.value;
  const token = auth.accessToken;
  const session = missionSession.value;
  if (!navigation.start()) return;
  routeSaveWarning.value = null;
  closeTool("route");
  if (!missionId || !selected || !token || !session) return;
  void saveSuggestedMissionRoute(token, missionId, {
    polyline: selected.polyline, distanceM: selected.distance_m, profile
  }).catch(() => {
    if (desk.activeMission.value?.id === missionId && missionSession.value === session) {
      routeSaveWarning.value = "ذخیرهٔ مسیر پیشنهادی فعلی انجام نشد؛ راهبری ادامه دارد، اما سابقه ممکن است مسیر انتخاب‌شدهٔ قبلی را نشان دهد.";
    }
  });
}
function stopGuidance(): void {
  navigation.stop();
  navigation.dismissError();
}
function cancelWaypointPick(): void {
  pickingWaypoint.value = false;
  activeTool.value = "route";
  void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
}
function toggleWaypointPick(): void {
  pickingWaypoint.value = !pickingWaypoint.value;
  waypointError.value = "";
  activeTool.value = pickingWaypoint.value ? null : "route";
  const focusId = pickingWaypoint.value ? "mission-cancel-waypoint" : "mission-route-panel";
  void nextTick(() => document.getElementById(focusId)?.focus({ preventScroll: true }));
}
function onWaypointDrag(index: number, event: DragEvent): void {
  if (navigation.active.value) { event.preventDefault(); return; }
  draggingWaypoint = index;
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
function onWaypointDrop(index: number): void {
  if (draggingWaypoint !== null && !navigation.active.value) routing.moveWaypoint(draggingWaypoint, index);
  draggingWaypoint = null;
}
watch(() => props.visible, (visible) => {
  if (!visible) legendOpen.value = false;
  if (!visible && pickingWaypoint.value) {
    pickingWaypoint.value = false;
    activeTool.value = "route"; // Hidden map taps cannot add a private stop.
  }
}, { flush: "sync" });
function onRouteMapClick(event: MapMouseEvent): void {
  if (!props.visible || !pickingWaypoint.value || navigation.active.value) return;
  // Unbounded MapLibre maps repeat world copies; normalize the longitude before
  // validating the stop, without allowing an invalid click to dismiss pick mode.
  const lon = event.lngLat.lng;
  const normalizedLon = Number.isFinite(lon) ? ((lon + 180) % 360 + 360) % 360 - 180 : lon;
  if (!routing.addWaypoint({ lat: event.lngLat.lat, lon: normalizedLon })) {
    waypointError.value = "این نقطه معتبر نیست یا ایستگاه‌ها به سقف ۶ مورد رسیده‌اند؛ نقطهٔ دیگری را انتخاب کنید.";
    return;
  }
  pickingWaypoint.value = false;
  activeTool.value = "route";
  waypointError.value = "";
  void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
}

const navigation = useRouteNavigation(computed(() => auth.user?.id ?? null),
  computed(() => desk.activeMission.value?.id ?? null), routing.selectedRoute, routing.profile,
  (camera) => { if (props.visible && followingGps.value) routeMap?.easeTo(camera); }, undefined,
  () => { if (props.visible) routeMap?.easeTo({ pitch: 0, bearing: 0, duration: 450 }); });
// Before guidance, the button calls the map owner's PRIVATE recenter/retry;
// during guidance it resumes the mission's own GPS camera without a new watcher.
const ownFocus = computed(() => {
  if (navigation.active.value) return {
    icon: followingGps.value ? "mdi-crosshairs-gps" : "mdi-navigation-variant",
    color: followingGps.value ? "primary" : "warning",
    label: followingGps.value ? "مرکز کردن موقعیت راهبری" : "بازگشت به دنبال‌کردن GPS"
  };
  return { icon: props.ownLocationError ? "mdi-crosshairs-question" : "mdi-crosshairs-gps",
    color: props.ownLocationError ? "warning" : "primary", label: props.ownRecenterLabel };
});
// The GPS watcher clears fix immediately on timeout, denial, background or Stop.
// Do not substitute the saved route origin or an old member marker here.
const incidentDistance = computed(() => incidentDistanceMetres(navigation.fix.value, routing.target.value?.incident ?? null));
const routeCue = computed(() => missionRouteCue({
  blocked: !!desk.terminalHold.value || !!desk.error.value,
  routeError: !!routing.error.value,
  navigationError: !!navigation.error.value,
  navigationActive: navigation.active.value,
  freshFix: !!navigation.fix.value,
  targetLoading: routing.targetLoading.value,
  routeLoading: routing.loading.value,
  hasRoute: !!routing.selectedRoute.value,
  hasTarget: !!routing.target.value
}));
function confirmMissionTransport(mode: TransportProfile): void {
  if (routeSection.value !== "transport" || !desk.activeMission.value || navigation.active.value ||
    !transportProfiles.some((option) => option.value === mode)) return;
  if (mode !== routing.profile.value) {
    routing.selectProfile(mode);
    // Recalculate from the already-authorized origin. Never wake GPS merely
    // because a vehicle was selected before the explicit Get Route action.
    if (routing.from.value) void routing.findRoutes();
  }
  closeRouteSection();
  void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
}
const elevationCharts = useRouteElevationCharts(routing.routes, routing.profile);
const ROUTE_SOURCE = "rescuer-route-preview";
const ROUTE_LAYER = "rescuer-route-preview-line";
let routeMap: MapLibreMap | null = null;
// MapCanvas supplies Marker only after its lazy MapLibre import and map load.
let markerConstructor: typeof Marker | null = null;
let incidentMarker: Marker | null = null;
let rescuerMarker: Marker | null = null;
let waypointMarkers: Marker[] = [];
let detachRouteMap: (() => void) | null = null;
function pauseGuidanceFollow(): void {
  if (navigation.active.value) followingGps.value = false;
}
function onMissionMapMove(event: MapMovementEvent): void {
  // MapLibre camera animations have no originalEvent; only a person's drag,
  // wheel or zoom-control action suspends follow, as on /_user/map.
  if (props.visible && event.originalEvent) pauseGuidanceFollow();
}
function resumeGuidanceFollow(): void {
  if (!navigation.active.value) return;
  followingGps.value = true;
  navigation.recenter(); // A fresh fix recenters now; otherwise await the next GPS sample.
}
function frameMissionRoute(): void {
  const map = routeMap;
  const incident = routing.visible.value ? routing.target.value?.incident : null;
  if (!props.visible || !map || !incident) return;
  pauseGuidanceFollow();
  const camera = missionMapCamera(incident, routing.from.value, routing.via.value,
    routing.selectedRoute.value ? routeSnapshot.value.bounds : null);
  if (camera.kind === "both") map.fitBounds(camera.bounds, { padding: camera.padding, maxZoom: camera.maxZoom, duration: 450 });
  else map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 450 });
}
function highlightRouteStop(): void {
  const selected = routing.order.value[routing.step.value];
  const markers = [rescuerMarker, ...waypointMarkers, incidentMarker];
  markers.forEach((marker, index) => marker?.getElement().classList.toggle(
    "mission-desk__selected-stop", Boolean(routing.selectedRoute.value) && selected === index));
}
const routeSnapshot = useMissionRouteGeometry(routing.selectedRoute);
function clearRouteOverlays(removeLayer = true): void {
  incidentMarker?.remove();
  rescuerMarker?.remove();
  waypointMarkers.forEach((marker) => marker.remove());
  waypointMarkers = [];
  incidentMarker = null;
  rescuerMarker = null;
  if (!removeLayer) return;
  // The shared map remains mounted after closing a route; remove only route-owned layers.
  try {
    if (routeMap?.getLayer(ROUTE_LAYER)) routeMap.removeLayer(ROUTE_LAYER);
    if (routeMap?.getSource(ROUTE_SOURCE)) routeMap.removeSource(ROUTE_SOURCE);
  } catch { /* A style swap or map teardown may already have removed them. */ }
}
function syncRouteMap(): void {
  const map = routeMap;
  const MarkerClass = markerConstructor;
  // The route state and GPS watch survive a switch to Sharing, but its private
  // pins and line belong only to the Missions tab on the shared MapCanvas.
  const incident = props.visible && routing.visible.value ? routing.target.value?.incident : null;
  clearRouteOverlays(!incident);
  if (!map || !incident || !MarkerClass) return;
  waypointMarkers = routing.via.value.map((point, index) => {
    const marker = new MarkerClass({ color: "#c27c14" }).setLngLat([point.lon, point.lat]).addTo(map);
    marker.getElement().setAttribute("aria-label", `ایستگاه ${index + 1}`);
    return marker;
  });
  // A square ! pin cannot be mistaken for the requester's orange live-location marker.
  const incidentPin = document.createElement("button");
  incidentPin.type = "button";
  incidentPin.className = "mission-desk__incident-pin";
  incidentPin.textContent = "!";
  incidentPin.setAttribute("aria-label", "محل حادثه؛ باز کردن برنامهٔ مسیر");
  incidentPin.setAttribute("aria-disabled", String(pickingWaypoint.value));
  incidentPin.addEventListener("click", (event) => {
    event.stopPropagation(); // A marker tap must not also insert a waypoint through the map.
    if (!pickingWaypoint.value) openRouteWorkspace();
  });
  incidentMarker = new MarkerClass({ element: incidentPin, anchor: "bottom" })
    .setLngLat([incident.lon, incident.lat]).addTo(map);
  // A planned origin is a snapshot, not the rescuer's live/consented location.
  rescuerMarker = routing.from.value ? new MarkerClass({ color: "#2563a6" })
    .setLngLat([routing.from.value.lon, routing.from.value.lat]).addTo(map) : null;
  rescuerMarker?.getElement().setAttribute("aria-label", "مبدأ محاسبهٔ مسیر؛ نه موقعیت زنده");
  highlightRouteStop();
  // Route changes frame the plan, but updates must not interrupt active GPS guidance.
  if (!navigation.active.value) frameMissionRoute();
  applyRouteLayer();
}
watch(() => props.visible, (visible) => {
  syncRouteMap(); // Remove/recreate DOM pins and the private line at the tab boundary.
  if (visible && navigation.active.value && followingGps.value) navigation.recenter();
}, { flush: "sync" });
function applyRouteLayer(): void {
  const map = routeMap;
  if (!props.visible || !map || !map.isStyleLoaded()) return;
  try {
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData(routeSnapshot.value.data);
    else map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeSnapshot.value.data });
    if (!map.getLayer(ROUTE_LAYER)) map.addLayer({ id: ROUTE_LAYER, type: "line", source: ROUTE_SOURCE,
      paint: { "line-color": "#176e62", "line-width": 6, "line-opacity": 0.9 } });
  } catch { /* Style swaps re-apply at idle. */ }
}
function restoreRouteLayer(): void {
  const map = routeMap;
  if (!props.visible || !map || !routing.visible.value || !routing.target.value || !needsOverlayRestore({
    styleLoaded: Boolean(map.isStyleLoaded()),
    hasSource: (id) => Boolean(map.getSource(id)),
    hasLayer: (id) => Boolean(map.getLayer(id))
  }, [ROUTE_SOURCE], [ROUTE_LAYER])) return;
  applyRouteLayer();
}
function onRouteMapReady(map: MapLibreMap, MarkerClass: typeof Marker): void {
  if (routeMap !== map) {
    clearRouteOverlays();
    detachRouteMap?.();
    const onStyleReady = () => restoreRouteLayer();
    map.on("idle", onStyleReady);
    map.on("click", onRouteMapClick);
    map.on("movestart", onMissionMapMove);
    detachRouteMap = () => {
      map.off("idle", onStyleReady);
      map.off("click", onRouteMapClick);
      map.off("movestart", onMissionMapMove);
    };
  }
  markerConstructor = MarkerClass;
  routeMap = map;
  mapReady.value = true;
  syncRouteMap();
}
function onMissionEnded(id: string): void {
  if (desk.activeMission.value?.id !== id) return;
  desk.markTerminalEvent(id);
  closeRoutes(); // Revoke GPS guidance and private incident overlays immediately.
  void desk.load(); // A socket event is a signal to verify, not an HTTP outcome banner.
}
function closeRoutes(): void {
  routeDeleteConfirmOpen.value = false;
  closeRouteSection(false);
  navigation.stop();
  navigation.dismissError();
  routing.reset();
  activeTool.value = null;
  pickingWaypoint.value = false;
  waypointError.value = "";
  draggingWaypoint = null;
  clearRouteOverlays();
  // A close does not detach listeners or forget the shared canvas. Reopening the
  // planner must work without MapCanvas firing a second ready event.
}
function releaseRouteMap(): void {
  closeRoutes();
  detachRouteMap?.();
  detachRouteMap = null;
  mapReady.value = false;
  routeMap = null;
  markerConstructor = null;
}
watch(() => [routing.visible.value, routing.target.value, routing.from.value, routing.selectedRoute.value, routing.via.value] as const,
  () => syncRouteMap(), { flush: "sync" });
watch(pickingWaypoint, (picking) => {
  incidentMarker?.getElement().setAttribute("aria-disabled", String(picking));
}, { flush: "sync" });
watch(() => navigation.active.value, (active) => {
  if (active) pickingWaypoint.value = false;
  else followingGps.value = true; // Never carry a paused camera into another mission/watch.
}, { flush: "sync" });
// An automatic private target read can fail before any tool is open: show its
// retry panel. GPS outages instead use the map warning; never steal focus from
// Team or Status while someone is relying on those controls.
watch(() => routing.error.value, (routeError) => {
  if (routeError && !activeTool.value && desk.activeMission.value && !desk.terminalHold.value) {
    activeTool.value = "route";
    void nextTick(() => document.getElementById("mission-route-panel")?.focus({ preventScroll: true }));
  }
});
watch(() => desk.activeMission.value?.id, (next, previous) => {
  if (next !== previous) { teamSharing.value = false; legendOpen.value = false; routeSaveWarning.value = null; }
  if (previous && next !== previous) {
    if (next) closeRoutes(); // Same mounted canvas, new private incident.
    else releaseRouteMap(); // The mission panel is about to unmount.
  }
  // Load the private incident once per active mission, without requesting GPS or
  // starting live sharing. A user-closed planner stays closed on status refresh.
  if (next && next !== previous) void routing.open();
}, { flush: "sync" });
const steps = [
  { status: "pending", label: "پذیرفته شده" },
  { status: "on_the_way", label: "در راه" },
  { status: "arrived", label: "رسیده به محل" },
  { status: "in_progress", label: "در حال امدادرسانی" },
  { status: "completed", label: "پایان یافته" }
];
const nextStatusLabel = computed(() => desk.nextStatus.value ? ({
  on_the_way: "شروع حرکت؛ در راه هستم",
  arrived: "به محل حادثه رسیده‌ام",
  in_progress: "امدادرسانی را آغاز کردم",
  completed: "امدادرسانی پایان یافت"
})[desk.nextStatus.value] : "");
const activeStep = computed(() => steps.findIndex((step) => step.status === desk.activeMission.value?.status));
const currentStatusLabel = computed(() => desk.terminalHold.value
  ? "پایان گزارش شد؛ در انتظار تأیید" : steps[activeStep.value]?.label ?? "در حال بررسی");
const missionSession = computed(() => {
  const owner = auth.user?.id;
  const claims = decodeAccessTokenClaims(auth.accessToken);
  if (!owner || claims?.sub !== owner || typeof claims.sessionId !== "string") return null;
  return JSON.stringify([owner, claims.sessionId]);
});
onMounted(() => { if (missionSession.value) void desk.load(); });
watch(missionSession, (next) => {
  teamSharing.value = false;
  legendOpen.value = false;
  routeSaveWarning.value = null;
  closeRoutes();
  desk.reset();
  if (next) void desk.load();
}, { flush: "sync" });
onBeforeUnmount(() => {
  document.documentElement.style.removeProperty("--bb-map-mission-sheet-height");
  releaseRouteMap(); desk.reset();
});
</script>

<style scoped>
.mission-desk { min-height: calc(100vh - 130px); padding: clamp(18px, 4vw, 52px) 18px 100px; color: rgb(var(--v-theme-on-background)); background: radial-gradient(ellipse at 86% 4%, rgba(33,130,113,.10), transparent 52%), rgb(var(--v-theme-background)); }
.mission-desk__workspace { scroll-margin-top: 16px; }
.mission-route { margin-top: 12px; padding: clamp(14px, 2vw, 22px); border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-card, 24px); }
.mission-desk__map-hint { position: absolute; z-index: 2; inset-inline: 12px; bottom: 32px; width: fit-content; max-width: calc(100% - 24px); padding: 8px 12px; border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); box-shadow: var(--bb-shadow-surface); font-size: .85rem; }
.mission-desk__map-hint button { margin-inline-start: 12px; color: rgb(var(--v-theme-primary)); text-decoration: underline; font: inherit; font-weight: 700; }
:global(.mission-desk__incident-pin) { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 2px solid white; border-radius: 7px; background: #b91c1c; color: white; font: 900 19px/1 sans-serif; box-shadow: 0 2px 7px #172b38aa; cursor: pointer; }
:global(.mission-desk__incident-pin:focus-visible) { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
:global(.mission-desk__incident-pin[aria-disabled="true"]) { cursor: default; }
:global(.mission-desk__incident-pin::after) { content: ''; position: absolute; top: 100%; border-inline: 6px solid transparent; border-top: 8px solid #b91c1c; }
:global(.mission-desk__selected-stop) { outline: 3px solid #fbbf24; outline-offset: 4px; border-radius: 50%; }
.mission-route__header { position: relative; z-index: 1; top: auto; display: flex; align-items: center;
  gap: .5rem; margin: -.85rem -.85rem .75rem; padding: .5rem .85rem;
  border-bottom: 1px solid var(--bb-color-outline); background: rgb(var(--v-theme-surface)); }
.mission-route__heading { min-width: 0; flex: 1; }
.mission-route__heading small { display: block; font-size: .8rem; font-weight: 700; color: rgb(var(--v-theme-primary)); }
.mission-route__emblem { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; background: rgba(var(--v-theme-primary), .12); color: rgb(var(--v-theme-primary)); }
.mission-route__header :deep(.v-btn) { flex: none; min-width: 44px; min-height: 44px; }
.mission-route__header h2 { margin: 0; font-size: 1.08rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* One compact itinerary instead of two independently padded cards. Its divider
   separates the route snapshot from the fixed incident, never from live GPS. */
.mission-route__endpoints { display: grid; gap: 0; margin: .4rem 0 .85rem; padding: .25rem .65rem;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.mission-route__endpoint { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center;
  gap: .6rem; min-width: 0; padding: .32rem 0; }
.mission-route__endpoint + .mission-route__endpoint { border-top: 1px solid var(--bb-color-outline); }
.mission-route__endpoint-mark { position: relative; display: grid; place-items: center; width: 22px; height: 22px;
  border: 2px solid white; border-radius: 50%; background: #2563a6; box-shadow: 0 0 0 1px var(--bb-color-outline); }
.mission-route__endpoint-mark--incident { border-radius: 6px; background: #b91c1c; color: white;
  font: 900 .85rem/1 sans-serif; }
.mission-route__endpoint-copy { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: .55rem; row-gap: 0;
  min-width: 0; font-size: .82rem; line-height: 1.6; }
.mission-route__endpoint-copy > span:first-child { flex: 1 1 11rem; min-width: 0; }
.mission-route__endpoint-copy strong { color: rgb(var(--v-theme-on-surface)); font-weight: 800; }
.mission-route__endpoint-copy small { color: var(--bb-color-muted); font-size: .8rem; }
.mission-route__endpoint-copy bdi, .mission-route__endpoint-pending { font-size: .8rem; color: var(--bb-color-muted); overflow-wrap: anywhere; }
.mission-route__endpoints bdi { overflow-wrap: anywhere; }
.mission-route__decision {
  display: grid; gap: .55rem; margin: 0 0 .7rem; padding: .7rem;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  background: var(--bb-color-inset);
}
.mission-route__decision-heading { display: flex; align-items: flex-start; gap: .6rem; min-width: 0; }
.mission-route__decision-heading > :deep(.v-icon) { flex: none; color: rgb(var(--v-theme-primary)); }
.mission-route__decision-heading > div { display: grid; gap: 2px; min-width: 0; }
.mission-route__decision-heading strong { font-size: .94rem; }
.mission-route__decision-heading small { font-size: .8rem; line-height: 1.5; }
.mission-route__decision :deep(.v-btn) { width: 100%; max-width: 100%; min-width: 0; min-height: 44px; height: auto; white-space: normal; text-align: center; }
.mission-route__decision :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-route__decision .mission-route__metrics { margin: 0; }
.mission-route__decision .mission-route__metrics > div { padding: .25rem .5rem; border: 0; border-radius: 0; background: transparent; }
.mission-route__decision .mission-route__metrics > div + div { border-inline-start: 1px solid var(--bb-color-outline); }
.mission-route__decision .mission-route__navigation { display: grid; gap: .4rem; margin: 0; }
.mission-route__decision .mission-route__navigation p { margin: 0; }
.mission-route__preview-note { margin: .85rem 0 0; padding: .75rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); font-size: .82rem; line-height: 1.6; }
.mission-route__section-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; margin: .65rem 0; }
.mission-route__section-links button { display: flex; align-items: center; gap: .4rem; width: 100%; min-width: 0; min-height: 52px; padding: .5rem; text-align: start; font: inherit; cursor: pointer; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); color: rgb(var(--v-theme-on-surface)); }
.mission-route__section-links button > :deep(.v-icon) { flex: none; font-size: 19px; }
.mission-route__section-links button > span { flex: 1; display: grid; min-width: 0; }
.mission-route__section-links button strong { font-size: .87rem; }
.mission-route__section-links button small { font-size: .8rem; opacity: .8; }
.mission-route__section-links button:disabled { opacity: .5; cursor: not-allowed; }
.mission-route__section-links button:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-route__route-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; margin: .65rem 0; }
.mission-route__route-actions :deep(.v-btn), .mission-route__navigation :deep(.v-btn) { min-width: 0; min-height: 44px; height: auto; }
.mission-route__route-actions :deep(.v-btn__content) { white-space: normal; text-align: center; line-height: 1.35; }
.mission-route__route-actions :deep(.v-btn:only-child) { grid-column: 1 / -1; }
.mission-route__metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; margin: 1rem 0; }
.mission-route__metrics > div { display: grid; gap: .25rem; padding: .75rem; background: var(--bb-color-inset); border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); }
.mission-route__metrics span { font-size: .8rem; opacity: .8; }
.mission-route__metrics strong { font-size: 1.02rem; }
.mission-route__header p { font-size: 0.9rem; opacity: .78; }
.mission-route__help { margin: 0 0 .6rem; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.6; }
.mission-route__map-stop { max-width: 100%; }
.mission-route__map-stop :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-route__manual { margin-top: .5rem; }
.mission-route__manual summary { display: flex; align-items: center; gap: .35rem; width: fit-content; min-height: 44px; color: rgb(var(--v-theme-primary)); cursor: pointer; font-size: .83rem; font-weight: 700; }
.mission-route__manual summary::marker { content: ''; }
.mission-route__manual summary::-webkit-details-marker { display: none; }
.mission-route__manual[open] summary :deep(.v-icon) { transform: rotate(180deg); }
.mission-route__manual summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-route__manual-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: .5rem; padding-top: .5rem; }
.mission-route__manual-fields :deep(.v-btn) { grid-column: 1 / -1; justify-self: start; min-height: 44px; }
.mission-route__coordinate { min-width: 0; }
.mission-route__error { margin: .5rem 0 0; font-size: .83rem; }
.mission-route__stop-list { display: grid; gap: .4rem; list-style: none; margin: .7rem 0 0; padding: 0; }
.mission-route__stop-list li { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .25rem .5rem; min-width: 0; padding: .35rem .5rem; border: 1px solid var(--bb-color-outline); border-radius: 12px; background: rgb(var(--v-theme-surface)); cursor: grab; }
.mission-route__stop-list li > span { min-width: 0; overflow-wrap: anywhere; font-size: .8rem; }
.mission-route__stop-list li :deep(.v-btn) { min-width: 44px; min-height: 44px; }
.mission-route__optimize { margin-top: .5rem; }
.mission-route__step-control { margin-top: .7rem; padding: .65rem .75rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.mission-route__step-control p { margin: 0; font-size: .82rem; }
.mission-route__choices { margin-top: .65rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: .5rem; }
.mission-route__choice { display: grid; text-align: start; gap: .4rem; color: rgb(var(--v-theme-on-surface)); background: var(--bb-color-inset); border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); padding: .75rem; cursor: pointer; font: inherit; }
.mission-route__choice--selected { border-color: rgb(var(--v-theme-primary)); box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.mission-route__choice:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-route__choice:disabled { opacity: .7; cursor: not-allowed; }
.mission-route__navigation { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-top: .65rem; }
.mission-route__choice small { opacity: .75; }
.mission-route__elevation-chart { display: grid; gap: 4px; min-width: 0; }
.mission-route__elevation-chart svg { display: block; width: 100%; height: 72px; direction: ltr; overflow: visible; }
.mission-route__elevation-area { fill: rgb(var(--v-theme-primary)); opacity: .13; }
.mission-route__elevation-line { fill: none; stroke: rgb(var(--v-theme-primary)); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.mission-desk__shell { max-width: 1120px; margin-inline: auto; }
.mission-hero { position: relative; overflow: hidden; border-radius: var(--bb-radius-card, 24px); background: linear-gradient(115deg, #103b40, #206b67); color: white; padding: clamp(27px, 5vw, 56px); box-shadow: var(--bb-shadow-hero); }
.mission-hero--active { padding: 18px 24px; }
.mission-hero__eyebrow { display: inline-flex; align-items: center; gap: 9px; color: #a4e7d5; font-weight: 700; font-size: .84rem; }
.mission-hero h1 { position: relative; z-index: 1; font-size: clamp(1.65rem, 2.5vw, 2.2rem); font-weight: 850; line-height: 1.25; margin: 18px 0 10px; }
.mission-hero p { position: relative; z-index: 1; max-width: 590px; color: #daf2e9; line-height: 1.9; margin: 0; }
.mission-hero--active h1 { margin: 6px 0 0; font-size: 1.45rem; }
.mission-hero--active p { margin-top: 4px; line-height: 1.45; font-size: .84rem; }
.mission-hero__glow { position: absolute; width: 330px; height: 330px; inset-inline-end: -60px; top: -145px; border-radius: 50%; border: 55px solid rgba(170,255,214,.07); pointer-events: none; }
.mission-desk__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 34px 0 18px; }
.mission-desk__toolbar h2 { font-size: 1.2rem; font-weight: 800; margin: 0; }
.mission-desk__toolbar p { font-size: 0.9rem; opacity: .72; margin: 4px 0 0; }
.mission-desk__card, .mission-desk__empty { border-radius: var(--bb-radius-card, 24px); background: rgba(var(--v-theme-surface), .95); border: 1px solid rgba(var(--v-theme-on-surface), .1); box-shadow: var(--bb-shadow-overlay); backdrop-filter: blur(12px); }
.mission-desk__card { padding: clamp(12px, 2vw, 18px); margin-top: 16px; }
.mission-desk__empty { text-align: center; padding: 58px 24px; }
.mission-desk__empty-icon { width: 70px; height: 70px; border-radius: 20px; background: rgba(34,145,116,.13); color: rgb(var(--v-theme-primary)); display: grid; place-items: center; margin: 0 auto 16px; }
.mission-desk__empty h3 { font-size: 1.2rem; margin: 0 0 8px; }.mission-desk__empty p { opacity: .7; margin-bottom: 22px; }
.mission-desk__limit { font-size: .8rem; opacity: .68; margin: 20px 0 0; }
.mission-cancel-actions { flex-wrap: wrap; }
@media(max-width: 780px) { .mission-desk__toolbar { align-items: flex-start; }.mission-desk__toolbar p { max-width: 230px; } }
@media(max-width: 599px) {
  .mission-desk { padding-inline: 12px; }
  .mission-desk__toolbar { flex-wrap: wrap; }
  .mission-desk__toolbar > div { flex: 1 1 100%; min-width: 0; }
  .mission-desk__toolbar p { max-width: none; }
  .mission-route__section-links { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mission-route__section-links button { min-height: 60px; }
  .mission-cancel-actions { flex-direction: column; align-items: stretch; gap: 8px; }
  .mission-cancel-actions :deep(.v-spacer) { display: none; }
  .mission-cancel-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }
  .mission-cancel-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
}
@media(max-width: 480px) { .mission-hero__glow { opacity: .4; } }

/* While a mission is loading or absent, the same full-screen spatial shell
   remains. Its public canvas has no incident or live-room data. */
.mission-desk:not(.mission-desk--active) { position: relative; height: 100dvh; min-height: 0; padding: 0; overflow: hidden; }
.mission-desk__idle-map { position: absolute !important; inset: 0; width: 100%; height: 100%; min-height: 0 !important; border-radius: 0; }
/* Both the idle and live MapCanvas use the map page's physical-right action
   rail. The native control remains in the map for tap-to-north and drag/pitch. */
.mission-desk :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {
  position: fixed; z-index: 6;
  top: auto; left: auto;
  right: 1.25rem;
  bottom: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 10.5rem);
  width: 48px;
}
.mission-desk:not(.mission-desk--active) .mission-desk__shell {
  position: absolute; z-index: 2; inset: 0; height: 100%; max-width: none;
  pointer-events: none; overflow-y: auto;
}
.mission-desk:not(.mission-desk--active) .mission-hero {
  position: relative; width: min(27rem, calc(100vw - 2rem)); margin: calc(4.5rem + env(safe-area-inset-top, 0px)) auto 0;
  padding: 1rem 1.25rem; pointer-events: auto;
}
.mission-desk:not(.mission-desk--active) .mission-hero h1 { margin: .45rem 0; font-size: 1.3rem; }
.mission-desk:not(.mission-desk--active) .mission-hero p { line-height: 1.55; font-size: .85rem; }
.mission-desk:not(.mission-desk--active) .mission-hero :deep(.v-btn) { position: relative; z-index: 1; margin-top: .65rem; }
.mission-desk:not(.mission-desk--active) .mission-desk__empty,
.mission-desk:not(.mission-desk--active) .mission-desk__card,
.mission-desk:not(.mission-desk--active) .mission-desk__outcome,
.mission-desk:not(.mission-desk--active) .mission-desk__load-alert {
  width: min(27rem, calc(100vw - 2rem)); margin: 1rem auto 0; padding: 1.25rem;
  pointer-events: auto;
}
.mission-desk:not(.mission-desk--active) .mission-desk__empty { text-align: start; }
.mission-desk:not(.mission-desk--active) .mission-desk__empty-icon { display: none; }
.mission-desk:not(.mission-desk--active) .mission-desk__shell { padding-bottom: calc(8rem + env(safe-area-inset-bottom, 0px)); }

/* The parent map owns the ONLY canvas. Keep mission cards interactive while
   letting taps through the transparent room to the shared map beneath it. */
.mission-desk--embedded { position: absolute !important; inset: 0; z-index: 4; width: 100%; height: 100%;
  background: transparent !important; pointer-events: none; }
.mission-desk--embedded .mission-desk__shell,
.mission-desk--embedded .mission-desk__workspace { pointer-events: none; }
/* The idle offer surface, not the whole map shell or an inner offer list, is
   the one scroll container. Keep a clear strip of map/SOS visible below it. */
.mission-desk--embedded:not(.mission-desk--active) .mission-desk__shell {
  overflow: hidden; padding-bottom: 0;
}
.mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty {
  width: min(42rem, calc(100vw - 1.5rem));
  margin: calc(8.5rem + env(safe-area-inset-top, 0px)) auto 0;
  padding: .9rem; max-height: calc(100dvh - 14rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  overflow-y: auto; overscroll-behavior: contain;
  background: rgb(var(--v-theme-surface));
}
.mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty :deep(.offers) {
  padding: 0; background: transparent;
}
.mission-desk__inline-outcome { margin-bottom: .8rem; border: 1px solid rgb(var(--v-theme-success));
  color: rgb(var(--v-theme-on-surface)); background: var(--bb-color-inset); }
/* This card is at most 42rem even on desktop: viewport breakpoints in the
   reusable inbox cannot decide whether its list and detail fit side by side. */
.mission-desk__empty :deep(.offers__layout) { grid-template-columns: minmax(0, 1fr); gap: .75rem; }
.mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty :deep(.offers__hero) { padding: .75rem; }
.mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty :deep(.offers__items) {
  max-height: none; overflow: visible; padding: 0;
}
.mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty :deep(.offers__empty) {
  margin-top: .75rem; padding: 1rem;
}
@media (min-width: 600px) and (max-width: 1023px) {
  /* On the tablet's viewport map Search owns the upper-left half. Keep the
     scrollable idle inbox below it, away from the right-hand map/SOS rail. */
  .mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty {
    width: min(30rem, calc(50vw - 1.5rem - env(safe-area-inset-left, 0px)));
    margin: calc(50dvh + 1.75rem + env(safe-area-inset-top, 0px)) 0 0 calc(1rem + env(safe-area-inset-left, 0px));
    max-height: max(4rem, calc(50dvh - 2.75rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  }
}
.mission-desk--embedded .mission-desk__guidance { top: calc(9rem + env(safe-area-inset-top, 0px)); }
/* A tonal error is translucent over green map tiles and its red copy loses
   contrast. Use an opaque theme surface and normal readable foreground. */
.mission-desk__load-alert {
  pointer-events: auto;
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  border: 2px solid rgb(var(--v-theme-error));
  box-shadow: var(--bb-shadow-overlay);
}
.mission-desk__load-alert :deep(.v-alert__underlay) { display: none; }
.mission-desk__load-alert :deep(.v-alert__prepend) { color: rgb(var(--v-theme-error)); }
.mission-desk__load-alert :deep(.v-btn) {
  min-height: 44px; color: rgb(var(--v-theme-on-surface));
  background: var(--bb-color-inset);
}
.mission-desk--embedded :deep(.live-panel--fullscreen) { background: transparent; pointer-events: none; }
.mission-desk--embedded :deep(.live-panel__map) { pointer-events: none; }
.mission-desk--embedded :deep(.live-panel__members),
.mission-desk--embedded :deep(.live-panel__room-alert),
.mission-desk--embedded :deep(.live-panel__map-actions),
.mission-desk--embedded .mission-desk__map-focus,
.mission-desk--embedded .mission-desk__bottom-stack,
.mission-desk--embedded .mission-desk__legend-action,
.mission-desk--embedded .mission-desk__info-action,
.mission-desk--embedded .mission-desk__map-hint,
.mission-desk--embedded .mission-desk__guidance,
.mission-desk--embedded .mission-desk__card,
.mission-desk--embedded .mission-route { pointer-events: auto; }
/* Match /_user/map: the canvas owns the viewport, with independent compact
   tools that can all close. No persistent planner takes map space. */
.mission-desk--active {
  height: 100dvh; min-height: 0; padding: 0; overflow: hidden;
  background: rgb(var(--v-theme-background)); isolation: isolate;
}
.mission-desk--active .mission-desk__shell { position: relative; width: 100%; max-width: none; height: 100%; }
.mission-desk--active .mission-desk__workspace { position: absolute; inset: 0; width: 100%; height: 100%; }
.mission-desk--active .mission-desk__card,
.mission-desk--active .mission-route {
  position: absolute; z-index: 8;
  inset: auto auto calc(5.5rem + env(safe-area-inset-bottom, 0px)) 1rem;
  width: min(28rem, calc(100vw - 1.5rem)); max-height: min(56dvh, 33rem);
  margin: 0; padding: 1rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-card, 24px);
  box-shadow: var(--bb-shadow-overlay);
}
/* The map remains visible. The route surface is fixed; normal scrolling belongs
   to the stop list (or the alternatives list), not the outer card. */
.mission-desk--active .mission-route { display: flex; flex-direction: column; width: min(25rem, calc(100vw - 1.5rem));
  max-height: min(48dvh, 23rem); padding: .7rem; overflow: hidden; }
.mission-desk--active .mission-route--editor { max-height: min(56dvh, 29rem); }
.mission-desk--active .mission-route:has(.mission-route__route-details[open]) { max-height: min(68dvh, 32rem); }
.mission-route__body { flex: 1 1 auto; min-height: 0; min-width: 0; }
.mission-route__body--stops, .mission-route__body--alternatives { display: flex; flex-direction: column; }
.mission-route__header { flex: none; margin: -.7rem -.7rem .35rem; padding: .35rem .6rem; }
.mission-route__section-links { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .3rem; margin: .4rem 0; }
.mission-route__section-links button { display: grid; justify-items: center; align-content: center; text-align: center;
  gap: 1px; padding: .35rem .15rem; min-height: 64px; }
.mission-route__section-links button > :deep(.v-icon:last-child) { display: none; }
.mission-route__section-links button > span { justify-items: center; }
.mission-route__section-links button strong { font-size: .8rem; }
.mission-route__section-links button small { line-height: 1.25; overflow-wrap: anywhere; }
.mission-route__decision { gap: .35rem; margin: 0 0 .35rem; padding: .5rem .6rem; }
.mission-route__decision-heading > :deep(.v-icon) { font-size: 18px !important; }
.mission-route__decision-heading small { line-height: 1.3; }
.mission-route__decision .mission-route__metrics { gap: 0; }
.mission-route__decision .mission-route__metrics strong { font-size: .9rem; }
.mission-route__route-details { border-top: 1px solid var(--bb-color-outline); }
.mission-route__route-details summary { display: flex; align-items: center; min-height: 44px; gap: .25rem;
  cursor: pointer; font-size: .8rem; font-weight: 700; color: rgb(var(--v-theme-primary)); }
.mission-route__route-details summary :deep(.v-icon) { margin-inline-start: auto; }
.mission-route__route-details[open] summary :deep(.v-icon) { transform: rotate(180deg); }
.mission-route__route-details summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.mission-route__route-details-body { max-height: min(25dvh, 9rem); overflow-y: auto; overscroll-behavior: contain;
  scrollbar-gutter: stable; padding-inline: .1rem; }
.mission-route__route-details-body .mission-route__endpoints { margin: .2rem 0; }
.mission-route__route-details-body > .v-btn { min-height: 44px; }
.mission-route__stops { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; margin: 0; padding: .2rem 0;
  border: 0; background: transparent; }
.mission-route__stops-body { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; align-items: stretch;
  padding: 0; }
.mission-route__stops .mission-route__map-stop, .mission-route__stops .mission-route__manual,
.mission-route__stops .mission-route__optimize, .mission-route__stops .mission-route__help { flex: none; }
.mission-route__stop-list { flex: 0 1 auto; min-height: 0; max-height: min(14rem, 24dvh); overflow-y: auto;
  overscroll-behavior: contain; scrollbar-gutter: stable; padding-inline: .15rem; }
.mission-route__choices { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.mission-route__body--alternatives > .mission-route__navigation { flex: none; }
/* When the manual editor expands, scroll its entire body instead of nesting a
   stop-list scroller around the coordinate fields and optimization control. */
.mission-route__body--stops:has(.mission-route__manual[open]) { overflow-y: auto; overscroll-behavior: contain; }
.mission-route__body--stops:has(.mission-route__manual[open]) .mission-route__stop-list {
  flex: none; max-height: none; overflow: visible;
}
.mission-route__body--plan:has(.mission-route__navigation p),
.mission-route__body--plan:has([role="alert"]) { overflow-y: auto; overscroll-behavior: contain; }
@media (max-height: 560px) {
  /* Accessibility fallback for a landscape/zoomed phone: keep all actions
     reachable inside the content, never scroll the outer map card. */
  .mission-route__body { overflow-y: auto; overscroll-behavior: contain; }
  .mission-route__route-details-body { max-height: none; overflow: visible; }
  .mission-route__body--stops .mission-route__stop-list { flex: none; max-height: none; overflow: visible; }
}
.mission-desk--active .mission-desk__card { z-index: 9; }
/* The key opens above the progress or information sheet; the clear lower-left
   rail holds its launcher directly above the Mission Information launcher. */
.mission-desk__bottom-stack { position: absolute; z-index: 9;
  left: 0; right: 0; bottom: calc(8.5rem + env(safe-area-inset-bottom, 0px));
  width: 100%; max-height: min(65dvh, 32rem, calc(100dvh - 15rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  display: flex; flex-direction: column; gap: .5rem; min-height: 0; pointer-events: auto; }
/* The default briefing is a compact snapshot; only explicit detail expansion
   grows the scroll surface. The height cap still protects short viewports. */
.mission-desk__bottom-stack--information { max-height: min(19rem, 55dvh, calc(100dvh - 15rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
.mission-desk__bottom-stack--information:has(.mission-brief__details[open]) {
  max-height: min(65dvh, 28rem, calc(100dvh - 15rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
}
@media (min-width: 600px) and (max-width: 1023px) {
  /* Keep the briefing readable without filling the tablet map. */
  .mission-desk--active .mission-desk__bottom-stack--information {
    left: calc(.75rem + env(safe-area-inset-left, 0px)); right: auto;
    width: min(26rem, calc(100% - 7.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  }
}
@media (min-width: 1024px) {
  /* Search occupies the left 25rem. Center a smaller briefing in the
     remaining map, clear of Search and the right-hand action rail. */
  .mission-desk--active .mission-desk__bottom-stack--information {
    left: max(calc(27rem + env(safe-area-inset-left, 0px)), calc(50% - 13rem));
    right: auto;
    width: min(26rem, calc(100% - 34rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  }
}
/* Same centered bottom card as Navigate; only the steps variant docks here.
   Mission Information is a separate, bounded panel above map controls on wide maps. */
.mission-desk--steps-visible .mission-desk__bottom-stack {
  left: 50%; right: auto; transform: translateX(-50%);
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  width: min(36rem, calc(100% - 1.5rem));
  max-height: min(65dvh, 32rem, calc(100dvh - 18rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
}
@media (min-width: 600px) and (max-width: 1023px) {
  /* Match Navigate's tablet clearance beside the fixed SOS/map rail. */
  .mission-desk--steps-visible .mission-desk__bottom-stack {
    left: calc(.75rem + env(safe-area-inset-left, 0px)); transform: none;
    width: min(30rem, calc(100% - 7.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  }
}
.mission-desk--steps-visible .mission-desk__bottom-panel { flex: 0 1 auto; }
.mission-desk--steps-visible .mission-desk__info-action {
  bottom: calc(var(--bb-map-mission-sheet-height, 15rem) + .5rem);
}
.mission-desk--steps-visible .mission-desk__legend-action {
  bottom: calc(var(--bb-map-mission-sheet-height, 15rem) + 4rem);
}
@media (min-width: 1024px) {
  /* The centered 36rem steps card owns its own left-hand icon rail; don't
     strand Information/Legend at the far viewport edge on large displays. */
  .mission-desk--steps-visible .mission-desk__info-action,
  .mission-desk--steps-visible .mission-desk__legend-action {
    left: calc(50% - 18rem - 4rem);
  }
  .mission-desk--steps-visible .mission-desk__info-action {
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  }
  .mission-desk--steps-visible .mission-desk__legend-action {
    bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
  }
}
.mission-desk--active .mission-desk__bottom-stack #mission-status-panel {
  position: relative; inset: auto; flex: 1 1 auto; min-height: 0;
  width: 100%; max-height: none; margin: 0; padding: .75rem;
  padding-left: max(.75rem, env(safe-area-inset-left, 0px));
  padding-right: max(.75rem, env(safe-area-inset-right, 0px));
  display: flex; flex-direction: column; overflow: hidden;
}
.mission-desk--active .mission-desk__load-alert {
  position: absolute; z-index: 12; top: calc(3.5rem + env(safe-area-inset-top, 0px));
  right: 1rem; width: min(27rem, calc(100vw - 1.5rem)); max-height: 30dvh; overflow-y: auto;
}
/* An unverified room event is not a confirmed cancellation. Keep its retry
   action readable/clickable above the shared map, clear of the tab bar;
   never cover the guidance strip with a pale tonal alert. */
.mission-desk__terminal-alert {
  position: absolute; z-index: 12;
  top: calc(9.75rem + env(safe-area-inset-top, 0px));
  left: 50%; transform: translateX(-50%);
  width: min(29rem, calc(100vw - 1.5rem));
  max-height: min(38dvh, calc(100dvh - 16rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  padding: .9rem; overflow-y: auto; overscroll-behavior: contain; pointer-events: auto;
  border: 1px solid rgb(var(--v-theme-warning)); border-inline-start-width: 4px;
  border-radius: var(--bb-radius-card, 24px); box-shadow: var(--bb-shadow-overlay);
  color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface));
}
.mission-desk__terminal-heading { display: flex; gap: .7rem; align-items: flex-start; }
.mission-desk__terminal-heading > :deep(.v-icon) { flex: 0 0 auto; color: rgb(var(--v-theme-warning)); }
.mission-desk__terminal-heading strong { display: block; font-size: .92rem; line-height: 1.5; }
.mission-desk__terminal-heading p { margin: .3rem 0 .75rem; font-size: .83rem; line-height: 1.6; }
.mission-desk__terminal-error { padding: .55rem .7rem; border-radius: .7rem;
  background: var(--bb-color-inset); color: rgb(var(--v-theme-on-surface)); font-size: .82rem; line-height: 1.5; }
.mission-desk__terminal-alert :deep(.v-btn) { position: sticky; bottom: 0;
  min-height: 44px; height: auto; width: 100%; }
.mission-desk__terminal-alert :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-desk--embedded.mission-desk--active .mission-desk__load-alert {
  top: calc(9.75rem + env(safe-area-inset-top, 0px));
  left: 50%; right: auto; transform: translateX(-50%);
  pointer-events: auto; border: 1px solid rgb(var(--v-theme-error));
  color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface));
  box-shadow: var(--bb-shadow-overlay);
}
.mission-desk__guidance {
  position: absolute; z-index: 10; top: calc(5.75rem + env(safe-area-inset-top, 0px));
  left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: .5rem;
  width: max-content; max-width: calc(100vw - 1.5rem); padding: .35rem .6rem;
  border-radius: var(--bb-radius-nested, 16px); color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay);
  font-size: .82rem;
}
.mission-desk__guidance span { min-width: 0; overflow-wrap: anywhere; }
.mission-desk__guidance :deep(.v-btn) { flex-shrink: 0; }
.mission-desk__guidance--warning {
  width: min(30rem, calc(100vw - 1.5rem)); border: 1px solid rgb(var(--v-theme-warning));
}
.mission-desk__guidance--active { width: min(30rem, calc(100vw - 1.5rem)); padding: .55rem .7rem; border: 1px solid var(--bb-color-outline); }
.mission-desk__guidance-symbol { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 12px; background: rgba(var(--v-theme-primary), .15); color: rgb(var(--v-theme-primary)); }
.mission-desk__guidance-copy { flex: 1; min-width: 0; display: grid; gap: 2px; }
.mission-desk__guidance-copy strong { font-size: .87rem; }
.mission-desk__guidance-copy small { font-size: .8rem; line-height: 1.4; }
.mission-desk__direct-distance { color: rgb(var(--v-theme-primary)); font-weight: 800; }
.mission-desk__guidance--active :deep(.v-btn) { min-height: 44px; height: auto; }
/* The key uses Mission Information's card treatment, not an inset strip in
   the steps widget. The two surfaces stay in normal flex flow, never overlap. */
.mission-desk__map-legend { flex: none; min-width: 0; max-height: min(8rem, 25dvh);
  padding: .55rem max(.75rem, env(safe-area-inset-right, 0px)) .55rem max(.75rem, env(safe-area-inset-left, 0px));
  overflow-y: auto; overscroll-behavior: contain;
  border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-card, 24px);
  background: rgba(var(--v-theme-surface), .95); color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay); backdrop-filter: blur(12px); }
.mission-desk__bottom-panel { flex: 1 1 auto; min-height: 0; width: 100%;
  display: flex; flex-direction: column; overflow: hidden;
  padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px);
  border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-card, 24px);
  background: rgba(var(--v-theme-surface), .97); color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay); backdrop-filter: blur(12px); }
.mission-desk__map-legend h2 { margin: 0 0 .25rem; font-size: .85rem; font-weight: 800; }
.mission-desk__map-legend-body { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .2rem .35rem;
  margin: 0; padding: 0; list-style: none; font-size: .8rem; line-height: 1.3; }
.mission-desk__map-legend-body li { display: flex; align-items: center; min-width: 0; gap: .25rem; overflow-wrap: anywhere; }
.mission-desk__map-legend small { display: block; margin-top: .3rem; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.35; }
.mission-desk__legend-symbol { display: inline-grid; place-items: center; flex: none;
  width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;
  box-shadow: 0 0 0 1px var(--bb-color-outline); }
.mission-desk__legend-symbol--incident { background: #b91c1c; border-radius: 3px; color: white; font: 900 9px/1 sans-serif; }
.mission-desk__legend-symbol--origin { background: #2563a6; }
.mission-desk__legend-symbol--stop { background: #c27c14; }
.mission-desk__legend-symbol--requester { background: #dc593b; }
.mission-desk__legend-symbol--rescuer { background: #16826c; }
.mission-desk__legend-symbol--admin { background: #5555ae; }
/* One scroll surface for the steps and guarded action within the docked card.
   No individual stage has a nested scroller. */
.mission-desk__map-cards { flex: 1 1 auto; min-height: 0; width: 100%;
  overflow-y: auto; overscroll-behavior: contain; pointer-events: auto; }
.mission-desk__map-cards :deep(.mission-map-cards) {
  border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none;
}
.mission-desk__header-actions { display: flex; align-items: center; gap: .3rem; flex: none; }
.mission-desk__team-action { flex: none; min-width: 44px; min-height: 44px; }
.mission-desk__route-action { flex: none; min-width: 44px; min-height: 44px; }
.mission-desk__route-action--warning { box-shadow: inset 3px 0 rgb(var(--v-theme-warning)); }
.mission-desk__route-action--ready { box-shadow: inset 3px 0 rgb(var(--v-theme-primary)); }
.mission-desk__route-action:focus-visible, .mission-desk__map-hint button:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-desk__legend-action { position: absolute; z-index: 10;
  left: calc(1rem + env(safe-area-inset-left, 0px));
  bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));
  width: 48px; min-width: 48px; height: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: 50%;
  box-shadow: var(--bb-shadow-overlay); }
.mission-desk__legend-action:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-desk__info-action { position: absolute; z-index: 10;
  left: calc(1rem + env(safe-area-inset-left, 0px));
  bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
  width: 48px; min-width: 48px; height: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: 50%;
  box-shadow: var(--bb-shadow-overlay); }
.mission-desk__info-action:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-desk__map-focus {
  position: absolute; z-index: 9; right: 1.25rem;
  bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: row; gap: .5rem;
}

.mission-desk__map-focus :deep(.v-btn) {
  width: 48px; min-width: 48px; height: 48px;
  border: 1px solid var(--bb-color-outline); border-radius: 50%; box-shadow: var(--bb-shadow-overlay);
}
.mission-desk__map-focus :deep(.v-btn:focus-visible) { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
@media (min-width: 600px) {
  /* Keep the frame action in the same right-hand column, between the compass
     and Broadcast. The 48px slots remain separate at desktop/tablet widths. */
  .mission-desk__map-focus--pair :deep(.mission-desk__frame-action) {
    position: absolute; right: 0; bottom: 10.5rem;
  }
}
.mission-desk--active .mission-desk__map-hint {
  bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
  inset-inline: 50% auto; transform: translateX(50%);
}
@media (max-width: 599px) {
  .mission-desk--active { padding: 0; }
  /* The shared map owns the idle action rail above this panel. Do not shrink
     and offset the offers to one side: use a centered, single scroll surface. */
  .mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty {
    width: min(42rem, calc(100vw - 1.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
    margin: calc(8.5rem + env(safe-area-inset-top, 0px)) auto 0;
    max-height: max(3.75rem, calc(100dvh - 16rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  }
  .mission-desk--active .mission-desk__card,
  .mission-desk--active .mission-route {
    inset-inline: .75rem; width: auto;
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    /* One generous scroll surface, clear of top tabs and guidance above and
       SOS/camera/dock actions below. */
    max-height: calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
  .mission-desk--active .mission-route {
    width: auto;
    max-height: min(48dvh, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  }
  .mission-desk--active .mission-route--editor { max-height: min(56dvh, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
  .mission-route__emblem { display: none; }
  .mission-desk--active .mission-route:has(.mission-route__route-details[open]) {
    max-height: min(68dvh, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
  /* The shared vehicle sheet sits above SOS on the private mission map. */
  .mission-desk__workspace :deep(.point-transport-choices-shell) {
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    z-index: 11;
  }
  /* Bottom sheet fills the map width; camera, info and SOS retain the
     clear row below it while route stays in the steps header. */
  .mission-desk__info-action, .mission-desk__legend-action { left: calc(.75rem + env(safe-area-inset-left, 0px)); }
  .mission-desk__bottom-stack { bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    max-height: min(60dvh, calc(100dvh - 15rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
  /* Like Navigate, the steps surface meets the phone edge; its safe-area
     padding is inside the scrollable card, never an empty map strip. */
  .mission-desk--steps-visible .mission-desk__bottom-stack {
    left: 0; right: 0; transform: none; bottom: 0; width: 100%;
    max-height: min(65dvh, 32rem, max(7rem, calc(100dvh - 14rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))));
  }
  .mission-desk--steps-visible .mission-desk__bottom-panel {
    border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .mission-desk__bottom-stack--information {
    max-height: min(19rem, 70dvh, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
  .mission-desk__bottom-stack--information:has(.mission-brief__details[open]) {
    max-height: min(65dvh, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  }
  /* Do not nest a thumb-sized scroller inside the warning. The whole banner
     scrolls if necessary while its safety actions stay in reach. */
  .mission-desk__guidance--warning {
    flex-wrap: wrap; max-height: max(4.75rem, min(16rem, calc(100dvh - 25.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))));
    overflow-y: auto; overscroll-behavior: contain;
  }
  .mission-desk__guidance--warning span { flex: 1 1 100%; max-height: none; overflow: visible; }
  .mission-desk__guidance--warning :deep(.v-btn) { position: sticky; bottom: 0; min-height: 44px; height: auto;
    background: rgb(var(--v-theme-surface)); }
  /* Same right-hand 48px slots as the phone map, including side cutouts. */
  .mission-desk :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {
    right: calc(.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(16rem + env(safe-area-inset-bottom, 0px));
  }
  .mission-desk__map-focus {
    right: calc(.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
  }
  /* Tool sheets keep the compass to the left of SOS. With steps visible it
     moves above the dock, while Location remains in the bottom-right slot. */
  .mission-desk--active :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {
    right: calc(4.25rem + env(safe-area-inset-right, 0px));
    bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));
  }
  .mission-desk--active .mission-desk__map-focus,
  .mission-desk--active .mission-desk__map-focus--pair {
    right: calc(.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
    flex-direction: row;
  }
  /* Route framing is optional and belongs in the upper row, not in the
     Location/Search row at the bottom of the usable map. */
  .mission-desk--active .mission-desk__map-focus--pair :deep(.v-btn:last-child) {
    position: absolute; right: 7rem; bottom: 5rem;
  }
}
@media (max-width: 599px) and (max-height: 700px) {
  /* Between 561px and 700px the default 60dvh sheet could also rise into
     guidance (especially with the legend or expanded stages). */
  .mission-desk__bottom-stack {
    max-height: min(60dvh, calc(100dvh - 20.75rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  }
  .mission-desk__bottom-stack--information {
    max-height: min(19rem, 70dvh, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  }
  /* Match the embedded selector's specificity: otherwise its 9rem top wins
     even though the short-phone rules appear later in the stylesheet. */
  .mission-desk__guidance.mission-desk__guidance--warning,
  .mission-desk__guidance.mission-desk__guidance--active {
    top: calc(5.25rem + env(safe-area-inset-top, 0px)); max-height: 5rem;
    overflow-y: auto; overscroll-behavior: contain;
  }
}
@media (max-width: 599px) and (max-height: 560px) {
  /* Reserve an upper lane for the 5rem guidance banner below the tabs.
     At 480px+ the sheet starts at least 11.25rem from the top, leaving a
     1rem gap after guidance; its own scroller keeps the guarded action usable. */
  .mission-desk__bottom-stack { max-height: max(7rem, min(48dvh, calc(100dvh - 20.75rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)))); }
  .mission-desk__bottom-stack--information { max-height: min(19rem, calc(100dvh - 10.25rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
  .mission-desk__bottom-stack--information:has(.mission-brief__details[open]) {
    max-height: calc(100dvh - 10.25rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
  .mission-desk__map-legend { padding: .2rem .6rem; max-height: 4rem; }
  .mission-desk__map-legend h2 { position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0, 0, 0, 0); white-space: nowrap; }
  .mission-desk__map-legend small { position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0, 0, 0, 0); white-space: nowrap; }
  /* A short phone cannot fit guidance and a vertical camera rail.
     Put map controls in the open band above SOS. */
  .mission-desk:not(.mission-desk--tool-open) :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {
    right: calc(7.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));
  }
  .mission-desk:not(.mission-desk--tool-open) .mission-desk__map-focus {
    right: calc(.75rem + env(safe-area-inset-right, 0px));
    bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
    flex-direction: row;
  }
  .mission-desk__guidance--active .mission-desk__guidance-symbol { display: none; }
  /* A fresh direct-distance cue remains visible beside Stop. Keep the longer
     planned-route disclaimer available to screen readers without crowding this row. */
  .mission-desk__guidance--active .mission-desk__planned-distance {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  .mission-desk__direct-distance { line-height: 1.25; }
}
@media (max-width: 599px) and (max-height: 400px) {
  /* Zoomed/landscape viewports cannot fit two full cards. Keep both safety
     controls at least 44px high and let their surrounding text scroll. */
  .mission-desk__bottom-stack:not(.mission-desk__bottom-stack--information) {
    max-height: max(4.5rem, min(48dvh, calc(100dvh - 20.75rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))));
  }
  .mission-desk__guidance.mission-desk__guidance--warning,
  .mission-desk__guidance.mission-desk__guidance--active { max-height: 3rem; }
}
@media (max-width: 599px) {
  /* No mission: the centered welcome and empty-state cards occupy the lower
     map, so the normal action rail (and the short-phone row) can cover them.
     Keep an 8px gap beside the 48px network button, before the cards start. */
  .mission-desk:not(.mission-desk--active) :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {
    top: calc(.75rem + env(safe-area-inset-top, 0px));
    right: calc(4.25rem + env(safe-area-inset-right, 0px));
    bottom: auto;
  }
}
@media (max-width: 599px) and (max-height: 560px) {
  .mission-desk__terminal-alert {
    top: calc(4.5rem + env(safe-area-inset-top, 0px));
    max-height: max(6rem, calc(100dvh - 10.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));
  }
  .mission-desk--active .mission-desk__card,
  .mission-desk--active .mission-route {
    top: calc(.75rem + env(safe-area-inset-top, 0px));
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    max-height: none;
  }
  /* The tool's own close header replaces the stage sheet on short screens;
     the map, SOS and camera actions remain available beneath the sheet. */
  .mission-desk--route-open .mission-route {
    top: calc(.75rem + env(safe-area-inset-top, 0px));
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    max-height: none;
  }

  .mission-desk--route-open .mission-desk__guidance { visibility: hidden; }
  .mission-desk--route-open .mission-route__header { gap: .4rem; padding: .55rem .75rem; }
  .mission-desk--route-open .mission-route__emblem { display: none; }
  .mission-desk--route-open .mission-route__heading small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}

@media (max-width: 599px) {
  .mission-desk--steps-visible #mission-steps-stack {
    max-height: min(65dvh, 32rem, max(7rem, calc(100dvh - 14rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))));
  }
  /* Only an actual guidance banner needs a taller clearance lane. Otherwise
     a short phone retains Navigate's 7rem minimum for the actionable steps. */
  .mission-desk--steps-visible.mission-desk--steps-guidance #mission-steps-stack {
    max-height: min(65dvh, 32rem, max(4.75rem, calc(100dvh - 17.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))));
  }
  .mission-desk--steps-guidance .mission-desk__guidance.mission-desk__guidance--warning,
  .mission-desk--steps-guidance .mission-desk__guidance.mission-desk__guidance--active {
    top: calc(5.25rem + env(safe-area-inset-top, 0px)); max-height: 5rem;
    overflow-y: auto; overscroll-behavior: contain;
  }
  /* The location action owns the lowest usable right slot above the dock.
     Its optional route-frame button stays in the upper row with the compass. */
  .mission-desk--active.mission-desk--steps-visible .mission-desk__map-focus,
  .mission-desk--active.mission-desk--steps-visible .mission-desk__map-focus--pair {
    top: auto; bottom: calc(var(--bb-map-mission-sheet-height, 15rem) + .5rem);
    right: calc(.75rem + env(safe-area-inset-right, 0px)); flex-direction: row;
  }
  .mission-desk--active.mission-desk--steps-visible .mission-desk__map-focus--pair :deep(.v-btn:last-child) {
    bottom: 3.5rem;
  }
  /* Standalone bookmark canvas; embedded missions use the shared map rule. */
  .mission-desk--active.mission-desk--steps-visible :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {
    top: auto; bottom: calc(var(--bb-map-mission-sheet-height, 15rem) + 4rem);
    right: calc(4.25rem + env(safe-area-inset-right, 0px));
  }
}
@media (max-width: 599px) and (max-height: 400px) {
  .mission-desk--steps-guidance .mission-desk__guidance.mission-desk__guidance--warning,
  .mission-desk--steps-guidance .mission-desk__guidance.mission-desk__guidance--active { max-height: 3rem; }
}
:global(:root.dark .mission-route__stops),
:global(:root.dark .mission-route__step-control),
:global(:root.dark .mission-route__choice:not(.mission-route__choice--selected)) {
  background: var(--bb-color-inset);
  border-color: var(--bb-color-outline);
}
</style>
