<template>
  <v-container class="admin-dispatch py-6" fluid>
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
      <div>
        <div class="d-flex align-center ga-2">
          <v-icon color="error" icon="mdi-radar" size="28" />
          <h1 class="text-h5 font-weight-bold mb-0">مرکز پایش و اعزام اضطراری (SOS)</h1>
          <v-chip
            :color="adminSos.connected ? 'success' : 'warning'"
            size="small"
            variant="tonal"
          >
            {{ adminSos.connected ? "متصل به اتاق زندهٔ ادمین" : "در حال اتصال زنده…" }}
          </v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mt-1 mb-0">
          درخواست‌های SOS به‌صورت بلادرنگ دریافت می‌شوند؛ نزدیک‌ترین امدادگران هم‌تخصص را انتخاب و اعزام کنید.
        </p>
      </div>

      <div class="d-flex flex-wrap align-center ga-2">
        <v-select
          :model-value="adminSos.filterStatus"
          :items="dispatchFilters"
          class="admin-dispatch__filter-select d-sm-none"
          label="وضعیت درخواست‌های اضطراری"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="onFilterChange"
        />
        <v-btn-toggle
          class="d-none d-sm-inline-flex"
          :model-value="adminSos.filterStatus"
          density="compact"
          mandatory
          rounded="lg"
          variant="outlined"
          @update:model-value="onFilterChange"
        >
          <v-btn value="pending">
            در انتظار رسیدگی
          </v-btn>
          <v-btn value="dispatched">
            اعزام‌شده
          </v-btn>
          <v-btn value="all">
            همه
          </v-btn>
        </v-btn-toggle>

        <v-btn
          :aria-label="adminSos.soundMuted ? 'فعال‌سازی صدای هشدار' : 'بی‌صدا کردن هشدار'"
          :color="adminSos.soundMuted ? 'warning' : 'primary'"
          :prepend-icon="adminSos.soundMuted ? 'mdi-volume-off' : 'mdi-volume-high'"
          rounded="lg"
          variant="tonal"
          @click="adminSos.toggleSoundMuted()"
        >
          {{ adminSos.soundMuted ? "بی‌صدا" : "صدای فعال" }}
        </v-btn>

        <v-btn
          prepend-icon="mdi-bell-ring-outline"
          rounded="lg"
          variant="outlined"
          @click="adminSos.testAlertSound()"
        >
          تست صدا
        </v-btn>

        <v-btn
          :loading="adminSos.loading"
          aria-label="بازخوانی فهرست درخواست‌های اضطراری"
          icon="mdi-refresh"
          variant="text"
          @click="adminSos.refreshRequests()"
        />
      </div>
    </div>

    <v-alert
      v-if="adminSos.errorMessage"
      class="mb-4"
      closable
      type="error"
      variant="tonal"
      @click:close="adminSos.errorMessage = null"
    >
      {{ adminSos.errorMessage }}
    </v-alert>

    <v-alert v-if="adminSos.quickDispatchFeedback" :type="adminSos.quickDispatchFeedback.type"
      variant="tonal" rounded="lg" role="status" class="mb-4">
      {{ adminSos.quickDispatchFeedback.message }}
    </v-alert>
    <v-alert
      v-if="adminSos.urgentReplacement"
      class="replacement-flash mb-4"
      color="error"
      icon="mdi-alert-octagon"
      variant="tonal"
      role="alert"
      aria-live="assertive"
    >
      <div class="d-flex flex-wrap align-center justify-space-between ga-3">
        <div>
          <strong>NEEDS REPLACEMENT · اعزام جایگزین فوری</strong>
          <p class="mb-0">امدادگر مأموریت را لغو کرده است؛ درخواست را بررسی و امدادگر دیگری اعزام کنید.</p>
          <p v-if="adminSos.urgentReplacement.reviewRequired" class="mb-0 font-weight-bold">
            این لغو به بررسی مدیریتی نیاز دارد.
          </p>
          <p v-if="adminSos.urgentReplacement.rescuerLocation" class="mb-0 text-caption">
            آخرین موقعیت امدادگر: <span dir="ltr">{{ adminSos.urgentReplacement.rescuerLocation.lat.toFixed(5) }}, {{ adminSos.urgentReplacement.rescuerLocation.lon.toFixed(5) }}</span>
          </p>
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn color="error" variant="flat" :loading="adminSos.dispatchSubmitting"
            :disabled="adminSos.dispatchSubmitting"
            @click="quickRedispatch(adminSos.urgentReplacement.sosRequestId)">
            اعزام فوری به امدادگران جدید
          </v-btn>
          <v-btn color="error" variant="tonal" @click="focusReplacement(adminSos.urgentReplacement.sosRequestId)">
            مشاهدهٔ درخواست و اعزام
          </v-btn>
          <v-btn color="error" variant="text" @click="adminSos.dismissUrgentReplacement()">بستن هشدار</v-btn>
        </div>
      </div>
    </v-alert>

    <!-- Triage queue is first in DOM and visual order, including when the columns stack. -->
    <v-row>
      <v-col cols="12" lg="5" class="admin-dispatch__queue">
        <v-card class="admin-dispatch__surface bb-surface-card mb-4" elevation="0" rounded="xl">
          <v-card-title class="d-flex align-center justify-space-between text-subtitle-1 font-weight-bold">
            <span>صف درخواست‌های اضطراری</span>
            <v-chip v-if="adminSos.queueVerified" color="error" size="small" variant="flat">
              {{ adminSos.visibleRequests.length }} مورد در این نما
            </v-chip>
            <v-chip v-else color="warning" size="small" variant="tonal">فهرست نامطمئن</v-chip>
          </v-card-title>
          <v-divider />

          <v-card-text v-if="adminSos.visibleRequests.length === 0 && adminSos.loading" class="py-8 text-center" role="status">
            <v-progress-circular indeterminate color="primary" size="28" class="me-2" />
            در حال بررسی صف درخواست‌های اضطراری…
          </v-card-text>
          <v-card-text v-else-if="adminSos.visibleRequests.length === 0 && !adminSos.queueVerified"
            class="py-8 text-center" role="status">
            صف هنوز تأیید نشده است؛ نبودن درخواست اضطراری را نمی‌توان نتیجه گرفت.
            <span v-if="adminSos.listTruncated">فقط بخشی از درخواست‌ها دریافت شده‌اند.</span>
            <v-btn variant="text" size="small" :loading="adminSos.loading" @click="adminSos.refreshRequests()">تلاش دوباره</v-btn>
          </v-card-text>
          <v-card-text v-else-if="adminSos.visibleRequests.length === 0" class="py-8 text-center text-medium-emphasis">
            در حال حاضر درخواست اضطراری فعالی در این نما ثبت نشده است. به محض ارسال SOS جدید، نشانگر تپنده و هشدار صوتی فعال می‌شود.
          </v-card-text>
          <v-alert v-if="adminSos.visibleRequests.length && !adminSos.queueVerified" type="warning" variant="tonal"
            density="compact" role="status" class="ma-3">
            این فهرست هنوز تأیید نشده است؛ وضعیت موارد نمایشی ممکن است قدیمی باشد یا درخواست‌های بیشتری در صف باشند.
            <span v-if="adminSos.listTruncated">فقط نخستین ۱۰۰ مورد خوانده شدند.</span>
          </v-alert>

          <v-list v-if="adminSos.visibleRequests.length" class="dispatch-request-list py-0" lines="two">
            <template v-for="(item, index) in adminSos.visibleRequests" :key="item.id">
              <v-divider v-if="index > 0" />
              <v-list-item
                :active="item.id === adminSos.selectedId"
                class="py-3"
                @click="focusRequest(item)"
              >
                <template #prepend>
                  <span
                    class="pulse-indicator me-3"
                    :style="{ '--alert-color': item.status === 'cancelled_by_rescuer' ? '#dc2626' : severityMeta(item.severity).color }"
                    aria-hidden="true"
                  />
                </template>

                <v-list-item-title class="d-flex flex-wrap align-center justify-space-between ga-2 font-weight-bold">
                  <span>{{ incidentLabel(item.incidentTypeId) }}</span>
                  <div class="d-flex flex-wrap align-center ga-1">
                    <v-chip v-if="item.status === 'cancelled_by_rescuer'" color="error" size="x-small" variant="flat">
                      NEEDS REPLACEMENT
                    </v-chip>
                    <v-chip
                      :color="statusMeta(item.status).badgeColor"
                      size="x-small"
                      variant="tonal"
                    >
                      {{ statusMeta(item.status).label }}
                    </v-chip>
                    <v-chip
                      :color="severityMeta(item.severity).badgeColor"
                      size="x-small"
                      variant="flat"
                    >
                      {{ severityMeta(item.severity).label }}
                    </v-chip>
                  </div>
                </v-list-item-title>

                <v-list-item-subtitle class="mt-1">
                  {{ item.description }}
                </v-list-item-subtitle>

                <div class="d-flex flex-wrap align-center ga-2 mt-2 text-caption text-medium-emphasis">
                  <span>{{ formatTimestamp(item.createdAt) }}</span>
                  <span>•</span>
                  <span dir="ltr">
                    {{ item.location.lat.toFixed(5) }}, {{ item.location.lon.toFixed(5) }}
                  </span>
                  <v-chip v-if="item.photoUrl" color="secondary" size="x-small" variant="tonal">
                    دارای تصویر پیوست
                  </v-chip>
                </div>
              </v-list-item>
            </template>
          </v-list>
        </v-card>

        <v-card v-if="adminSos.selectedRequest" class="admin-dispatch__surface bb-surface-card" elevation="0" rounded="xl">
          <v-card-title class="d-flex align-center justify-space-between text-subtitle-1 font-weight-bold">
            <span>جزئیات درخواست انتخاب‌شده</span>
            <v-chip
              :color="severityMeta(adminSos.selectedRequest.severity).badgeColor"
              size="small"
              variant="flat"
            >
              {{ severityMeta(adminSos.selectedRequest.severity).label }}
            </v-chip>
          </v-card-title>
          <v-divider />
          <v-alert
            v-if="adminSos.selectedRequest.status === 'cancelled_by_rescuer'"
            class="ma-4 mb-0 replacement-flash"
            color="error"
            icon="mdi-alert-octagon"
            variant="tonal"
            role="status"
          >
            <strong>NEEDS REPLACEMENT · اعزام جایگزین</strong>
            <p class="mb-0">این مأموریت لغو شده است. امدادگران واجد شرایط را در ادامه انتخاب و پیشنهاد جدید ارسال کنید.</p>
            <template v-if="adminSos.replacementByRequest[adminSos.selectedRequest.id]">
              <p v-if="adminSos.replacementByRequest[adminSos.selectedRequest.id]?.reviewRequired" class="mb-0">این لغو به بررسی مدیریتی نیاز دارد.</p>
              <p v-if="adminSos.replacementByRequest[adminSos.selectedRequest.id]?.rescuerLocation" class="mb-0 text-caption">
                آخرین موقعیت امدادگر: <span dir="ltr">{{ adminSos.replacementByRequest[adminSos.selectedRequest.id]?.rescuerLocation?.lat.toFixed(5) }}, {{ adminSos.replacementByRequest[adminSos.selectedRequest.id]?.rescuerLocation?.lon.toFixed(5) }}</span>
              </p>
            </template>
          </v-alert>
          <v-card-text class="d-flex flex-column ga-2 text-body-2">
            <div>
              <strong>نوع حادثه:</strong>
              {{ incidentLabel(adminSos.selectedRequest.incidentTypeId) }}
            </div>
            <div>
              <strong>وضعیت فعلی:</strong>
              <v-chip
                :color="statusMeta(adminSos.selectedRequest.status).badgeColor"
                class="ms-1"
                size="x-small"
                variant="tonal"
              >
                {{ statusMeta(adminSos.selectedRequest.status).label }}
              </v-chip>
            </div>
            <div>
              <strong>موقعیت جغرافیایی:</strong>
              <span dir="ltr" class="ms-1">
                {{ adminSos.selectedRequest.location.lat.toFixed(6) }},
                {{ adminSos.selectedRequest.location.lon.toFixed(6) }}
              </span>
              <span class="ms-2 text-caption text-medium-emphasis">
                ({{ adminSos.selectedRequest.location.isManual ? "انتخاب دستی روی نقشه" : "GPS دستگاه" }})
              </span>
            </div>
            <div v-if="adminSos.selectedRequest.location.accuracy !== undefined">
              <strong>دقت گزارش‌شده:</strong>
              ±{{ Math.round(adminSos.selectedRequest.location.accuracy) }} متر
            </div>
            <div>
              <strong>زمان ثبت:</strong>
              {{ formatTimestamp(adminSos.selectedRequest.createdAt) }}
            </div>
            <div>
              <strong>توضیحات امدادخواه:</strong>
              <p class="mt-1 mb-0">{{ adminSos.selectedRequest.description }}</p>
            </div>
            <div v-if="adminSos.selectedRequest.photoUrl" class="text-caption text-medium-emphasis">
              <strong>تصویر پیوست حادثه:</strong>
              <img
                v-if="photoSrc"
                :src="photoSrc"
                alt="تصویر پیوست درخواست امداد"
                class="d-block mt-2 rounded-lg"
                style="max-width: 100%; max-height: 360px; object-fit: contain"
                referrerpolicy="no-referrer"
              >
              <span v-else class="ms-1">{{ photoLoading ? "در حال دریافت تصویر…" : "تصویر در دسترس نیست." }}</span>
            </div>
            <div v-if="adminSos.selectedRequestProposals.length > 0" class="pt-2">
              <strong>پیشنهادهای ارسال‌شده در این نشست:</strong>
              <span class="ms-1 text-caption text-medium-emphasis">
                ({{ adminSos.selectedRequestProposals.length }} پیشنهاد در وضعیت انتظار)
              </span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" lg="7" class="admin-dispatch__map-and-actions">
        <v-card class="admin-dispatch__surface bb-surface-card overflow-hidden mb-4" elevation="0" rounded="xl">
          <div class="dispatch-map-wrapper">
            <MapCanvas
              aria-label="نقشهٔ زندهٔ درخواست‌های اضطراری SOS"
              :style-url="mapStyleUrl"
              :constrain-bounds="false"
              :zoom="12"
              @ready="onMapReady"
            />

            <v-card
              v-if="adminSos.selectedRequest"
              class="map-selected-alert-card bb-floating-card"
              elevation="4"
              rounded="xl"
            >
              <v-card-text class="pa-3">
                <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-1">
                  <div class="d-flex flex-wrap align-center ga-2">
                    <v-chip
                      :color="severityMeta(adminSos.selectedRequest.severity).badgeColor"
                      size="x-small"
                      variant="flat"
                    >
                      {{ severityMeta(adminSos.selectedRequest.severity).label }}
                    </v-chip>
                    <span class="text-subtitle-2 font-weight-bold">
                      {{ incidentLabel(adminSos.selectedRequest.incidentTypeId) }}
                    </span>
                  </div>
                  <v-chip
                    :color="statusMeta(adminSos.selectedRequest.status).badgeColor"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ statusMeta(adminSos.selectedRequest.status).label }}
                  </v-chip>
                </div>
                <p class="text-caption text-medium-emphasis text-truncate mb-2">
                  {{ adminSos.selectedRequest.description }}
                </p>
                <div class="d-flex flex-wrap align-center justify-space-between ga-1 text-caption">
                  <span dir="ltr">
                    {{ adminSos.selectedRequest.location.lat.toFixed(5) }},
                    {{ adminSos.selectedRequest.location.lon.toFixed(5) }}
                  </span>
                  <v-btn
                    color="primary"
                    density="compact"
                    prepend-icon="mdi-crosshairs-gps"
                    size="small"
                    variant="text"
                    @click="focusRequest(adminSos.selectedRequest)"
                  >
                    تمرکز روی نقشه
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>

            <div class="severity-legend" role="note" aria-label="راهنمای رنگ شدت حادثه">
              <span class="legend-item">
                <span class="legend-dot legend-dot--high" /> بحرانی
              </span>
              <span class="legend-item">
                <span class="legend-dot legend-dot--medium" /> متوسط
              </span>
              <span class="legend-item">
                <span class="legend-dot legend-dot--low" /> کم‌خطر
              </span>
            </div>
          </div>
        </v-card>

        <v-alert v-if="missionError" type="warning" variant="tonal" class="mb-3" role="alert">
          {{ missionError }} <v-btn size="small" variant="text" @click="loadActiveMissions()">تلاش دوباره</v-btn>
        </v-alert>
        <v-skeleton-loader v-if="adminSos.selectedRequest && missionLoading" type="article" class="mb-3"
          role="status" aria-label="در حال دریافت مأموریت‌های این درخواست" />
        <div v-else-if="requestMissions.length" class="mb-3 pa-3 dispatch-mission-timeline">
          <label for="dispatch-mission-timeline" class="d-block text-caption font-weight-bold mb-2">خط زمانی مأموریت</label>
          <select id="dispatch-mission-timeline" v-model="timelineMissionId" class="mission-timeline-select">
            <option v-for="mission in requestMissions" :key="mission.id" :value="mission.id">
              {{ new Date(mission.createdAt).toLocaleString('fa-IR') }} · {{ statusLabel(mission.status) }}
            </option>
          </select>
          <MissionTimelinePanel v-if="selectedTimelineMission" :key="selectedTimelineMission.id"
            :mission="selectedTimelineMission" audience="admin" />
        </div>
        <p v-else-if="adminSos.selectedRequest && missionLoaded" class="mb-3 text-body-2 text-medium-emphasis" role="status">
          برای این درخواست هنوز مأموریتی ثبت نشده است.
        </p>
        <v-btn v-if="adminSos.selectedRequest?.status === 'cancelled_by_rescuer'"
          color="error" variant="flat" class="mb-3" :loading="adminSos.dispatchSubmitting"
          :disabled="adminSos.dispatchSubmitting"
          @click="quickRedispatch(adminSos.selectedRequest.id)">
          اعزام فوری به امدادگران جدید
        </v-btn>
        <MissionLivePanel v-for="mission in activeMissions" :key="mission.id" :mission="mission"
          :center="adminSos.selectedRequest ? [adminSos.selectedRequest.location.lon, adminSos.selectedRequest.location.lat] : undefined" />
        <v-card v-if="adminSos.selectedRequest" class="admin-dispatch__surface bb-surface-card" elevation="0" rounded="xl">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2 text-subtitle-1 font-weight-bold">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary" icon="mdi-account-group-outline" />
              <span>نزدیک‌ترین امدادگران واجد شرایط</span>
              <v-chip v-if="adminSos.nearestLoaded && !adminSos.nearestLoading" color="primary" size="x-small" variant="tonal">
                {{ adminSos.nearestResponders.length }} نفر
              </v-chip>
              <v-chip v-else color="warning" size="x-small" variant="tonal">
                {{ adminSos.nearestLoading ? 'در حال بررسی' : 'نامطمئن' }}
              </v-chip>
            </div>

            <div class="d-flex align-center ga-1">
              <v-btn
                :disabled="!adminSos.nearestLoaded || adminSos.nearestLoading || adminSos.nearestResponders.length === 0"
                size="small"
                variant="text"
                @click="adminSos.selectAllNearestResponders()"
              >
                انتخاب همه
              </v-btn>
              <v-btn
                v-if="adminSos.selectedResponderIds.length > 0"
                size="small"
                variant="text"
                @click="adminSos.clearResponderSelection()"
              >
                پاک‌سازی انتخاب
              </v-btn>
              <v-btn
                :loading="adminSos.nearestLoading"
                aria-label="بازخوانی امدادگران نزدیک"
                icon="mdi-refresh"
                size="small"
                variant="text"
                @click="adminSos.loadNearestResponders()"
              />
            </div>
          </v-card-title>
          <v-divider />
          <form class="admin-dispatch__responder-search pa-4 pb-0 d-flex align-center ga-2" role="search" @submit.prevent="searchResponders">
            <v-text-field v-model="responderSearchInput" label="جست‌وجوی امدادگر با نام کاربری"
              placeholder="حداقل ۲ حرف؛ جست‌وجو در همهٔ امدادگران واجد شرایط"
              variant="outlined" density="compact" hide-details autocomplete="off" maxlength="64"
              aria-label="جست‌وجوی امدادگر با نام کاربری" />
            <v-btn type="submit" color="primary" variant="tonal" :disabled="responderSearchInput.trim().length === 1"
              :loading="adminSos.nearestLoading">جست‌وجو</v-btn>
          </form>
          <p class="px-4 mt-2 text-caption text-medium-emphasis">
            {{ adminSos.responderSearch ? 'نزدیک‌ترین ۱۰ نتیجهٔ منطبق با جست‌وجو' : '۱۰ امدادگر نزدیک‌تر نمایش داده می‌شوند؛ برای دیگران نام کاربری را جست‌وجو کنید.' }}
            فقط امدادگران فعال، آزاد، هم‌تخصص و دارای موقعیت ثبت‌شده قابل انتخاب‌اند.
          </p>
          <div v-if="adminSos.selectedResponderIds.length" class="px-4 pb-2 d-flex flex-wrap ga-1" aria-label="امدادگران انتخاب‌شده">
            <v-chip v-for="id in adminSos.selectedResponderIds" :key="id" closable size="small" color="primary"
              variant="tonal" @click:close="adminSos.toggleResponderSelection(id)">
              @{{ adminSos.selectedResponderNames[id] ?? id }}
            </v-chip>
          </div>

          <v-alert
            v-if="adminSos.dispatchFeedback"
            :type="adminSos.dispatchFeedback.type"
            class="ma-4 mb-0"
            closable
            density="comfortable"
            variant="tonal"
            @click:close="adminSos.dispatchFeedback = null"
          >
            {{ adminSos.dispatchFeedback.message }}
          </v-alert>

          <v-card-text v-if="adminSos.nearestLoading" class="py-6 text-center text-medium-emphasis" role="status">
            <v-progress-circular class="me-2" color="primary" indeterminate size="22" width="2" />
            در حال جستجوی نزدیک‌ترین امدادگران فعال و هم‌تخصص…
          </v-card-text>

          <v-alert v-else-if="adminSos.nearestError" class="ma-4" type="error" variant="tonal" role="alert">
            {{ adminSos.nearestError }}
            <template #append>
              <v-btn variant="text" size="small" @click="adminSos.loadNearestResponders()">تلاش دوباره</v-btn>
            </template>
          </v-alert>

          <v-card-text
            v-else-if="adminSos.nearestLoaded && adminSos.nearestResponders.length === 0"
            class="py-6 text-center text-medium-emphasis" role="status"
          >
            {{ adminSos.responderSearch
              ? 'برای این نام کاربری امدادگر فعال، آزاد، هم‌تخصص و دارای موقعیت ثبت‌شده یافت نشد.'
              : 'در حال حاضر امدادگر فعال، آزاد، هم‌تخصص و دارای موقعیت ثبت‌شده برای این حادثه یافت نشد.' }}
          </v-card-text>

          <v-list v-else-if="adminSos.nearestLoaded" class="responder-list py-0" lines="two">
            <template v-for="(responder, rIndex) in adminSos.nearestResponders" :key="responder.userId">
              <v-divider v-if="rIndex > 0" />
              <v-list-item
                :active="adminSos.selectedResponderIds.includes(responder.userId)"
                class="py-3"
                @click="adminSos.toggleResponderSelection(responder.userId)"
              >
                <template #prepend>
                  <v-checkbox-btn
                    :model-value="adminSos.selectedResponderIds.includes(responder.userId)"
                    color="primary"
                    @click.stop="adminSos.toggleResponderSelection(responder.userId)"
                  />
                </template>

                <v-list-item-title class="d-flex flex-wrap align-center justify-space-between ga-2 font-weight-bold">
                  <div class="d-flex align-center ga-2">
                    <span dir="ltr">@{{ responder.username }}</span>
                    <v-chip
                      v-if="proposedRescuerIdSet.has(responder.userId)"
                      color="info"
                      size="x-small"
                      variant="tonal"
                    >
                      پیشنهاد ارسال‌شده
                    </v-chip>
                  </div>

                  <div class="d-flex align-center ga-2">
                    <v-chip color="primary" size="x-small" variant="flat">
                      {{ formatDistance(responder.distance) }}
                    </v-chip>
                    <v-chip color="amber-darken-2" size="x-small" variant="tonal">
                      {{ responder.avgRating !== null ? `★ ${responder.avgRating.toFixed(1)}` : "بدون امتیاز" }}
                    </v-chip>
                  </div>
                </v-list-item-title>

                <v-list-item-subtitle class="d-flex flex-wrap align-center ga-2 mt-1">
                  <span v-if="responder.categoryName">
                    تخصص: {{ responder.categoryName }}
                  </span>
                  <span>•</span>
                  <span>آخرین فعالیت: {{ formatTimestamp(responder.lastActiveAt) }}</span>
                </v-list-item-subtitle>
              </v-list-item>
            </template>
          </v-list>
          <v-card-text v-else class="py-6 text-center text-medium-emphasis" role="status">
            فهرست امدادگران هنوز تأیید نشده است؛ نتیجهٔ خالی نمی‌توان گرفت.
            <v-btn variant="text" size="small" @click="adminSos.loadNearestResponders()">تلاش دوباره</v-btn>
          </v-card-text>

          <v-divider />
          <v-card-actions class="pa-4 d-flex flex-wrap align-center justify-space-between ga-2">
            <span class="text-caption text-medium-emphasis">
              {{ adminSos.selectedResponderIds.length }} امدادگر برای ارسال پیشنهاد مأموریت انتخاب شده است.
            </span>
            <v-btn
              :disabled="!adminSos.canDispatchSelected"
              :loading="adminSos.dispatchSubmitting"
              color="error"
              prepend-icon="mdi-send-check-outline"
              rounded="lg"
              variant="flat"
              @click="adminSos.dispatchSelectedResponders()"
            >
              اعزام امدادگران انتخاب‌شده ({{ adminSos.selectedResponderIds.length }})
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { IncidentType, Severity, SosRequestRecord } from "@shared/index";
import { listSosIncidentTypes } from "@/api/sos";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { useAdminRequestMissions } from "@/composables/use-admin-request-missions";
import {
  buildSosAlertsGeoJson,
  formatResponderDistance,
  SOS_SEVERITY_PRESENTATION,
  SOS_STATUS_PRESENTATION
} from "@/admin/sos-alerts";
import MapCanvas from "@/components/map/MapCanvas.vue";
import MissionLivePanel from "@/components/mission/MissionLivePanel.vue";
import MissionTimelinePanel from "@/components/mission/MissionTimelinePanel.vue";
import { statusLabel } from "@/mission/timeline-presentation";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { needsOverlayRestore } from "@/map/overlay-restore";
import { pinia } from "@/stores";
import { useAdminSosStore } from "@/stores/admin-sos";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const SOS_SOURCE_ID = "admin-sos-requests";
const SOS_PULSE_LAYER_ID = "admin-sos-pulse";
const SOS_CORE_LAYER_ID = "admin-sos-core";

