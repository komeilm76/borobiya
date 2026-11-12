<template>
  <main class="mission-desk" :class="{ 'mission-desk--active': desk.activeMission.value }" dir="rtl" @keydown.esc="dismissTool">
    <!-- No active mission means no private markers. Show the same full-viewport
         canvas for context, then replace it with the live canvas once assigned. -->
    <MapCanvas v-if="!desk.activeMission.value" class="mission-desk__idle-map"
      :constrain-bounds="false" aria-label="نقشهٔ عمومی؛ مأموریت فعالی ندارید" />
    <div class="mission-desk__shell">
      <header v-if="!desk.activeMission.value" class="mission-hero">
        <span class="mission-hero__eyebrow"><v-icon icon="mdi-lifebuoy" size="18" /> میز مأموریت امدادگر</span>
        <h1>{{ missionHeadline }}</h1>
        <p>{{ missionIntro }}</p>
        <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-refresh" :loading="desk.loading.value"
          @click="desk.load()">تازه‌سازی</v-btn>
        <div class="mission-hero__glow" aria-hidden="true" />
      </header>

      <v-alert v-if="desk.cancelledMissionId.value" type="info" variant="tonal" rounded="lg" class="mission-desk__outcome mt-6" role="status">
        مأموریت لغو شد. مرکز امداد برای جایگزینی امدادگر مطلع شده است.
      </v-alert>
      <v-alert v-if="desk.completedMissionId.value" type="success" variant="tonal" rounded="lg" class="mission-desk__outcome mt-6" role="status">
        امدادرسانی پایان یافت و وضعیت مأموریت در سرور ثبت شد.
      </v-alert>
      <v-alert v-if="desk.terminalHold.value" type="warning" variant="tonal" rounded="lg"
        class="mission-desk__load-alert mt-6" role="alert">
        پایان مأموریت از اتاق زنده گزارش شد؛ راهبری متوقف شده است. تا تأیید وضعیت از سرور، تغییر مرحله و لغو ممکن نیست.
        <span v-if="desk.error.value">{{ desk.error.value }}</span>
        <v-btn class="ms-2" size="small" variant="text" :loading="desk.loading.value" @click="desk.load()">بررسی وضعیت از سرور</v-btn>
      </v-alert>
      <v-alert v-else-if="desk.error.value" type="error" variant="tonal" rounded="lg" class="mission-desk__load-alert mt-6" role="alert">
        {{ desk.error.value }}
        <v-btn class="ms-2" size="small" variant="text" @click="desk.load()">تلاش دوباره</v-btn>
      </v-alert>
      <v-skeleton-loader v-if="desk.loading.value && !desk.missions.value.length" type="article, actions" class="mission-desk__card" />
      <section v-else-if="desk.activeMission.value" v-show="activeTool === 'status'" id="mission-status-panel"
        class="mission-desk__card" aria-label="مأموریت فعال" tabindex="-1">
        <div class="mission-desk__card-header">
          <div>
            <span class="mission-desk__kicker"><span class="mission-desk__pulse" /> اکنون در جریان</span>
            <h3>مأموریت امدادی شما</h3>
            <p>شناسهٔ پیگیری: <bdi dir="ltr">{{ desk.activeMission.value.id }}</bdi></p>
          </div>
          <div class="mission-desk__card-actions">
            <v-chip color="primary" variant="tonal" size="large" prepend-icon="mdi-timeline-clock-outline"
              role="status" aria-live="polite" aria-atomic="true">{{ currentStatusLabel }}</v-chip>
            <v-btn variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-refresh" :loading="desk.loading.value"
              @click="desk.load()">تازه‌سازی</v-btn>
            <v-btn icon="mdi-close" variant="text" aria-label="بستن وضعیت مأموریت" @click="closeTool('status')" />
          </div>
        </div>
        <details class="mission-desk__timeline">
          <summary>مرحلهٔ {{ (activeStep + 1).toLocaleString('fa-IR') }} از ۵ · {{ currentStatusLabel }} — نمایش همهٔ مراحل</summary>
          <div class="mission-steps" role="list" aria-label="مراحل مأموریت">
            <div v-for="(step, index) in steps" :key="step.status" class="mission-steps__item"
              :class="{ 'mission-steps__item--reached': index <= activeStep }"
              :aria-current="index === activeStep ? 'step' : undefined" role="listitem">
              <span class="mission-steps__number" aria-hidden="true">{{ (index + 1).toLocaleString('fa-IR') }}</span>
              <span>{{ step.label }}</span>
              <v-icon v-if="index < activeStep" icon="mdi-check" size="16" aria-label="انجام شده" />
            </div>
          </div>
        </details>
        <div class="mission-desk__progress" aria-label="به‌روزرسانی وضعیت مأموریت">
          <p>تغییر مرحله دستی است؛ موقعیت‌یابی یا باز کردن مسیر، وضعیت مأموریت را تغییر نمی‌دهد.</p>
          <p v-if="desk.loading.value" role="status">در حال تأیید وضعیت مأموریت از سرور؛ تغییر مرحله موقتاً متوقف است.</p>
          <v-btn v-if="desk.nextStatus.value" color="primary" variant="flat" rounded="lg"
            :loading="desk.progressing.value" :disabled="!desk.canAdvance.value"
            @click="desk.advanceStatus()">{{ nextStatusLabel }}</v-btn>
          <v-alert v-if="desk.progressError.value" type="error" variant="tonal" rounded="lg" role="alert">
            {{ desk.progressError.value }}
            <v-btn size="small" variant="text" :loading="desk.loading.value" @click="desk.load()">تازه‌سازی وضعیت</v-btn>
          </v-alert>
          <v-alert v-if="desk.cancellationNeedsRefresh.value && !desk.cancellationOpen.value" type="warning"
            variant="tonal" rounded="lg" role="alert">
            وضعیت درخواست لغو هنوز تأیید نشده است؛ پیش از تغییر مرحله، وضعیت مأموریت را از سرور تازه کنید.
            <v-btn size="small" variant="text" :loading="desk.loading.value" @click="desk.load()">تازه‌سازی وضعیت</v-btn>
          </v-alert>
        </div>
        <div class="mission-desk__foot">
          <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-map-marker-path"
            aria-controls="mission-route-panel" :disabled="!!desk.terminalHold.value || !!desk.error.value || desk.loading.value"
            @click="openRouteWorkspace">باز کردن مسیر</v-btn>
          <p><v-icon icon="mdi-shield-check-outline" size="20" /> لغو، آخرین راه‌حل است؛ برای ناتوانی در ادامه، دلیل واقعی ثبت کنید.</p>
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn v-bind="props" variant="text" color="error" rounded="lg" prepend-icon="mdi-dots-horizontal"
                aria-label="گزینه‌های بیشتر مأموریت" :disabled="desk.progressing.value || desk.loading.value || !!desk.error.value || !!desk.terminalHold.value">بیشتر</v-btn>
            </template>
            <v-list density="comfortable" rounded="lg">
              <v-list-item prepend-icon="mdi-alert-outline" title="قادر به ادامه نیستم" subtitle="ثبت دلیل و آگاه‌سازی مرکز امداد" :disabled="desk.progressing.value"
                @click="desk.showCancellation()" />
            </v-list>
          </v-menu>
        </div>
      </section>
      <section v-else-if="!desk.error.value" class="mission-desk__empty">
        <div class="mission-desk__empty-icon"><v-icon icon="mdi-check-decagram-outline" size="36" /></div>
        <h3>در حال حاضر مأموریت فعالی ندارید</h3>
        <p>برای پذیرفتن مأموریت تازه، پیشنهادهای دریافتی را بررسی کنید.</p>
        <v-btn color="primary" variant="flat" rounded="lg" to="/_user/map?inbox=1">مشاهدهٔ پیشنهادها</v-btn>
      </section>
      <div v-if="desk.activeMission.value" id="mission-workspace" class="mission-desk__workspace">
        <MissionLivePanel :mission="desk.activeMission.value" fullscreen :room-open="activeTool === 'team'"
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
            <section v-show="routing.visible.value && activeTool === 'route'" id="mission-route-panel"
              class="mission-route" aria-label="مسیرهای پیشنهادی مأموریت" tabindex="-1">
              <header class="mission-route__header">
                <div>
                  <h2>مسیر تا محل حادثه</h2>
                  <p>مسیریابی با سرور نقشهٔ محلی انجام می‌شود؛ مسیرها پیشنهادند و زمان رسیدن قطعی نیست.</p>
                </div>
                <div class="d-flex align-center ga-1">
                  <v-btn variant="text" color="error" size="small" :disabled="navigation.active.value || !routing.target.value || routing.targetLoading.value"
                    @click="resetRoutePlan">پاک کردن مسیر</v-btn>
                  <v-btn icon="mdi-close" variant="text" aria-label="بستن پنل مسیر؛ مسیر روی نقشه می‌ماند" @click="closeTool('route')" />
                </div>
              </header>
              <v-progress-linear v-if="routing.targetLoading.value" indeterminate color="primary" aria-label="دریافت محل حادثه" />
              <v-alert v-if="routing.error.value" class="my-3" type="warning" variant="tonal" role="alert">
                {{ routing.error.value }}
                <v-btn v-if="!routing.target.value" size="small" variant="text" @click="routing.open()">تلاش دوباره</v-btn>
              </v-alert>
              <template v-if="routing.target.value">
                <div class="mission-route__controls">
                  <div class="mission-route__profile">
                    <p class="d-none d-sm-block text-body-2 font-weight-bold mb-2">وسیلهٔ حرکت</p>
                    <v-select :model-value="routing.profile.value" :items="transportProfiles"
                      class="mission-route__profile-select d-sm-none" label="وسیلهٔ حرکت" item-title="title" item-value="value"
                      density="compact" variant="outlined" hide-details :disabled="navigation.active.value"
                      @update:model-value="onProfileChange" />
                    <v-btn-toggle class="d-none d-sm-inline-flex" :model-value="routing.profile.value"
                      :disabled="navigation.active.value" mandatory rounded="lg" color="primary"
                      @update:model-value="onProfileChange">
                      <v-btn value="car" prepend-icon="mdi-car">خودرو</v-btn>
                      <v-btn value="bicycle" prepend-icon="mdi-bicycle">دوچرخه</v-btn>
                      <v-btn value="foot" prepend-icon="mdi-walk">پیاده</v-btn>
                    </v-btn-toggle>
                  </div>
                  <div class="mission-route__route-actions d-flex flex-wrap ga-2">
                    <v-btn color="primary" variant="flat" rounded="lg" :loading="routing.loading.value" :disabled="navigation.active.value"
                      @click="routing.findRoutes()">{{ routing.from.value ? 'دریافت مسیرها' : 'اجازهٔ موقعیت و دریافت مسیرها' }}</v-btn>
                    <v-btn v-if="routing.from.value" color="primary" variant="tonal" rounded="lg"
                      :disabled="routing.loading.value || navigation.active.value" @click="routing.findRoutes(true)">به‌روزرسانی موقعیت</v-btn>
                  </div>
                </div>
                <details class="mission-route__stops" @toggle="onWaypointDisclosureToggle">
                  <summary class="mission-route__stops-toggle">ایستگاه‌های میانی (اختیاری، حداکثر ۶)
                    <span v-if="routing.via.value.length" class="mission-route__stops-count">{{ routing.via.value.length.toLocaleString('fa-IR') }} ایستگاه</span>
                  </summary>
                  <p class="text-caption">برای افزودن یک نقطه روی نقشه، حالت انتخاب را فعال کنید؛ یا مختصات را وارد کنید. محل حادثه همیشه مقصد نهایی است.</p>
                  <div class="d-flex flex-wrap ga-2 align-center">
                    <v-btn variant="tonal" :disabled="navigation.active.value || routing.via.value.length >= 6 || !mapReady || !routing.target.value"
                      :aria-pressed="pickingWaypoint" @click="toggleWaypointPick">
                      {{ pickingWaypoint ? 'لغو انتخاب روی نقشه' : 'افزودن نقطه از نقشه' }}
                    </v-btn>
                    <v-text-field v-model="waypointLat" type="number" label="عرض جغرافیایی" aria-label="عرض جغرافیایی ایستگاه"
                      density="compact" variant="outlined" hide-details class="mission-route__coordinate" />
                    <v-text-field v-model="waypointLon" type="number" label="طول جغرافیایی" aria-label="طول جغرافیایی ایستگاه"
                      density="compact" variant="outlined" hide-details class="mission-route__coordinate" />
                    <v-btn variant="tonal" :disabled="navigation.active.value || routing.via.value.length >= 6" @click="addTypedWaypoint">افزودن مختصات</v-btn>
                  </div>
                  <p v-if="waypointError" role="alert" class="text-error">{{ waypointError }}</p>
                  <ol class="mission-route__stop-list">
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
                  <v-switch :model-value="routing.optimize.value" label="بهینه‌سازی ترتیب ایستگاه‌ها (TSP)"
                    :disabled="navigation.active.value || !routing.via.value.length" hide-details color="primary"
                    @update:model-value="routing.setOptimize(Boolean($event))" />
                </details>
              <p class="mission-route__legend">مربع قرمز (!): محل حادثه · آبی: مبدأ محاسبهٔ مسیر · زرد: ایستگاه میانی.
                نارنجی/سبز/بنفش: موقعیت داوطلبانهٔ درخواست‌کننده/امدادگر/مدیر؛ این نشانگرها ممکن است با محل حادثه هم‌پوشانی داشته باشند. مختصات حادثه:
                  <bdi dir="ltr">{{ routing.target.value.incident.lat.toFixed(5) }}, {{ routing.target.value.incident.lon.toFixed(5) }}</bdi>
                </p>
                <div v-if="routing.routes.value.length" class="mission-route__step-control" role="group" aria-label="مراحل مسیر پیشنهادی">
                  <v-slider :model-value="routing.step.value" :min="0" :max="routing.via.value.length + 1" :step="1"
                    label="نمایش ایستگاه روی نقشه" thumb-label="always" :disabled="navigation.active.value"
                    @update:model-value="focusRouteStep(Number($event))" />
                  <p role="status">{{ currentStopLabel }}</p>
                </div>
                <div v-if="routing.routes.value.length" class="mission-route__choices" role="group" aria-label="انتخاب مسیر پیشنهادی">
                  <button v-for="(choice, index) in routing.routes.value" :key="index" type="button"
                    class="mission-route__choice" :class="{ 'mission-route__choice--selected': routing.selectedIndex.value === index }"
                    :aria-pressed="routing.selectedIndex.value === index" :disabled="navigation.active.value" @click="routing.selectRoute(index)">
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
                <p v-if="routing.routes.value.some(choice => choice.elevation)" class="text-caption mt-2">
                  ارتفاع تقریبی از داده‌های محلی Mapzen/Tilezen محاسبه شده است؛ برای تصمیم ایمنی در مسیر به تنهایی کافی نیست.
                  <a href="/terrain-attribution.html" target="_blank" rel="noopener noreferrer">منابع و حق انتساب داده‌های ارتفاع (آفلاین)</a>
                </p>
                <div v-if="routing.selectedRoute.value" class="mission-route__navigation">
                  <v-btn v-if="!navigation.active.value" color="primary" variant="flat" rounded="lg"
                    prepend-icon="mdi-navigation" :disabled="!mapReady" @click="startGuidance">شروع راهبری</v-btn>
                  <v-btn v-else color="error" variant="tonal" rounded="lg" prepend-icon="mdi-stop-circle-outline"
                    @click="stopGuidance">توقف راهبری</v-btn>
                  <p v-if="navigation.active.value" role="status" class="text-caption mb-0">
                    {{ !navigation.fix.value ? 'در انتظار موقعیت تازهٔ GPS…' : followingGps ? 'دوربین نقشه موقعیت شما را دنبال می‌کند؛ مسیر را با محیط واقعی تطبیق دهید.' : 'دوربین روی نمای انتخابی شماست؛ برای دنبال‌کردن دوبارهٔ GPS، دکمهٔ موقعیت را بزنید.' }}
                  </p>
                </div>
                <v-alert v-if="navigation.error.value" type="warning" variant="tonal" role="alert" class="mt-3">
                  {{ navigation.error.value }}
                </v-alert>
                <p v-if="routing.routes.value.length === 1" class="text-caption mt-2" role="status">
                  برای این وسیله فقط یک مسیر در شبکهٔ راه‌های محلی پیدا شد؛ وجود چند مسیر تضمین نمی‌شود.
                </p>
              </template>
            </section>
          </template>
        </MissionLivePanel>
        <header class="mission-desk__map-heading" aria-label="مأموریت فعال">
          <h1>مأموریت من</h1>
          <span role="status" aria-live="polite">{{ currentStatusLabel }}</span>
        </header>
        <div v-if="activeTool !== 'route' && (routing.error.value || navigation.error.value)"
          class="mission-desk__guidance mission-desk__guidance--warning" role="alert">
          <span>{{ routing.error.value || navigation.error.value }}</span>
          <v-btn v-if="!desk.terminalHold.value && !desk.error.value && !desk.loading.value" size="small" variant="tonal"
            @click="openRouteWorkspace">بررسی مسیر</v-btn>
          <v-btn v-if="navigation.active.value" size="small" variant="tonal" color="error"
            @click="stopGuidance">توقف</v-btn>
          <v-btn v-else-if="!routing.error.value" icon="mdi-close" size="small" variant="text"
            aria-label="بستن هشدار راهبری" @click="navigation.dismissError()" />
        </div>
        <div v-else-if="navigation.active.value" class="mission-desk__guidance" role="status">
          <span>{{ !navigation.fix.value ? 'راهبری فعال · در انتظار GPS' : followingGps ? 'راهبری فعال · موقعیت خصوصی GPS' : 'راهبری فعال · دنبال‌کردن GPS متوقف است' }}</span>
          <v-btn size="small" variant="tonal" color="error" @click="stopGuidance">توقف راهبری</v-btn>
        </div>
        <div v-show="!pickingWaypoint && activeTool !== 'status' && activeTool !== 'team'"
          class="mission-desk__map-focus" role="group" aria-label="کنترل‌های نمای نقشهٔ مأموریت">
          <v-btn v-if="navigation.active.value" :icon="followingGps ? 'mdi-crosshairs-gps' : 'mdi-navigation-variant'"
            :color="followingGps ? 'primary' : 'warning'" variant="flat"
            :aria-label="followingGps ? 'مرکز کردن موقعیت راهبری' : 'بازگشت به دنبال‌کردن GPS'"
            :title="followingGps ? 'مرکز کردن موقعیت راهبری' : 'بازگشت به دنبال‌کردن GPS'"
            :aria-pressed="followingGps" :disabled="!mapReady" @click="resumeGuidanceFollow" />
          <v-btn v-if="routing.visible.value && routing.target.value" icon="mdi-fit-to-screen" color="primary" variant="flat"
            aria-label="نمایش محل حادثه و مسیر مأموریت" title="نمایش محل حادثه و مسیر مأموریت"
            :disabled="!mapReady || !!desk.terminalHold.value" @click="frameMissionRoute" />
        </div>
        <nav class="mission-desk__dock" aria-label="ابزارهای مأموریت">
          <button id="mission-tool-status" type="button" :class="{ 'mission-desk__dock-active': activeTool === 'status' }"
            :aria-expanded="activeTool === 'status'" aria-controls="mission-status-panel"
            @click="toggleTool('status')"><v-icon icon="mdi-clipboard-text-outline" size="22" aria-hidden="true" />وضعیت</button>
          <button id="mission-tool-route" type="button" :class="{ 'mission-desk__dock-active': activeTool === 'route' }"
            :aria-expanded="activeTool === 'route'" aria-controls="mission-route-panel"
            :disabled="!!desk.terminalHold.value || !!desk.error.value || desk.loading.value"
            @click="toggleTool('route')"><v-icon icon="mdi-routes" size="22" aria-hidden="true" />مسیر</button>
          <button id="mission-tool-team" type="button" :class="{ 'mission-desk__dock-active': activeTool === 'team', 'mission-desk__dock-sharing': teamSharing && activeTool !== 'team' }"
            :aria-expanded="activeTool === 'team'" aria-controls="mission-team-panel"
            @click="toggleTool('team')"><v-icon :icon="teamSharing ? 'mdi-map-marker-check' : 'mdi-account-group-outline'" size="22" aria-hidden="true" />{{ teamSharing ? 'اشتراک روشن' : 'اعضا' }}</button>
        </nav>
      </div>
    </div>

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
import MapCanvas from "@/components/map/MapCanvas.vue";
import { useMissionRoutes } from "@/composables/use-mission-routes";
import { missionMapCamera, missionRouteStop } from "@/sos/mission-map";
import { formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
import { useMissionRouteGeometry } from "@/sos/mission-route-geometry";
import { useRouteElevationCharts } from "@/sos/route-elevation-charts";
import { needsOverlayRestore } from "@/map/overlay-restore";
import type { RouteChoice, TransportProfile } from "@/api/mission-routing";
import { useMissionDesk } from "@/composables/use-mission-desk";
import { decodeAccessTokenClaims } from "@/composables/device-identity";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
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
  if (pickingWaypoint.value) pickingWaypoint.value = false;
  if (activeTool.value === tool) { closeTool(tool); return; }
  if (tool === "route") { openRouteWorkspace(); return; }
  activeTool.value = tool;
  void nextTick(() => document.getElementById(`mission-${tool}-panel`)?.focus({ preventScroll: true }));
}
function closeTool(tool: "status" | "route" | "team"): void {
  activeTool.value = null;
  void nextTick(() => document.getElementById(`mission-tool-${tool}`)?.focus({ preventScroll: true }));
}
function dismissTool(): void {
  if (pickingWaypoint.value) { cancelWaypointPick(); return; }
  if (activeTool.value) closeTool(activeTool.value);
}
function resetRoutePlan(): void {
  if (navigation.active.value || !routing.target.value) return;
  // Clearing the proposed route must not also remove the incident from the map.
  routing.clearPlan();
  pickingWaypoint.value = false;
  waypointError.value = "";
  closeTool("route");
}
function startGuidance(): void {
  // A denied/unavailable GPS watch must leave the route and its error visible.
  followingGps.value = true;
  if (navigation.start()) closeTool("route");
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
function onWaypointDisclosureToggle(event: Event): void {
  // Closing the optional editor must also end map-pick mode: otherwise the next
  // tap on the visible map can silently insert a waypoint from a hidden control.
  if (!(event.target as HTMLDetailsElement).open) pickingWaypoint.value = false;
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
function onRouteMapClick(event: MapMouseEvent): void {
  if (!pickingWaypoint.value || navigation.active.value) return;
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
  (camera) => { if (followingGps.value) routeMap?.easeTo(camera); }, undefined,
  () => routeMap?.easeTo({ pitch: 0, bearing: 0, duration: 450 }));
function onProfileChange(value: unknown): void {
  if (value === "car" || value === "bicycle" || value === "foot") routing.selectProfile(value as TransportProfile);
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
  if (event.originalEvent) pauseGuidanceFollow();
}
function resumeGuidanceFollow(): void {
  if (!navigation.active.value) return;
  followingGps.value = true;
  navigation.recenter(); // A fresh fix recenters now; otherwise await the next GPS sample.
}
function frameMissionRoute(): void {
  const map = routeMap;
  const incident = routing.visible.value ? routing.target.value?.incident : null;
  if (!map || !incident) return;
  pauseGuidanceFollow();
  if (routing.selectedRoute.value && routeSnapshot.value.bounds) {
    map.fitBounds(routeSnapshot.value.bounds, { padding: 60, maxZoom: 15, duration: 450 });
  } else {
    const camera = missionMapCamera(incident, routing.from.value, routing.via.value);
    if (camera.kind === "both") map.fitBounds(camera.bounds, { padding: camera.padding, maxZoom: camera.maxZoom, duration: 450 });
    else map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 450 });
  }
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
  const incident = routing.visible.value ? routing.target.value?.incident : null;
  clearRouteOverlays(!incident);
  if (!map || !incident || !MarkerClass) return;
  waypointMarkers = routing.via.value.map((point, index) => {
    const marker = new MarkerClass({ color: "#c27c14" }).setLngLat([point.lon, point.lat]).addTo(map);
    marker.getElement().setAttribute("aria-label", `ایستگاه ${index + 1}`);
    return marker;
  });
  // A square ! pin cannot be mistaken for the requester's orange live-location marker.
  const incidentPin = document.createElement("div");
  incidentPin.className = "mission-desk__incident-pin";
  incidentPin.textContent = "!";
  incidentPin.setAttribute("role", "img");
  incidentPin.setAttribute("aria-label", "محل حادثه");
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
function applyRouteLayer(): void {
  const map = routeMap;
  if (!map || !map.isStyleLoaded()) return;
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
  if (!map || !routing.visible.value || !routing.target.value || !needsOverlayRestore({
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
  if (next !== previous) teamSharing.value = false;
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
  closeRoutes();
  desk.reset();
  if (next) void desk.load();
}, { flush: "sync" });
onBeforeUnmount(() => { releaseRouteMap(); desk.reset(); });
</script>

<style scoped>
.mission-desk { min-height: calc(100vh - 130px); padding: clamp(18px, 4vw, 52px) 18px 100px; color: rgb(var(--v-theme-on-background)); background: radial-gradient(ellipse at 86% 4%, rgba(33,130,113,.10), transparent 52%), rgb(var(--v-theme-background)); }
.mission-desk__workspace { scroll-margin-top: 16px; }
.mission-route { margin-top: 12px; padding: clamp(14px, 2vw, 22px); border: 1px solid rgba(35,135,108,.3); border-radius: var(--bb-radius-nested, 16px); background: rgba(31,121,102,.045); }
.mission-route__legend { margin: 10px 0; font-size: .82rem; line-height: 1.7; }
.mission-desk__map-hint { position: absolute; z-index: 2; inset-inline: 12px; bottom: 32px; width: fit-content; max-width: calc(100% - 24px); padding: 8px 12px; border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); box-shadow: var(--bb-shadow-surface); font-size: .85rem; }
.mission-desk__map-hint button { margin-inline-start: 12px; color: rgb(var(--v-theme-primary)); text-decoration: underline; font: inherit; font-weight: 700; }
:global(.mission-desk__incident-pin) { display: grid; place-items: center; width: 30px; height: 30px; border: 2px solid white; border-radius: 7px; background: #b91c1c; color: white; font: 900 19px/1 sans-serif; box-shadow: 0 2px 7px #172b38aa; }
:global(.mission-desk__incident-pin::after) { content: ''; position: absolute; top: 100%; border-inline: 6px solid transparent; border-top: 8px solid #b91c1c; }
:global(.mission-desk__selected-stop) { outline: 3px solid #fbbf24; outline-offset: 4px; border-radius: 50%; }
.mission-route__header, .mission-route__controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
.mission-route__header h2 { font-size: 1.2rem; font-weight: 800; }
.mission-route__header p { font-size: 0.9rem; opacity: .78; }
.mission-route__stops { margin-block: 16px; padding: 16px; border: 1px solid rgba(98,146,137,.3); border-radius: var(--bb-radius-nested, 16px); }
.mission-route__stops-toggle { cursor: pointer; font-weight: 700; color: rgb(var(--v-theme-on-surface)); }
.mission-route__stops-toggle:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 4px; }
.mission-route__stops[open] .mission-route__stops-toggle { margin-bottom: 12px; }
.mission-route__stops-count { margin-inline-start: 8px; color: rgb(var(--v-theme-primary)); font-size: .85rem; }
.mission-route__step-control { margin-top: 16px; padding: 16px; border: 1px solid rgba(98,146,137,.3); border-radius: var(--bb-radius-nested, 16px); }
.mission-route__step-control p { margin: 0; font-size: .88rem; }
.mission-route__coordinate { flex: 1 1 145px; max-width: 225px; }
.mission-route__stop-list { padding-inline-start: 22px; }
.mission-route__stop-list li { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 6px; cursor: grab; }
.mission-route__choices { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 12px; }
.mission-route__choice { display: grid; text-align: start; gap: 7px; color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); border: 1px solid rgba(98,146,137,.35); border-radius: var(--bb-radius-nested, 16px); padding: 16px; cursor: pointer; font: inherit; }
.mission-route__choice--selected { border: 2px solid rgb(var(--v-theme-primary)); background: rgba(22,130,108,.09); }
.mission-route__choice:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-route__choice:disabled { opacity: .7; cursor: not-allowed; }
.mission-route__navigation { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 18px; }
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
.mission-desk__card, .mission-desk__empty { border-radius: var(--bb-radius-card, 24px); background: rgb(var(--v-theme-surface)); border: 1px solid rgba(98,146,137,.25); box-shadow: var(--bb-shadow-surface); }
.mission-desk__card { padding: clamp(16px, 2vw, 24px); margin-top: 16px; }
.mission-desk__card-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 18px; }
.mission-desk__card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mission-desk__timeline { margin: 14px 0; border-top: 1px solid rgba(98,146,137,.25); padding-top: 10px; }
.mission-desk__timeline summary { cursor: pointer; width: fit-content; font-size: .85rem; font-weight: 700; color: rgb(var(--v-theme-primary)); }
.mission-desk__timeline summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
.mission-desk__kicker { display: inline-flex; align-items: center; gap: 8px; color: rgb(var(--v-theme-primary)); font-weight: 800; font-size: .84rem; }
.mission-desk__pulse { width: 9px; height: 9px; border-radius: 50%; background: #16b58f; box-shadow: 0 0 0 5px rgba(22,181,143,.16); }
.mission-desk__card h3 { font-size: clamp(1.2rem, 2vw, 1.45rem); margin: 9px 0 5px; }
.mission-desk__card-header p { opacity: .65; font-size: 0.82rem; overflow-wrap: anywhere; }
.mission-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 14px 0; }
.mission-steps__item { display: flex; align-items: center; gap: 9px; min-height: 60px; padding: 11px; border-radius: var(--bb-radius-nested, 16px); background: rgba(111,138,130,.09); color: rgb(var(--v-theme-on-surface)); font-size: .81rem; font-weight: 700; }
.mission-steps__item--reached { background: rgba(34,145,116,.13); color: rgb(var(--v-theme-primary)); opacity: 1; }
.mission-steps__number { display: inline-grid; flex-shrink: 0; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid currentColor; font-size: .8rem; }
.mission-desk__progress { display: grid; justify-items: start; gap: 12px; margin-bottom: 20px; }
.mission-desk__progress p { margin: 0; font-size: .88rem; color: rgb(var(--v-theme-on-surface)); }
.mission-desk__progress :deep(.v-btn) { min-height: 44px; height: auto; max-width: 100%; min-width: 0; white-space: normal; text-align: center; }
.mission-desk__progress :deep(.v-btn__content) { white-space: normal; text-align: center; }
.mission-desk__foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid rgba(98,146,137,.2); padding-top: 18px; }
.mission-desk__foot p { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 0.9rem; opacity: .76; }
.mission-desk__empty { text-align: center; padding: 58px 24px; }
.mission-desk__empty-icon { width: 70px; height: 70px; border-radius: 20px; background: rgba(34,145,116,.13); color: rgb(var(--v-theme-primary)); display: grid; place-items: center; margin: 0 auto 16px; }
.mission-desk__empty h3 { font-size: 1.2rem; margin: 0 0 8px; }.mission-desk__empty p { opacity: .7; margin-bottom: 22px; }
.mission-desk__limit { font-size: .8rem; opacity: .68; margin: 20px 0 0; }
.mission-cancel-actions { flex-wrap: wrap; }
@media(max-width: 780px) { .mission-steps { grid-template-columns: repeat(2, 1fr); }.mission-desk__toolbar { align-items: flex-start; }.mission-desk__toolbar p { max-width: 230px; } }
@media(max-width: 599px) {
  .mission-desk { padding-inline: 12px; }
  .mission-desk__toolbar { flex-wrap: wrap; }
  .mission-desk__toolbar > div { flex: 1 1 100%; min-width: 0; }
  .mission-desk__toolbar p { max-width: none; }
  .mission-route { padding: 16px; }
  .mission-route__controls > div { width: 100%; min-width: 0; }
  .mission-route__profile-select { width: 100%; }
  .mission-route__route-actions :deep(.v-btn) { flex: 1 1 100%; max-width: 100%; min-height: 44px; height: auto; white-space: normal; }
  .mission-route__route-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
  .mission-route__stops { padding: 12px; }
  .mission-route__coordinate { flex: 1 1 100%; max-width: none; min-width: 0; }
  .mission-cancel-actions { flex-direction: column; align-items: stretch; gap: 8px; }
  .mission-cancel-actions :deep(.v-spacer) { display: none; }
  .mission-cancel-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }
  .mission-cancel-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
}
@media(max-width: 480px) { .mission-steps { grid-template-columns: 1fr; margin: 22px 0; }.mission-steps__item { min-height: 44px; }.mission-desk__foot { align-items: flex-start; flex-direction: column; }.mission-hero__glow { opacity: .4; } }

