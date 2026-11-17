<template>
  <v-container class="admin-dispatch py-6" fluid>
    <header class="admin-dispatch__header mb-5">
      <div class="admin-dispatch__intro">
        <span class="admin-dispatch__eyebrow"><v-icon icon="mdi-shield-account-outline" size="17" /> پنل مدیریت · عملیات اضطراری</span>
        <div class="admin-dispatch__heading d-flex flex-wrap align-center ga-2">
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
        <p class="admin-dispatch__intro-note">صف را بررسی کنید، شواهد و موقعیت را بسنجید، سپس به امدادگران واجد شرایط پیشنهاد بفرستید.</p>
      </div>

      <div class="admin-dispatch__toolbar">
        <div class="admin-dispatch__filter-group" role="group" aria-label="فیلتر وضعیت درخواست‌ها">
          <span class="admin-dispatch__toolbar-label d-none d-md-inline">نمایش</span>
          <v-select
            :model-value="adminSos.filterStatus"
            :items="dispatchFilters"
            class="admin-dispatch__filter-select d-md-none"
            label="وضعیت درخواست‌های اضطراری"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            @update:model-value="onFilterChange"
          />
          <v-btn-toggle
            class="admin-dispatch__filter-toggle d-none d-md-inline-flex"
            :model-value="adminSos.filterStatus"
            aria-label="وضعیت درخواست‌های اضطراری"
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
        </div>

        <div class="admin-dispatch__toolbar-actions" role="group" aria-label="کنترل‌های هشدار و بازخوانی">
          <v-btn
            density="compact"
            size="small"
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
            density="compact"
            size="small"
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
            density="compact"
            size="small"
            icon="mdi-refresh"
            variant="text"
            @click="adminSos.refreshRequests()"
          />
        </div>
      </div>
    </header>

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

    <div class="admin-dispatch__overview" role="status" aria-live="polite" aria-label="نمای کلی عملیات">
      <div><v-icon icon="mdi-alert-circle-outline" size="20" aria-hidden="true" />
        <span>در انتظار رسیدگی</span><strong>{{ adminSos.queueVerified && adminSos.filterStatus !== 'dispatched' ? adminSos.pendingCount.toLocaleString('fa-IR') : 'نامشخص' }}</strong></div>
      <div><v-icon icon="mdi-send-check-outline" size="20" aria-hidden="true" />
        <span>اعزام‌شده</span><strong>{{ adminSos.queueVerified && adminSos.filterStatus !== 'pending' ? adminSos.dispatchedCount.toLocaleString('fa-IR') : 'نامشخص' }}</strong></div>
      <div><v-icon icon="mdi-crosshairs-gps" size="20" aria-hidden="true" />
        <span>در حال بررسی</span><strong>{{ adminSos.selectedRequest ? incidentLabel(adminSos.selectedRequest.incidentTypeId) : 'درخواستی انتخاب نشده' }}</strong></div>
    </div>

    <!-- Triage queue stays first in DOM and visual order when the columns stack. -->
    <v-row class="admin-dispatch__workspace">
      <v-col cols="12" lg="5" class="admin-dispatch__queue">
        <p class="admin-dispatch__section-label">۰۱ / بررسی درخواست‌ها</p>
        <v-card id="dispatch-queue" class="admin-dispatch__surface admin-dispatch__surface--queue bb-surface-card mb-4" elevation="0" rounded="xl">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2 text-subtitle-1 font-weight-bold">
            <span class="admin-dispatch__card-heading"><v-icon icon="mdi-format-list-bulleted" color="primary" size="21" aria-hidden="true" /> صف درخواست‌های اضطراری</span>
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

          <v-list v-if="adminSos.visibleRequests.length" class="dispatch-request-list" lines="two" aria-label="فهرست درخواست‌های SOS">
            <v-list-item v-for="item in adminSos.visibleRequests" :key="item.id"
              :active="item.id === adminSos.selectedId"
              :aria-current="item.id === adminSos.selectedId ? 'true' : undefined"
              class="dispatch-request-row"
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
                      نیازمند جایگزین
                    </v-chip>
                    <v-chip v-else
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

                <v-list-item-subtitle class="dispatch-request-row__summary mt-1">
                  {{ item.description }}
                </v-list-item-subtitle>

                <div class="d-flex flex-wrap align-center ga-2 mt-2 text-caption text-medium-emphasis">
                  <span>{{ formatTimestamp(item.createdAt) }}</span>
                  <span>•</span>
                  <span><v-icon :icon="item.location.isManual ? 'mdi-map-marker-check-outline' : 'mdi-crosshairs-gps'" size="15" aria-hidden="true" />
                    {{ item.location.isManual ? 'موقعیت دستی' : 'موقعیت GPS' }}</span>
                  <span v-if="item.photoUrl"><v-icon icon="mdi-image-outline" size="15" aria-hidden="true" /> تصویر</span>
                </div>
              </v-list-item>
          </v-list>
        </v-card>

        <v-card v-if="adminSos.selectedRequest" id="dispatch-incident" class="admin-dispatch__surface bb-surface-card" elevation="0" rounded="xl">
          <v-card-title class="admin-dispatch__detail-heading">
            <div class="admin-dispatch__detail-title">
              <small>درخواست انتخاب‌شده</small>
              <h2>{{ incidentLabel(adminSos.selectedRequest.incidentTypeId) }}</h2>
            </div>
            <div class="admin-dispatch__detail-badges">
              <v-chip :color="statusMeta(adminSos.selectedRequest.status).badgeColor" size="small" variant="tonal">
                {{ statusMeta(adminSos.selectedRequest.status).label }}
              </v-chip>
              <v-chip :color="severityMeta(adminSos.selectedRequest.severity).badgeColor" size="small" variant="flat">
                {{ severityMeta(adminSos.selectedRequest.severity).label }}
              </v-chip>
            </div>
          </v-card-title>
          <v-divider />
          <div class="admin-dispatch__sender" role="group" aria-label="ارسال‌کنندهٔ درخواست">
            <span class="admin-dispatch__sender-icon" aria-hidden="true"><v-icon icon="mdi-account-circle-outline" size="23" /></span>
            <div class="admin-dispatch__sender-copy">
              <strong>ارسال‌کنندهٔ درخواست</strong>
              <details class="admin-dispatch__sender-id"><summary>شناسهٔ ثبت‌شده</summary>
                <bdi dir="ltr">{{ adminSos.selectedRequest.requesterId }}</bdi>
              </details>
            </div>
            <v-btn color="primary" variant="tonal" rounded="lg" prepend-icon="mdi-account-details-outline"
              class="admin-dispatch__sender-action" @click="senderProfileOpen = true">مشاهدهٔ پروفایل</v-btn>
          </div>
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
          <v-card-text class="admin-dispatch__detail-body">
            <div class="admin-dispatch__description">
              <h3>شرح حادثه</h3>
              <p>{{ adminSos.selectedRequest.description }}</p>
            </div>
            <dl class="admin-dispatch__facts">
              <div>
                <dt>زمان ثبت</dt>
                <dd>{{ formatTimestamp(adminSos.selectedRequest.createdAt) }}</dd>
              </div>
              <div>
                <dt>روش ثبت موقعیت</dt>
                <dd>{{ adminSos.selectedRequest.location.isManual ? "انتخاب دستی روی نقشه" : "GPS دستگاه" }}</dd>
              </div>
              <div class="admin-dispatch__fact-location">
                <dt>مختصات ثبت‌شدهٔ حادثه</dt>
                <dd><bdi dir="ltr">{{ adminSos.selectedRequest.location.lat.toFixed(6) }}, {{ adminSos.selectedRequest.location.lon.toFixed(6) }}</bdi></dd>
              </div>
              <div v-if="adminSos.selectedRequest.location.accuracy !== undefined">
                <dt>دقت گزارش‌شده</dt>
                <dd>±{{ Math.round(adminSos.selectedRequest.location.accuracy) }} متر</dd>
              </div>
            </dl>
            <div v-if="adminSos.selectedRequest.photoUrl" class="admin-dispatch__photo">
              <h3>تصویر پیوست حادثه</h3>
              <button v-if="photoSrc" type="button" class="admin-dispatch__photo-open"
                aria-label="نمایش تصویر پیوست حادثه در اندازهٔ بزرگ" @click="photoDialogOpen = true">
                <img :src="photoSrc" alt="تصویر پیوست درخواست امداد"
                  class="admin-dispatch__photo-image" referrerpolicy="no-referrer">
                <span>نمایش تصویر کامل <v-icon icon="mdi-open-in-new" size="17" aria-hidden="true" /></span>
              </button>
              <span v-else role="status">{{ photoLoading ? "در حال دریافت تصویر…" : "تصویر در دسترس نیست." }}</span>
            </div>
            <p v-if="adminSos.selectedRequestProposals.length > 0" class="admin-dispatch__proposal-note">
              {{ adminSos.selectedRequestProposals.length.toLocaleString('fa-IR') }} پیشنهاد در انتظار برای این درخواست ثبت شده است.
            </p>
            <div class="admin-dispatch__next">
              <span>گام بعدی: بررسی امدادگران واجد شرایط</span>
              <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-account-search-outline"
                aria-controls="dispatch-responders" @click="focusResponders">انتخاب امدادگر و اعزام</v-btn>
            </div>
          </v-card-text>
          <v-dialog v-model="photoDialogOpen" max-width="min(94vw, 60rem)" aria-label="تصویر کامل پیوست حادثه">
            <v-card rounded="xl" class="admin-dispatch__photo-dialog">
              <v-card-title class="d-flex align-center justify-space-between">
                تصویر پیوست حادثه
                <v-btn icon="mdi-close" variant="text" aria-label="بستن تصویر" @click="photoDialogOpen = false" />
              </v-card-title>
              <v-card-text><img v-if="photoSrc" :src="photoSrc" alt="تصویر کامل پیوست درخواست امداد" referrerpolicy="no-referrer"></v-card-text>
            </v-card>
          </v-dialog>
        </v-card>
      </v-col>
      <v-col cols="12" lg="7" class="admin-dispatch__map-and-actions">
        <p class="admin-dispatch__section-label">۰۲ / موقعیت حادثه و اعزام</p>
        <p v-if="adminSos.visibleRequests.length && !adminSos.selectedRequest" class="admin-dispatch__selection-hint" role="status">
          <v-icon icon="mdi-cursor-default-click-outline" size="20" aria-hidden="true" />
          برای بررسی حادثه و انتخاب امدادگر، یکی از درخواست‌های صف را انتخاب کنید.
        </p>
        <v-card id="dispatch-map" class="admin-dispatch__surface bb-surface-card overflow-hidden mb-4" elevation="0" rounded="xl">
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
                <div class="admin-dispatch__map-caption">
                  <span><v-icon icon="mdi-map-marker-radius" color="error" size="20" aria-hidden="true" />
                    {{ incidentLabel(adminSos.selectedRequest.incidentTypeId) }}</span>
                  <v-btn color="primary" density="compact" prepend-icon="mdi-crosshairs-gps"
                    size="small" variant="text" @click="focusRequest(adminSos.selectedRequest)">نمایش محل</v-btn>
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

        <v-btn v-if="adminSos.selectedRequest?.status === 'cancelled_by_rescuer'"
          color="error" variant="flat" class="mb-3" :loading="adminSos.dispatchSubmitting"
          :disabled="adminSos.dispatchSubmitting"
          @click="quickRedispatch(adminSos.selectedRequest.id)">
          اعزام فوری به امدادگران جدید
        </v-btn>
        <v-card v-if="adminSos.selectedRequest" id="dispatch-responders" tabindex="-1"
          class="admin-dispatch__surface admin-dispatch__responders bb-surface-card" elevation="0" rounded="xl">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2 text-subtitle-1 font-weight-bold">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary" icon="mdi-account-group-outline" />
              <span>{{ adminSos.responderSearch ? 'جست‌وجوی دستی برای اعزام' : 'نزدیک‌ترین امدادگران واجد شرایط' }}</span>
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
              placeholder="حداقل ۲ حرف؛ جست‌وجوی دستی حتی بدون موقعیت یا تخصص مرتبط"
              variant="outlined" density="compact" hide-details autocomplete="off" maxlength="64"
              aria-label="جست‌وجوی امدادگر با نام کاربری" />
            <v-btn type="submit" color="primary" variant="tonal" :disabled="responderSearchInput.trim().length === 1"
              :loading="adminSos.nearestLoading">جست‌وجو</v-btn>
          </form>
          <p v-if="adminSos.responderSearch" class="admin-dispatch__manual-warning" role="note">
            <v-icon icon="mdi-alert-outline" size="18" aria-hidden="true" />
            جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند؛ پیش از اعزام صلاحیت و دسترسی را بررسی کنید.
          </p>
          <details class="admin-dispatch__search-help">
            <summary>معیارهای فهرست امدادگران</summary>
            <p>{{ adminSos.responderSearch
              ? 'تا ۱۰ حساب فعال و آزاد با نام کاربری منطبق؛ موقعیت/فاصله در جست‌وجوی دستی نمایش داده نمی‌شود و تخصص مرتبط ممکن است ثبت نشده باشد.'
              : '۱۰ امدادگر نزدیک‌تر نمایش داده می‌شوند. فقط امدادگران فعال، آزاد، هم‌تخصص و دارای موقعیت ثبت‌شده در فهرست نزدیک‌ترین‌ها هستند؛ برای دیگران نام کاربری را جست‌وجو کنید.' }}</p>
          </details>
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
              ? 'برای این نام کاربری حساب فعال و آزاد دیگری یافت نشد. نام کاربری را بررسی کنید.'
              : 'در حال حاضر امدادگر فعال، آزاد، هم‌تخصص و دارای موقعیت ثبت‌شده برای این حادثه یافت نشد.' }}
          </v-card-text>

          <v-list v-else-if="adminSos.nearestLoaded" class="responder-list" lines="two" aria-label="امدادگران واجد شرایط یا جست‌وجوشده">
            <v-list-item v-for="responder in adminSos.nearestResponders" :key="responder.userId"
              :active="adminSos.selectedResponderIds.includes(responder.userId)"
              class="dispatch-responder-row"
              @click="adminSos.toggleResponderSelection(responder.userId)"
            >
                <template #prepend>
                  <v-checkbox-btn
                    :model-value="adminSos.selectedResponderIds.includes(responder.userId)"
                    :aria-label="`انتخاب امدادگر ${responder.username}`"
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
                    <v-chip :color="responder.distance === null ? 'warning' : 'primary'" size="x-small" variant="flat">
                      {{ responder.distance === null ? 'فاصله نامشخص' : formatDistance(responder.distance) }}
                    </v-chip>
                    <v-chip color="amber-darken-2" size="x-small" variant="tonal">
                      {{ responder.avgRating !== null ? `★ ${responder.avgRating.toFixed(1)}` : "بدون امتیاز" }}
                    </v-chip>
                  </div>
                </v-list-item-title>

                <v-list-item-subtitle class="d-flex flex-wrap align-center ga-2 mt-1">
                  <span v-if="responder.categoryName">تخصص: {{ responder.categoryName }}</span>
                  <span v-else class="text-warning">تخصص مرتبط ثبت نشده</span>
                  <span>•</span>
                  <span>آخرین فعالیت: {{ formatTimestamp(responder.lastActiveAt) }}</span>
                </v-list-item-subtitle>
              </v-list-item>
          </v-list>
          <v-card-text v-else class="py-6 text-center text-medium-emphasis" role="status">
            فهرست امدادگران هنوز تأیید نشده است؛ نتیجهٔ خالی نمی‌توان گرفت.
            <v-btn variant="text" size="small" @click="adminSos.loadNearestResponders()">تلاش دوباره</v-btn>
          </v-card-text>

          <v-divider />
          <v-card-actions class="admin-dispatch__submit pa-4 d-flex flex-wrap align-center justify-space-between ga-2">
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
              @click="requestDispatch"
            >
              اعزام امدادگران انتخاب‌شده ({{ adminSos.selectedResponderIds.length }})
            </v-btn>
          </v-card-actions>
        </v-card>

        <v-alert v-if="missionError" type="warning" variant="tonal" class="mb-3" role="alert">
          {{ missionError }} <v-btn size="small" variant="text" @click="loadActiveMissions()">تلاش دوباره</v-btn>
        </v-alert>
        <v-skeleton-loader v-if="adminSos.selectedRequest && missionLoading" type="article" class="mb-3"
          role="status" aria-label="در حال دریافت مأموریت‌های این درخواست" />
        <details v-else-if="requestMissions.length" class="mb-3 pa-3 dispatch-mission-timeline">
          <summary>پیگیری مأموریت‌ها و خط زمانی <span>{{ requestMissions.length.toLocaleString('fa-IR') }} مأموریت</span></summary>
          <label for="dispatch-mission-timeline" class="d-block text-caption font-weight-bold mb-2">انتخاب مأموریت</label>
          <select id="dispatch-mission-timeline" v-model="timelineMissionId" class="mission-timeline-select">
            <option v-for="mission in requestMissions" :key="mission.id" :value="mission.id">
              {{ new Date(mission.createdAt).toLocaleString('fa-IR') }} · {{ statusLabel(mission.status) }}
            </option>
          </select>
          <MissionTimelinePanel v-if="selectedTimelineMission" :key="selectedTimelineMission.id"
            :mission="selectedTimelineMission" audience="admin" />
        </details>
        <p v-else-if="adminSos.selectedRequest && missionLoaded" class="mb-3 text-body-2 text-medium-emphasis" role="status">
          برای این درخواست هنوز مأموریتی ثبت نشده است.
        </p>
        <details v-if="activeMissions.length" :key="adminSos.selectedRequest?.id" class="admin-dispatch__followup mb-3"
          @toggle="onLiveDetailsToggle">
          <summary>موقعیت زنده و اعضای مأموریت <span>{{ activeMissions.length.toLocaleString('fa-IR') }} مأموریت فعال</span></summary>
          <MissionLivePanel v-for="mission in (showLivePanel ? activeMissions : [])" :key="mission.id" :mission="mission"
            :center="adminSos.selectedRequest ? [adminSos.selectedRequest.location.lon, adminSos.selectedRequest.location.lat] : undefined" />
        </details>
        <v-dialog v-model="manualDispatchConfirmation" max-width="480" :persistent="adminSos.dispatchSubmitting" aria-label="تأیید اعزام دستی">
          <v-card title="تأیید اعزام دستی" rounded="xl">
            <v-card-text>
              موقعیت یا تخصص مرتبط برای افراد زیر تأیید نشده است. پیش از ارسال پیشنهاد مأموریت، صلاحیت و دسترسی آن‌ها را بررسی کنید:
              <ul class="mt-2 ps-6">
                <li v-for="item in selectedDispatchWarnings" :key="item.id">
                  <span dir="ltr">@{{ item.username }}</span> — {{ item.warning }}
                </li>
              </ul>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" :disabled="adminSos.dispatchSubmitting" @click="manualDispatchConfirmation = false">بازگشت</v-btn>
              <v-btn color="error" :loading="adminSos.dispatchSubmitting" :disabled="!adminSos.canDispatchSelected"
                @click="confirmManualDispatch">ارسال با آگاهی از محدودیت‌ها</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-col>

    </v-row>
    <AdminUserProfileDialog v-model="senderProfileOpen" :user-id="adminSos.selectedRequest?.requesterId ?? null"
      title="پروفایل ارسال‌کننده" />
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
import AdminUserProfileDialog from "./AdminUserProfileDialog.vue";

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
const senderProfileOpen = ref(false);
const photoDialogOpen = ref(false);
watch(() => adminSos.selectedRequest?.id, () => {
  senderProfileOpen.value = false;
  photoDialogOpen.value = false;
}, { flush: "sync" });
const { requestMissions, activeMissions, timelineMissionId, selectedTimelineMission,
  missionLoading, missionLoaded, missionError, loadActiveMissions } = useAdminRequestMissions(
  computed(() => adminSos.selectedRequest?.id ?? null),
  computed(() => adminSos.selectedRequest?.status ?? null),
  computed(() => auth.accessToken)
);