const route = useRoute();
const adminSos = useAdminSosStore(pinia);
const dispatchFilters = [
  { title: "در انتظار رسیدگی", value: "pending" },
  { title: "اعزام‌شده", value: "dispatched" },
  { title: "همه", value: "all" }
];
const auth = useAuthStore(pinia);
const { requestMissions, activeMissions, timelineMissionId, selectedTimelineMission,
  missionLoading, missionLoaded, missionError, loadActiveMissions } = useAdminRequestMissions(
  computed(() => adminSos.selectedRequest?.id ?? null),
  computed(() => adminSos.selectedRequest?.status ?? null),
  computed(() => auth.accessToken)
);

const themeStore = useThemeStore(pinia);
const photoSrc = ref<string | null>(null);
const photoLoading = ref(false);
watch(
  () => [adminSos.selectedRequest?.id, adminSos.selectedRequest?.photoUrl, auth.accessToken] as const,
  ([requestId, photoUrl, token], _previous, onCleanup) => {
    let active = true;
    onCleanup(() => { active = false; });
    photoSrc.value = null;
    photoLoading.value = Boolean(requestId && photoUrl && token);
    if (!requestId || !photoUrl || !token) return;
    void getSosPhotoSrc(requestId, token)
      .then((src) => { if (active) photoSrc.value = src; })
      .catch(() => { if (active) photoSrc.value = null; })
      .finally(() => { if (active) photoLoading.value = false; });
  },
  { immediate: true }
);