/* While a mission is loading or absent, the same full-screen spatial shell
   remains. Its public canvas has no incident or live-room data. */
.mission-desk:not(.mission-desk--active) { position: relative; height: 100dvh; min-height: 0; padding: 0; overflow: hidden; }
.mission-desk__idle-map { position: absolute !important; inset: 0; width: 100%; height: 100%; min-height: 0 !important; border-radius: 0; }
.mission-desk__idle-map :deep(.maplibregl-ctrl-top-right) { top: calc(4.5rem + env(safe-area-inset-top, 0px)); }
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

/* Match /_user/map: the canvas owns the viewport, with independent scrollable
   tools that can all close. No tall card or persistent planner takes map space. */
.mission-desk--active {
  height: 100dvh; min-height: 0; padding: 0; overflow: hidden;
  background: rgb(var(--v-theme-background)); isolation: isolate;
}
.mission-desk--active .mission-desk__shell { position: relative; width: 100%; max-width: none; height: 100%; }
.mission-desk--active .mission-desk__workspace { position: absolute; inset: 0; width: 100%; height: 100%; }
.mission-desk--active .mission-desk__card,
.mission-desk--active .mission-route {
  position: absolute; z-index: 8;
  inset: auto 1rem calc(5.5rem + env(safe-area-inset-bottom, 0px)) auto;
  width: min(28rem, calc(100vw - 1.5rem)); max-height: min(56dvh, 33rem);
  margin: 0; padding: 1rem; overflow-y: auto; overscroll-behavior: contain;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-card, 24px);
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay);
}
.mission-desk--active .mission-desk__card { z-index: 9; }
.mission-desk--active .mission-desk__load-alert {
  position: absolute; z-index: 12; top: calc(3.5rem + env(safe-area-inset-top, 0px));
  right: 1rem; width: min(27rem, calc(100vw - 1.5rem)); max-height: 30dvh; overflow-y: auto;
}
.mission-desk__map-heading {
  position: absolute; z-index: 7; top: calc(.75rem + env(safe-area-inset-top, 0px));
  left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: .5rem; max-width: calc(100vw - 8rem);
  padding: .5rem .85rem; border: 1px solid var(--bb-color-outline);
  border-radius: var(--bb-radius-nested, 16px); white-space: nowrap;
  color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay);
}
.mission-desk__map-heading h1 { margin: 0; font-size: .9rem; font-weight: 800; }
.mission-desk__map-heading span { overflow: hidden; text-overflow: ellipsis; font-size: .8rem; }
.mission-desk__guidance {
  position: absolute; z-index: 7; top: calc(4.5rem + env(safe-area-inset-top, 0px));
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
/* Keep the compact mission camera controls clear of the bottom dock and the
   physical-right planner. They remain reachable while the Route tool is open. */
.mission-desk__map-focus {
  position: absolute; z-index: 9; left: calc(.75rem + env(safe-area-inset-left, 0px));
  bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));
  display: flex; gap: .5rem;
}
.mission-desk__map-focus :deep(.v-btn) {
  width: 44px; min-width: 44px; height: 44px;
  border: 1px solid var(--bb-color-outline); box-shadow: var(--bb-shadow-overlay);
}
.mission-desk__map-focus :deep(.v-btn:focus-visible) { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-desk__dock {
  position: absolute; z-index: 10; bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
  left: 50%; transform: translateX(-50%); display: flex; gap: 3px;
  width: min(21rem, calc(100vw - 6rem)); padding: 4px;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-card, 24px);
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay);
}
.mission-desk__dock button {
  display: grid; place-items: center; flex: 1 1 0; gap: 1px; min-width: 0; min-height: 54px;
  border: 0; border-radius: var(--bb-radius-nested, 16px); background: transparent;
  color: rgb(var(--v-theme-on-surface)); cursor: pointer; font-family: inherit; font-size: .82rem; font-weight: 700; line-height: 1.3;
}
.mission-desk__dock .mission-desk__dock-active {
  background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary));
}
.mission-desk__dock .mission-desk__dock-sharing {
  background: rgb(var(--v-theme-error)); color: rgb(var(--v-theme-on-error));
}
.mission-desk__dock button:disabled { opacity: .48; cursor: not-allowed; }
.mission-desk__dock button:focus-visible, .mission-desk__map-hint button:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
.mission-desk--active .mission-desk__map-hint {
  bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
  inset-inline: 50% auto; transform: translateX(50%);
}
@media (max-width: 599px) {
  .mission-desk--active { padding: 0; }
  .mission-desk--active .mission-desk__card,
  .mission-desk--active .mission-route {
    inset-inline: .75rem; width: auto;
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    max-height: min(52dvh, 26rem);
  }
  .mission-desk__dock { width: min(21rem, calc(100vw - 1.5rem)); }
  .mission-desk__map-heading { max-width: calc(100vw - 8rem); }
  .mission-desk__guidance { top: calc(4.25rem + env(safe-area-inset-top, 0px)); }
  .mission-desk__guidance--warning { flex-wrap: wrap; }
  .mission-desk__guidance--warning span { flex: 1 1 100%; }
}
:global(:root.dark .mission-desk__dock button:not(.mission-desk__dock-active):not(.mission-desk__dock-sharing)) { background: var(--bb-color-inset); }

:global(:root.dark .mission-route) { background: #21383a; border-color: var(--bb-color-outline); }
:global(:root.dark .mission-route__stops),
:global(:root.dark .mission-route__step-control),
:global(:root.dark .mission-route__choice:not(.mission-route__choice--selected)) {
  background: var(--bb-color-inset);
  border-color: var(--bb-color-outline);
}
:global(:root.dark .mission-steps__item:not(.mission-steps__item--reached)) {
  background: var(--bb-color-inset);
  border: 1px solid var(--bb-color-outline);
}
</style>