const themeStore = useThemeStore(pinia);
const photoSrc = ref<string | null>(null);
const photoLoading = ref(false);
watch(photoSrc, (src) => { if (!src) photoDialogOpen.value = false; }, { flush: "sync" });
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
const showLivePanel = ref(false);
function onLiveDetailsToggle(event: Event): void {
  showLivePanel.value = (event.currentTarget as HTMLDetailsElement).open;
}
const manualDispatchConfirmation = ref(false);
const selectedDispatchWarnings = computed(() => adminSos.selectedResponderIds
  .filter((id) => !!adminSos.selectedResponderWarnings[id])
  .map((id) => ({ id, username: adminSos.selectedResponderNames[id] ?? id,
    warning: adminSos.selectedResponderWarnings[id]! })));
watch(() => adminSos.selectedId, () => {
  responderSearchInput.value = "";
  manualDispatchConfirmation.value = false;
  showLivePanel.value = false;
});
function requestDispatch(): void {
  if (!adminSos.canDispatchSelected) return;
  if (selectedDispatchWarnings.value.length) manualDispatchConfirmation.value = true;
  else void adminSos.dispatchSelectedResponders();
}
async function confirmManualDispatch(): Promise<void> {
  if (!adminSos.canDispatchSelected) return;
  if (await adminSos.dispatchSelectedResponders()) manualDispatchConfirmation.value = false;
}
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