const incidentTypes = ref<IncidentType[]>([]);
const mapStyleUrl = computed(() =>
  themeStore.isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE
);
const incidentNameById = computed(
  () => new Map(incidentTypes.value.map((item) => [item.id, item.name]))
);
const proposedRescuerIdSet = computed(
  () => new Set(adminSos.selectedRequestProposals.map((proposal) => proposal.rescuerId))
);
const responderSearchInput = ref("");
watch(() => adminSos.selectedId, () => { responderSearchInput.value = ""; });
function searchResponders(): void {
  const term = responderSearchInput.value.trim();
  if (term.length === 1) return;
  adminSos.setResponderSearch(term);
  void adminSos.loadNearestResponders();
}

let mapInstance: MapLibreMap | null = null;
let pulseAnimationFrame: number | null = null;
let lastPulseUpdateAt = 0;
let detachMapEvents: (() => void) | null = null;

function severityMeta(severity: Severity) {
  return SOS_SEVERITY_PRESENTATION[severity];
}

function statusMeta(status: SosRequestRecord["status"]) {
  return SOS_STATUS_PRESENTATION[status];
}

function formatDistance(metres: number): string {
  return formatResponderDistance(metres);
}

function incidentLabel(incidentTypeId: string): string {
  return incidentNameById.value.get(incidentTypeId) ?? "حادثهٔ اضطراری";
}

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString("fa-IR");
}

function onFilterChange(value: unknown): void {
  if (value === "pending" || value === "dispatched" || value === "all") {
    adminSos.setFilterStatus(value);
  }
}

type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];

function ensureSosMapLayers(map: MapLibreMap): void {
  const data = buildSosAlertsGeoJson(adminSos.visibleRequests, adminSos.selectedId);
  const existingSource = map.getSource(SOS_SOURCE_ID) as GeoJSONSource | undefined;
  if (!existingSource) {
    map.addSource(SOS_SOURCE_ID, {
      type: "geojson",
      data: data as unknown as GeoJsonSourceData
    });
  } else {
    existingSource.setData(data as unknown as GeoJsonSourceData);
  }

  if (!map.getLayer(SOS_PULSE_LAYER_ID)) {
    map.addLayer({
      id: SOS_PULSE_LAYER_ID,
      type: "circle",
      source: SOS_SOURCE_ID,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 18,
        "circle-opacity": 0.35
      }
    });
  }

  if (!map.getLayer(SOS_CORE_LAYER_ID)) {
    map.addLayer({
      id: SOS_CORE_LAYER_ID,
      type: "circle",
      source: SOS_SOURCE_ID,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["case", ["boolean", ["get", "isSelected"], false], 10, 8],
        "circle-stroke-width": ["case", ["boolean", ["get", "isSelected"], false], 3.5, 2],
        "circle-stroke-color": "#ffffff"
      }
    });
  }
}