function focusResponders(): void {
  if (!adminSos.selectedRequest) return;
  const target = document.getElementById("dispatch-responders");
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
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
  max-width: 100rem;
  margin-inline: auto;
  padding-inline: clamp(.75rem, 2vw, 2rem);
  font-family: var(--bb-font-family);
}
.admin-dispatch__header { display: flex; align-items: flex-end; flex-wrap: wrap; gap: .75rem 1.5rem; }
.admin-dispatch__intro-note { margin: .35rem 0 0; color: var(--bb-color-muted); font-size: .85rem; }
.admin-dispatch__overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: .5rem; margin-bottom: 1rem; }
.admin-dispatch__overview > div { display: flex; align-items: center; gap: .45rem; min-width: 0;
  padding: .65rem .9rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface)); }
.admin-dispatch__overview .v-icon { flex: none; color: rgb(var(--v-theme-primary)); }
.admin-dispatch__overview span { color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__overview strong { margin-inline-start: auto; font-size: .9rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-dispatch__intro { min-width: 0; flex: 1 1 22rem; }
.admin-dispatch__eyebrow { display: inline-flex; align-items: center; gap: .35rem; margin-bottom: .35rem;
  color: rgb(var(--v-theme-primary)); font-size: .8rem; font-weight: 800; }
.admin-dispatch__heading h1 { min-width: 0; font-size: clamp(1.1rem, 2vw, 1.5rem) !important; overflow-wrap: anywhere; }
.admin-dispatch__header p { max-width: 56ch; line-height: 1.65; }
.admin-dispatch__toolbar {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
  gap: .6rem 1rem; max-width: 100%; min-width: 0;
}
.admin-dispatch__filter-group, .admin-dispatch__toolbar-actions {
  display: flex; align-items: center; gap: .5rem; min-width: 0;
}
.admin-dispatch__toolbar-actions { justify-content: flex-end; flex-wrap: wrap; }
.admin-dispatch__toolbar-label { color: var(--bb-color-muted); font-size: .8rem; font-weight: 700; }
.admin-dispatch__filter-select { max-width: 15rem; min-width: 0; }
.admin-dispatch__toolbar :deep(.v-btn) {
  min-width: 44px; min-height: 44px; height: 44px; padding-inline: .7rem;
  font-size: .8rem; letter-spacing: normal;
}
.admin-dispatch__filter-toggle :deep(.v-btn) { padding-inline: .65rem; }
.admin-dispatch__toolbar :deep(.v-btn--icon) { width: 44px; padding: 0; }
.admin-dispatch__workspace { margin-inline: -clamp(.75rem, 1.25vw, 1.25rem); }
.admin-dispatch__workspace > :deep(.v-col) { padding-inline: clamp(.75rem, 1.25vw, 1.25rem); }
.admin-dispatch__section-label {
  margin: 0 0 .65rem; color: rgb(var(--v-theme-primary)); font-size: .8rem;
  font-weight: 800; line-height: 1.5;
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
/* Uniform surfaces and inset selectable rows: urgency belongs to status chips,
   not unrelated red/green card edges or side stripes. */
.admin-dispatch__card-heading { display: inline-flex; align-items: center; gap: .5rem;
  min-width: 0; white-space: normal; }
.dispatch-request-row, .dispatch-responder-row {
  border: 1px solid transparent; border-radius: var(--bb-radius-nested, 16px);
  background: var(--bb-color-inset); margin-bottom: .4rem;
}
.dispatch-request-row:last-child, .dispatch-responder-row:last-child { margin-bottom: 0; }
.dispatch-request-row.v-list-item--active, .dispatch-responder-row.v-list-item--active {
  border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .1);
}
.dispatch-request-row:focus-visible, .dispatch-responder-row:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
.dispatch-request-list, .responder-list { padding: .55rem; }
.dispatch-request-row, .dispatch-responder-row { padding: .55rem .7rem; min-height: 44px; }
.dispatch-request-row__summary { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1;
  white-space: normal; overflow: hidden; overflow-wrap: anywhere; line-height: 1.5; }
.dispatch-request-row.v-list-item--active .dispatch-request-row__summary { -webkit-line-clamp: 2; }
.admin-dispatch__detail-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
.admin-dispatch__detail-title { min-width: 0; }
.admin-dispatch__detail-title small { display: block; color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__detail-title h2 { margin: 0; font-size: 1.05rem; font-weight: 800; overflow-wrap: anywhere; }
.admin-dispatch__detail-badges { display: flex; flex-wrap: wrap; gap: .35rem; }
.admin-dispatch__detail-body { display: grid; gap: .75rem; font-size: .87rem; line-height: 1.6; }
.admin-dispatch__detail-body h3 { margin: 0 0 .25rem; font-size: .88rem; }
.admin-dispatch__description { padding: .75rem .85rem; border-radius: var(--bb-radius-nested, 16px);
  background: var(--bb-color-inset); }
.admin-dispatch__description p, .admin-dispatch__proposal-note { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.admin-dispatch__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; margin: 0; }
.admin-dispatch__facts > div { min-width: 0; padding: .55rem .7rem; border-radius: .8rem;
  background: var(--bb-color-inset); }
.admin-dispatch__facts dt { color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__facts dd { margin: .1rem 0 0; font-weight: 700; overflow-wrap: anywhere; }
.admin-dispatch__fact-location { grid-column: 1 / -1; }
.admin-dispatch__facts bdi { unicode-bidi: isolate; }
.admin-dispatch__photo { min-width: 0; }
.admin-dispatch__photo-open { display: inline-grid; gap: .35rem; margin-top: .4rem; padding: .35rem;
  color: rgb(var(--v-theme-primary)); background: var(--bb-color-inset); border: 0;
  border-radius: var(--bb-radius-nested, 16px); cursor: pointer; text-align: start; }
.admin-dispatch__photo-open:focus-visible, .admin-dispatch__sender-id summary:focus-visible,
.admin-dispatch__search-help summary:focus-visible, .dispatch-mission-timeline summary:focus-visible,
.admin-dispatch__followup summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.admin-dispatch__photo-open span { display: flex; align-items: center; gap: .3rem; font-size: .8rem; font-weight: 700; }
.admin-dispatch__photo-image { display: block; max-width: 100%; max-height: 9rem;
  border-radius: .75rem; object-fit: contain; }
.admin-dispatch__photo-dialog img { display: block; max-width: 100%; max-height: 75dvh;
  margin: auto; object-fit: contain; }
.admin-dispatch__photo-dialog :deep(.v-card-title) { white-space: normal; }
.admin-dispatch__proposal-note { color: var(--bb-color-muted); }
.admin-dispatch__next { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .6rem;
  padding: .65rem .75rem; border-radius: var(--bb-radius-nested, 16px);
  background: var(--bb-color-inset); }
.admin-dispatch__next span { font-weight: 700; }
.admin-dispatch__next :deep(.v-btn) { min-height: 44px; max-width: 100%; height: auto; white-space: normal; }
.admin-dispatch__next :deep(.v-btn__content) { white-space: normal; text-align: center; }
.admin-dispatch__selection-hint { display: flex; align-items: center; gap: .5rem; margin: 0 0 .75rem;
  padding: .7rem .9rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); }
.admin-dispatch__responders { scroll-margin-top: calc(5rem + env(safe-area-inset-top, 0px)); }
.admin-dispatch__responders:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
.admin-dispatch__sender { display: flex; align-items: center; flex-wrap: wrap; gap: .65rem;
  margin: .85rem 1rem 0; padding: .65rem .8rem;
  border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.admin-dispatch__sender-icon { display: grid; flex: none; place-items: center; width: 42px; height: 42px;
  border-radius: 50%; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .14); }
.admin-dispatch__sender-copy { display: grid; flex: 1 1 10rem; min-width: 0; gap: .12rem; }
.admin-dispatch__sender-copy strong { font-size: .9rem; }
.admin-dispatch__sender-id { color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__sender-id summary { cursor: pointer; min-height: 24px; }
.admin-dispatch__sender-id bdi { display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
.admin-dispatch__sender-action { flex: none; min-height: 44px; }

/* The timeline sits between other cards; give it a boundary, not another shadow. */
.dispatch-mission-timeline {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface));
}

.dispatch-map-wrapper {
  position: relative;
  height: clamp(18rem, 37dvh, 23rem);
  min-height: 18rem;
}

.map-selected-alert-card {
  position: absolute;
  top: .75rem;
  left: .75rem; right: auto; /* Do not cover MapLibre's top-right zoom/compass. */
  z-index: 2;
  width: min(17rem, calc(100% - 1.5rem));
  border: 1px solid var(--bb-color-outline);
  background: rgb(var(--v-theme-surface));
}
.admin-dispatch__map-caption { display: flex; align-items: center; flex-wrap: wrap; gap: .25rem .5rem;
  justify-content: space-between; }
.admin-dispatch__map-caption span { display: flex; align-items: center; gap: .4rem;
  min-width: 0; font-size: .83rem; font-weight: 800; }

.dispatch-request-list {
  max-height: min(42dvh, 24rem);
  overflow-y: auto; overscroll-behavior: contain;
}
.responder-list {
  max-height: min(38dvh, 20rem);
  overflow-y: auto; overscroll-behavior: contain;
}
.admin-dispatch__manual-warning { display: flex; align-items: center; gap: .4rem; margin: .5rem 1rem 0;
  color: rgb(var(--v-theme-on-surface)); font-size: .82rem; line-height: 1.5; }
.admin-dispatch__manual-warning .v-icon { flex: none; color: rgb(var(--v-theme-error)); }
.admin-dispatch__search-help { margin: .45rem 1rem .65rem; color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__search-help summary { cursor: pointer; min-height: 32px; }
.admin-dispatch__search-help p { margin: .3rem 0; line-height: 1.65; }
.admin-dispatch__submit { position: sticky; bottom: 0; z-index: 1;
  background: rgb(var(--v-theme-surface)); border-top: 1px solid var(--bb-color-outline); }
.admin-dispatch__followup { border: 1px solid var(--bb-color-outline);
  border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); padding: .75rem; }
.admin-dispatch__followup summary, .dispatch-mission-timeline summary { cursor: pointer; min-height: 44px;
  font-weight: 800; }
.admin-dispatch__followup summary span, .dispatch-mission-timeline summary span {
  color: var(--bb-color-muted); font-size: .8rem; font-weight: 500; margin-inline-start: .5rem;
}
.dispatch-mission-timeline[open] summary { margin-bottom: .5rem; }
.admin-dispatch__followup[open] summary { margin-bottom: .75rem; }

.severity-legend {
  position: absolute;
  bottom: 12px;
  inset-inline-start: 12px;
  z-index: 2;
  display: flex;
  gap: .7rem;
  padding: .45rem .7rem;
  border: 1px solid var(--bb-color-outline);
  border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay);
  font-size: .8rem;
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
    height: clamp(17rem, 40dvh, 22rem);
    min-height: 17rem;
  }
  .map-selected-alert-card {
    position: static;
    z-index: auto;
    width: auto;
    margin-inline: 0.75rem;
    overflow-wrap: anywhere;
  }
  .map-selected-alert-card.bb-floating-card {
    border: 0; background: var(--bb-color-inset);
    box-shadow: none !important;
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

@media (max-width: 959px) {
  .admin-dispatch__filter-select { width: 15rem; }
}
@media (max-width: 699px) {
  .admin-dispatch__overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .admin-dispatch__overview > :last-child { grid-column: 1 / -1; }
  .admin-dispatch__toolbar { grid-template-columns: minmax(0, 1fr); }
  .admin-dispatch__filter-select { width: 100%; max-width: none; }
  .admin-dispatch__toolbar-actions { justify-content: flex-start; }
}
@media (max-width: 599px) {
  .admin-dispatch__filter-select { flex: 1 1 12rem; min-width: 0; max-width: 100%; }
  .admin-dispatch__toolbar { width: 100%; }
  .admin-dispatch__sender-action { width: 100%; }
  .admin-dispatch__facts { grid-template-columns: minmax(0, 1fr); }
  .admin-dispatch__next :deep(.v-btn), .admin-dispatch__submit :deep(.v-btn) { width: 100%; }
  .admin-dispatch__submit :deep(.v-btn) { min-height: 44px; height: auto; white-space: normal; }
  .admin-dispatch__submit :deep(.v-btn__content) { white-space: normal; text-align: center; }
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
  border: 2px solid rgb(var(--v-theme-error));
  border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  animation: replacement-arrival 1.1s ease-in-out 2;
}
.replacement-flash :deep(.v-alert__underlay) { display: none; }

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

:global(:root.dark .admin-dispatch__surface),
:global(:root.dark .dispatch-mission-timeline),
:global(:root.dark .map-selected-alert-card),
:global(:root.dark .mission-timeline-select) {
  border-color: var(--bb-color-outline);
}
:global(:root.dark .dispatch-request-row.v-list-item--active),
:global(:root.dark .dispatch-responder-row.v-list-item--active) {
  background: var(--bb-color-inset); border-color: rgb(var(--v-theme-primary));
}
:global(:root.dark .mission-timeline-select) { background: var(--bb-color-inset); }
</style>