function syncMapData(): void {
  const map = mapInstance;
  if (!map || !map.getStyle()) return;
  try {
    ensureSosMapLayers(map);
  } catch {
    // If a new style JSON is still mid-fetch, the `styledata` / `idle` listener below applies the data immediately once ready.
  }
}

function restoreMapLayers(): void {
  const map = mapInstance;
  if (!map || !needsOverlayRestore({
    styleLoaded: Boolean(map.isStyleLoaded()),
    hasSource: (id) => Boolean(map.getSource(id)),
    hasLayer: (id) => Boolean(map.getLayer(id))
  }, [SOS_SOURCE_ID], [SOS_PULSE_LAYER_ID, SOS_CORE_LAYER_ID])) return;
  // Requests and selection changes call syncMapData directly. An idle/styledata callback only
  // repairs style swaps; unconditionally setting GeoJSON here would schedule another idle.
  syncMapData();
}

function startPulseLoop(): void {
  if (
    pulseAnimationFrame !== null ||
    typeof requestAnimationFrame !== "function" ||
    adminSos.visibleRequests.length === 0
  ) {
    return;
  }
  const step = (timestamp: number) => {
    pulseAnimationFrame = null;
    if (adminSos.visibleRequests.length === 0) return;

    const map = mapInstance;
    const isHidden = typeof document !== "undefined" && document.hidden;
    if (!isHidden && timestamp - lastPulseUpdateAt >= 50 && map && map.isStyleLoaded() && map.getLayer(SOS_PULSE_LAYER_ID)) {
      lastPulseUpdateAt = timestamp;
      const phase = (timestamp % 1600) / 1600;
      const radius = 11 + phase * 18;
      const opacity = Math.max(0.06, (1 - phase) * 0.45);
      map.setPaintProperty(SOS_PULSE_LAYER_ID, "circle-radius", radius);
      map.setPaintProperty(SOS_PULSE_LAYER_ID, "circle-opacity", opacity);
    }
    pulseAnimationFrame = requestAnimationFrame(step);
  };
  pulseAnimationFrame = requestAnimationFrame(step);
}

function stopPulseLoop(): void {
  if (pulseAnimationFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(pulseAnimationFrame);
  }
  pulseAnimationFrame = null;
}

function quickRedispatch(requestId: string): void {
  focusReplacement(requestId);
  void adminSos.redispatchNearest(requestId);
}

function focusReplacement(requestId: string): void {
  adminSos.setFilterStatus("pending");
  const item = adminSos.requests.find((request) => request.id === requestId);
  if (item) focusRequest(item);
  else {
    pendingDeepLinkId = requestId;
    adminSos.selectRequest(requestId);
  }
}

function focusRequest(item: SosRequestRecord): void {
  adminSos.selectRequest(item.id);
  mapInstance?.flyTo({
    center: [item.location.lon, item.location.lat],
    zoom: Math.max(mapInstance.getZoom(), 14)
  });
}

function onMapReady(map: MapLibreMap): void {
  detachMapEvents?.();
  mapInstance = map;
  ensureSosMapLayers(map);
  startPulseLoop();

  if (adminSos.selectedRequest) {
    map.jumpTo({
      center: [
        adminSos.selectedRequest.location.lon,
        adminSos.selectedRequest.location.lat
      ],
      zoom: 13
    });
  }

  const onStyleData = () => {
    restoreMapLayers();
  };
  const onIdle = () => {
    restoreMapLayers();
  };
  const onMarkerClick = (event: MapMouseEvent) => {
    if (!map.getLayer(SOS_CORE_LAYER_ID) && !map.getLayer(SOS_PULSE_LAYER_ID)) return;
    const features = map.queryRenderedFeatures(event.point, {
      layers: [SOS_CORE_LAYER_ID, SOS_PULSE_LAYER_ID].filter((id) => Boolean(map.getLayer(id)))
    });
    const clickedId = features[0]?.properties?.id;
    if (typeof clickedId === "string") {
      adminSos.selectRequest(clickedId);
    }
  };

  map.on("styledata", onStyleData);
  map.on("idle", onIdle);
  map.on("click", onMarkerClick);
  detachMapEvents = () => {
    map.off("styledata", onStyleData);
    map.off("idle", onIdle);
    map.off("click", onMarkerClick);
  };
}

let pendingDeepLinkId: string | null = null;

watch(
  () => [adminSos.visibleRequests, adminSos.selectedId] as const,
  ([nextVisible]) => {
    syncMapData();
    if (pendingDeepLinkId) {
      const resolved = adminSos.requests.find((r) => r.id === pendingDeepLinkId);
      if (resolved) {
        pendingDeepLinkId = null;
        focusRequest(resolved);
      }
    }
    if (nextVisible.length > 0 && mapInstance) {
      startPulseLoop();
    } else if (nextVisible.length === 0) {
      stopPulseLoop();
    }
  }
);

watch(
  () => route.query.request,
  (requestQuery) => {
    if (typeof requestQuery === "string" && requestQuery.length > 0) {
      const target = adminSos.requests.find((r) => r.id === requestQuery);
      if (target) {
        pendingDeepLinkId = null;
        focusRequest(target);
      } else {
        pendingDeepLinkId = requestQuery;
        adminSos.selectRequest(requestQuery);
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  adminSos.startMonitoring();
  try {
    incidentTypes.value = await listSosIncidentTypes();
  } catch {
    // Request list remains usable with default fallback labels if catalog read transiently fails.
  }
});

onBeforeUnmount(() => {
  stopPulseLoop();
  detachMapEvents?.();
  detachMapEvents = null;
  mapInstance = null;
});
</script>

<style scoped>
.admin-dispatch {
  font-family: var(--bb-font-family);
}

/* Vuetify's text utilities force Roboto even when the page inherits Persian-first type. */
.admin-dispatch :deep(.text-h5),
.admin-dispatch :deep(.text-subtitle-1),
.admin-dispatch :deep(.text-subtitle-2),
.admin-dispatch :deep(.text-body-2),
.admin-dispatch :deep(.text-caption) {
  font-family: var(--bb-font-family) !important;
  letter-spacing: normal !important;
}

.admin-dispatch :deep(.text-caption) {
  font-size: 0.8rem !important;
  line-height: 1.55;
}

.admin-dispatch :deep(.text-body-2) {
  line-height: 1.7;
}

/* One tier for the four primary cards, matching the other admin screens. */
.admin-dispatch__surface {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgb(var(--v-theme-surface));
}

.admin-dispatch__surface :deep(.v-card-title) {
  font-size: 1.08rem !important;
  font-weight: 800 !important;
  line-height: 1.55;
  white-space: normal;
}

/* The timeline sits between other cards; give it a boundary, not another shadow. */
.dispatch-mission-timeline {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface));
}

.dispatch-map-wrapper {
  position: relative;
  height: min(68vh, 560px);
  min-height: 360px;
}

.map-selected-alert-card {
  position: absolute;
  top: 12px;
  inset-inline-start: 12px;
  z-index: 2;
  width: min(360px, calc(100% - 24px));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-surface), 0.96);
  backdrop-filter: blur(8px);
}

.dispatch-request-list {
  max-height: 360px;
  overflow-y: auto;
}

.responder-list {
  max-height: 380px;
  overflow-y: auto;
}

.severity-legend {
  position: absolute;
  bottom: 12px;
  inset-inline-start: 12px;
  z-index: 2;
  display: flex;
  gap: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fafc;
  font-size: 0.78rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot--high {
  background: #dc2626;
}

.legend-dot--medium {
  background: #d97706;
}

.legend-dot--low {
  background: #0284c7;
}

/* Vuetify's lg columns start at 1280px. Below that width the queue and map
 * stack; keep the selected SOS and legend *after* the definite-height canvas
 * in normal flow so they cannot cover markers, gestures or zoom controls. */
@media (max-width: 1279px) {
  .dispatch-map-wrapper { display: flex; flex-direction: column; height: auto; min-height: 0; gap: 0.75rem; }
  .dispatch-map-wrapper > :deep(.map-canvas) {
    flex: 0 0 auto;
    height: clamp(20rem, 48dvh, 30rem);
    min-height: 20rem;
  }
  .map-selected-alert-card {
    position: static;
    z-index: auto;
    width: auto;
    margin-inline: 0.75rem;
    backdrop-filter: none;
    overflow-wrap: anywhere;
  }
  .map-selected-alert-card.bb-floating-card {
    box-shadow: var(--bb-shadow-surface) !important;
  }
  .severity-legend {
    position: static;
    z-index: auto;
    align-self: flex-start;
    flex-wrap: wrap;
    margin: 0 0.75rem 0.75rem;
    border-radius: 0.75rem;
  }
}

@media (max-width: 599px) {
  .admin-dispatch__filter-select { flex: 1 1 12rem; min-width: 0; max-width: 100%; }
  .admin-dispatch__responder-search { flex-wrap: wrap; }
  .admin-dispatch__responder-search :deep(.v-input) { flex: 1 1 100%; min-width: 0; }
}

.pulse-indicator {
  position: relative;
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--alert-color, #dc2626);
  box-shadow: 0 0 0 0 var(--alert-color, #dc2626);
  animation: sos-pulse 1.6s infinite ease-out;
}

.replacement-flash {
  border-inline-start: 5px solid rgb(var(--v-theme-error));
  animation: replacement-arrival 1.1s ease-in-out 2;
}

@keyframes replacement-arrival {
  50% { box-shadow: 0 0 0 5px rgba(220, 38, 38, .3); }
}

@media (prefers-reduced-motion: reduce) {
  .replacement-flash, .pulse-indicator { animation: none; }
}

@keyframes sos-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--alert-color, #dc2626) 65%, transparent);
  }
  75% {
    box-shadow: 0 0 0 10px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
.mission-timeline-select {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 0.875rem;
}

.mission-timeline-select:focus-visible {
  outline: 2px solid var(--bb-color-primary);
  outline-offset: 2px;
}
</style>
