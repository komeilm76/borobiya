<template>
  <main id="dispatch-workspace" class="admin-dispatch" aria-label="مرکز پایش و اعزام اضطراری"
    :class="{ 'admin-dispatch--incident-at-top': incidentAtMapTop }"
    :style="compactDispatch && sheetDragHeight !== null ? { '--dispatch-current-sheet-height': `${sheetDragHeight}px` } : undefined">
    <!-- Teleported above the workspace: feedback must not shrink or hide the responder list. -->
    <v-snackbar id="dispatch-notice-05"
      :model-value="Boolean(adminSos.dispatchFeedback)"
      :content-props="{ class: 'admin-sos-toast__wrapper dispatch-feedback-toast__wrapper' }"
      location="top" variant="flat"
      :timeout="adminSos.dispatchFeedback?.type === 'success' ? 6500 : -1"
      @update:model-value="dismissDispatchFeedback"
    >
      <div v-if="adminSos.dispatchFeedback" class="admin-sos-toast__message"
        :role="adminSos.dispatchFeedback.type === 'error' ? 'alert' : 'status'"
        :aria-live="adminSos.dispatchFeedback.type === 'error' ? 'assertive' : 'polite'">
        <v-icon :icon="adminSos.dispatchFeedback.type === 'success' ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'"
          :color="adminSos.dispatchFeedback.type" size="20" aria-hidden="true" />
        <span><strong>{{ adminSos.dispatchFeedback.type === 'success' ? 'ارسال موفق' : 'ارسال پیشنهاد ناموفق' }}</strong>
          <small>{{ adminSos.dispatchFeedback.message }}</small></span>
      </div>
      <template #actions>
        <v-btn id="dispatch-action-28" icon="mdi-close" size="small" variant="text"
          aria-label="بستن نتیجهٔ ارسال پیشنهاد" @click="adminSos.dispatchFeedback = null" />
      </template>
    </v-snackbar>
    <aside id="dispatch-sidebar" ref="dispatchSidebar" class="admin-dispatch__sidebar"
      :class="{ 'admin-dispatch__sidebar--expanded': compactDispatch && sheetExpanded,
        'admin-dispatch__sidebar--dragging': sheetDragging }"
      :style="compactDispatch && sheetDragHeight !== null ? { height: `${sheetDragHeight}px` } : undefined"
      aria-label="صف SOS و امدادگران نزدیک">
    <button id="dispatch-sheet-handle" v-if="compactDispatch" type="button" class="admin-dispatch__sheet-handle"
      :aria-expanded="sheetExpanded" aria-controls="dispatch-sidebar-content"
      :aria-label="sheetExpanded ? 'کوچک کردن پنل اعزام؛ برای جابه‌جایی بکشید' : 'باز کردن پنل اعزام؛ برای جابه‌جایی بکشید'"
      title="پنل اعزام را بکشید یا برای باز و بسته شدن بزنید"
      @pointerdown="startSheetDrag" @pointermove="moveSheetDrag" @pointerup="endSheetDrag"
      @pointercancel="cancelSheetDrag" @lostpointercapture="cancelSheetDrag"
      @click="clickSheetHandle" @keydown.up.prevent="setSheetExpanded(true)" @keydown.down.prevent="setSheetExpanded(false)">
      <span aria-hidden="true" />
    </button>
    <!-- Queue controls are not part of the selected SOS's responder workflow. -->
    <header v-if="!compactDispatch || !adminSos.selectedId" id="dispatch-header-01" class="admin-dispatch__header mb-5">
      <div class="admin-dispatch__intro">
        <div class="admin-dispatch__heading">
          <span class="admin-dispatch__brand-icon" aria-hidden="true"><v-icon icon="mdi-radar" size="23" /></span>
          <div class="admin-dispatch__heading-copy">
            <span class="admin-dispatch__eyebrow">عملیات اضطراری <span aria-hidden="true">/</span> SOS</span>
            <h1>مرکز پایش و اعزام اضطراری (SOS)</h1>
          </div>
        </div>
      </div>

      <div class="admin-dispatch__toolbar">
        <div class="admin-dispatch__filter-group" role="group" aria-label="فیلتر وضعیت درخواست‌ها">
          <v-select id="dispatch-select-01"
            :model-value="adminSos.filterStatus"
            :items="dispatchFilters"
            class="admin-dispatch__filter-select"
            label="فیلتر SOS"
            aria-label="وضعیت درخواست‌های اضطراری"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            rounded="lg"
            color="primary"
            hide-details
            @update:model-value="onFilterChange"
          />
        </div>

        <div class="admin-dispatch__toolbar-actions" role="group" aria-label="تنظیمات، بازخوانی و راهنما">
          <v-menu v-model="soundSettingsOpen" location="bottom end" :close-on-content-click="false">
            <template #activator="{ props: menuProps }">
              <v-btn id="dispatch-voice-settings" v-bind="menuProps" icon="mdi-cog-outline"
                size="small" variant="text"
                :aria-label="`تنظیمات؛ ${adminSos.soundMuted ? 'هشدار بی‌صدا' : 'هشدار صوتی فعال'}`"
                aria-controls="dispatch-voice-settings-panel" />
            </template>
            <div id="dispatch-voice-settings-panel" class="dispatch-voice-settings" dir="rtl"
              role="group" aria-label="تنظیمات صدا">
              <h2>تنظیمات</h2>
              <h3>صدا</h3>
              <div class="dispatch-voice-settings__row">
                <v-btn id="dispatch-action-04" :icon="adminSos.soundMuted ? 'mdi-volume-off' : 'mdi-volume-high'"
                  :color="adminSos.soundMuted ? 'warning' : 'primary'" variant="tonal" size="small"
                  :aria-label="adminSos.soundMuted ? 'فعال‌سازی صدای هشدار' : 'بی‌صدا کردن هشدار'"
                  :aria-pressed="!adminSos.soundMuted" @click="adminSos.toggleSoundMuted()" />
                <span>{{ adminSos.soundMuted ? 'هشدار صوتی خاموش' : 'هشدار صوتی فعال' }}</span>
              </div>
              <div class="dispatch-voice-settings__row">
                <v-btn id="dispatch-action-05" icon="mdi-bell-ring-outline" variant="tonal" size="small"
                  aria-label="آزمایش صدای هشدار" @click="testSound" />
                <span>آزمایش صدا</span>
              </div>
              <p v-if="soundTestError" id="dispatch-notice-01" role="alert" class="dispatch-voice-settings__error">
                {{ soundTestError }}
              </p>
            </div>
          </v-menu>
          <v-btn id="dispatch-action-06"
            :loading="adminSos.loading"
            aria-label="بازخوانی فهرست درخواست‌های اضطراری"
            density="compact"
            size="small"
            icon="mdi-refresh"
            variant="text"
            @click="adminSos.refreshRequests()"
          />
          <v-btn id="dispatch-help-button" icon="mdi-help-circle-outline" size="small" variant="text"
            aria-label="راهنمای مرکز اعزام و شرایط امدادگران" title="راهنمای مرکز اعزام"
            aria-controls="dispatch-help-dialog" :aria-expanded="helpDialogOpen"
            @click="helpDialogOpen = true" />
        </div>
      </div>
    </header>

    <!-- Keep replacement feedback above the scrollport: a previously scrolled
         worklist must not hide the result, and the alert must not grow as a row. -->
    <v-alert id="dispatch-notice-03" v-if="adminSos.quickDispatchFeedback" :type="adminSos.quickDispatchFeedback.type"
      variant="tonal" rounded="lg" density="compact" closable
      :role="adminSos.quickDispatchFeedback.type === 'error' ? 'alert' : 'status'" class="dispatch-quick-feedback"
      @click:close="adminSos.quickDispatchFeedback = null">
      {{ adminSos.quickDispatchFeedback.message }}
    </v-alert>

    <div id="dispatch-sidebar-content" class="admin-dispatch__content">
    <v-alert id="dispatch-notice-02"
      v-if="adminSos.errorMessage"
      class="mb-4"
      closable
      type="error"
      variant="tonal"
      @click:close="adminSos.errorMessage = null"
    >
      {{ adminSos.errorMessage }}
    </v-alert>

    <section id="dispatch-notice-04" v-if="adminSos.urgentReplacement"
      class="dispatch-replacement" role="alert" aria-live="assertive" aria-label="اعزام جایگزین لازم است">
      <div class="dispatch-replacement__heading">
        <v-icon icon="mdi-alert-circle-outline" size="19" aria-hidden="true" />
        <strong>اعزام جایگزین</strong>
        <v-btn id="dispatch-action-09" icon="mdi-close" size="small" variant="text"
          aria-label="بستن هشدار اعزام جایگزین" @click="adminSos.dismissUrgentReplacement()" />
      </div>
      <p>امدادگر مأموریت را لغو کرد.</p>
      <span v-if="adminSos.urgentReplacement.reviewRequired" class="dispatch-replacement__review">نیازمند بررسی مدیریتی</span>
      <details v-if="adminSos.urgentReplacement.rescuerLocation" class="dispatch-replacement__location">
        <summary>آخرین موقعیت امدادگر</summary>
        <bdi dir="ltr">{{ adminSos.urgentReplacement.rescuerLocation.lat.toFixed(5) }}, {{ adminSos.urgentReplacement.rescuerLocation.lon.toFixed(5) }}</bdi>
      </details>
      <div class="dispatch-replacement__actions">
        <v-btn id="dispatch-action-08" color="primary" variant="tonal" size="small"
          @click="focusReplacement(adminSos.urgentReplacement.sosRequestId)">بررسی درخواست</v-btn>
        <v-btn id="dispatch-action-07" color="error" variant="tonal" size="small"
          title="ارسال پیشنهاد به امدادگران جدید نزدیک، پس از بررسی مجدد وضعیت درخواست"
          :loading="adminSos.dispatchSubmitting" :disabled="adminSos.dispatchSubmitting"
          aria-label="ارسال پیشنهاد جایگزین به امدادگران نزدیک"
          @click="quickRedispatch(adminSos.urgentReplacement.sosRequestId)">ارسال پیشنهاد</v-btn>
      </div>
    </section>

    <section id="dispatch-queue-region" class="admin-dispatch__queue"
      :class="{ 'admin-dispatch__section--hidden': compactDispatch && !!adminSos.selectedId }"
      aria-label="صف درخواست‌ها">
        <v-card id="dispatch-queue" tabindex="-1" class="admin-dispatch__surface admin-dispatch__surface--queue bb-map-navigation-card bb-surface-card mb-4" elevation="0" rounded="xl">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2 text-subtitle-1 font-weight-bold">
            <span class="admin-dispatch__card-heading"><span class="admin-dispatch__section-number" aria-hidden="true">۰۱</span><span>صف درخواست‌های اضطراری</span></span>
            <v-chip id="dispatch-chip-08" v-if="adminSos.queueVerified" size="small" variant="tonal">
              {{ adminSos.visibleRequests.length.toLocaleString('fa-IR') }} مورد در این نما
            </v-chip>
            <v-chip id="dispatch-chip-09" v-else color="warning" size="small" variant="tonal">فهرست نامطمئن</v-chip>
          </v-card-title>

          <v-card-text v-if="adminSos.visibleRequests.length === 0 && adminSos.loading" class="py-8 text-center" role="status">
            <v-progress-circular indeterminate color="primary" size="28" class="me-2" />
            در حال بررسی صف درخواست‌های اضطراری…
          </v-card-text>
          <v-card-text v-else-if="adminSos.visibleRequests.length === 0 && !adminSos.queueVerified"
            class="py-8 text-center" role="status">
            صف هنوز تأیید نشده است؛ نبودن درخواست اضطراری را نمی‌توان نتیجه گرفت.
            <span v-if="adminSos.listTruncated">فقط بخشی از درخواست‌ها دریافت شده‌اند.</span>
            <v-btn id="dispatch-action-18" variant="text" size="small" :loading="adminSos.loading" @click="adminSos.refreshRequests()">تلاش دوباره</v-btn>
          </v-card-text>
          <v-card-text v-else-if="adminSos.visibleRequests.length === 0" class="py-8 text-center text-medium-emphasis" role="status">
            در حال حاضر درخواست اضطراری فعالی در این نما ثبت نشده است. به محض ارسال SOS جدید، نشانگر تپنده و هشدار صوتی فعال می‌شود.
          </v-card-text>
          <v-alert id="dispatch-notice-07" v-if="adminSos.visibleRequests.length && !adminSos.queueVerified" type="warning" variant="tonal"
            density="compact" role="status" class="ma-3">
            این فهرست هنوز تأیید نشده است؛ وضعیت موارد نمایشی ممکن است قدیمی باشد یا درخواست‌های بیشتری در صف باشند.
            <span v-if="adminSos.listTruncated">فقط نخستین ۱۰۰ مورد خوانده شدند.</span>
          </v-alert>

          <v-list id="dispatch-list-02" v-if="adminSos.visibleRequests.length" class="dispatch-request-list" lines="two" aria-label="فهرست درخواست‌های SOS">
            <v-list-item v-for="item in adminSos.visibleRequests" :key="item.id"
              :id="`dispatch-sos-${item.id}`"
              :active="item.id === adminSos.selectedId"
              :aria-current="item.id === adminSos.selectedId ? 'true' : undefined"
              :aria-pressed="item.id === adminSos.selectedId"
              class="dispatch-request-row" rounded="lg"
              :style="sosPriorityStyle(item.severity)"
              @click="toggleQueueRequest(item)"
            >
                <v-list-item-title class="dispatch-request-row__title font-weight-bold">
                  <span class="dispatch-request-row__name">{{ incidentLabel(item.incidentTypeId) }}</span>
                  <span class="dispatch-request-row__marker"
                    role="img" :aria-label="`اولویت: ${severityMeta(item.severity).label}`" />
                </v-list-item-title>
                <div class="dispatch-request-row__details">
                  <span class="dispatch-request-row__status" :class="`dispatch-request-row__status--${item.status}`"
                    :title="statusMeta(item.status).label">
                    <v-icon :icon="statusMeta(item.status).icon" size="16" aria-hidden="true" />
                    {{ statusMeta(item.status).queueLabel }}
                  </span>
                  <div class="dispatch-request-row__meta text-caption">
                    <span v-if="item.photoUrl" class="dispatch-request-row__attachment" role="img"
                      aria-label="تصویر پیوست" title="تصویر پیوست حادثه؛ برای بررسی درخواست را انتخاب کنید">
                      <v-icon icon="mdi-image-outline" size="16" aria-hidden="true" />
                    </span>
                    <time :datetime="item.createdAt" :title="formatTimestamp(item.createdAt)">{{ formatQueueTimestamp(item.createdAt) }}</time>
                    <span role="img" :aria-label="item.location.isManual ? 'موقعیت دستی' : 'موقعیت GPS'"
                      :title="item.location.isManual ? 'موقعیت دستی' : 'موقعیت GPS'">
                      <v-icon :icon="item.location.isManual ? 'mdi-map-marker-check-outline' : 'mdi-crosshairs-gps'" size="16" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </v-list-item>
          </v-list>
        </v-card>
    </section>

        <section id="dispatch-nearby" class="admin-dispatch__nearby"
          :class="{ 'admin-dispatch__section--hidden': compactDispatch && !adminSos.selectedId }"
          aria-label="امدادگران نزدیک">
          <div v-if="!adminSos.selectedRequest" class="admin-dispatch__nearby-empty" role="status">
            <strong>امدادگران نزدیک</strong>
            <span>{{ !adminSos.selectedId
              ? 'برای مشاهدهٔ امدادگران واجد شرایط، یک درخواست SOS انتخاب کنید.'
              : adminSos.loading ? 'در حال دریافت درخواست SOS…'
                : 'این درخواست در فهرست فعلی موجود نیست؛ به فهرست SOS بازگردید.' }}</span>
            <v-btn v-if="compactDispatch && adminSos.selectedId" id="dispatch-action-30"
              class="admin-dispatch__back-to-queue" icon="mdi-arrow-right" size="small" variant="tonal"
              aria-label="بازگشت به فهرست درخواست‌های SOS و لغو انتخاب درخواست"
              aria-controls="dispatch-queue-region" @click="returnToSosQueue" />
          </div>
        <v-card v-if="adminSos.selectedRequest" id="dispatch-responders" tabindex="-1"
          class="admin-dispatch__surface admin-dispatch__responders bb-map-navigation-card bb-surface-card" elevation="0" rounded="xl">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-2 text-subtitle-1 font-weight-bold">
            <div class="d-flex align-center ga-2">
              <span class="admin-dispatch__section-number" aria-hidden="true">۰۲</span>
              <span>{{ adminSos.responderSearch ? 'جست‌وجوی دستی' : 'امدادگران واجد شرایط نزدیک' }}</span>
              <v-chip id="dispatch-chip-02" v-if="adminSos.nearestLoaded && !adminSos.nearestLoading" color="primary" size="x-small" variant="tonal">
                {{ adminSos.nearestResponders.length }} نفر
              </v-chip>
              <v-chip id="dispatch-chip-03" v-else color="warning" size="x-small" variant="tonal">
                {{ adminSos.nearestLoading ? 'در حال بررسی' : 'نامطمئن' }}
              </v-chip>
            </div>

            <div class="d-flex align-center ga-1">
              <v-btn id="dispatch-action-10"
                :disabled="!adminSos.nearestLoaded || adminSos.nearestLoading || adminSos.nearestResponders.length === 0"
                icon="mdi-account-multiple-check-outline" size="small" variant="text"
                aria-label="انتخاب همهٔ امدادگران" title="انتخاب همهٔ امدادگران"
                @click="adminSos.selectAllNearestResponders()" />
              <v-btn id="dispatch-action-11"
                v-if="adminSos.selectedResponderIds.length > 0"
                icon="mdi-account-multiple-remove-outline" size="small" variant="text"
                aria-label="پاک‌سازی انتخاب امدادگران" title="پاک‌سازی انتخاب امدادگران"
                @click="adminSos.clearResponderSelection()" />
              <v-btn id="dispatch-action-12"
                :loading="adminSos.nearestLoading"
                aria-label="بازخوانی امدادگران نزدیک"
                icon="mdi-refresh"
                size="small"
                variant="text"
                @click="adminSos.loadNearestResponders()"
              />
            </div>
          </v-card-title>
          <form id="dispatch-form-01" class="admin-dispatch__responder-search pa-4 pb-0 d-flex align-center ga-2" role="search" @submit.prevent="searchResponders">
            <v-text-field id="dispatch-field-01" v-model="responderSearchInput" label="نام کاربری امدادگر"
              placeholder="حداقل ۲ حرف از نام کاربری"
              variant="outlined" rounded="lg" color="primary" density="compact" hide-details autocomplete="off" maxlength="64"
              aria-label="جست‌وجوی امدادگر با نام کاربری" />
            <v-btn id="dispatch-action-13" class="admin-dispatch__responder-search-submit" type="submit"
              icon="mdi-magnify" color="primary" variant="flat" rounded="lg"
              :aria-label="responderSearchInput.trim() ? 'جست‌وجوی امدادگر' : 'نمایش امدادگران نزدیک'"
              :title="responderSearchInput.trim() ? 'جست‌وجوی امدادگر' : 'نمایش امدادگران نزدیک'"
              :disabled="responderSearchInput.trim().length === 1" :loading="adminSos.nearestLoading" />
          </form>
          <div v-if="hiddenSelectedResponderIds.length" class="admin-dispatch__hidden-selections" aria-label="انتخاب‌های خارج از فهرست کنونی">
            <span>انتخاب‌های دیگر:</span>
            <v-chip :id="`dispatch-chip-04-${id}`" v-for="id in hiddenSelectedResponderIds" :key="id" closable size="small" color="primary"
              variant="tonal" @click:close="adminSos.toggleResponderSelection(id)">
              @{{ adminSos.selectedResponderNames[id] ?? id }}
            </v-chip>
          </div>

          <v-card-text v-if="adminSos.nearestLoading" class="py-6 text-center text-medium-emphasis" role="status">
            <v-progress-circular class="me-2" color="primary" indeterminate size="22" width="2" />
            در حال جستجوی نزدیک‌ترین امدادگران فعال و هم‌تخصص…
          </v-card-text>

          <v-alert id="dispatch-notice-06" v-else-if="adminSos.nearestError" class="ma-4" type="error" variant="tonal" role="alert">
            {{ adminSos.nearestError }}
            <template #append>
              <v-btn id="dispatch-action-14" variant="text" size="small" @click="adminSos.loadNearestResponders()">تلاش دوباره</v-btn>
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

          <div id="dispatch-list-01" v-else-if="adminSos.nearestLoaded" class="responder-list" role="group"
            aria-label="امدادگران واجد شرایط یا جست‌وجوشده">
            <div v-for="responder in adminSos.nearestResponders" :key="responder.userId"
              :id="`dispatch-responder-${responder.userId}`" class="dispatch-responder-row"
              :class="{ 'dispatch-responder-row--selected': adminSos.selectedResponderIds.includes(responder.userId) }">
              <button :id="`dispatch-select-${responder.userId}`" type="button" class="dispatch-responder-row__select"
                :aria-pressed="adminSos.selectedResponderIds.includes(responder.userId)"
                :aria-describedby="`dispatch-chip-06-${responder.userId} dispatch-meta-${responder.userId}`"
                :aria-label="`${adminSos.selectedResponderIds.includes(responder.userId) ? 'لغو انتخاب' : 'انتخاب'} امدادگر ${responder.username} برای اعزام`"
                @click="adminSos.toggleResponderSelection(responder.userId)">
                <span class="dispatch-responder-row__title">
                  <span class="dispatch-responder-row__identity">
                    <span class="dispatch-responder-row__selection" aria-hidden="true">
                      <v-icon :icon="adminSos.selectedResponderIds.includes(responder.userId) ? 'mdi-check' : 'mdi-plus'" size="16" />
                    </span>
                    <bdi class="dispatch-responder-row__name" dir="ltr" :title="responder.username">@{{ responder.username }}</bdi>
                  </span>
                  <span :id="`dispatch-chip-06-${responder.userId}`" class="dispatch-responder-row__distance"
                    :class="{ 'dispatch-responder-row__distance--unknown': responder.distance === null }"
                    :title="responder.distance === null ? 'فاصله و موقعیت تأیید نشده' : 'فاصله تا آخرین موقعیت ثبت‌شده، نه زمان رسیدن'">
                    <v-icon :icon="responder.distance === null ? 'mdi-map-marker-question-outline' : 'mdi-map-marker-distance'" size="15" aria-hidden="true" />
                    {{ responder.distance === null ? 'فاصله نامشخص' : formatDistance(responder.distance) }}
                  </span>
                </span>
                <span :id="`dispatch-meta-${responder.userId}`" class="dispatch-responder-row__meta">
                  <span class="dispatch-responder-row__specialty" :class="{ 'dispatch-responder-row__specialty--missing': !responder.categoryName }"
                    :title="responder.categoryName ? `تخصص: ${responder.categoryName}` : 'تخصص مرتبط ثبت نشده'">
                    <v-icon icon="mdi-medical-bag" size="15" aria-hidden="true" />
                    <span class="sr-only">تخصص:</span>
                    {{ responder.categoryName ?? 'تخصص مرتبط ثبت نشده' }}
                  </span>
                  <span :id="`dispatch-chip-07-${responder.userId}`" class="dispatch-responder-row__rating"
                    :title="responder.avgRating !== null ? `میانگین امتیاز ${responder.avgRating.toFixed(1)} از ۵` : 'بدون امتیاز'">
                    <v-icon icon="mdi-star-outline" size="15" aria-hidden="true" />
                    <span v-if="responder.avgRating !== null" class="sr-only">امتیاز از ۵:</span>
                    {{ responder.avgRating !== null ? responder.avgRating.toFixed(1) : 'بدون امتیاز' }}
                  </span>
                  <span class="dispatch-responder-row__activity" :title="`آخرین فعالیت: ${formatTimestamp(responder.lastActiveAt)}`">
                    <v-icon icon="mdi-clock-outline" size="15" aria-hidden="true" />
                    <span class="sr-only">آخرین فعالیت:</span>
                    <time :datetime="responder.lastActiveAt">{{ formatQueueTimestamp(responder.lastActiveAt) }}</time>
                  </span>
                  <span :id="`dispatch-chip-05-${responder.userId}`" v-if="proposedRescuerIdSet.has(responder.userId)"
                    class="dispatch-responder-row__proposed">
                    <v-icon icon="mdi-send-check-outline" size="15" aria-hidden="true" /> پیشنهاد ارسال‌شده
                  </span>
                </span>
              </button>
              <v-btn v-if="!adminSos.responderSearch && nearbyFeatures.features.some((feature) => feature.id === responder.userId)"
                :id="`dispatch-action-15-${responder.userId}`" class="dispatch-responder-row__map"
                icon="mdi-map-marker-radius-outline" variant="text" color="primary"
                :aria-label="`نمایش آخرین موقعیت ثبت‌شدهٔ ${responder.username} روی نقشه`"
                :title="`نمایش ${responder.username} روی نقشه`" @click="focusNearbyResponder(responder.userId)" />
            </div>
          </div>
          <v-card-text v-else class="py-6 text-center text-medium-emphasis" role="status">
            فهرست امدادگران هنوز تأیید نشده است؛ نتیجهٔ خالی نمی‌توان گرفت.
            <v-btn id="dispatch-action-16" variant="text" size="small" @click="adminSos.loadNearestResponders()">تلاش دوباره</v-btn>
          </v-card-text>

          <v-card-actions class="admin-dispatch__submit pa-4 d-flex flex-wrap align-center justify-space-between ga-2">
            <v-btn v-if="compactDispatch" id="dispatch-action-29"
              class="admin-dispatch__back-to-queue" icon="mdi-arrow-right" size="small" variant="tonal"
              aria-label="بازگشت به فهرست درخواست‌های SOS و لغو انتخاب درخواست"
              aria-controls="dispatch-queue-region" @click="returnToSosQueue" />
            <v-btn id="dispatch-action-17"
              :aria-label="`ارسال پیشنهاد مأموریت به ${adminSos.selectedResponderIds.length} امدادگر انتخاب‌شده`"
              :disabled="!adminSos.canDispatchSelected"
              :loading="adminSos.dispatchSubmitting"
              color="error"
              prepend-icon="mdi-send-check-outline"
              rounded="lg"
              variant="flat"
              @click="requestDispatch"
            >
              ارسال پیشنهاد ({{ adminSos.selectedResponderIds.length }})
            </v-btn>
          </v-card-actions>
        </v-card>
        </section>
    </div>
    </aside>
    <section id="dispatch-map-region" class="admin-dispatch__map-and-actions" aria-label="نقشه و جزئیات اعزام">
        <section id="dispatch-search" class="admin-dispatch__search" aria-label="جست‌وجو روی نقشه"
          :class="{ 'admin-dispatch__search--hidden': hideDispatchSearch }" :inert="hideDispatchSearch">
          <div class="admin-dispatch__search-form" role="search">
            <v-text-field id="dispatch-search-input" v-model="mapSearch" label="جست‌وجو در نقشه"
              placeholder="کاربر، SOS، مکان یا نقطهٔ موردعلاقه"
              prepend-inner-icon="mdi-magnify" clearable hide-details density="compact" variant="outlined" rounded="lg"
              autocomplete="off" maxlength="200" aria-controls="dispatch-search-results" @click:clear="mapSearch = ''" />
            <!-- The shared map menu launcher lives beside the field at every dispatch width. -->
            <div id="dispatch-search-menu-slot" class="admin-dispatch__search-menu-slot" />
          </div>
          <div v-if="searchQuery.length >= 2" id="dispatch-search-results" class="admin-dispatch__search-results"
            role="listbox" aria-label="نتایج جست‌وجوی نقشه">
            <button v-for="item in matchedRequests" :key="item.id" type="button" class="admin-dispatch__search-result"
              :id="`dispatch-search-sos-${item.id}`" role="option" :aria-selected="item.id === adminSos.selectedId"
              @click="selectSearchRequest(item)">
              <v-icon icon="mdi-alert-circle-outline" size="20" aria-hidden="true" />
              <span> SOS · {{ incidentLabel(item.incidentTypeId) }} <small>{{ item.id.slice(0, 8) }}</small></span>
            </button>
            <button v-for="user in searchedUsers" :key="user.id" type="button" class="admin-dispatch__search-result"
              :id="`dispatch-search-account-${user.id}`" role="option" aria-selected="false"
              @click="focusSearchUser(user)">
              <v-icon icon="mdi-account-outline" size="20" aria-hidden="true" />
              <span>کاربر · @{{ user.username }} <small>{{ adminSos.requests.some((item) => item.requesterId === user.id)
                ? 'موقعیت درخواست SOS' : nearbyFeatures.features.some((feature) => feature.id === user.id)
                  ? 'موقعیت تأییدشدهٔ امدادگر' : 'پروفایل؛ موقعیت تأییدشده‌ای در دسترس نیست' }}</small></span>
            </button>
            <button v-for="responder in matchedResponders" :key="responder.userId" type="button"
              class="admin-dispatch__search-result" :id="`dispatch-search-user-${responder.userId}`" role="option"
              :aria-selected="adminSos.selectedResponderIds.includes(responder.userId)" @click="focusSearchResponder(responder.userId)">
              <v-icon icon="mdi-account-outline" size="20" aria-hidden="true" />
              <span>امدادگر · @{{ responder.username }}</span>
            </button>
            <button v-for="(place, index) in searchedPlaces" :key="place.placeId" type="button" class="admin-dispatch__search-result"
              :id="`dispatch-search-place-${index}`" role="option" aria-selected="false"
              @click="focusSearchPlace(place)">
              <v-icon icon="mdi-map-marker-outline" size="20" aria-hidden="true" />
              <span>{{ place.name }} <small>{{ place.address }}</small></span>
            </button>
            <p v-if="usersLoading" role="status">در حال جست‌وجوی کاربران…</p>
            <p v-if="usersError" role="alert">جست‌وجوی کاربران در دسترس نیست. <button id="dispatch-users-retry" type="button" @click="retryUserSearch">تلاش دوباره</button></p>
            <p v-if="searchQuery.length > 30" role="status">برای جست‌وجوی کاربر حداکثر ۳۰ نویسه وارد کنید.</p>
            <p v-if="placesLoading" role="status">در حال جست‌وجوی مکان‌ها…</p>
            <p v-if="placesError" role="alert">جست‌وجوی مکان‌ها در دسترس نیست. <button id="dispatch-search-retry" type="button" @click="retryPlaceSearch">تلاش دوباره</button></p>
            <button v-if="adminSos.selectedRequest && searchQuery.length >= 2" id="dispatch-search-username" type="button"
              class="admin-dispatch__search-result" role="option" aria-selected="false" @click="searchUsernameOnMap">
              <v-icon icon="mdi-account-search-outline" size="20" aria-hidden="true" />
              جست‌وجوی نام کاربری در امدادگران (موقعیت تأیید نمی‌شود)
            </button>
            <p v-if="!matchedRequests.length && !matchedResponders.length && !searchedUsers.length && !searchedPlaces.length && !placesLoading && !usersLoading && !placesError && !usersError"
              role="status">نتیجه‌ای در موارد بارگذاری‌شده پیدا نشد.</p>
          </div>
        </section>
        <v-card id="dispatch-map" class="admin-dispatch__surface bb-map-navigation-card bb-surface-card overflow-hidden mb-4" elevation="0" rounded="xl">
          <div class="dispatch-map-wrapper">
            <MapCanvas id="dispatch-canvas-01" tabindex="-1"
              aria-label="نقشهٔ درخواست‌های SOS و آخرین موقعیت ثبت‌شدهٔ امدادگران نزدیک"
              :style-url="mapStyleUrl"
              :constrain-bounds="false"
              :show-navigation="false"
              :zoom="12"
              @ready="onMapReady"
            />

            <div v-if="mapEdgeCues.length" class="dispatch-map-edge-cues" aria-label="نقاط بیرون از قاب نقشه">
              <button v-for="cue in mapEdgeCues" :key="`${cue.kind}-${cue.id}`" type="button"
                :id="`dispatch-edge-${cue.kind}-${cue.id}`" class="dispatch-map-edge-cue" :class="[`dispatch-map-edge-cue--${cue.kind}`, `dispatch-map-edge-cue--${cue.edge}`]"
                :style="{ left: `${cue.x}px`, top: `${cue.y}px`, '--dispatch-edge-color': edgeCueColor(cue) }"
                :aria-label="`${cue.kind === 'sos' ? 'حادثهٔ انتخاب‌شده' : 'امدادگر نزدیک'} ${cue.label}، بیرون از قاب نقشه در سمت ${edgeCueDirectionLabel[cue.edge]}، نمایش روی نقشه`"
                :title="cue.label"
                @click="focusEdgeCue(cue)">
                <span class="dispatch-map-edge-cue__arrow" aria-hidden="true">
                  <svg :class="`dispatch-map-edge-cue__arrow--${cue.edge}`" viewBox="0 0 24 24" focusable="false">
                    <path d="M12 20V4 M5 11l7-7 7 7" fill="none" stroke="currentColor" stroke-width="3.5"
                      stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span><bdi dir="auto">{{ cue.label }}</bdi>
              </button>
            </div>

            <div v-if="mapPointChoices.length" id="dispatch-map-choices" class="dispatch-map-choices" role="group"
              aria-labelledby="dispatch-map-choices-heading" dir="rtl">
              <div class="dispatch-map-choices__heading">
                <span class="dispatch-map-choices__heading-icon" aria-hidden="true"><v-icon icon="mdi-map-marker-multiple-outline" size="19" /></span>
                <div class="dispatch-map-choices__heading-copy">
                  <strong id="dispatch-map-choices-heading">نقاط این مکان</strong>
                  <span>{{ mapPointChoices.length.toLocaleString('fa-IR') }} مورد هم‌پوشان</span>
                </div>
                <button id="dispatch-button-01" type="button" class="dispatch-map-choices__close"
                  aria-label="بستن فهرست نقاط" @click="mapPointChoices = []">
                  <v-icon icon="mdi-close" size="19" aria-hidden="true" />
                </button>
              </div>
              <div class="dispatch-map-choices__items">
                <button :id="`dispatch-button-02-${choice.kind}-${choice.id}`" v-for="choice in mapPointChoices"
                  :key="`${choice.kind}-${choice.id}`" type="button" class="dispatch-map-choices__item"
                  :class="{ 'dispatch-map-choices__item--selected': isMapChoiceSelected(choice) }"
                  :aria-label="`${choice.label}؛ ${mapChoiceHint(choice)}`"
                  :aria-pressed="choice.kind === 'cluster' ? undefined : isMapChoiceSelected(choice)"
                  @click="activateMapChoice(choice)">
                  <span class="dispatch-map-choices__item-icon" :class="`dispatch-map-choices__item-icon--${choice.kind}`" aria-hidden="true">
                    <v-icon :icon="choice.kind === 'sos' ? 'mdi-alarm-light-outline' : choice.kind === 'cluster' ? 'mdi-account-group-outline' : 'mdi-account-outline'" size="19" />
                  </span>
                  <span class="dispatch-map-choices__item-copy">
                    <strong dir="auto">{{ choice.title ?? choice.label }}</strong>
                    <small>{{ mapChoiceHint(choice) }}</small>
                  </span>
                  <v-icon :icon="isMapChoiceSelected(choice) ? 'mdi-check' : choice.kind === 'cluster' ? 'mdi-magnify-plus-outline' : 'mdi-chevron-left'"
                    size="19" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
          <v-btn v-if="!compactDispatch" id="dispatch-legend-toggle" class="admin-dispatch__legend-toggle"
            icon="mdi-map-outline" :color="legendOpen ? 'primary' : 'surface'" variant="flat"
            :aria-label="legendOpen ? 'بستن راهنمای نقشه' : 'نمایش راهنمای نقشه'"
            :title="legendOpen ? 'بستن راهنمای نقشه' : 'نمایش راهنمای نقشه'"
            :aria-expanded="legendOpen" aria-controls="dispatch-map-legend"
            @click="legendOpen = !legendOpen" />
          <ul id="dispatch-map-legend" class="dispatch-map-key" aria-label="راهنمای نشانگرهای نقشه"
            v-show="legendOpen && !compactDispatch"
            :style="{ '--dispatch-helper-color': themeStore.isDark ? '#205fd1' : '#0868c8' }">
            <li v-for="item in sosSeverityKey" :key="item.severity">
              <span class="dispatch-map-key__icon dispatch-map-key__icon--sos mdi mdi-alert"
                :style="{ '--dispatch-sos-color': SOS_MAP_MARKER_COLORS[item.severity] }" aria-hidden="true" />
              حادثه {{ item.label }}
            </li>
            <li v-if="adminSos.selectedRequest"><span class="dispatch-map-key__icon dispatch-map-key__icon--selected-sos mdi mdi-alert"
              :style="{ '--dispatch-sos-color': SOS_MAP_MARKER_COLORS[sosMapPriority(adminSos.selectedRequest.status, adminSos.selectedRequest.severity)] }"
              aria-hidden="true" />حادثه انتخاب‌شده</li>
            <li v-if="adminSos.selectedRequest"><span class="dispatch-map-key__icon dispatch-map-key__icon--helper mdi mdi-account" aria-hidden="true" />امدادگر واجد شرایط</li>
            <li v-if="adminSos.selectedRequest"><span class="dispatch-map-key__selected" aria-hidden="true"><span class="mdi mdi-account" /></span>امدادگر انتخاب‌شده</li>
            <li v-if="adminSos.selectedRequest && nearbyFeatures.features.length > 1"><span class="dispatch-map-key__cluster" aria-hidden="true">+۲</span>چند امدادگر در یک ناحیه</li>
          </ul>
        </v-card>
        <div v-if="adminSos.selectedRequest" id="dispatch-incident-panel" class="admin-dispatch__incident-panel"
          :class="{ 'admin-dispatch__incident-panel--expanded': incidentExpanded }"
          @click.self="collapseSheetForIncident">
          <div class="admin-dispatch__incident-header">
            <v-btn id="dispatch-action-21" class="admin-dispatch__incident-map" icon="mdi-map-marker-radius-outline"
              color="primary" variant="tonal" aria-controls="dispatch-map"
              :aria-label="nearbyFeatures.features.length ? 'نمایش حادثه و امدادگران نزدیک روی نقشه' : 'نمایش محل حادثه روی نقشه'"
              @click.stop="focusSelectedIncidentMap" />
            <button id="dispatch-incident-toggle" type="button" class="admin-dispatch__incident-toggle"
              :aria-expanded="incidentExpanded" aria-controls="dispatch-incident-content"
              @click="toggleIncidentPanel">
              <span class="admin-dispatch__incident-summary">
                <span class="admin-dispatch__incident-name">
                  <span class="admin-dispatch__priority-dot" :style="sosPriorityStyle(adminSos.selectedRequest.severity)"
                    role="img" :aria-label="`اولویت: ${severityMeta(adminSos.selectedRequest.severity).label}`" />
                  <strong>{{ incidentLabel(adminSos.selectedRequest.incidentTypeId) }}</strong>
                </span>
                <v-chip id="dispatch-chip-14" class="admin-dispatch__incident-status"
                  :color="statusMeta(adminSos.selectedRequest.status).badgeColor"
                  :prepend-icon="statusMeta(adminSos.selectedRequest.status).icon" size="small" variant="tonal"
                  :aria-label="statusMeta(adminSos.selectedRequest.status).label">
                  {{ statusMeta(adminSos.selectedRequest.status).queueLabel }}
                </v-chip>
              </span>
              <v-icon :icon="incidentExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" aria-hidden="true" />
            </button>
          </div>
          <div v-show="incidentExpanded" id="dispatch-incident-content">
        <v-card v-if="adminSos.selectedRequest" id="dispatch-incident" class="admin-dispatch__surface bb-map-navigation-card bb-surface-card" elevation="0" rounded="xl">
          <section v-if="adminSos.selectedRequest.photoUrl" class="admin-dispatch__photo" aria-label="تصویر پیوست حادثه">
            <div class="admin-dispatch__photo-heading">
              <span class="admin-dispatch__photo-heading-icon" aria-hidden="true"><v-icon icon="mdi-image-multiple-outline" size="19" /></span>
              <div><h3>تصویر پیوست حادثه</h3><p>برای بررسی جزئیات، تصویر را در اندازهٔ کامل ببینید.</p></div>
            </div>
            <button id="dispatch-button-03" v-if="photoSrc" type="button" class="admin-dispatch__photo-open"
              :disabled="photoOpenLoading" aria-label="نمایش تصویر پیوست حادثه در اندازهٔ بزرگ" @click="openPhoto">
              <span class="admin-dispatch__photo-preview">
                <img :src="photoSrc" alt="تصویر پیوست درخواست امداد"
                  class="admin-dispatch__photo-image" referrerpolicy="no-referrer" @error="photoSrc = null">
              </span>
              <span class="admin-dispatch__photo-caption"><span><v-icon icon="mdi-arrow-expand-all" size="18" aria-hidden="true" /> {{ photoOpenLoading ? 'در حال باز کردن تصویر…' : 'نمایش تصویر کامل' }}</span>
                <v-icon icon="mdi-arrow-top-left" size="18" aria-hidden="true" /></span>
            </button>
            <div v-else class="admin-dispatch__photo-state" role="status">
              <v-icon :icon="photoLoading ? 'mdi-image-search-outline' : 'mdi-image-off-outline'" size="22" aria-hidden="true" />
              <span>{{ photoLoading ? "در حال دریافت تصویر حادثه…" : "تصویر حادثه در دسترس نیست." }}</span>
              <v-btn id="dispatch-action-20" v-if="!photoLoading && auth.accessToken" size="small" variant="tonal"
                color="primary" @click="photoRetryNonce++">تلاش دوباره</v-btn>
            </div>
            <p v-if="photoOpenError" class="admin-dispatch__photo-error" role="alert">{{ photoOpenError }}</p>
          </section>
          <div class="admin-dispatch__sender-group" role="group" aria-label="ارسال‌کنندهٔ درخواست">
            <button id="dispatch-action-19" type="button" class="admin-dispatch__sender"
              aria-label="مشاهدهٔ پروفایل ارسال‌کننده" aria-haspopup="dialog" title="مشاهدهٔ پروفایل ارسال‌کننده"
              @click="collapseSheetForIncident(); profileUserId = null; senderProfileOpen = true">
              <span class="admin-dispatch__sender-avatar" aria-hidden="true">
                <v-icon icon="mdi-account-circle-outline" size="26" />
              </span>
              <span class="admin-dispatch__sender-copy">
                <strong>ارسال‌کنندهٔ درخواست</strong>
                <span class="admin-dispatch__sender-name" dir="ltr" v-if="requesterName">@{{ requesterName }}</span>
                <span v-else class="admin-dispatch__sender-placeholder" role="status">{{ requesterLoading ? 'در حال دریافت نام کاربری…' : 'نام کاربری در دسترس نیست' }}</span>
              </span>
            </button>
            <button id="dispatch-button-06" v-if="requesterFailed" type="button" class="admin-dispatch__inline-retry" @click="requesterRetry++">تلاش دوباره</button>
          </div>
          <div id="dispatch-notice-08"
            v-if="adminSos.selectedRequest.status === 'cancelled_by_rescuer' &&
              adminSos.urgentReplacement?.sosRequestId !== adminSos.selectedRequest.id"
            class="admin-dispatch__replacement-note" role="status">
            <v-icon icon="mdi-alert-circle-outline" size="18" aria-hidden="true" />
            <span>اعزام جایگزین لازم است.</span>
            <small v-if="adminSos.replacementByRequest[adminSos.selectedRequest.id]?.reviewRequired">نیازمند بررسی مدیریتی</small>
            <details v-if="adminSos.replacementByRequest[adminSos.selectedRequest.id]?.rescuerLocation"
              class="dispatch-replacement__location">
              <summary>آخرین موقعیت امدادگر</summary>
              <bdi dir="ltr">{{ adminSos.replacementByRequest[adminSos.selectedRequest.id]?.rescuerLocation?.lat.toFixed(5) }}, {{ adminSos.replacementByRequest[adminSos.selectedRequest.id]?.rescuerLocation?.lon.toFixed(5) }}</bdi>
            </details>
          </div>
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
            </dl>
            <details id="dispatch-details-03" :key="adminSos.selectedRequest.id" class="admin-dispatch__location-details">
              <summary>جزئیات موقعیت و مختصات <v-icon icon="mdi-chevron-down" size="18" aria-hidden="true" /></summary>
              <dl class="admin-dispatch__facts">
                <div class="admin-dispatch__address">
                  <dt>محل حادثه · نشانی تقریبی</dt>
                  <dd v-if="addressLoading" role="status">در حال یافتن نشانی…</dd>
                  <dd v-else-if="incidentAddress">{{ incidentAddress }}</dd>
                  <dd v-else>{{ addressFailed ? 'دریافت نشانی ممکن نشد.' : 'نشانی در دسترس نیست؛ نقطهٔ حادثه روی نقشه ثبت شده است.' }}
                    <button id="dispatch-button-05" v-if="addressFailed" type="button" class="admin-dispatch__inline-retry" @click="addressRetry++">تلاش دوباره</button>
                  </dd>
                </div>
                <div class="admin-dispatch__location-coordinates">
                  <dt>مختصات ثبت‌شدهٔ حادثه</dt>
                  <dd class="admin-dispatch__coordinates" dir="ltr"><span>lat: {{ adminSos.selectedRequest.location.lat.toFixed(6) }}</span><span>lng: {{ adminSos.selectedRequest.location.lon.toFixed(6) }}</span></dd>
                </div>
                <div v-if="adminSos.selectedRequest.location.accuracy !== undefined">
                  <dt>دقت گزارش‌شده</dt>
                  <dd>±{{ Math.round(adminSos.selectedRequest.location.accuracy) }} متر</dd>
                </div>
              </dl>
            </details>
            <p v-if="adminSos.selectedRequestProposals.length > 0" class="admin-dispatch__proposal-note">
              {{ adminSos.selectedRequestProposals.length.toLocaleString('fa-IR') }} پیشنهاد در این نشست ارسال شد؛ وضعیت پذیرش آن‌ها در این بخش تأیید نمی‌شود.
            </p>
            <div v-if="compactDispatch" class="admin-dispatch__next">
              <v-btn id="dispatch-action-22" color="primary" variant="flat" rounded="lg" prepend-icon="mdi-account-search-outline"
                aria-label="انتخاب امدادگر و اعزام" aria-controls="dispatch-responders" @click="focusResponders">انتخاب و اعزام</v-btn>
            </div>
          </v-card-text>
          <v-dialog id="dispatch-dialog-01" v-model="photoDialogOpen" max-width="min(94vw, 60rem)" aria-label="تصویر کامل پیوست حادثه">
            <v-card id="dispatch-card-01" rounded="xl" class="admin-dispatch__photo-dialog">
              <v-card-title class="admin-dispatch__photo-dialog-heading">
                <span><v-icon icon="mdi-image-multiple-outline" size="22" aria-hidden="true" /> تصویر پیوست حادثه</span>
                <v-btn id="dispatch-action-23" icon="mdi-close" variant="text" aria-label="بستن تصویر" @click="photoDialogOpen = false" />
              </v-card-title>
              <v-card-text><img v-if="photoSrc" :src="photoSrc" alt="تصویر کامل پیوست درخواست امداد"
                referrerpolicy="no-referrer" @error="photoSrc = null"></v-card-text>
            </v-card>
          </v-dialog>
        </v-card>
        <p v-if="adminSos.selectedRequest && !adminSos.responderSearch &&
          (adminSos.nearestLoading || adminSos.nearestError || adminSos.nearestLoaded)"
          class="admin-dispatch__map-note" role="status">
          {{ adminSos.nearestLoading ? 'در حال بررسی امدادگران نزدیک…'
            : adminSos.nearestError ? 'موقعیت امدادگران تأیید نشد؛ فهرست را بازخوانی کنید.'
              : nearbyFeatures.features.length ? `نقاط ${nearbyFeatures.features.length.toLocaleString('fa-IR')} امدادگر واجد شرایط، آخرین موقعیت ثبت‌شده‌اند؛ موقعیت زنده نیستند.`
                : adminSos.nearestLoaded ? 'موقعیت ثبت‌شده‌ای از امدادگران واجد شرایط در دسترس نیست.' : '' }}
        </p>

        <v-btn id="dispatch-action-24" v-if="adminSos.selectedRequest?.status === 'cancelled_by_rescuer' &&
          adminSos.urgentReplacement?.sosRequestId !== adminSos.selectedRequest.id"
          color="error" variant="tonal" size="small" class="admin-dispatch__replacement-action"
          title="ارسال پیشنهاد به امدادگران جدید نزدیک، پس از بررسی مجدد وضعیت درخواست"
          :loading="adminSos.dispatchSubmitting" :disabled="adminSos.dispatchSubmitting"
          aria-label="ارسال پیشنهاد جایگزین به امدادگران نزدیک"
          @click="quickRedispatch(adminSos.selectedRequest.id)">ارسال پیشنهاد</v-btn>
        <div v-if="adminSos.selectedRequest" class="admin-dispatch__mission-header">
          <h2>پیگیری مأموریت</h2>
          <v-btn id="dispatch-action-25" size="small" variant="text" color="primary" icon="mdi-refresh"
            aria-label="بازخوانی مأموریت‌ها" title="بازخوانی مأموریت‌ها"
            :loading="missionLoading" :disabled="missionLoading"
            @click="loadActiveMissions()" />
        </div>
        <v-alert id="dispatch-notice-09" v-if="missionError" type="warning" variant="tonal" class="mb-3" role="alert">
          {{ missionError }}
        </v-alert>
        <v-skeleton-loader id="dispatch-loading-01" v-if="adminSos.selectedRequest && missionLoading && !requestMissions.length" type="article" class="mb-3"
          role="status" aria-label="در حال دریافت مأموریت‌های این درخواست" />
        <details id="dispatch-details-04" v-else-if="requestMissions.length" :key="adminSos.selectedRequest?.id" class="mb-3 pa-3 dispatch-mission-timeline">
          <summary>خط زمانی <span>{{ requestMissions.length.toLocaleString('fa-IR') }} مأموریت</span></summary>
          <label for="dispatch-mission-timeline" class="d-block text-caption font-weight-bold mb-2">انتخاب مأموریت</label>
          <select id="dispatch-mission-timeline" v-model="timelineMissionId" class="mission-timeline-select">
            <option v-for="mission in requestMissions" :key="mission.id" :value="mission.id">
              {{ new Date(mission.createdAt).toLocaleString('fa-IR') }} · {{ statusLabel(mission.status) }}
            </option>
          </select>
          <MissionTimelinePanel id="dispatch-timeline-01" v-if="selectedTimelineMission" :key="selectedTimelineMission.id"
            :mission="selectedTimelineMission" audience="admin" :show-navigation="false" />
        </details>
        <p v-else-if="adminSos.selectedRequest && missionLoaded" class="mb-3 text-body-2 text-medium-emphasis" role="status">
          برای این درخواست هنوز مأموریتی ثبت نشده است.
        </p>
        <section id="dispatch-section-01" v-if="activeMissions.length" class="admin-dispatch__followup mb-3">
          <button id="dispatch-button-04" type="button" class="admin-dispatch__followup-toggle" :aria-expanded="showLivePanel"
            @click="showLivePanel = !showLivePanel">
            موقعیت زنده و اعضای مأموریت <span>{{ activeMissions.length.toLocaleString('fa-IR') }} مأموریت فعال</span>
            <v-icon :icon="showLivePanel ? 'mdi-chevron-up' : 'mdi-chevron-down'" aria-hidden="true" />
          </button>
          <template v-if="showLivePanel">
            <MissionLivePanel :id="`dispatch-live-01-${mission.id}`" v-for="mission in activeMissions" :key="mission.id" :mission="mission"
              :show-navigation="false"
              :center="adminSos.selectedRequest ? [adminSos.selectedRequest.location.lon, adminSos.selectedRequest.location.lat] : undefined" />
          </template>
        </section>
          </div>
        </div>
        <v-dialog id="dispatch-dialog-02" v-model="manualDispatchConfirmation" max-width="480" :persistent="adminSos.dispatchSubmitting" aria-label="تأیید ارسال پیشنهاد دستی">
          <v-card id="dispatch-card-02" title="تأیید ارسال پیشنهاد دستی" class="admin-dispatch__confirmation" rounded="xl">
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
              <v-btn id="dispatch-action-26" variant="text" rounded="lg" :disabled="adminSos.dispatchSubmitting" @click="manualDispatchConfirmation = false">بازگشت</v-btn>
              <v-btn id="dispatch-action-27" color="error" variant="flat" rounded="lg" :loading="adminSos.dispatchSubmitting" :disabled="!adminSos.canDispatchSelected"
                @click="confirmManualDispatch">ارسال با آگاهی از محدودیت‌ها</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
    </section>
    <v-dialog id="dispatch-help-dialog" v-model="helpDialogOpen" max-width="520"
      aria-label="راهنمای مرکز اعزام و شرایط امدادگران">
      <v-card id="dispatch-help-card" class="admin-dispatch__help-dialog" rounded="xl">
        <v-card-title class="admin-dispatch__help-heading">
          <span><v-icon icon="mdi-help-circle-outline" size="22" aria-hidden="true" /> راهنمای مرکز اعزام</span>
          <v-btn id="dispatch-help-close" icon="mdi-close" variant="text" aria-label="بستن راهنمای مرکز اعزام"
            @click="helpDialogOpen = false" />
        </v-card-title>
        <v-card-text class="admin-dispatch__help-content">
          <section>
            <h2>انتخاب درخواست و ارسال پیشنهاد</h2>
            <p>در موبایل، ابتدا فهرست درخواست‌های SOS نمایش داده می‌شود. با انتخاب یک درخواست، فهرست امدادگران نزدیک آن باز می‌شود. دکمهٔ پیکان کنار «ارسال پیشنهاد» به فهرست SOS برمی‌گردد و انتخاب درخواست را لغو می‌کند. با دستگیرهٔ بالای پنل می‌توانید ارتفاع فهرست را تغییر دهید.</p>
            <p>در نمایش بزرگ‌تر، صف درخواست‌ها و فهرست امدادگران هم‌زمان دیده می‌شوند. نقطهٔ رنگی در انتهای چپ سطر عنوان، اولویت حادثه را نشان می‌دهد؛ نماد تصویر یعنی درخواست پیوست دارد. وضعیت درخواست جداگانه نمایش داده می‌شود.</p>
            <p>امدادگران را بررسی و انتخاب کنید؛ تعداد افراد انتخاب‌شده روی دکمهٔ «ارسال پیشنهاد» دیده می‌شود. ارسال بدون انتخاب امدادگر ممکن نیست.</p>
          </section>
          <section>
            <h2>معیارهای فهرست امدادگران</h2>
            <p>در فهرست نزدیک‌ترین‌ها حداکثر ۱۰ امدادگر فعال، آزاد، هم‌تخصص و دارای موقعیت ثبت‌شده نمایش داده می‌شوند. فاصله بر پایهٔ آخرین موقعیت ثبت‌شده است، نه زمان رسیدن.</p>
          </section>
          <section>
            <h2>جست‌وجوی دستی و شرایط اعزام</h2>
            <p>برای یافتن افراد دیگر، حداقل ۲ حرف از نام کاربری را وارد و دکمهٔ جست‌وجو را بزنید. حداکثر ۱۰ حساب فعال و آزادِ منطبق نمایش داده می‌شود. پاک‌کردن فیلد و زدن همان دکمه، فهرست نزدیک‌ترین‌ها را بازمی‌گرداند.</p>
            <p class="admin-dispatch__help-caution"><v-icon icon="mdi-alert-outline" size="20" aria-hidden="true" />
              جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند؛ پیش از اعزام صلاحیت و دسترسی را بررسی کنید. برای انتخاب‌های نامطمئن، پیش از ارسال پیشنهاد تأیید جداگانه خواسته می‌شود.</p>
          </section>
        </v-card-text>
      </v-card>
    </v-dialog>
    <AdminUserProfileDialog v-model="senderProfileOpen" :user-id="profileUserId ?? adminSos.selectedRequest?.requesterId ?? null"
      title="پروفایل ارسال‌کننده" />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useRoute } from "vue-router";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Marker as MapLibreMarker } from "maplibre-gl";
import type { GeocodeResult, IncidentType, Severity, SosRequestRecord, UserProfile } from "@shared/index";
import { listSosIncidentTypes } from "@/api/sos";
import { reversePlace, searchPlaces } from "@/api/geocoding";
import { getAdminUser, listAdminUsers } from "@/api/admin-users";
import { accountSessionKey } from "@/composables/device-identity";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { sosPriorityStyle } from "@/sos/severity-palette";
import { useAdminRequestMissions } from "@/composables/use-admin-request-missions";
import {
  buildSosAlertsGeoJson,
  buildEligibleResponderGeoJson,
  formatResponderDistance,
  SOS_MAP_MARKER_COLORS,
  SOS_DIMMED_OPACITY,
  sosMapPriority,
  toggleSosQueueSelection,
  SOS_SEVERITY_PRESENTATION,
  SOS_STATUS_PRESENTATION
} from "@/admin/sos-alerts";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { MAP_POINT_META } from "@/components/map/map-point";
import MissionLivePanel from "@/components/mission/MissionLivePanel.vue";
import MissionTimelinePanel from "@/components/mission/MissionTimelinePanel.vue";
import { statusLabel } from "@/mission/timeline-presentation";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { needsOverlayRestore } from "@/map/overlay-restore";
import { shortestLongitudeBounds } from "@/map/longitude-bounds";
import { dispatchMapEdgeCues, type DispatchEdgeCue } from "@/admin/dispatch-map-edge";
import { dispatchSosLabelPlacement, type DispatchSosLabelPlacement } from "@/admin/dispatch-sos-label";
import { raiseDispatchLayers } from "@/admin/dispatch-map-layer-order";
import { placeResponderLabels, selectedSosPinBounds, visibleResponderLabelIds } from "@/admin/dispatch-responder-labels";
import { DISPATCH_PIN_IMAGES, DispatchPinCanvasUnavailable, ensureDispatchPinImages, refreshResponderPinImages, sosPinImage } from "@/admin/dispatch-map-pins";
import { pinia } from "@/stores";
import { useAdminSosStore } from "@/stores/admin-sos";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import AdminUserProfileDialog from "./AdminUserProfileDialog.vue";
import { dispatchDraggedHeight, dispatchSheetBounds, dispatchSheetShouldExpand } from "@/admin/dispatch-sheet-gesture";
import { dispatchMapPanelState } from "@/admin/dispatch-map-panel-state";

const sosSeverityKey = [
  { severity: "high", label: "فوری" },
  { severity: "medium", label: "متوسط" },
  { severity: "low", label: "کم‌خطر" }
] as const;

const SOS_SOURCE_ID = "admin-sos-requests";
const SOS_AURA_LAYER_ID = "admin-sos-selected-aura";
const SOS_PULSE_LAYER_ID = "admin-sos-pulse";
const SOS_CORE_LAYER_ID = "admin-sos-core";
const SOS_GLYPH_LAYER_ID = "admin-sos-glyph";
const SOS_PIN_LAYER_ID = "admin-sos-pin";
const SOS_SELECTED_CORE_LAYER_ID = "admin-sos-selected-core";
const SOS_SELECTED_GLYPH_LAYER_ID = "admin-sos-selected-glyph";
const SOS_SELECTED_PIN_LAYER_ID = "admin-sos-selected-pin";
const RESPONDER_SOURCE_ID = "admin-sos-nearby-rescuers";
const RESPONDER_DOT_LAYER_ID = "admin-sos-nearby-rescuers-dot";
const RESPONDER_LABEL_LAYER_ID = "admin-sos-nearby-rescuers-label";
const RESPONDER_PIN_LAYER_ID = "admin-sos-nearby-rescuers-pin";
const RESPONDER_SELECTED_SOURCE_ID = "admin-sos-selected-rescuers";
const RESPONDER_SELECTED_DOT_LAYER_ID = "admin-sos-selected-rescuers-dot";
const RESPONDER_SELECTED_GLYPH_LAYER_ID = "admin-sos-selected-rescuers-glyph";
const RESPONDER_SELECTED_PIN_LAYER_ID = "admin-sos-selected-rescuers-pin";
const RESPONDER_CLUSTER_LAYER_ID = "admin-sos-nearby-cluster";
const RESPONDER_COUNT_LAYER_ID = "admin-sos-nearby-cluster-count";
// MapLibre layer order is the canvas z-index: ordinary SOS < nearby helpers
// < selected SOS. The selected label is a DOM marker above responder labels.
const DISPATCH_LAYER_ORDER = [
  SOS_AURA_LAYER_ID, SOS_PULSE_LAYER_ID, SOS_CORE_LAYER_ID, SOS_GLYPH_LAYER_ID,
  SOS_PIN_LAYER_ID,
  RESPONDER_DOT_LAYER_ID, RESPONDER_CLUSTER_LAYER_ID, RESPONDER_LABEL_LAYER_ID,
  RESPONDER_PIN_LAYER_ID, RESPONDER_COUNT_LAYER_ID,
  RESPONDER_SELECTED_DOT_LAYER_ID, RESPONDER_SELECTED_GLYPH_LAYER_ID,
  RESPONDER_SELECTED_PIN_LAYER_ID,
  SOS_SELECTED_CORE_LAYER_ID, SOS_SELECTED_GLYPH_LAYER_ID, SOS_SELECTED_PIN_LAYER_ID
] as const;
type MapPointChoice = { kind: "sos" | "responder" | "cluster"; id: string; label: string;
  title?: string; clusterId?: number; coordinates?: [number, number] };
const mapPointChoices = ref<MapPointChoice[]>([]);

const route = useRoute();
const adminSos = useAdminSosStore(pinia);
const dispatchFilters = [
  { title: "در انتظار رسیدگی", value: "pending" },
  { title: "اعزام‌شده", value: "dispatched" },
  { title: "همه", value: "all" }
];
const auth = useAuthStore(pinia);
const senderProfileOpen = ref(false);
const profileUserId = ref<string | null>(null);
const requesterName = ref<string | null>(null);
const requesterLoading = ref(false);
const requesterFailed = ref(false);
const requesterRetry = ref(0);
const incidentAddress = ref<string | null>(null);
const addressLoading = ref(false);
const addressFailed = ref(false);
const addressRetry = ref(0);
const adminSession = computed(() => auth.user?.role === "admin"
  ? accountSessionKey(auth.user.id, auth.accessToken) : null);

// The SOS record has no username or postal address. Resolve both from the
// exact admin user endpoint and the approximate, same-origin reverse endpoint.
// Never let responses for another selection or admin session replace this one.
watch(() => [adminSos.selectedRequest?.requesterId, adminSession.value, requesterRetry.value] as const,
  ([userId, session], _previous, onCleanup) => {
    const controller = new AbortController();
    let active = true;
    onCleanup(() => { active = false; controller.abort(); });
    requesterName.value = null;
    requesterLoading.value = Boolean(userId && session);
    requesterFailed.value = false;
    if (!userId || !session) return;
    void (async () => {
      try {
        await auth.ensureSession();
        if (!active || adminSession.value !== session || !auth.accessToken) return;
        const profile = await getAdminUser(userId, auth.accessToken, controller.signal);
        if (active && adminSession.value === session && adminSos.selectedRequest?.requesterId === userId)
          requesterName.value = profile.username;
      } catch {
        if (active) requesterFailed.value = true;
      } finally {
        if (active) requesterLoading.value = false;
      }
    })();
  }, { immediate: true, flush: "sync" });
watch(() => [adminSos.selectedRequest?.id, adminSos.selectedRequest?.location.lat,
  adminSos.selectedRequest?.location.lon, adminSession.value, addressRetry.value] as const,
  ([id, lat, lon, session], _previous, onCleanup) => {
    const controller = new AbortController();
    let active = true;
    onCleanup(() => { active = false; controller.abort(); });
    incidentAddress.value = null;
    addressLoading.value = Boolean(id && lat !== undefined && lon !== undefined && session);
    addressFailed.value = false;
    if (!id || lat === undefined || lon === undefined || !session) return;
    void reversePlace({ lat, lon }, controller.signal).then((result) => {
      if (active && adminSession.value === session && adminSos.selectedRequest?.id === id)
        incidentAddress.value = result?.formattedAddress ?? null;
    }).catch((error: unknown) => {
      if (active && (error as { name?: unknown } | null)?.name !== "AbortError") addressFailed.value = true;
    }).finally(() => { if (active) addressLoading.value = false; });
  }, { immediate: true, flush: "sync" });
const photoDialogOpen = ref(false);
const photoOpenLoading = ref(false);
const photoOpenError = ref<string | null>(null);
let photoOpenGeneration = 0;
watch(() => adminSos.selectedRequest?.id, () => {
  senderProfileOpen.value = false;
  profileUserId.value = null;
  photoDialogOpen.value = false;
  photoOpenError.value = null;
  photoOpenLoading.value = false;
  photoOpenGeneration++;
}, { flush: "sync" });
watch(() => auth.accessToken, () => {
  photoOpenGeneration++;
  photoOpenLoading.value = false;
  photoOpenError.value = null;
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
const photoRetryNonce = ref(0);
watch(photoSrc, (src) => { if (!src) photoDialogOpen.value = false; }, { flush: "sync" });
watch(
  () => [adminSos.selectedRequest?.id, adminSos.selectedRequest?.photoUrl, auth.accessToken, photoRetryNonce.value] as const,
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

async function openPhoto(): Promise<void> {
  const requestId = adminSos.selectedRequest?.id;
  const token = auth.accessToken;
  if (!requestId || !token || photoOpenLoading.value) return;
  const generation = ++photoOpenGeneration;
  photoOpenLoading.value = true;
  photoOpenError.value = null;
  try {
    // Photo access URLs expire after 60 seconds. Issue a fresh URL for the full image.
    const src = await getSosPhotoSrc(requestId, token);
    if (generation !== photoOpenGeneration || adminSos.selectedRequest?.id !== requestId || auth.accessToken !== token) return;
    photoSrc.value = src;
    photoDialogOpen.value = true;
  } catch {
    if (generation === photoOpenGeneration) photoOpenError.value = "تصویر کامل بارگذاری نشد؛ دوباره تلاش کنید.";
  } finally {
    if (generation === photoOpenGeneration) photoOpenLoading.value = false;
  }
}

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
// Manual username lookup is not a location search. Use only the verified,
// incident-matched nearest list, never arbitrary account coordinates.
const nearbyFeatures = computed(() => buildEligibleResponderGeoJson(
  adminSos.selectedRequest && adminSos.nearestRequestId === adminSos.selectedRequest.id &&
    adminSos.nearestLoaded && !adminSos.responderSearch
    ? adminSos.nearestResponders : [], adminSos.selectedResponderIds
));
// SOS and qualified responders are searched locally. Admin accounts use the
// authenticated admin endpoint; place and POI queries use the same-origin gateway.
const mapSearch = ref("");
const searchedPlaces = ref<GeocodeResult[]>([]);
const searchedUsers = ref<UserProfile[]>([]);
const usersLoading = ref(false);
const usersError = ref(false);
let userSearchController: AbortController | null = null;
const placesLoading = ref(false);
const placesError = ref(false);
const searchQuery = computed(() => (mapSearch.value ?? "").trim());
let placeSearchController: AbortController | null = null;
let placeSearchTimer: ReturnType<typeof setTimeout> | null = null;
const matchedRequests = computed(() => {
  const q = searchQuery.value.toLocaleLowerCase();
  if (q.length < 2) return [];
  return adminSos.requests.filter((item) =>
    [item.id, item.requesterId, incidentLabel(item.incidentTypeId), item.description]
      .some((value) => value.toLocaleLowerCase().includes(q))).slice(0, 8);
});
const matchedResponders = computed(() => {
  const q = searchQuery.value.replace(/^@/, "").toLocaleLowerCase();
  if (q.length < 2 || !adminSos.nearestLoaded) return [];
  return adminSos.nearestResponders.filter((item) => item.username.toLocaleLowerCase().includes(q)).slice(0, 8);
});
async function findPlaces(query: string, controller: AbortController): Promise<void> {
  placesLoading.value = true;
  placesError.value = false;
  try {
    const results = await searchPlaces({ q: query, limit: 8 }, controller.signal);
    if (!controller.signal.aborted) searchedPlaces.value = results;
  } catch {
    if (!controller.signal.aborted) placesError.value = true;
  } finally {
    if (!controller.signal.aborted) placesLoading.value = false;
  }
}
function retryPlaceSearch(): void {
  const query = searchQuery.value;
  // An explicit @username lookup never sends the account name to the place gateway.
  if (query.length < 2 || query.startsWith("@")) return;
  placeSearchController?.abort();
  placeSearchController = new AbortController();
  void findPlaces(query, placeSearchController);
}
async function findUsers(query: string, controller: AbortController): Promise<void> {
  const token = auth.accessToken;
  if (!token || query.length > 30) return;
  usersLoading.value = true;
  usersError.value = false;
  try {
    const response = await listAdminUsers({ q: query, page: 1, limit: 8 }, token, controller.signal);
    if (!controller.signal.aborted && token === auth.accessToken) searchedUsers.value = response.items;
  } catch {
    if (!controller.signal.aborted) usersError.value = true;
  } finally {
    if (!controller.signal.aborted) usersLoading.value = false;
  }
}
function retryUserSearch(): void {
  const query = searchQuery.value.replace(/^@/, "");
  if (query.length < 2 || query.length > 30) return;
  userSearchController?.abort();
  userSearchController = new AbortController();
  void findUsers(query, userSearchController);
}
watch([mapSearch, () => auth.accessToken], () => {
  if (placeSearchTimer) clearTimeout(placeSearchTimer);
  placeSearchController?.abort();
  userSearchController?.abort();
  searchedPlaces.value = [];
  searchedUsers.value = [];
  placesLoading.value = false;
  placesError.value = false;
  usersLoading.value = false;
  usersError.value = false;
  if (searchQuery.value.length < 2) return;
  placeSearchTimer = setTimeout(() => { retryPlaceSearch(); retryUserSearch(); }, 350);
});
function selectSearchRequest(item: SosRequestRecord): void {
  if (!adminSos.visibleRequests.some((request) => request.id === item.id)) adminSos.setFilterStatus("all");
  focusRequest(item);
  mapSearch.value = "";
}
function focusSearchResponder(id: string): void {
  // Only verified, incident-matched coordinates are navigable on the map.
  const feature = nearbyFeatures.value.features.find((item) => item.id === id);
  if (feature) mapInstance?.flyTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(mapInstance.getZoom(), 14) });
  else focusResponders();
  mapSearch.value = "";
}
function focusSearchUser(user: UserProfile): void {
  const incident = adminSos.requests.find((item) => item.requesterId === user.id);
  if (incident) selectSearchRequest(incident);
  else if (nearbyFeatures.value.features.some((feature) => feature.id === user.id)) focusSearchResponder(user.id);
  else {
    // A user account is not a map coordinate. Only incident and verified
    // responder positions can be mapped; otherwise open the exact profile.
    profileUserId.value = user.id;
    senderProfileOpen.value = true;
    mapSearch.value = "";
  }
}
function searchUsernameOnMap(): void {
  responderSearchInput.value = searchQuery.value.replace(/^@/, "");
  searchResponders();
  focusResponders();
  mapSearch.value = "";
}
let placeMarker: MapLibreMarker | null = null;
function focusSearchPlace(place: GeocodeResult): void {
  const map = mapInstance;
  if (!map) return;
  placeMarker?.remove();
  if (mapLabelMarkerClass) {
    const marker = document.createElement("div");
    marker.id = "dispatch-place-marker";
    marker.className = "dispatch-place-marker";
    marker.setAttribute("role", "img");
    marker.setAttribute("aria-label", `مکان جست‌وجوشده: ${place.name}`);
    const title = document.createElement("span");
    title.textContent = place.name;
    marker.append(title);
    placeMarker = new mapLabelMarkerClass({ element: marker, anchor: "bottom" })
      .setLngLat([place.lon, place.lat]).addTo(map);
  }
  map.flyTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), 15) });
  mapSearch.value = "";
}
const responderSearchInput = ref("");
const helpDialogOpen = ref(false);
const soundSettingsOpen = ref(false);
const soundTestError = ref<string | null>(null);
async function testSound(): Promise<void> {
  soundTestError.value = null;
  if (!await adminSos.testAlertSound()) {
    soundTestError.value = "پخش صدای آزمایشی ممکن نشد؛ صدای دستگاه و مجوز پخش مرورگر را بررسی کنید. هشدار دیداری همچنان فعال است.";
  }
}
const compactDispatch = useMediaQuery("(max-width: 900px)");
const sheetExpanded = ref(false);
const dispatchSidebar = ref<HTMLElement | null>(null);
const sheetDragHeight = ref<number | null>(null);
const sheetDragging = ref(false);
type SheetPointer = { id: number; startY: number; startHeight: number;
  lastY: number; lastTime: number; velocityY: number;
  bounds: { peek: number; expanded: number }; moved: boolean };
let sheetPointer: SheetPointer | null = null;
let suppressSheetClick = false;
let suppressSheetClickTimer: ReturnType<typeof setTimeout> | null = null;

function setSheetExpanded(expanded: boolean): void {
  sheetExpanded.value = expanded;
  sheetDragHeight.value = null;
}
function startSheetDrag(event: PointerEvent): void {
  if (!compactDispatch.value || !event.isPrimary || event.button !== 0 || sheetPointer) return;
  const sidebar = dispatchSidebar.value;
  if (!sidebar) return;
  const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  // The compact search panel sits at 1rem + the top safe area. Read its
  // resolved inset so gesture bounds match the sheet's CSS on notched phones.
  const search = document.getElementById("dispatch-search");
  const searchTop = search ? parseFloat(getComputedStyle(search).top) : NaN;
  const safeAreaTop = Number.isFinite(searchTop) ? Math.max(0, searchTop - fontSize) : 0;
  sheetPointer = { id: event.pointerId, startY: event.clientY, startHeight: sidebar.getBoundingClientRect().height,
    lastY: event.clientY, lastTime: event.timeStamp, velocityY: 0,
    bounds: dispatchSheetBounds(window.innerHeight, fontSize, safeAreaTop), moved: false };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function moveSheetDrag(event: PointerEvent): void {
  const pointer = sheetPointer;
  if (!pointer || pointer.id !== event.pointerId || !compactDispatch.value) return;
  if (!pointer.moved && Math.abs(event.clientY - pointer.startY) < 6) return;
  pointer.moved = true;
  sheetDragging.value = true;
  sheetDragHeight.value = dispatchDraggedHeight(pointer.startHeight, pointer.startY, event.clientY, pointer.bounds);
  if (event.timeStamp > pointer.lastTime) {
    pointer.velocityY = (event.clientY - pointer.lastY) / (event.timeStamp - pointer.lastTime);
    pointer.lastY = event.clientY;
    pointer.lastTime = event.timeStamp;
  }
  event.preventDefault();
}
function endSheetDrag(event: PointerEvent): void {
  const pointer = sheetPointer;
  if (!pointer || pointer.id !== event.pointerId) return;
  const handle = event.currentTarget as HTMLElement;
  sheetPointer = null;
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  if (pointer.moved) {
    const height = dispatchDraggedHeight(pointer.startHeight, pointer.startY, event.clientY, pointer.bounds);
    const velocity = event.timeStamp - pointer.lastTime > 120 ? 0 : pointer.velocityY;
    setSheetExpanded(dispatchSheetShouldExpand(height, event.clientY - pointer.startY, velocity, pointer.bounds));
    // Pointer capture may synthesize a click on the handle after release.
    suppressSheetClick = true;
    if (suppressSheetClickTimer) clearTimeout(suppressSheetClickTimer);
    suppressSheetClickTimer = setTimeout(() => { suppressSheetClick = false; suppressSheetClickTimer = null; }, 0);
  }
  sheetDragging.value = false;
}
function cancelSheetDrag(event: PointerEvent): void {
  if (!sheetPointer || sheetPointer.id !== event.pointerId) return;
  sheetPointer = null;
  sheetDragHeight.value = null;
  sheetDragging.value = false;
}
function clickSheetHandle(): void {
  if (suppressSheetClick) return;
  setSheetExpanded(!sheetExpanded.value);
}
watch(compactDispatch, (compact) => {
  sheetPointer = null;
  sheetDragHeight.value = null;
  sheetDragging.value = false;
  sheetExpanded.value = false;
  if (compact && adminSos.selectedId) {
    soundSettingsOpen.value = false;
    helpDialogOpen.value = false;
  }
});
// The selected SOS is the only mobile step state. Reset the shared scrollport
// whenever selection changes, including changes from the map or a deep link.
watch(() => adminSos.selectedId, (selectedId) => {
  if (!compactDispatch.value) return;
  if (selectedId) {
    soundSettingsOpen.value = false;
    helpDialogOpen.value = false;
  }
  const active = document.activeElement;
  const focusedInHiddenSection = active instanceof HTMLElement &&
    active.closest(selectedId ? "#dispatch-queue-region, #dispatch-header-01" : "#dispatch-nearby");
  void nextTick(() => {
    const content = document.getElementById("dispatch-sidebar-content");
    if (content) content.scrollTop = 0;
    if (focusedInHiddenSection) document.getElementById(selectedId
      ? adminSos.selectedRequest ? "dispatch-responders" : "dispatch-action-30"
      : "dispatch-queue")?.focus({ preventScroll: true });
  });
});
const incidentExpanded = ref(!compactDispatch.value);
watch(compactDispatch, (compact) => { incidentExpanded.value = !compact; });
// With no incident selected, search stays available even over an expanded
// worklist. Open incident details take the search slot at the top of the map.
const mapPanelState = computed(() => dispatchMapPanelState(compactDispatch.value, !!adminSos.selectedRequest,
  sheetExpanded.value, sheetDragging.value, incidentExpanded.value));
const incidentAtMapTop = computed(() => mapPanelState.value.incidentAtTop);
const hideDispatchSearch = computed(() => mapPanelState.value.hideSearch);
watch(hideDispatchSearch, (hidden) => {
  if (!hidden) return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && document.getElementById("dispatch-search")?.contains(active)) {
    document.getElementById(sheetExpanded.value ? "dispatch-sheet-handle" : "dispatch-incident-toggle")?.focus({ preventScroll: true });
  }
}, { flush: "sync" });
function collapseSheetForIncident(): void {
  if (compactDispatch.value && sheetExpanded.value) setSheetExpanded(false);
}
function toggleIncidentPanel(): void {
  // An open worklist obscures the map. Tapping the incident moves to its
  // details: first return the sheet to peek, then show (not hide) the details.
  const wasExpandedSheet = compactDispatch.value && sheetExpanded.value;
  collapseSheetForIncident();
  incidentExpanded.value = wasExpandedSheet || !incidentExpanded.value;
  if (!incidentExpanded.value) {
    photoDialogOpen.value = false;
    showLivePanel.value = false;
  }
  frameSelectedIncident();
}
const showLivePanel = ref(false);
const manualDispatchConfirmation = ref(false);
// Visible rows already show their selection. Keep removable chips only for
// selections retained across a refresh or a different manual-search query.
const hiddenSelectedResponderIds = computed(() => adminSos.selectedResponderIds.filter((id) =>
  !adminSos.nearestResponders.some((responder) => responder.userId === id)));
const selectedDispatchWarnings = computed(() => adminSos.selectedResponderIds
  .filter((id) => !!adminSos.selectedResponderWarnings[id])
  .map((id) => ({ id, username: adminSos.selectedResponderNames[id] ?? id,
    warning: adminSos.selectedResponderWarnings[id]! })));
watch(() => adminSos.selectedId, () => {
  responderSearchInput.value = "";
  manualDispatchConfirmation.value = false;
  showLivePanel.value = false;
  incidentExpanded.value = !compactDispatch.value;
}, { flush: "sync" });
function dismissDispatchFeedback(isOpen: boolean): void {
  if (!isOpen) adminSos.dispatchFeedback = null;
}
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
let mapLabelMarkerClass: typeof import("maplibre-gl").Marker | null = null;
let selectedSosLabelMarker: MapLibreMarker | null = null;
const responderLabelMarkers = new Map<string, { marker: MapLibreMarker; coordinates: [number, number]; selected: boolean }>();
let pulseAnimationFrame: number | null = null;
let lastPulseUpdateAt = 0;
let detachMapEvents: (() => void) | null = null;
const mapEdgeCues = ref<DispatchEdgeCue[]>([]);
const legendOpen = ref(false);
const edgeCueDirectionLabel = { top: "بالا", bottom: "پایین", left: "چپ", right: "راست" } as const;

type DispatchLabelSide = DispatchSosLabelPlacement["side"];

function setDispatchLabelSide(element: HTMLElement, chip: HTMLElement, x: number, width: number, side: DispatchLabelSide): void {
  element.classList.toggle("dispatch-sos-label-anchor--left", side === "left");
  const centered = side === "below" || side === "above";
  element.classList.toggle("dispatch-sos-label-anchor--center", centered);
  element.classList.toggle("dispatch-sos-label-anchor--above", side === "above");
  element.classList.toggle("dispatch-sos-label-anchor--below", side === "below");
  // Shift centered chips into the viewport without detaching their necks.
  const left = x - chip.offsetWidth / 2;
  const shift = Math.max(8 - left, Math.min(0, width - 8 - chip.offsetWidth - left));
  element.style.setProperty("--dispatch-sos-label-shift", `${Math.round(centered ? shift : 0)}px`);
}

function positionDispatchLabel(map: MapLibreMap, marker: MapLibreMarker, coordinates: [number, number]): DispatchLabelSide | null {
  const element = marker.getElement();
  const chip = element.firstElementChild as HTMLElement | null;
  if (!chip) return null;
  // A previously offscreen marker is display:none; reveal it synchronously to
  // measure the real text width before choosing a side on re-entry.
  element.hidden = false;
  const canvas = map.getCanvas();
  const pinLayer = element.classList.contains("dispatch-responder-label-anchor")
    ? RESPONDER_PIN_LAYER_ID : SOS_PIN_LAYER_ID;
  const hasPin = Boolean(map.getLayer(pinLayer));
  element.classList.toggle("dispatch-label-anchor--circle", !hasPin);
  chip.style.maxWidth = `${Math.max(64, Math.min(192, canvas.clientWidth - 60))}px`;
  const pixel = map.project(coordinates);
  const placement = dispatchSosLabelPlacement(pixel.x, pixel.y, canvas.clientWidth, canvas.clientHeight,
    chip.offsetWidth, chip.offsetHeight, hasPin ? -35 : 0);
  element.hidden = !placement.visible;
  setDispatchLabelSide(element, chip, pixel.x, canvas.clientWidth, placement.side);
  return placement.visible ? placement.side : null;
}

function updateSelectedSosLabelPosition(): void {
  const map = mapInstance, marker = selectedSosLabelMarker;
  const incident = adminSos.visibleRequests.find((item) => item.id === adminSos.selectedId);
  if (map && marker && incident) positionDispatchLabel(map, marker, [incident.location.lon, incident.location.lat]);
}

/** MapLibre controls the actual pins and cluster membership. These zero-sized
 * DOM markers only paint the same one-sided chip as SOS at rendered pin IDs. */
function clearResponderLabels(): void {
  for (const { marker } of responderLabelMarkers.values()) marker.remove();
  responderLabelMarkers.clear();
}

/** Only the chip is a hit target: don't let a label click (or a drag starting
 * on it) also activate the WebGL pin or pan the map underneath. */
function stopLabelMapEvents(chip: HTMLButtonElement): void {
  for (const type of ["pointerdown", "mousedown", "touchstart", "dblclick", "keydown"])
    chip.addEventListener(type, (event) => event.stopPropagation());
}

function positionResponderLabels(map: MapLibreMap): void {
  const canvas = map.getCanvas();
  const viewport = canvas.getBoundingClientRect();
  const candidates: { id: string; selected: boolean; preferred: DispatchLabelSide }[] = [];
  for (const [id, { marker, coordinates, selected }] of responderLabelMarkers) {
    const preferred = positionDispatchLabel(map, marker, coordinates);
    if (preferred) candidates.push({ id, selected, preferred });
  }
  const sos = selectedSosLabelMarker?.getElement();
  const sosChip = sos && !sos.hidden ? sos.firstElementChild as HTMLElement | null : null;
  const reserved: { left: number; right: number; top: number; bottom: number }[] =
    sosChip ? [sosChip.getBoundingClientRect()] : [];
  const incident = adminSos.visibleRequests.find((item) => item.id === adminSos.selectedId);
  if (incident) {
    const pin = map.project([incident.location.lon, incident.location.lat]);
    const pinReady = Boolean(map.getLayer(SOS_SELECTED_PIN_LAYER_ID));
    reserved.push(selectedSosPinBounds(viewport.left + pin.x, viewport.top + pin.y, pinReady));
  }
  const visible = placeResponderLabels(candidates, (id, side) => {
    const entry = responderLabelMarkers.get(id)!;
    const element = entry.marker.getElement();
    const chip = element.firstElementChild as HTMLElement;
    const pixel = map.project(entry.coordinates);
    setDispatchLabelSide(element, chip, pixel.x, canvas.clientWidth, side);
    const box = chip.getBoundingClientRect();
    // A side whose measured chip would clip at a map edge is not an option.
    if (box.width <= 0 || box.height <= 0 || box.left < viewport.left + 8 ||
      box.right > viewport.right - 8 || box.top < viewport.top + 8 ||
      box.bottom > viewport.bottom - 8) return null;
    return box;
  }, reserved);
  for (const candidate of candidates) responderLabelMarkers.get(candidate.id)!.marker.getElement().hidden =
    !visible.has(candidate.id);
}

function syncResponderLabels(): void {
  const map = mapInstance;
  if (!map || !mapLabelMarkerClass || !map.getStyle()) { clearResponderLabels(); return; }
  const layers = [RESPONDER_PIN_LAYER_ID, RESPONDER_DOT_LAYER_ID,
    RESPONDER_SELECTED_PIN_LAYER_ID, RESPONDER_SELECTED_DOT_LAYER_ID]
    .filter((id) => Boolean(map.getLayer(id)));
  if (!layers.length) { clearResponderLabels(); return; }
  const current = new Map(nearbyFeatures.value.features.map((feature) => [String(feature.id), feature]));
  // A cluster is never a named individual. The selected source remains visible
  // even if the same responder belongs to a nearby cluster; deduplicate by ID.
  const visible = visibleResponderLabelIds(map.queryRenderedFeatures({ layers }),
    new Set(current.keys()), new Set(layers));
  for (const [id, entry] of responderLabelMarkers) {
    if (visible.has(id)) continue;
    entry.marker.remove();
    responderLabelMarkers.delete(id);
  }
  for (const id of visible) {
    const feature = current.get(id);
    if (!feature) continue;
    const coordinates = feature.geometry.coordinates;
    let entry = responderLabelMarkers.get(id);
    if (!entry) {
      const element = document.createElement("div");
      element.className = "dispatch-sos-label-anchor dispatch-responder-label-anchor";
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dispatch-sos-label dispatch-responder-label";
      chip.dir = "auto";
      stopLabelMapEvents(chip);
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        activateMapChoice({ kind: "responder", id, label: "" });
      });
      element.append(chip);
      const marker = new mapLabelMarkerClass({ element, anchor: "center" })
        .setLngLat(coordinates).addTo(map);
      entry = { marker, coordinates, selected: feature.properties.isSelected };
      responderLabelMarkers.set(id, entry);
    } else {
      if (entry.coordinates[0] !== coordinates[0] || entry.coordinates[1] !== coordinates[1])
        entry.marker.setLngLat(coordinates);
      entry.coordinates = coordinates;
      entry.selected = feature.properties.isSelected;
    }
    const element = entry.marker.getElement();
    const chip = element.firstElementChild as HTMLElement;
    chip.textContent = feature.properties.username; // No HTML from server-provided usernames.
    chip.setAttribute("aria-pressed", String(feature.properties.isSelected));
    chip.setAttribute("aria-label", `${feature.properties.isSelected ? "لغو انتخاب" : "انتخاب"} امدادگر نزدیک ${feature.properties.username}`);
    element.style.setProperty("--dispatch-label-color", themeStore.isDark ? "#205fd1" : "#0868c8");
  }
  positionResponderLabels(map);
}

function syncSelectedSosLabel(): void {
  const map = mapInstance;
  const incident = adminSos.visibleRequests.find((item) => item.id === adminSos.selectedId);
  if (!map || !mapLabelMarkerClass || !incident) {
    selectedSosLabelMarker?.remove();
    selectedSosLabelMarker = null;
    return;
  }
  if (!selectedSosLabelMarker) {
    const element = document.createElement("div");
    element.className = "dispatch-sos-label-anchor";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "dispatch-sos-label";
    chip.dir = "auto";
    stopLabelMapEvents(chip);
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      const selected = adminSos.selectedRequest;
      if (selected) activateMapChoice({ kind: "sos", id: selected.id, label: "" });
    });
    element.append(chip);
    selectedSosLabelMarker = new mapLabelMarkerClass({ element, anchor: "center" })
      .setLngLat([incident.location.lon, incident.location.lat]).addTo(map);
  } else selectedSosLabelMarker.setLngLat([incident.location.lon, incident.location.lat]);
  const element = selectedSosLabelMarker.getElement();
  const chip = element.firstElementChild as HTMLElement | null;
  if (chip) {
    chip.textContent = incidentLabel(incident.incidentTypeId); // Never interpret catalog names as HTML.
    chip.setAttribute("aria-pressed", "true");
    chip.setAttribute("aria-label", `لغو انتخاب حادثه ${incidentLabel(incident.incidentTypeId)}`);
  }
  element.style.setProperty("--dispatch-label-color", SOS_MAP_MARKER_COLORS[sosMapPriority(incident.status, incident.severity)]);
  updateSelectedSosLabelPosition();
}

function edgeCueColor(cue: DispatchEdgeCue): string {
  if (cue.kind === "responder") return themeStore.isDark ? "#205fd1" : "#0868c8";
  const incident = adminSos.visibleRequests.find((item) => item.id === cue.id);
  return incident ? SOS_MAP_MARKER_COLORS[sosMapPriority(incident.status, incident.severity)] : SOS_MAP_MARKER_COLORS.high;
}
function updateMapEdgeCues(): void {
  const map = mapInstance;
  if (!map) { mapEdgeCues.value = []; return; }
  updateSelectedSosLabelPosition();
  positionResponderLabels(map);
  const canvas = map.getCanvas();
  const incident = adminSos.visibleRequests.find((item) => item.id === adminSos.selectedId);
  const points = [
    ...(incident ? [{ kind: "sos" as const, id: incident.id, label: incidentLabel(incident.incidentTypeId),
      coordinates: [incident.location.lon, incident.location.lat] as [number, number], selected: true }] : []),
    ...nearbyFeatures.value.features.map((feature) => ({ kind: "responder" as const, id: String(feature.id),
      label: feature.properties.username, coordinates: feature.geometry.coordinates,
      selected: feature.properties.isSelected }))
  ];
  mapEdgeCues.value = dispatchMapEdgeCues(canvas.clientWidth, canvas.clientHeight, points.map((point) => {
    const pixel = map.project(point.coordinates);
    return { kind: point.kind, id: point.id, label: point.label,
      selected: point.selected, x: pixel.x, y: pixel.y };
  }));
}
function focusEdgeCue(cue: DispatchEdgeCue): void {
  if (cue.kind === "sos") {
    const selected = adminSos.visibleRequests.find((item) => item.id === adminSos.selectedId);
    if (selected?.id === cue.id) focusRequest(selected);
  } else if (nearbyFeatures.value.features.some((feature) => feature.id === cue.id)) focusNearbyResponder(cue.id);
}

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

function formatQueueTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const persianYear = new Intl.DateTimeFormat("fa-IR", { year: "numeric" });
  return parsed.toLocaleString("fa-IR", {
    ...(persianYear.format(parsed) === persianYear.format(new Date()) ? {} : { year: "numeric" as const }),
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function onFilterChange(value: unknown): void {
  if (value === "pending" || value === "dispatched" || value === "all") {
    adminSos.setFilterStatus(value);
  }
}

type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];
let pinImagesSupported = true;
function registerPins(map: MapLibreMap): void {
  if (!pinImagesSupported) return;
  try { ensureDispatchPinImages(map, themeStore.isDark); }
  catch (error) {
    if (error instanceof DispatchPinCanvasUnavailable) pinImagesSupported = false; // Circle fallback.
    else throw error; // A style swap is temporary: retry once MapLibre finishes loading.
  }
}

function ensureResponderMapLayers(map: MapLibreMap): void {
  const data = nearbyFeatures.value as unknown as GeoJsonSourceData;
  const existing = map.getSource(RESPONDER_SOURCE_ID) as GeoJSONSource | undefined;
  if (existing) existing.setData(data);
  else map.addSource(RESPONDER_SOURCE_ID, { type: "geojson", data,
    cluster: true, clusterRadius: 42, clusterMaxZoom: 18 });
  // A selected rescuer must remain individually visible and named even when
  // the nearby source clusters several fixes at the same zoom. Only currently
  // qualified responders enter this unclustered source, never manual search.
  const selectedData = { type: "FeatureCollection" as const,
    features: nearbyFeatures.value.features.filter((feature) => feature.properties.isSelected) };
  const selectedSource = map.getSource(RESPONDER_SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
  if (selectedSource) selectedSource.setData(selectedData as unknown as GeoJsonSourceData);
  else map.addSource(RESPONDER_SELECTED_SOURCE_ID, {
    type: "geojson", data: selectedData as unknown as GeoJsonSourceData
  });
  registerPins(map);
  const pinReady = pinImagesSupported && Object.values(DISPATCH_PIN_IMAGES).every((id) => map.hasImage(id));
  // White glyphs must remain legible on both basemaps; the theme's pale dark-mode
  // primary is designed for dark text and cannot safely carry a white map symbol.
  const responderPin = themeStore.isDark ? "#205fd1" : "#0868c8";
  // On partial style restoration, insert helpers after ordinary SOS layers but
  // before the selected SOS. The order pass also fixes preserved style layers.
  const before = map.getLayer(SOS_SELECTED_CORE_LAYER_ID) ? SOS_SELECTED_CORE_LAYER_ID : undefined;
  if (!map.getLayer(RESPONDER_DOT_LAYER_ID)) map.addLayer({
    id: RESPONDER_DOT_LAYER_ID, type: "circle", source: RESPONDER_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": responderPin,
      "circle-opacity": pinReady ? 0 : 1,
      "circle-stroke-opacity": pinReady ? 0 : 1,
      "circle-radius": ["case", ["boolean", ["get", "isSelected"], false], 15, 13],
      "circle-stroke-color": ["case", ["boolean", ["get", "isSelected"], false], "#f7b632", "#ffffff"],
      "circle-stroke-width": ["case", ["boolean", ["get", "isSelected"], false], 3.5, 2.5]
    }
  }, before);
  if (!map.getLayer(RESPONDER_CLUSTER_LAYER_ID)) map.addLayer({
    id: RESPONDER_CLUSTER_LAYER_ID, type: "circle", source: RESPONDER_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: { "circle-color": responderPin,
      "circle-radius": ["step", ["get", "point_count"], 19, 10, 22, 100, 25],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 }
  }, before);
  if (!map.getLayer(RESPONDER_LABEL_LAYER_ID)) map.addLayer({
    id: RESPONDER_LABEL_LAYER_ID, type: "symbol", source: RESPONDER_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: { "text-field": MAP_POINT_META.nearby.glyph, "text-font": ["Borobiya Vazirmatn"],
      "text-size": 18, "text-allow-overlap": true },
    paint: { "text-color": "#ffffff", "text-opacity": pinReady ? 0 : 1 }
  }, before);
  if (pinReady && !map.getLayer(RESPONDER_PIN_LAYER_ID)) map.addLayer({
    id: RESPONDER_PIN_LAYER_ID, type: "symbol", source: RESPONDER_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: { "icon-image": DISPATCH_PIN_IMAGES.helper, "icon-anchor": "bottom",
      "icon-size": .72, "icon-offset": [0, 4], "icon-allow-overlap": true, "icon-ignore-placement": true }
  }, before);
  if (!map.getLayer(RESPONDER_COUNT_LAYER_ID)) map.addLayer({
    id: RESPONDER_COUNT_LAYER_ID, type: "symbol", source: RESPONDER_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: { "text-field": ["to-string", ["get", "point_count"]],
      "text-font": ["Borobiya Vazirmatn"], "text-size": 16, "text-allow-overlap": true },
    // Martin supplies the regular face only. A tight same-color halo gives the
    // numeral a semibold stroke without requesting a missing bold font stack.
    paint: { "text-color": "#ffffff", "text-halo-color": "#ffffff", "text-halo-width": .8 }
  }, before);
  // Keep the selected fix above the cluster count and unselected SOS points;
  // only the selected SOS retains priority at coincident coordinates.
  if (!map.getLayer(RESPONDER_SELECTED_DOT_LAYER_ID)) map.addLayer({
    id: RESPONDER_SELECTED_DOT_LAYER_ID, type: "circle", source: RESPONDER_SELECTED_SOURCE_ID,
    paint: { "circle-color": responderPin, "circle-radius": 15,
      "circle-opacity": pinReady ? 0 : 1,
      "circle-stroke-opacity": pinReady ? 0 : 1,
      "circle-stroke-color": "#f7b632", "circle-stroke-width": 3.5 }
  }, before);
  if (!map.getLayer(RESPONDER_SELECTED_GLYPH_LAYER_ID)) map.addLayer({
    id: RESPONDER_SELECTED_GLYPH_LAYER_ID, type: "symbol", source: RESPONDER_SELECTED_SOURCE_ID,
    layout: { "text-field": MAP_POINT_META.nearby.glyph, "text-font": ["Borobiya Vazirmatn"],
      "text-size": 18, "text-allow-overlap": true },
    paint: { "text-color": "#ffffff", "text-opacity": pinReady ? 0 : 1 }
  }, before);
  if (pinReady && !map.getLayer(RESPONDER_SELECTED_PIN_LAYER_ID)) map.addLayer({
    id: RESPONDER_SELECTED_PIN_LAYER_ID, type: "symbol", source: RESPONDER_SELECTED_SOURCE_ID,
    layout: { "icon-image": DISPATCH_PIN_IMAGES.selectedHelper, "icon-anchor": "bottom",
      "icon-size": .76, "icon-offset": [0, 4], "icon-allow-overlap": true, "icon-ignore-placement": true }
  }, before);
}

function ensureSosMapLayers(map: MapLibreMap): void {
  const alerts = buildSosAlertsGeoJson(adminSos.visibleRequests, adminSos.selectedId);
  // The selected incident title is a single DOM label with an opaque surface;
  // GeoJSON carries only actual SOS points, not an unbacked WebGL text glyph.
  const data = { ...alerts, features: alerts.features.map((feature) => ({
    ...feature, properties: { ...feature.properties,
      pinImage: sosPinImage(feature.properties.status, feature.properties.severity, feature.properties.isSelected) }
  })) };
  registerPins(map);
  const pinReady = pinImagesSupported && Object.values(DISPATCH_PIN_IMAGES).every((id) => map.hasImage(id));
  const existingSource = map.getSource(SOS_SOURCE_ID) as GeoJSONSource | undefined;
  if (!existingSource) {
    map.addSource(SOS_SOURCE_ID, {
      type: "geojson",
      data: data as unknown as GeoJsonSourceData
    });
  } else {
    existingSource.setData(data as unknown as GeoJsonSourceData);
  }

  // The selected SOS has a soft stationary aura in its actual priority hue,
  // including when reduced motion disables pulse animation.
  if (!map.getLayer(SOS_AURA_LAYER_ID)) map.addLayer({
    id: SOS_AURA_LAYER_ID, type: "circle", source: SOS_SOURCE_ID,
    filter: ["==", ["get", "isSelected"], true],
    paint: { "circle-color": ["get", "color"], "circle-radius": 23,
      "circle-opacity": .08, "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 3, "circle-stroke-opacity": .06,
      "circle-translate": pinReady ? [0, -35] : [0, 0],
      "circle-translate-anchor": "viewport" }
  });

  if (!map.getLayer(SOS_PULSE_LAYER_ID)) {
    map.addLayer({
      id: SOS_PULSE_LAYER_ID,
      type: "circle",
      source: SOS_SOURCE_ID,
      // The selected pin and its attached title already carry the emphasis;
      // avoid a large animated ring behind the compact joined marker.
      filter: ["==", ["get", "isSelected"], false],
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 18,
        // The canvas pin's head is ~35px above its geographic tip. In the
        // no-canvas circle fallback, the head is centered on the coordinate.
        "circle-translate": pinReady ? [0, -35] : [0, 0],
        "circle-translate-anchor": "viewport",
        "circle-opacity": ["case", ["boolean", ["get", "isDimmed"], false], 0.35 * SOS_DIMMED_OPACITY, 0.35]
      }
    });
  }

  if (!map.getLayer(SOS_CORE_LAYER_ID)) {
    map.addLayer({
      id: SOS_CORE_LAYER_ID,
      type: "circle",
      source: SOS_SOURCE_ID,
      filter: ["==", ["get", "isSelected"], false],
      paint: {
        "circle-color": ["get", "color"],
        "circle-opacity": pinReady ? 0 : ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1],
        "circle-stroke-opacity": pinReady ? 0 : ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1],
        "circle-radius": 12,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff"
      }
    });
  }
  if (!map.getLayer(SOS_GLYPH_LAYER_ID)) map.addLayer({
    id: SOS_GLYPH_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID,
    filter: ["==", ["get", "isSelected"], false],
    layout: { "text-field": MAP_POINT_META.sos.glyph, "text-font": ["Borobiya Vazirmatn"],
      "text-size": 16, "text-allow-overlap": true },
    paint: { "text-color": "#ffffff", "text-opacity": pinReady ? 0 :
      ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1] }
  });
  if (pinReady && !map.getLayer(SOS_PIN_LAYER_ID)) map.addLayer({
    id: SOS_PIN_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID,
    filter: ["==", ["get", "isSelected"], false],
    layout: { "icon-image": ["get", "pinImage"], "icon-anchor": "bottom",
      "icon-size": .76, "icon-offset": [0, 4], "icon-allow-overlap": true, "icon-ignore-placement": true },
    paint: { "icon-opacity": ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1] }
  });
  // A selected incident must not compete for draw order with another SOS
  // symbol in the same layer. Draw it last, above nearby pins and basemap POIs.
  if (!map.getLayer(SOS_SELECTED_CORE_LAYER_ID)) map.addLayer({
    id: SOS_SELECTED_CORE_LAYER_ID, type: "circle", source: SOS_SOURCE_ID,
    filter: ["==", ["get", "isSelected"], true],
    paint: { "circle-color": ["get", "color"],
      "circle-opacity": pinReady ? 0 : 1, "circle-stroke-opacity": pinReady ? 0 : 1,
      "circle-radius": 14, "circle-stroke-width": 3.5, "circle-stroke-color": "#ffffff" }
  });
  if (!map.getLayer(SOS_SELECTED_GLYPH_LAYER_ID)) map.addLayer({
    id: SOS_SELECTED_GLYPH_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID,
    filter: ["==", ["get", "isSelected"], true],
    layout: { "text-field": MAP_POINT_META.sos.glyph, "text-font": ["Borobiya Vazirmatn"],
      "text-size": 16, "text-allow-overlap": true },
    paint: { "text-color": "#ffffff", "text-opacity": pinReady ? 0 : 1 }
  });
  if (pinReady && !map.getLayer(SOS_SELECTED_PIN_LAYER_ID)) map.addLayer({
    id: SOS_SELECTED_PIN_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID,
    filter: ["==", ["get", "isSelected"], true],
    layout: { "icon-image": ["get", "pinImage"], "icon-anchor": "bottom",
      "icon-size": .76, "icon-offset": [0, 4], "icon-allow-overlap": true, "icon-ignore-placement": true }
  });
}

function syncMapData(): void {
  const map = mapInstance;
  if (!map || !map.getStyle()) return;
  try {
    ensureResponderMapLayers(map);
    ensureSosMapLayers(map); // Selected SOS draws above all other dispatch POIs.
    raiseDispatchLayers(map, DISPATCH_LAYER_ORDER);
  } catch {
    // If a new style JSON is still mid-fetch, the `styledata` / `idle` listener below applies the data immediately once ready.
  }
}

function restoreMapLayers(): void {
  const map = mapInstance;
  if (!map || !map.isStyleLoaded()) return;
  const imageMissing = pinImagesSupported && map.isStyleLoaded() &&
    Object.values(DISPATCH_PIN_IMAGES).some((id) => !map.hasImage(id));
  if (!imageMissing && !needsOverlayRestore({
    styleLoaded: Boolean(map.isStyleLoaded()),
    hasSource: (id) => Boolean(map.getSource(id)),
    hasLayer: (id) => Boolean(map.getLayer(id))
  }, [SOS_SOURCE_ID, RESPONDER_SOURCE_ID, RESPONDER_SELECTED_SOURCE_ID],
  [SOS_AURA_LAYER_ID, SOS_PULSE_LAYER_ID, SOS_CORE_LAYER_ID, SOS_GLYPH_LAYER_ID,
    SOS_SELECTED_CORE_LAYER_ID, SOS_SELECTED_GLYPH_LAYER_ID,
    RESPONDER_DOT_LAYER_ID, RESPONDER_LABEL_LAYER_ID,
    RESPONDER_SELECTED_DOT_LAYER_ID, RESPONDER_SELECTED_GLYPH_LAYER_ID,
    RESPONDER_CLUSTER_LAYER_ID, RESPONDER_COUNT_LAYER_ID,
    ...(pinImagesSupported && Object.values(DISPATCH_PIN_IMAGES).every((id) => map.hasImage(id))
      ? [SOS_PIN_LAYER_ID, SOS_SELECTED_PIN_LAYER_ID, RESPONDER_PIN_LAYER_ID, RESPONDER_SELECTED_PIN_LAYER_ID] : [])])) {
    raiseDispatchLayers(map, DISPATCH_LAYER_ORDER);
    return;
  }
  // Requests and selection changes call syncMapData directly. An idle/styledata callback only
  // repairs style swaps; unconditionally setting GeoJSON here would schedule another idle.
  syncMapData();
}

function startPulseLoop(): void {
  if (
    pulseAnimationFrame !== null ||
    typeof requestAnimationFrame !== "function" ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ||
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
      map.setPaintProperty(SOS_PULSE_LAYER_ID, "circle-opacity",
        ["case", ["boolean", ["get", "isDimmed"], false], opacity * SOS_DIMMED_OPACITY, opacity]);
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
  if (compactDispatch.value) setSheetExpanded(true);
  adminSos.setFilterStatus("pending");
  const item = adminSos.requests.find((request) => request.id === requestId);
  if (item) focusRequest(item);
  else {
    pendingDeepLinkId = requestId;
    adminSos.selectRequest(requestId);
  }
}

function returnToSosQueue(): void {
  pendingDeepLinkId = null;
  adminSos.selectRequest(null);
  // The back button is removed with the selection. Restore keyboard focus to
  // the now-visible queue rather than leaving it on a hidden/removed element.
  void nextTick(() => document.getElementById("dispatch-queue")?.focus({ preventScroll: true }));
}

function toggleQueueRequest(item: SosRequestRecord): void {
  pendingDeepLinkId = null; // A manual choice supersedes an unresolved route target.
  if (toggleSosQueueSelection(adminSos.selectedId, item.id) === null) {
    adminSos.selectRequest(null);
    return;
  }
  focusRequest(item);
  if (compactDispatch.value) setSheetExpanded(true);
}

function focusRequest(item: SosRequestRecord): void {
  adminSos.selectRequest(item.id);
  mapInstance?.flyTo({
    center: [item.location.lon, item.location.lat],
    offset: dispatchFocusOffset(),
    zoom: Math.max(mapInstance.getZoom(), 14)
  });
}

// Keep the geographic point in the unobstructed map area, not under the
// pinned incident card. Edge cues use the actual resized MapLibre viewport.
function dispatchFocusOffset(): [number, number] {
  if (!incidentExpanded.value) return compactDispatch.value ? [0, 30] : [0, 0];
  return compactDispatch.value ? [100, 0] : [Math.min(140, window.innerWidth * .12), 0];
}
function frameSelectedIncident(): void {
  const incident = adminSos.selectedRequest;
  const map = mapInstance;
  if (!incident || !map) return;
  const points = nearbyFeatures.value.features.map((feature) => feature.geometry.coordinates);
  if (!points.length) {
    map.flyTo({ center: [incident.location.lon, incident.location.lat], offset: dispatchFocusOffset(), zoom: Math.max(map.getZoom(), 14) });
    return;
  }
  const [west, east] = shortestLongitudeBounds([incident.location.lon, ...points.map(([lon]) => lon)]);
  let south = incident.location.lat, north = south;
  for (const [, lat] of points) {
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  map.fitBounds([[west, south], [east, north]], {
    padding: { top: 56, bottom: compactDispatch.value ? 76 : 56,
      left: !incidentExpanded.value ? 48 : compactDispatch.value ? 160 : 290, right: 48 }, maxZoom: 14,
    duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650
  });
}

function focusSelectedIncidentMap(): void {
  if (!adminSos.selectedRequest) return;
  // The compact information panel covers the map when open. Reveal the map
  // before framing the incident and nearby responders, even from a tall sheet.
  if (compactDispatch.value) {
    collapseSheetForIncident();
    incidentExpanded.value = false;
    photoDialogOpen.value = false;
    showLivePanel.value = false;
  }
  frameSelectedIncident();
  const target = document.getElementById("dispatch-map");
  target?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
  });
  // Place keyboard focus on the labelled map region, not on the header icon.
  document.getElementById("dispatch-canvas-01")?.focus({ preventScroll: true });
}

function focusNearbyResponder(userId: string): void {
  const position = nearbyFeatures.value.features.find((feature) => feature.id === userId)?.geometry.coordinates;
  if (!position || !mapInstance) return;
  mapInstance.flyTo({ center: position, zoom: Math.max(mapInstance.getZoom(), 14) });
  document.getElementById("dispatch-map")?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center"
  });
}

function focusResponders(): void {
  if (!adminSos.selectedRequest) return;
  if (compactDispatch.value && !sheetExpanded.value) {
    setSheetExpanded(true);
    void nextTick(focusResponders);
    return;
  }
  const target = document.getElementById("dispatch-responders");
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
  });
}

function isMapChoiceSelected(choice: MapPointChoice): boolean {
  return choice.kind === "sos" ? adminSos.selectedId === choice.id :
    choice.kind === "responder" && adminSos.selectedResponderIds.includes(choice.id);
}

function mapChoiceHint(choice: MapPointChoice): string {
  if (choice.kind === "cluster") return "بزرگ‌نمایی ناحیه";
  return isMapChoiceSelected(choice) ? "انتخاب‌شده · برای برداشتن بزنید" :
    choice.kind === "sos" ? "انتخاب حادثه" : "انتخاب امدادگر";
}

function activateMapChoice(choice: MapPointChoice): void {
  mapPointChoices.value = [];
  if (choice.kind === "sos") {
    if (adminSos.visibleRequests.some((item) => item.id === choice.id))
      adminSos.selectRequest(toggleSosQueueSelection(adminSos.selectedId, choice.id));
    return;
  }
  if (choice.kind === "responder") {
    // This is only a qualified, currently visible suggestion; manual lookup
    // and stale results never become a map-based dispatch selection.
    if (nearbyFeatures.value.features.some((feature) => feature.id === choice.id))
      adminSos.toggleResponderSelection(choice.id);
    return;
  }
  const map = mapInstance;
  const source = map?.getSource(RESPONDER_SOURCE_ID) as GeoJSONSource | undefined;
  if (!map || !source || choice.clusterId === undefined) return;
  void source.getClusterExpansionZoom(choice.clusterId).then((zoom) => {
    if (mapInstance !== map) return;
    if (zoom > map.getZoom() + .05 && zoom <= map.getMaxZoom() && choice.coordinates)
      map.easeTo({ center: choice.coordinates, zoom });
    else focusResponders(); // Coincident positions at maximum zoom remain individually selectable in the list.
  }).catch(() => { if (mapInstance === map) focusResponders(); });
}

function onMapReady(map: MapLibreMap, MarkerClass: typeof import("maplibre-gl").Marker): void {
  placeMarker?.remove();
  placeMarker = null;
  detachMapEvents?.();
  mapPointChoices.value = [];
  mapInstance = map;
  mapLabelMarkerClass = MarkerClass;
  syncMapData();
  syncSelectedSosLabel();
  startPulseLoop();

  if (adminSos.selectedRequest) {
    map.easeTo({
      center: [
        adminSos.selectedRequest.location.lon,
        adminSos.selectedRequest.location.lat
      ],
      offset: dispatchFocusOffset(),
      zoom: 13,
      duration: 0
    });
    if (nearbyFeatures.value.features.length) frameSelectedIncident();
  }
  // The initial camera change can alter the side/visibility of labels and edge cues
  // before move listeners are registered.
  updateMapEdgeCues();

  let responderLabelsNeedSync = true;
  const onStyleData = () => {
    restoreMapLayers();
    responderLabelsNeedSync = true;
  };
  const onSourceData = (event: { sourceId?: string }) => {
    if (event.sourceId === RESPONDER_SOURCE_ID || event.sourceId === RESPONDER_SELECTED_SOURCE_ID)
      responderLabelsNeedSync = true;
  };
  const onRender = () => {
    if (!responderLabelsNeedSync) return;
    responderLabelsNeedSync = false;
    updateSelectedSosLabelPosition();
    syncResponderLabels(); // The new cluster/pin frame is now queryable.
  };
  const onIdle = () => {
    restoreMapLayers();
    updateSelectedSosLabelPosition();
    syncResponderLabels(); // Final pass after tile/style transitions.
  };
  const onMarkerClick = (event: MapMouseEvent) => {
    const layers = [SOS_SELECTED_PIN_LAYER_ID, SOS_PIN_LAYER_ID, RESPONDER_PIN_LAYER_ID, RESPONDER_SELECTED_PIN_LAYER_ID,
      SOS_SELECTED_CORE_LAYER_ID, SOS_CORE_LAYER_ID, RESPONDER_DOT_LAYER_ID,
      RESPONDER_SELECTED_DOT_LAYER_ID, RESPONDER_CLUSTER_LAYER_ID]
      .filter((id) => Boolean(map.getLayer(id)));
    const choices = new Map<string, MapPointChoice>();
    if (layers.length) for (const feature of map.queryRenderedFeatures(event.point, { layers })) {
      const props = feature.properties;
      const id = props?.id;
      if ((feature.layer.id === SOS_SELECTED_PIN_LAYER_ID || feature.layer.id === SOS_PIN_LAYER_ID ||
        feature.layer.id === SOS_SELECTED_CORE_LAYER_ID || feature.layer.id === SOS_CORE_LAYER_ID) && typeof id === "string") {
        const request = adminSos.visibleRequests.find((item) => item.id === id);
        if (request) choices.set(`sos-${id}`, { kind: "sos", id,
          title: incidentLabel(request.incidentTypeId),
          label: `حادثه SOS · ${incidentLabel(request.incidentTypeId)}` });
      } else if ((feature.layer.id === RESPONDER_PIN_LAYER_ID ||
        feature.layer.id === RESPONDER_SELECTED_PIN_LAYER_ID ||
        feature.layer.id === RESPONDER_DOT_LAYER_ID ||
        feature.layer.id === RESPONDER_SELECTED_DOT_LAYER_ID) && typeof id === "string" &&
        nearbyFeatures.value.features.some((item) => item.id === id)) {
        choices.set(`responder-${id}`, { kind: "responder", id,
          title: `@${String(props?.username ?? "")}`,
          label: `امدادگر نزدیک · ${String(props?.username ?? "")}` });
      } else if (feature.layer.id === RESPONDER_CLUSTER_LAYER_ID &&
        typeof props?.cluster_id === "number" && feature.geometry.type === "Point") {
        const clusterId = props.cluster_id as number;
        choices.set(`cluster-${clusterId}`, { kind: "cluster", id: String(clusterId), clusterId,
          coordinates: feature.geometry.coordinates as [number, number],
          title: `${Number(props.point_count).toLocaleString("fa-IR")} امدادگر نزدیک`,
          label: `${Number(props.point_count).toLocaleString("fa-IR")} امدادگر نزدیک · بزرگ‌نمایی` });
      }
    }
    const found = [...choices.values()];
    if (found.length === 1) activateMapChoice(found[0]!);
    else mapPointChoices.value = found; // Empty tap closes the choice tray.
  };

  map.on("styledata", onStyleData);
  map.on("sourcedata", onSourceData);
  map.on("render", onRender);
  map.on("idle", onIdle);
  map.on("moveend", syncResponderLabels);
  map.on("move", updateMapEdgeCues);
  map.on("resize", updateMapEdgeCues);
  map.on("click", onMarkerClick);
  detachMapEvents = () => {
    map.off("styledata", onStyleData);
    map.off("sourcedata", onSourceData);
    map.off("render", onRender);
    map.off("idle", onIdle);
    map.off("moveend", syncResponderLabels);
    map.off("move", updateMapEdgeCues);
    map.off("resize", updateMapEdgeCues);
    map.off("click", onMarkerClick);
    selectedSosLabelMarker?.remove();
    selectedSosLabelMarker = null;
    clearResponderLabels();
    mapEdgeCues.value = [];
  };
}

let pendingDeepLinkId: string | null = null;

// A style diff can retain custom layers. Refresh their paint when the basemap
// theme changes rather than leaving light-mode labels on the dark map.
watch(() => themeStore.isDark, () => {
  const map = mapInstance;
  if (!map) return;
  const responderPin = themeStore.isDark ? "#205fd1" : "#0868c8";
  for (const { marker } of responderLabelMarkers.values())
    marker.getElement().style.setProperty("--dispatch-label-color", responderPin);
  try {
    if (pinImagesSupported) refreshResponderPinImages(map, themeStore.isDark);
    for (const id of [RESPONDER_DOT_LAYER_ID, RESPONDER_CLUSTER_LAYER_ID, RESPONDER_SELECTED_DOT_LAYER_ID]) {
      if (map.getLayer(id)) map.setPaintProperty(id, "circle-color", responderPin);
    }
  } catch { /* MapCanvas is swapping styles; restoreMapLayers recreates removed layers. */ }
});
watch(incidentNameById, () => { syncMapData(); syncSelectedSosLabel(); updateMapEdgeCues(); });
watch(nearbyFeatures, (next) => {
  mapPointChoices.value = [];
  const current = new Map(next.features.map((feature) => [String(feature.id), feature]));
  // Keep a focused label button when only responder selection changes. Remove
  // labels for people no longer eligible immediately, before the new map frame.
  for (const [id, entry] of responderLabelMarkers) {
    const feature = current.get(id);
    if (!feature) { entry.marker.remove(); responderLabelMarkers.delete(id); continue; }
    entry.selected = feature.properties.isSelected;
    const chip = entry.marker.getElement().firstElementChild as HTMLElement;
    chip.textContent = feature.properties.username;
    chip.setAttribute("aria-pressed", String(entry.selected));
    chip.setAttribute("aria-label", `${entry.selected ? "لغو انتخاب" : "انتخاب"} امدادگر نزدیک ${feature.properties.username}`);
  }
  syncMapData(); updateMapEdgeCues();
}, { flush: "sync" });
watch(() => [adminSos.visibleRequests, adminSos.selectedId] as const,
  () => { mapPointChoices.value = []; syncMapData(); syncSelectedSosLabel(); updateMapEdgeCues(); }, { flush: "sync" });
// Keep the incident visible when its qualified suggestions arrive; selection
// still focuses the incident immediately, before the nearest read completes.
watch(() => [adminSos.nearestRequestId, adminSos.nearestLoaded] as const,
  ([requestId, loaded]) => {
    if (loaded && requestId && requestId === adminSos.selectedId && !adminSos.responderSearch &&
      nearbyFeatures.value.features.length) frameSelectedIncident();
  });

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
  if (suppressSheetClickTimer) clearTimeout(suppressSheetClickTimer);
  stopPulseLoop();
  if (placeSearchTimer) clearTimeout(placeSearchTimer);
  placeSearchController?.abort();
  userSearchController?.abort();
  placeMarker?.remove();
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
.admin-dispatch__followup-toggle:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.admin-dispatch__intro { min-width: 0; flex: 1 1 22rem; }
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
.admin-dispatch__filter-select { max-width: 15rem; min-width: 0; }
/* Match Map Search's outlined 44px fields and the Travel action rhythm.
   Emergency dispatch remains the sole error-coloured primary action. */
.admin-dispatch :deep(.v-btn) { min-width: 44px; min-height: 44px; height: auto;
  border-radius: 14px !important; font-family: var(--bb-font-family); font-weight: 700; letter-spacing: normal; }
.admin-dispatch :deep(.v-btn:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.admin-dispatch :deep(.v-field), .admin-dispatch :deep(.v-field__input),
.admin-dispatch :deep(.v-label), .admin-dispatch :deep(.v-chip),
.admin-dispatch :deep(.v-list-item), .admin-dispatch :deep(.v-card-title),
.admin-dispatch :deep(.v-alert) {
  font-family: var(--bb-font-family); letter-spacing: normal;
}
.admin-dispatch__toolbar :deep(.v-btn) { height: 46px; min-height: 46px; padding-inline: .7rem; font-size: .82rem; }
.admin-dispatch__toolbar :deep(.v-btn--icon) { width: 46px; padding: 0; }
.dispatch-voice-settings {
  width: min(16rem, calc(100vw - 1rem)); padding: .65rem;
  border-radius: .9rem; background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface)); box-shadow: var(--bb-shadow-overlay);
  font-family: var(--bb-font-family);
}
.dispatch-voice-settings h2 { margin: 0; font-size: .9rem; }
.dispatch-voice-settings h3 { margin: .35rem 0; font-size: .8rem; color: var(--bb-color-muted); }
.dispatch-voice-settings__row { display: flex; align-items: center; gap: .5rem;
  min-height: 44px; font-size: .8rem; }
.dispatch-voice-settings__error { margin: .4rem 0 0; color: rgb(var(--v-theme-error)); font-size: .8rem; }

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

/* The shared map-navigation-card defines colour, blur, border and 24px radius;
   surface-card supplies the quieter depth for cards in normal page flow. */
.admin-dispatch__surface { min-width: 0; }

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
  border: 1px solid rgba(var(--v-theme-on-surface), .12);
  border-radius: var(--bb-radius-nested, 16px);
  background: rgba(var(--v-theme-surface), .75); margin-bottom: .4rem;
  transition: background-color .15s, border-color .15s;
}
.dispatch-request-row:last-child, .dispatch-responder-row:last-child { margin-bottom: 0; }
.dispatch-request-row:hover, .dispatch-responder-row:hover { background: rgba(var(--v-theme-primary), .07); }
.dispatch-request-row.v-list-item--active, .dispatch-responder-row--selected {
  border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12);
}
.dispatch-request-row:focus-visible, .dispatch-responder-row__select:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
.dispatch-request-list, .responder-list { padding: .55rem; }
.dispatch-request-row, .dispatch-responder-row { padding: .55rem .7rem; min-height: 44px; }
.admin-dispatch__detail-body { display: grid; gap: .75rem; font-size: .87rem; line-height: 1.6; }
.admin-dispatch__detail-body h3 { margin: 0 0 .2rem; font-size: .8rem; font-weight: 650; }
.admin-dispatch__description { padding: .2rem .1rem .7rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); }
.admin-dispatch__description p, .admin-dispatch__proposal-note { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.admin-dispatch__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; margin: 0; }
.admin-dispatch__facts > div { min-width: 0; padding: .55rem .7rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .1);
  border-radius: var(--bb-radius-nested, 16px); background: rgba(var(--v-theme-on-surface), .035); }
.admin-dispatch__facts dt { color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__facts dd { margin: .1rem 0 0; font-weight: 700; overflow-wrap: anywhere; }
.admin-dispatch__facts bdi { unicode-bidi: isolate; }
.admin-dispatch__location-details { border-top: 1px solid var(--bb-color-outline); }
.admin-dispatch__location-details summary { display: flex; align-items: center; gap: .4rem;
  min-height: 44px; color: rgb(var(--v-theme-primary)); font-weight: 800; cursor: pointer; }
.admin-dispatch__location-details summary .v-icon { margin-inline-start: auto; transition: transform .2s; }
.admin-dispatch__location-details[open] summary .v-icon { transform: rotate(180deg); }
.admin-dispatch__location-details .admin-dispatch__facts { padding-bottom: .35rem; }
/* Evidence is never cropped or covered by a gradient: an image may contain
   information right at its edges. One quiet media frame, a separate action. */
.admin-dispatch__photo { min-width: 0; margin: .65rem .7rem .35rem; }
.admin-dispatch__photo-heading { display: flex; align-items: center; gap: .55rem; margin-bottom: .5rem; }
.admin-dispatch__photo-heading-icon { flex: none; display: grid; place-items: center;
  width: 2.15rem; height: 2.15rem; border-radius: .7rem;
  color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .1); }
.admin-dispatch__photo-heading h3 { margin: 0; font-size: .85rem; line-height: 1.4; font-weight: 800; }
.admin-dispatch__photo-heading p { margin: .1rem 0 0; color: var(--bb-color-muted);
  font-size: .8rem; line-height: 1.45; }
.admin-dispatch__photo-open { display: flex; flex-direction: column; width: 100%; min-height: 44px;
  padding: 0; overflow: hidden; border: 1px solid var(--bb-color-outline);
  background: var(--bb-color-inset); border-radius: .85rem; cursor: zoom-in;
  color: var(--bb-color-text); text-align: start; font: inherit;
  transition: border-color .16s, background-color .16s; }
.admin-dispatch__photo-open:hover { border-color: var(--bb-color-primary); }
.admin-dispatch__photo-open:disabled { opacity: .65; cursor: progress; }
.admin-dispatch__photo-preview { display: grid; place-items: center; width: 100%;
  height: clamp(9rem, 23vh, 14rem); overflow: hidden; background: rgba(var(--v-theme-on-surface), .045); }
.admin-dispatch__photo-image { display: block; width: 100%; height: 100%; object-fit: contain; }
.admin-dispatch__photo-caption { display: flex; align-items: center; justify-content: space-between;
  width: 100%; min-height: 44px; padding: .4rem .7rem; color: var(--bb-color-primary);
  background: rgb(var(--v-theme-surface)); font-size: .8rem; font-weight: 800; }
.admin-dispatch__photo-caption > span { display: inline-flex; align-items: center; gap: .35rem; }
.admin-dispatch__photo-state { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem;
  min-height: 58px; padding: .6rem .75rem; border-radius: .75rem;
  background: var(--bb-color-inset); color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__photo-state :deep(.v-btn) { margin-inline-start: auto; }
.admin-dispatch__photo-error { margin: .45rem 0 0; color: var(--bb-color-error); font-size: .82rem; }
.admin-dispatch__photo-open:focus-visible, .admin-dispatch__location-details summary:focus-visible,
.dispatch-mission-timeline summary:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.admin-dispatch__photo-dialog { display: flex; flex-direction: column; max-height: calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
.admin-dispatch__photo-dialog, .admin-dispatch__confirmation { font-family: var(--bb-font-family); color: rgb(var(--v-theme-on-surface)); }
.admin-dispatch__photo-dialog :deep(.v-card-title) { flex: none; white-space: normal; font-family: var(--bb-font-family); font-weight: 800; }
.admin-dispatch__photo-dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.admin-dispatch__photo-dialog-heading > span { display: inline-flex; align-items: center; gap: .5rem; min-width: 0; }
.admin-dispatch__photo-dialog-heading > span .v-icon { color: var(--bb-color-primary); }
.admin-dispatch__photo-dialog :deep(.v-btn), .admin-dispatch__confirmation :deep(.v-btn) {
  min-height: 44px; min-width: 44px; border-radius: 14px; font-family: var(--bb-font-family); font-weight: 800; letter-spacing: normal; }
.admin-dispatch__photo-dialog :deep(.v-btn:focus-visible), .admin-dispatch__confirmation :deep(.v-btn:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.admin-dispatch__confirmation :deep(.v-card-title) { font-family: var(--bb-font-family); font-weight: 800; }
.admin-dispatch__confirmation :deep(.v-card-actions) { flex-wrap: wrap; gap: .4rem;
  padding: .6rem .85rem calc(.85rem + env(safe-area-inset-bottom, 0px)); }
.admin-dispatch__confirmation :deep(.v-card-actions .v-btn) { height: auto; white-space: normal; }
.admin-dispatch__confirmation :deep(.v-btn__content) { white-space: normal; text-align: center; }
.admin-dispatch__photo-dialog :deep(.v-card-text) { min-height: 0; overflow: auto; display: grid; place-items: center;
  background: var(--bb-color-inset); }
.admin-dispatch__photo-dialog img { display: block; max-width: 100%; max-height: calc(100dvh - 7rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  width: auto; height: auto; object-fit: contain; }
.admin-dispatch__proposal-note { color: var(--bb-color-muted); }
.admin-dispatch__next { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .6rem;
  padding: .65rem .1rem 0; border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.admin-dispatch__next span { font-weight: 700; }
.admin-dispatch__next :deep(.v-btn) { min-height: 46px; max-width: 100%; height: auto; white-space: normal; font-weight: 800; }
.admin-dispatch__next :deep(.v-btn__content) { white-space: normal; text-align: center; }
.admin-dispatch__selection-hint { display: flex; align-items: center; gap: .5rem; margin: 0 0 .75rem;
  padding: .7rem .9rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); }
#dispatch-map { scroll-margin-top: calc(5rem + env(safe-area-inset-top, 0px)); }
.admin-dispatch__responders { scroll-margin-top: calc(5rem + env(safe-area-inset-top, 0px)); }
.admin-dispatch__responders:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 3px; }
.admin-dispatch__sender-group { margin: .85rem 1rem 0; }
.admin-dispatch__sender { display: grid; grid-template-columns: 44px minmax(0, 1fr);
  align-items: center; gap: .65rem; min-width: 0; width: 100%;
  padding: .55rem .7rem; text-align: start; font: inherit; color: inherit; cursor: pointer;
  border: 1px solid rgba(var(--v-theme-on-surface), .1);
  border-radius: var(--bb-radius-nested, 16px); background: rgba(var(--v-theme-on-surface), .035); }
.admin-dispatch__sender:hover, .admin-dispatch__sender:focus-visible {
  border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .08); }
.admin-dispatch__sender:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.admin-dispatch__sender-avatar { display: grid; place-items: center; width: 44px; height: 44px;
  border: 1px solid rgba(var(--v-theme-primary), .22); border-radius: 50%;
  color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.admin-dispatch__sender:hover .admin-dispatch__sender-avatar { background: rgba(var(--v-theme-primary), .2); }
.admin-dispatch__sender-copy { display: grid; min-width: 0; gap: .12rem; }
.admin-dispatch__sender-copy strong { font-size: .9rem; }
.admin-dispatch__sender-name { justify-self: start; max-width: 100%; font-size: .88rem;
  font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
.admin-dispatch__sender-placeholder { color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__inline-retry { display: inline-block; min-height: 36px; padding: .2rem .35rem; border: 0;
  background: transparent; color: rgb(var(--v-theme-primary)); cursor: pointer; font: inherit; font-size: .8rem; }
.admin-dispatch__inline-retry:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); border-radius: .35rem; }
.admin-dispatch__address, .admin-dispatch__location-coordinates { grid-column: 1 / -1; }
.admin-dispatch__coordinates { display: flex; flex-wrap: wrap; gap: .2rem .8rem; justify-content: flex-end; }

/* The timeline sits between other cards; give it a boundary, not another shadow. */
.dispatch-mission-timeline {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface));
}
/* Timeline already lives in the bordered disclosure; do not nest a second
   rounded, shadowed card inside it when the operator opens the history. */
.dispatch-mission-timeline :deep(.timeline) {
  margin-block: .75rem 0;
  padding: .75rem 0 0;
  border: 0;
  border-top: 1px solid var(--bb-color-outline);
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.dispatch-map-wrapper {
  position: relative;
  height: clamp(18rem, 37dvh, 23rem);
  min-height: 18rem;
}
/* MapLibre appends these labels outside the SFC scope. Their zero-sized
   anchors stay at the exact incident/responder coordinates; only chips move.
   The anchor ignores hits, but its actual chip is an interactive button. */
:global(.dispatch-sos-label-anchor) { width: 0; height: 0; z-index: 4; pointer-events: none; }
:global(.dispatch-sos-label-anchor[hidden]) { display: none; }
:global(.dispatch-responder-label-anchor) { z-index: 3; }
:global(.dispatch-sos-label) { position: absolute; top: -35px; left: 16px;
  appearance: none; cursor: pointer;
  transform: translateY(-50%); box-sizing: border-box; display: block; isolation: isolate;
  width: max-content; max-width: min(12rem, calc(100vw - 4rem)); min-height: 32px;
  padding: .34rem .75rem; border: 1px solid rgba(var(--v-theme-on-surface), .24);
  /* Physical pin-facing edges: a logical inline-start border lands on the far
     side of an RTL incident title, as in the reported screenshot. */
  border-left: 3px solid var(--dispatch-label-color, #dc2626);
  border-radius: 999px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 3px 10px rgba(8, 21, 38, .22); font: 800 .83rem/1.4 var(--bb-font-family, sans-serif);
  white-space: normal; overflow-wrap: anywhere; text-align: start; pointer-events: auto; }
:global(.dispatch-sos-label:focus-visible) {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
/* A short colored neck overlaps the pin head. Only the chip is a hit target;
   neither the pin nor its geographic anchor moves. */
:global(.dispatch-sos-label::after) { content: ""; position: absolute; z-index: -1;
  left: -8px; top: calc(50% - 4px); width: 10px; height: 8px;
  border-radius: 4px; background: var(--dispatch-label-color, #dc2626); }
:global(.dispatch-sos-label-anchor--left .dispatch-sos-label) {
  left: -16px; transform: translate(-100%, -50%); border-left-width: 1px;
  border-right: 3px solid var(--dispatch-label-color, #dc2626); }
:global(.dispatch-sos-label-anchor--left .dispatch-sos-label::after) { left: auto; right: -8px; }
:global(.dispatch-sos-label-anchor--center .dispatch-sos-label) {
  left: 0; top: 0; transform: translateX(calc(-50% + var(--dispatch-sos-label-shift, 0px)));
  border-left-width: 1px; border-top: 3px solid var(--dispatch-label-color, #dc2626); }
:global(.dispatch-sos-label-anchor--center .dispatch-sos-label::after) {
  left: calc(50% - 5px - var(--dispatch-sos-label-shift, 0px)); top: -8px;
  width: 10px; height: 10px; }
:global(.dispatch-sos-label-anchor--center.dispatch-sos-label-anchor--above .dispatch-sos-label) {
  top: auto; bottom: 51px; border-top-width: 1px;
  border-bottom: 3px solid var(--dispatch-label-color, #dc2626); }
:global(.dispatch-sos-label-anchor--center.dispatch-sos-label-anchor--above .dispatch-sos-label::after) {
  top: auto; bottom: -8px; }
/* Without canvas pins the circle itself sits on the coordinate, not 35px
   above it. Keep the same one-sided chip attached to that fallback geometry. */
:global(.dispatch-label-anchor--circle .dispatch-sos-label) { top: 0; }
:global(.dispatch-label-anchor--circle.dispatch-sos-label-anchor--center .dispatch-sos-label) { top: 18px; }
:global(.dispatch-label-anchor--circle.dispatch-sos-label-anchor--center.dispatch-sos-label-anchor--above .dispatch-sos-label) {
  top: auto; bottom: 18px; }
@media (forced-colors: active) {
  :global(.dispatch-sos-label) { border-color: CanvasText; background: Canvas; color: CanvasText; box-shadow: none; }
  :global(.dispatch-sos-label::after) { background: CanvasText; }
}
.dispatch-map-key { display: flex; flex-wrap: wrap; gap: .35rem .9rem; margin: 0;
  padding: .55rem .85rem; list-style: none; background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface)); font: 700 .76rem/1.5 var(--bb-font-family); }
.admin-dispatch__legend-toggle {
  position: absolute; z-index: 5; right: 1.125rem;
  bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
  width: 44px; height: 44px; min-width: 44px; min-height: 44px;
  border-radius: var(--bb-map-action-radius, 1rem);
  box-shadow: var(--bb-shadow-overlay);
}
.admin-dispatch__legend-toggle:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
.dispatch-map-key li { display: inline-flex; align-items: center; gap: .35rem; }
.dispatch-map-key__icon, .dispatch-map-key__selected { position: relative; isolation: isolate;
  display: inline-grid; place-items: center; flex: 0 0 46px; width: 46px; height: 48px;
  color: #fff; font-size: 16px; }
.dispatch-map-key__icon::after, .dispatch-map-key__selected::before {
  content: ""; position: absolute; z-index: -1; top: 8px; left: 7px;
  width: 27px; height: 27px; border: 2px solid #fff; border-radius: 50% 50% 50% 4px;
  background: var(--dispatch-sos-color, #dc2626);
  box-shadow: 0 2px 4px rgba(9, 25, 44, .4); transform: scale(1, 1.1) rotate(-45deg); }
/* Center the smaller glyph in the visible colored head, which appears slightly
   left of the rotated teardrop's geometric center in the legend. */
.dispatch-map-key__icon.mdi::before, .dispatch-map-key__selected > .mdi {
  position: absolute; top: 6px; left: 5px; display: grid; place-items: center;
  width: 31px; height: 31px; line-height: 1; }
.dispatch-map-key__icon--selected-sos::after {
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--dispatch-sos-color, #dc2626) 19%, transparent); }
.dispatch-map-key__icon--helper::after { background: var(--dispatch-helper-color, #0868c8); }
.dispatch-map-key__selected::before { background: var(--dispatch-helper-color, #0868c8); border-color: #f7b632; }
.dispatch-map-key__cluster { display: inline-grid; place-items: center; flex: 0 0 32px;
  width: 32px; height: 32px; border: 3px solid #fff; border-radius: 50%;
  color: #fff; background: var(--dispatch-helper-color, #0868c8);
  box-shadow: 0 0 0 1px rgba(var(--v-theme-on-surface), .25); font: 800 .7rem/1 var(--bb-font-family); }
@media (forced-colors: active) {
  .dispatch-map-key__icon, .dispatch-map-key__selected { color: CanvasText; }
  .dispatch-map-key__icon::after, .dispatch-map-key__selected::before,
  .dispatch-map-key__cluster { border-color: CanvasText; color: CanvasText;
    background: Canvas; box-shadow: none; }
}
/* Screen-space edge cues are never geographic pins: their buttons bring the
 * operator back to the real point. Keep them above map tiles, below choice tray. */
.dispatch-map-edge-cues { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.dispatch-map-edge-cue { position: absolute; display: inline-flex; align-items: center; gap: .35rem;
  transform: translate(-50%, -50%); box-sizing: border-box;
  width: max-content; max-width: min(138px, calc(100% - 24px)); height: 30px;
  padding: 0; padding-inline-end: .4rem; border: 0; border-radius: .7rem;
  overflow: hidden; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 3px 12px rgba(8, 21, 38, .28), 0 1px 3px rgba(8, 21, 38, .14);
  font: 800 .78rem/1.25 var(--bb-font-family);
  text-align: start; cursor: pointer; pointer-events: auto;
  transition: box-shadow .15s ease; }
/* Side cues grow inward from the viewport edge, so short names don't float
   into the map. Put the arrow on the side that points toward the target. */
.dispatch-map-edge-cue--left { direction: ltr; transform: translateY(-50%); }
.dispatch-map-edge-cue--right { transform: translate(-100%, -50%); }
.dispatch-map-edge-cue:hover { box-shadow: 0 5px 16px rgba(8, 21, 38, .32), 0 2px 5px rgba(8, 21, 38, .16); }
/* The arrow is square and integrated with the card, not a second floating pin. */
.dispatch-map-edge-cue__arrow { display: grid; place-items: center; flex: 0 0 30px;
  width: 30px; height: 100%; border-radius: .65rem 0 0 .65rem;
  color: #fff; background: var(--dispatch-edge-color, #0868c8); }
.dispatch-map-edge-cue--left .dispatch-map-edge-cue__arrow { border-radius: 0 .65rem .65rem 0; }
.dispatch-map-edge-cue__arrow svg { display: block; width: 17px; height: 17px; }
.dispatch-map-edge-cue__arrow--bottom { transform: rotate(180deg); }
.dispatch-map-edge-cue__arrow--left { transform: rotate(-90deg); }
.dispatch-map-edge-cue__arrow--right { transform: rotate(90deg); }
.dispatch-map-edge-cue bdi { display: block; flex: 0 1 auto; min-width: 0;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dispatch-map-edge-cue:focus-visible { outline: 3px solid var(--dispatch-edge-color, #0868c8); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .dispatch-map-edge-cue { transition: none; }
}
@media (forced-colors: active) {
  .dispatch-map-edge-cue { background: Canvas; color: CanvasText; outline: 1px solid CanvasText;
    outline-offset: -1px; box-shadow: none; }
  .dispatch-map-edge-cue:hover { box-shadow: none; }
  .dispatch-map-edge-cue__arrow { background: CanvasText; color: Canvas; }
}
/* Match the user map's dark-mode POI labels. A solid light chip and a dark
   silhouette stand out over both dark land and the pale roads in dark tiles.
   Limit this to map labels: the legend and map controls retain their theme. */
@media (forced-colors: none) {
  :global(:root.dark .dispatch-map-wrapper :is(.dispatch-sos-label, .dispatch-map-edge-cue)) {
    background: #f4f7f6; color: #193536;
    box-shadow: 0 0 0 2px #152b2d, 0 6px 18px rgba(0, 0, 0, .72);
  }
  :global(:root.dark .dispatch-map-wrapper .dispatch-map-edge-cue:hover) {
    box-shadow: 0 0 0 2px #152b2d, 0 8px 20px rgba(0, 0, 0, .8);
  }
}
.admin-dispatch__map-note { margin: -.7rem .75rem .85rem; color: var(--bb-color-muted);
  font-size: .82rem; line-height: 1.5; overflow-wrap: anywhere; }

.dispatch-request-list {
  max-height: min(42dvh, 24rem);
  overflow-y: auto; overscroll-behavior: contain;
}
.responder-list {
  max-height: min(38dvh, 20rem);
  overflow-y: auto; overscroll-behavior: contain;
}
.admin-dispatch__help-dialog {
  max-height: calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  font-family: var(--bb-font-family); color: rgb(var(--v-theme-on-surface));
}
.admin-dispatch__help-heading {
  display: flex; align-items: center; justify-content: space-between; gap: .5rem;
  flex: none; white-space: normal; font-family: inherit; font-size: 1rem; font-weight: 800;
}
.admin-dispatch__help-heading > span { display: inline-flex; align-items: center; gap: .45rem; min-width: 0; }
.admin-dispatch__help-heading > span .v-icon { color: var(--bb-color-primary); }
.admin-dispatch__help-heading :deep(.v-btn) { flex: none; min-width: 44px; min-height: 44px; }
.admin-dispatch__help-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.admin-dispatch__help-content section + section {
  margin-top: .8rem; padding-top: .8rem; border-top: 1px solid var(--bb-color-outline);
}
.admin-dispatch__help-content h2 { margin: 0 0 .25rem; font-size: .95rem; font-weight: 800; }
.admin-dispatch__help-content p { margin: .25rem 0; font-size: .86rem; line-height: 1.7; }
.admin-dispatch__help-caution { display: flex; align-items: flex-start; gap: .4rem; }
.admin-dispatch__help-caution .v-icon { flex: none; margin-top: .15rem; color: rgb(var(--v-theme-error)); }
.admin-dispatch__submit { position: sticky; bottom: 0; z-index: 1;
  background: rgb(var(--v-theme-surface)); border-top: 1px solid rgba(var(--v-theme-on-surface), .12); }
.admin-dispatch__submit :deep(.v-btn) { min-height: 46px; font-weight: 800; }
.admin-dispatch__mission-header { display: flex; flex-wrap: wrap; align-items: center;
  justify-content: space-between; gap: .5rem; margin-bottom: .65rem; }
.admin-dispatch__mission-header h2 { margin: 0; font-size: .95rem; font-weight: 800; }
.admin-dispatch__followup { border: 1px solid var(--bb-color-outline);
  border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); padding: .75rem; }
.admin-dispatch__followup-toggle { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem;
  width: 100%; min-height: 44px; border: 0; background: transparent;
  color: rgb(var(--v-theme-on-surface)); font: inherit; font-weight: 800; cursor: pointer; text-align: start; }
.admin-dispatch__followup-toggle .v-icon { margin-inline-start: auto; }
.dispatch-mission-timeline summary { cursor: pointer; min-height: 44px; font-weight: 800; }
.admin-dispatch__followup-toggle span, .dispatch-mission-timeline summary span {
  color: var(--bb-color-muted); font-size: .8rem; font-weight: 500; margin-inline-start: .5rem;
}
.dispatch-mission-timeline[open] summary { margin-bottom: .5rem; }
.admin-dispatch__followup-toggle[aria-expanded="true"] { margin-bottom: .75rem; }

.dispatch-map-choices { position: absolute; z-index: 5; bottom: 12px;
  box-sizing: border-box; width: min(17rem, calc(100% - 44px - 2.75rem)); max-height: min(15rem, 50%);
  display: flex; flex-direction: column; min-width: 0; padding: .55rem;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-card, 24px);
  background: rgba(var(--v-theme-surface), .98); color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay); backdrop-filter: blur(12px); }
.dispatch-map-choices__heading { display: flex; align-items: center; gap: .45rem;
  min-width: 0; padding: .1rem .1rem .45rem;
  border-bottom: 1px solid var(--bb-color-outline); }
.dispatch-map-choices__heading-icon { flex: none; display: grid; place-items: center;
  width: 34px; height: 34px; border-radius: .7rem;
  background: rgba(var(--v-theme-primary), .12); color: rgb(var(--v-theme-primary)); }
.dispatch-map-choices__heading-copy { display: grid; flex: 1; min-width: 0; gap: .05rem; line-height: 1.35; }
.dispatch-map-choices__heading-copy strong { font-size: .9rem; font-weight: 800; }
.dispatch-map-choices__heading-copy span { font-size: .8rem; color: var(--bb-color-muted); }
.dispatch-map-choices button { font: inherit; color: inherit; cursor: pointer; }
.dispatch-map-choices button:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -3px; }
.dispatch-map-choices__close { flex: none; display: grid; place-items: center;
  width: 44px; height: 44px; border: 0; border-radius: .75rem;
  background: var(--bb-color-inset); }
.dispatch-map-choices__close:hover { background: rgba(var(--v-theme-primary), .12); }
.dispatch-map-choices__items { overflow-y: auto; min-height: 0;
  display: grid; gap: .35rem; padding-block-start: .5rem;
  overscroll-behavior: contain; scrollbar-width: thin; }
.dispatch-map-choices__item { display: grid; grid-template-columns: 34px minmax(0, 1fr) 19px;
  align-items: center; gap: .45rem; width: 100%; min-height: 58px; padding: .4rem .5rem;
  border: 1px solid var(--bb-color-outline); border-radius: .8rem;
  background: var(--bb-color-inset); text-align: start; }
.dispatch-map-choices__item:hover { border-color: rgb(var(--v-theme-primary)); }
.dispatch-map-choices__item--selected { border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), .1); }
.dispatch-map-choices__item-icon { display: grid; place-items: center;
  width: 34px; height: 34px; border-radius: .7rem;
  color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.dispatch-map-choices__item-icon--sos { color: rgb(var(--v-theme-error)); background: rgba(var(--v-theme-error), .12); }
.dispatch-map-choices__item-copy { display: grid; min-width: 0; gap: .05rem; line-height: 1.4; }
.dispatch-map-choices__item-copy strong { font-size: .85rem; font-weight: 750; overflow-wrap: anywhere; }
.dispatch-map-choices__item-copy small { font-size: .8rem; color: var(--bb-color-muted); overflow-wrap: anywhere; }
.dispatch-map-choices__item > :deep(.v-icon:last-child) { color: var(--bb-color-muted); }
@media (forced-colors: active) {
  .dispatch-map-choices, .dispatch-map-choices__item { background: Canvas; color: CanvasText;
    border-color: CanvasText; box-shadow: none; }
  .dispatch-map-choices__close, .dispatch-map-choices__heading-icon,
  .dispatch-map-choices__item-icon { background: Canvas; color: CanvasText; }
  .dispatch-map-choices__item--selected { outline: 2px solid Highlight; outline-offset: -3px; }
  .dispatch-map-choices button:focus-visible { outline-color: Highlight; }
}
@media (max-width: 959px) {
  .admin-dispatch__filter-select { width: 15rem; }
}
@media (max-width: 699px) {
  .admin-dispatch__toolbar { grid-template-columns: minmax(0, 1fr); }
  .admin-dispatch__filter-select { width: 100%; max-width: none; }
  .admin-dispatch__toolbar-actions { justify-content: flex-start; }
}
@media (max-width: 599px) {
  .admin-dispatch__filter-select { flex: 1 1 12rem; min-width: 0; max-width: 100%; }
  .admin-dispatch__toolbar { width: 100%; }
  .admin-dispatch__facts { grid-template-columns: minmax(0, 1fr); }
  .admin-dispatch__next :deep(.v-btn), .admin-dispatch__submit :deep(.v-btn) { width: 100%; }
  .admin-dispatch__submit :deep(.v-btn) { min-height: 44px; height: auto; white-space: normal; }
  .admin-dispatch__submit :deep(.v-btn__content) { white-space: normal; text-align: center; }
}

/* Replacement is a compact work item, not a red modal-style alert. The
   same quiet surface and nested radius as the SOS and responder rows apply. */
:global(.dispatch-feedback-toast__wrapper .admin-sos-toast__message > .v-icon.text-success) {
  color: rgb(var(--v-theme-success));
}
#dispatch-sidebar .dispatch-replacement {
  flex: none; display: grid; gap: .25rem; margin: .25rem .2rem .55rem; padding: .45rem .55rem;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  background: var(--bb-color-inset); color: var(--bb-color-text); font-size: .8rem; line-height: 1.4;
  box-shadow: 0 2px 7px rgba(14, 42, 45, .12);
}
#dispatch-sidebar .dispatch-replacement__heading { display: flex; align-items: center; gap: .35rem; }
#dispatch-sidebar .dispatch-replacement__heading > .v-icon { color: rgb(var(--v-theme-error)); }
#dispatch-sidebar .dispatch-replacement__heading strong { font-size: .85rem; }
#dispatch-sidebar .dispatch-replacement__heading :deep(.v-btn) { margin-inline-start: auto; }
#dispatch-sidebar .dispatch-replacement p { margin: 0; }
#dispatch-sidebar .dispatch-replacement__review { color: rgb(var(--v-theme-error)); font-weight: 700; }
.dispatch-replacement__location { color: var(--bb-color-muted); font-size: .8rem; }
.dispatch-replacement__location summary { width: max-content; max-width: 100%; min-height: 32px;
  display: flex; align-items: center; cursor: pointer; }
.dispatch-replacement__location summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); border-radius: .35rem; }
.dispatch-replacement__location bdi { display: block; overflow-wrap: anywhere; }
#dispatch-sidebar .dispatch-replacement__actions { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .1rem; }
#dispatch-sidebar .dispatch-replacement__actions :deep(.v-btn) {
  min-width: 0; min-height: 36px; height: 36px; padding-inline: .55rem; font-size: .8rem;
}
.admin-dispatch__incident-panel .admin-dispatch__replacement-note {
  display: flex; flex-wrap: wrap; align-items: center; gap: .2rem .4rem;
  margin: .35rem var(--dispatch-incident-inset) 0; padding: .35rem .5rem; border-radius: .65rem;
  background: var(--bb-color-inset); color: var(--bb-color-text); font-size: .8rem;
}
.admin-dispatch__replacement-note > .v-icon,
.admin-dispatch__replacement-note small { color: rgb(var(--v-theme-error)); }
.admin-dispatch__replacement-note small { font-size: .8rem; }
.admin-dispatch__replacement-note .dispatch-replacement__location { flex-basis: 100%; }
.admin-dispatch__incident-panel .admin-dispatch__replacement-action {
  margin: .35rem var(--dispatch-incident-inset) .25rem; min-height: 38px; height: 38px; font-size: .8rem;
}
@media (max-width: 900px) {
  #dispatch-sidebar .dispatch-replacement__actions :deep(.v-btn),
  .admin-dispatch__incident-panel .admin-dispatch__replacement-action { min-height: 44px; height: 44px; }
  .dispatch-replacement__location summary { min-height: 44px; }
}
.mission-timeline-select {
  width: 100%; min-height: 44px;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(var(--v-theme-on-surface), .12);
  border-radius: var(--bb-radius-nested, 16px);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 0.875rem;
}

.mission-timeline-select:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

:global(:root.dark .dispatch-mission-timeline),
:global(:root.dark .mission-timeline-select) {
  border-color: var(--bb-color-outline);
}
:global(:root.dark .dispatch-request-row.v-list-item--active),
:global(:root.dark .dispatch-responder-row--selected) {
  background: rgba(var(--v-theme-primary), .12); border-color: rgb(var(--v-theme-primary));
}
:global(:root.dark .mission-timeline-select) { background: var(--bb-color-inset); }

/* Full-viewport dispatch surface: the map is the ground plane. All controls
   have independent scroll areas instead of shrinking MapLibre's canvas. */
.admin-dispatch {
  position: relative; width: 100%; height: 100dvh; max-width: none;
  margin: 0; padding: 0; overflow: hidden;
  --dispatch-sidebar-width: clamp(20rem, 28vw, 25rem);
  --dispatch-map-panel-width: min(25rem, calc(100% - var(--dispatch-sidebar-width) - 1.5rem - env(safe-area-inset-left, 0px)));
}
.admin-dispatch__sidebar {
  position: absolute; z-index: 12; top: 0; right: 0; bottom: 0;
  width: var(--dispatch-sidebar-width); padding: .4rem .5rem;
  padding-top: max(.4rem, env(safe-area-inset-top, 0px));
  display: flex; flex-direction: column; min-height: 0;
  overflow-y: auto; overscroll-behavior: contain;
  background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  border-left: 1px solid var(--bb-color-outline);
}
.admin-dispatch__header {
  display: block; flex: none; padding: .45rem .35rem .3rem;
  margin-bottom: .45rem !important;
}
/* One purposeful heading and a compact filter/refresh toolbar, no ambient status copy. */
.admin-dispatch__intro { display: block; margin-bottom: .55rem; }
.admin-dispatch__heading { gap: .3rem !important; }
.admin-dispatch__heading h1 { font-size: 1rem !important; line-height: 1.4; }
.admin-dispatch__toolbar { display: flex; align-items: center; width: 100%; gap: .2rem; }
.admin-dispatch__filter-group { flex: 1; min-width: 0; }
.admin-dispatch__toolbar-actions { flex: none; min-width: 0; justify-content: flex-start; gap: .1rem; }
.admin-dispatch__filter-select { width: 100%; max-width: none; }
/* Below the fixed header and alerts, give each worklist half of the rail.
   Scroll the rows inside their own cards; short viewports may scroll the rail
   rather than clipping responder search, warnings or the dispatch action. */
.admin-dispatch__queue, .admin-dispatch__nearby {
  display: flex; flex: 1 1 0; flex-direction: column; min-height: 18rem;
}
.admin-dispatch__queue { padding-bottom: .2rem; }
.admin-dispatch__nearby { padding-top: .2rem; }
.admin-dispatch__queue > #dispatch-queue,
.admin-dispatch__nearby > #dispatch-responders {
  display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0;
}
.admin-dispatch__nearby-empty { display: flex; flex: 1 1 auto; flex-direction: column; justify-content: center;
  gap: .15rem; padding: .6rem .5rem;
  background: rgba(var(--v-theme-on-surface), .035); border-radius: .65rem; }
.admin-dispatch__nearby-empty span { color: var(--bb-color-muted); font-size: .8rem; }
.admin-dispatch__responders .responder-list,
.admin-dispatch__queue .dispatch-request-list {
  flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto;
}
#dispatch-sidebar .admin-dispatch__surface :deep(.v-card-text[role="status"]) {
  flex: 1 1 auto; display: grid; place-content: center;
}
#dispatch-sidebar > :deep(.v-alert),
#dispatch-sidebar .admin-dispatch__content > :deep(.v-alert) { flex: 0 0 auto; }
/* Replacement feedback stays visible above the scrolling worklists. Vuetify's
   default v-alert flex: 1 1 would otherwise make a short message fill the rail. */
#dispatch-sidebar > :deep(.dispatch-quick-feedback) {
  min-width: 0; margin: .2rem .3rem .45rem; padding: .5rem .65rem;
  grid-template-columns: max-content minmax(0, 1fr) max-content max-content;
  font-size: .84rem; line-height: 1.5;
}
#dispatch-sidebar > :deep(.dispatch-quick-feedback .v-alert__content) {
  min-width: 0; white-space: normal; overflow-wrap: anywhere;
}
.admin-dispatch__queue .mb-4 { margin-bottom: 0 !important; }
/* The pinned rail is one surface, not cards stacked inside another card.
   Restrict these overrides to the rail; the map, dialogs and floating incident
   shell keep their own elevation and contrast. */
#dispatch-sidebar .admin-dispatch__surface {
  border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
  background: transparent !important; backdrop-filter: none !important;
}
#dispatch-sidebar .admin-dispatch__surface :deep(.v-card-title) {
  padding: .35rem .3rem .2rem; font-size: .9rem !important;
  line-height: 1.4; gap: .35rem !important;
}
#dispatch-sidebar .admin-dispatch__card-heading { gap: .35rem; }
#dispatch-sidebar .admin-dispatch__responders :deep(.v-card-title) { justify-content: flex-start !important; }
#dispatch-sidebar .admin-dispatch__responders :deep(.v-card-title > div:last-child) { margin-inline-start: auto; }
#dispatch-sidebar .admin-dispatch__responders :deep(.v-card-title > div:first-child) { min-width: 0; flex-wrap: wrap; }
#dispatch-sidebar .dispatch-request-list, #dispatch-sidebar .responder-list {
  padding: .1rem .15rem; background: transparent;
}
#dispatch-sidebar .dispatch-request-row {
  margin: 0; padding: .2rem .25rem; min-height: 44px;
  border: 0; border-radius: .5rem; background: transparent;
}
#dispatch-sidebar .dispatch-request-row.v-list-item--active {
  border-color: transparent; background: rgba(var(--v-theme-primary), .12);
}
#dispatch-sidebar .dispatch-request-row :deep(.v-list-item-title) {
  font-size: .8rem; line-height: 1.35; gap: .25rem !important;
  justify-content: flex-start !important;
}
#dispatch-sidebar .dispatch-request-row :deep(.v-list-item-title) { justify-content: space-between !important; }
#dispatch-sidebar .dispatch-request-row :deep(.v-list-item-subtitle) {
  font-size: .8rem; line-height: 1.3; gap: .25rem !important; margin-top: .1rem !important;
}
#dispatch-sidebar .dispatch-request-row :deep(.text-caption) { font-size: .8rem !important; gap: .25rem !important; }
/* SOS rows are compact, separate tappable surfaces within the otherwise flat
   rail. Priority sits at the left end of the title line; status and evidence share a second line. */
#dispatch-sidebar .dispatch-request-list { padding: .25rem .2rem .5rem; }
#dispatch-sidebar .dispatch-request-row {
  position: relative; margin-bottom: .3rem; padding: .35rem .45rem;
  min-height: 52px; border: 1px solid color-mix(in srgb, var(--bb-color-outline) 42%, transparent);
  /* Vuetify's rounded-lg utility is !important; retain the 16px nested-card radius. */
  border-radius: var(--bb-radius-nested, 16px) !important; background: var(--bb-color-inset);
  box-shadow: 0 2px 7px rgba(14, 42, 45, .12); overflow: hidden;
}
#dispatch-sidebar .dispatch-request-row:last-child { margin-bottom: 0; }
#dispatch-sidebar .dispatch-request-row:hover {
  border-color: var(--bb-color-outline);
  background: color-mix(in srgb, var(--bb-color-inset) 88%, var(--bb-color-primary));
}
#dispatch-sidebar .dispatch-request-row.v-list-item--active {
  border-color: var(--bb-color-primary);
  background: color-mix(in srgb, var(--bb-color-inset) 87%, var(--bb-color-primary));
}
/* Vuetify also paints active rows with ::before. Keep selection on the full
   rounded border, without an inset side stripe or a rectangular overlay. */
#dispatch-sidebar .dispatch-request-row.v-list-item--active::before { opacity: 0 !important; }
#dispatch-sidebar .dispatch-request-row.v-list-item--active :deep(.v-list-item__overlay) { opacity: 0; }
#dispatch-sidebar .dispatch-request-row :deep(.v-list-item__content) { display: grid; gap: .15rem; }
#dispatch-sidebar .dispatch-request-row__marker {
  display: block; flex: none; width: 9px; height: 9px; margin-inline-start: auto;
  border-radius: 50%; background: var(--sos-priority-accent);
}
#dispatch-sidebar .dispatch-request-row :deep(.v-list-item-title.dispatch-request-row__title) {
  display: flex; align-items: center; gap: .35rem !important;
  white-space: normal; min-width: 0; font-size: .84rem; line-height: 1.35;
}
#dispatch-sidebar .dispatch-request-row__name { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
#dispatch-sidebar .dispatch-request-row__details {
  display: flex; flex-wrap: wrap; align-items: center; gap: .15rem .3rem; min-width: 0;
}
/* Mission state is separate from severity. A small icon + named, tinted badge
   makes pending, dispatched and replacement legible without enlarging rows. */
#dispatch-sidebar .dispatch-request-row__status {
  --dispatch-status-color: var(--bb-color-muted);
  display: inline-flex; align-items: center; gap: .2rem; min-width: 0; max-width: 100%;
  padding: 0 .35rem; min-height: 20px; border-radius: .45rem;
  border: 1px solid color-mix(in srgb, var(--dispatch-status-color) 42%, transparent);
  background: color-mix(in srgb, var(--dispatch-status-color) 13%, var(--bb-color-surface));
  color: var(--dispatch-status-color); font-size: .8rem; line-height: 1.25; font-weight: 700;
}
#dispatch-sidebar .dispatch-request-row__status--pending { --dispatch-status-color: #956200; }
#dispatch-sidebar .dispatch-request-row__status--dispatched { --dispatch-status-color: #075c94; }
#dispatch-sidebar .dispatch-request-row__status--accepted,
#dispatch-sidebar .dispatch-request-row__status--completed { --dispatch-status-color: #08734a; }
#dispatch-sidebar .dispatch-request-row__status--cancelled_by_rescuer { --dispatch-status-color: #a2241e; }
#dispatch-sidebar .dispatch-request-row__status--cancelled_by_requester,
#dispatch-sidebar .dispatch-request-row__status--expired { --dispatch-status-color: var(--bb-color-muted); }
:global(:root.dark #dispatch-sidebar .dispatch-request-row__status--pending) { --dispatch-status-color: #ffd68a; }
:global(:root.dark #dispatch-sidebar .dispatch-request-row__status--dispatched) { --dispatch-status-color: #8ed1ff; }
:global(:root.dark #dispatch-sidebar .dispatch-request-row__status--accepted),
:global(:root.dark #dispatch-sidebar .dispatch-request-row__status--completed) { --dispatch-status-color: #8de5b8; }
:global(:root.dark #dispatch-sidebar .dispatch-request-row__status--cancelled_by_rescuer) { --dispatch-status-color: #ffadad; }
#dispatch-sidebar .dispatch-request-row__meta {
  display: inline-flex; flex-wrap: wrap; align-items: center; gap: .1rem .35rem;
  margin-inline-start: auto; color: var(--bb-color-muted); line-height: 1.3;
}
#dispatch-sidebar .dispatch-request-row__meta time { white-space: nowrap; }
#dispatch-sidebar .dispatch-request-row__meta span { display: inline-flex; align-items: center; }
:global(:root.dark .dispatch-request-row),
:global(:root.dark .dispatch-responder-row) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, .32) !important;
}
/* Independent pressed button and map action: no nested controls, checkbox,
   Vuetify active overlay, or selection stripe. Standard rows stay two lines. */
#dispatch-sidebar .responder-list { padding: .2rem .2rem .4rem; }
#dispatch-sidebar .dispatch-responder-row {
  display: flex; align-items: center; min-width: 0; min-height: 0; margin-bottom: .25rem; padding: 0;
  border: 1px solid color-mix(in srgb, var(--bb-color-outline) 50%, transparent);
  border-radius: .75rem; background: var(--bb-color-inset);
  box-shadow: 0 2px 7px rgba(14, 42, 45, .12);
  transition: background-color .15s, border-color .15s;
}
#dispatch-sidebar .dispatch-responder-row:last-child { margin-bottom: 0; }
#dispatch-sidebar .dispatch-responder-row:hover {
  border-color: var(--bb-color-outline);
  background: color-mix(in srgb, var(--bb-color-inset) 90%, var(--bb-color-primary));
}
#dispatch-sidebar .dispatch-responder-row--selected {
  border-color: var(--bb-color-primary);
  background: color-mix(in srgb, var(--bb-color-inset) 88%, var(--bb-color-primary));
}
#dispatch-sidebar .dispatch-responder-row__select {
  display: grid; align-content: center; gap: .12rem; flex: 1 1 auto;
  min-width: 0; min-height: 48px; padding: .3rem .5rem;
  border: 0; border-radius: .7rem; background: transparent; color: var(--bb-color-text);
  font: inherit; text-align: start; cursor: pointer;
}
#dispatch-sidebar .dispatch-responder-row__select:focus-visible {
  outline: 3px solid var(--bb-color-primary); outline-offset: -3px;
}
#dispatch-sidebar .dispatch-responder-row__title {
  display: flex; align-items: center; justify-content: space-between; gap: .3rem;
  min-width: 0; font-size: .84rem; line-height: 1.25;
}
#dispatch-sidebar .dispatch-responder-row__identity { display: flex; align-items: center; gap: .25rem; min-width: 0; }
#dispatch-sidebar .dispatch-responder-row__identity .v-icon { flex: none; color: var(--bb-color-primary); }
#dispatch-sidebar .dispatch-responder-row__name {
  display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700;
}
#dispatch-sidebar .dispatch-responder-row__distance {
  display: inline-flex; align-items: center; flex: none; gap: .15rem;
  margin-inline-start: auto; padding: 0 .3rem; min-height: 18px;
  border-radius: .4rem; background: var(--bb-color-surface);
  color: var(--bb-color-primary); font-size: .8rem; font-weight: 600; white-space: nowrap;
}
#dispatch-sidebar .dispatch-responder-row__distance--unknown { color: var(--bb-color-text); }
#dispatch-sidebar .dispatch-responder-row__meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: .05rem .4rem;
  min-width: 0; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.2;
}
#dispatch-sidebar .dispatch-responder-row__meta > span { display: inline-flex; align-items: center; gap: .15rem; }
#dispatch-sidebar .dispatch-responder-row__specialty {
  flex: 1 1 4rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#dispatch-sidebar .dispatch-responder-row__specialty--missing { color: var(--bb-color-error); }
#dispatch-sidebar .dispatch-responder-row__rating,
#dispatch-sidebar .dispatch-responder-row__activity { flex: none; white-space: nowrap; }
#dispatch-sidebar .dispatch-responder-row__proposed {
  flex: 0 1 auto; padding: 0 .3rem; border-radius: .4rem;
  color: var(--bb-color-primary);
  background: color-mix(in srgb, var(--bb-color-primary) 12%, var(--bb-color-inset));
}
#dispatch-sidebar .dispatch-responder-row__map { flex: none; margin-inline-end: .2rem; }
#dispatch-sidebar .admin-dispatch__hidden-selections {
  display: flex; flex-wrap: wrap; align-items: center; gap: .3rem;
  padding: .25rem .4rem; color: var(--bb-color-muted); font-size: .8rem;
}
#dispatch-sidebar .admin-dispatch__responder-search {
  flex-wrap: nowrap; padding: .3rem .3rem .1rem !important; gap: .35rem;
}
#dispatch-sidebar .admin-dispatch__responder-search :deep(.v-input) {
  flex: 1 1 auto; min-width: 0; width: 0;
}
#dispatch-sidebar .admin-dispatch__responder-search-submit { flex: none; }
#dispatch-sidebar .admin-dispatch__submit {
  padding: .25rem .3rem !important; gap: .15rem !important;
  border-top: 0; justify-content: flex-start !important;
}
#dispatch-sidebar .admin-dispatch__submit :deep(.v-btn) { min-height: 38px; padding-inline: .45rem; }
#dispatch-sidebar .admin-dispatch__responder-search :deep(.v-btn) { min-height: 40px; height: 40px; }
#dispatch-sidebar .admin-dispatch__surface :deep(.v-card-text[role="status"]) {
  padding: .55rem .3rem !important;
}
/* A compact desktop rail still retains 44px tap targets on touch widths. */
#dispatch-sidebar :deep(.v-btn) { min-width: 38px; min-height: 38px; height: auto; font-size: .8rem; padding-inline: .5rem; }
#dispatch-sidebar :deep(.v-btn--icon) { width: 38px; height: 38px; padding: 0; }
#dispatch-sidebar .admin-dispatch__toolbar :deep(.v-btn) { height: 38px; min-height: 38px; }
@media (max-width: 900px) {
  #dispatch-sidebar :deep(.v-btn), #dispatch-sidebar .admin-dispatch__toolbar :deep(.v-btn),
  #dispatch-sidebar .admin-dispatch__submit :deep(.v-btn),
  #dispatch-sidebar .admin-dispatch__responder-search :deep(.v-btn) { min-height: 44px; }
  #dispatch-sidebar .admin-dispatch__responder-search :deep(.v-btn) { height: 44px; }
  #dispatch-sidebar :deep(.v-btn--icon) { width: 44px; height: 44px; }
}
.admin-dispatch__map-and-actions { position: absolute; inset: 0; min-width: 0; pointer-events: none; }
.admin-dispatch__map-and-actions > #dispatch-map {
  position: absolute; inset: 0 var(--dispatch-sidebar-width) 0 0;
  width: calc(100% - var(--dispatch-sidebar-width)); height: 100%; margin: 0 !important;
  border: 0; border-radius: 0 !important; pointer-events: auto;
}
.admin-dispatch__map-and-actions .dispatch-map-wrapper {
  display: block; height: 100%; min-height: 0; gap: 0;
}
.admin-dispatch__map-and-actions .dispatch-map-wrapper > :deep(.map-canvas) {
  display: block; width: 100%; height: 100%; min-height: 0;
}
.admin-dispatch__incident-panel {
  position: absolute; z-index: 9; top: calc(5.5rem + env(safe-area-inset-top, 0px));
  left: calc(.75rem + env(safe-area-inset-left, 0px));
  width: var(--dispatch-map-panel-width);
  max-height: min(86dvh, calc(100dvh - 6rem));
  display: flex; flex-direction: column; overflow: hidden; pointer-events: auto;
  border-radius: var(--bb-radius-card, 24px);
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay);
  padding: .35rem;
}
/* Only the content scrolls: the scrollbar stays inset within the outer card,
   while the collapse control remains visible even for long mission histories. */
#dispatch-incident-content {
  --dispatch-incident-inset: .3rem;
  min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin; padding-inline: .15rem; border-radius: .65rem;
}
/* The image establishes the content edge; keep the card contents and mission
   history on that same line, inside the inset scrollport at every width. */
#dispatch-incident-content > .admin-dispatch__mission-header,
#dispatch-incident-content > .dispatch-mission-timeline,
#dispatch-incident-content > .admin-dispatch__followup,
#dispatch-incident-content > #dispatch-notice-09,
#dispatch-incident-content > #dispatch-loading-01,
#dispatch-incident-content > p[role="status"] {
  margin-inline: var(--dispatch-incident-inset);
}
/* The floating panel supplies the surface. Keep facts flat; only the sender
   identity gets a subtle inset treatment, while alerts remain. */
.admin-dispatch__incident-panel #dispatch-incident {
  border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
  background: transparent !important; backdrop-filter: none !important; margin: 0;
}
.admin-dispatch__incident-panel .admin-dispatch__facts > div,
.admin-dispatch__incident-panel .dispatch-mission-timeline,
.admin-dispatch__incident-panel .admin-dispatch__followup {
  border: 0; border-radius: 0; box-shadow: none; background: transparent;
}
.admin-dispatch__incident-panel .admin-dispatch__description,
.admin-dispatch__incident-panel .admin-dispatch__location-details,
.admin-dispatch__incident-panel .admin-dispatch__next { border: 0; }
/* Keep the information and actions on the RTL start edge. */
.admin-dispatch__incident-panel .admin-dispatch__sender-group { margin: .4rem var(--dispatch-incident-inset) .2rem; }
.admin-dispatch__incident-panel .admin-dispatch__sender {
  gap: .5rem; padding: .4rem .55rem;
  border: 1px solid color-mix(in srgb, var(--bb-color-outline) 50%, transparent);
  border-radius: .75rem; background: var(--bb-color-inset);
}
.admin-dispatch__incident-panel .admin-dispatch__sender-copy strong { color: var(--bb-color-muted); font-size: .8rem; font-weight: 600; }
.admin-dispatch__incident-panel .admin-dispatch__photo { margin: .05rem var(--dispatch-incident-inset) .15rem; }
.admin-dispatch__incident-panel .admin-dispatch__photo-preview { height: clamp(8rem, 22vh, 12rem); }
.admin-dispatch__incident-panel #dispatch-incident :deep(.admin-dispatch__detail-body) {
  gap: .5rem; padding: .45rem var(--dispatch-incident-inset) .65rem; line-height: 1.5;
}
.admin-dispatch__incident-panel .admin-dispatch__description {
  padding: 0 0 .55rem; border-bottom: 1px solid var(--bb-color-outline);
}
.admin-dispatch__incident-panel .admin-dispatch__description p { line-height: 1.6; }
.admin-dispatch__incident-panel .admin-dispatch__facts { gap: .45rem; }
.admin-dispatch__incident-panel .admin-dispatch__facts > div { padding: .2rem 0; }
.admin-dispatch__incident-panel .admin-dispatch__next {
  display: flex; flex-wrap: wrap; justify-content: flex-start; gap: .35rem;
  padding: .55rem 0 0; border-top: 1px solid var(--bb-color-outline);
}
.admin-dispatch__incident-panel .admin-dispatch__next :deep(.v-btn) {
  min-height: 44px; height: 44px; padding-inline: .5rem; font-size: .8rem;
}
.admin-dispatch__incident-panel .admin-dispatch__mission-header { margin-bottom: .2rem; }
.admin-dispatch__incident-panel .admin-dispatch__mission-header :deep(.v-btn) { width: 44px; height: 44px; padding: 0; }
.admin-dispatch__incident-panel .admin-dispatch__mission-header + p { margin-bottom: .25rem !important; }
.admin-dispatch__incident-panel :deep(.live-panel) {
  border: 0; border-radius: 0; box-shadow: none; background: transparent;
  margin-block: .5rem; padding: .35rem 0;
}
.admin-dispatch__incident-panel :deep(.live-panel__members),
.admin-dispatch__incident-panel :deep(.live-panel__privacy),
.admin-dispatch__incident-panel .dispatch-mission-timeline :deep(.timeline) {
  border: 0; box-shadow: none; background: transparent;
}
.admin-dispatch__incident-header { display: flex; flex: none; align-items: center; gap: .25rem; min-width: 0; padding-inline: .25rem; }
.admin-dispatch__incident-toggle {
  display: flex; flex: 1 1 auto; align-items: center; gap: .5rem; min-width: 0; min-height: 48px;
  padding: .45rem .4rem; border: 0; border-radius: 1rem; cursor: pointer;
  background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));
  text-align: start; font: inherit;
}
.admin-dispatch__incident-map { flex: none; width: 44px; min-width: 44px; height: 44px; border-radius: .85rem; }
.admin-dispatch__incident-summary {
  display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center;
  gap: .25rem .45rem; min-width: 0;
}
.admin-dispatch__incident-name { display: inline-flex; flex: 1 1 6rem; align-items: center; gap: .35rem; min-width: 0; }
.admin-dispatch__incident-name strong { min-width: 0; overflow-wrap: anywhere; }
.admin-dispatch__priority-dot {
  display: inline-block; flex: none; width: 9px; height: 9px;
  border-radius: 50%; background: var(--sos-priority-accent);
}
.admin-dispatch__incident-status { flex: none; max-width: 100%; white-space: nowrap; }
.admin-dispatch__incident-status :deep(.v-chip__content) { white-space: nowrap; }
.admin-dispatch__incident-toggle:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -3px; }
.admin-dispatch__incident-panel #dispatch-incident { margin-bottom: .3rem; }
.admin-dispatch__incident-panel .admin-dispatch__map-note { margin: .2rem var(--dispatch-incident-inset) .35rem; }
.admin-dispatch__search {
  position: absolute; z-index: 11; top: calc(.75rem + env(safe-area-inset-top, 0px));
  left: calc(.75rem + env(safe-area-inset-left, 0px));
  /* Share the former menu corner; stay within the map before the right rail. */
  width: var(--dispatch-map-panel-width);
  max-height: min(65dvh, 30rem); padding: .6rem .8rem;
  display: flex; flex-direction: column; gap: .5rem; overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), .1);
  border-radius: var(--bb-radius-card, 24px);
  background: rgba(var(--v-theme-surface), .95); color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay); backdrop-filter: blur(10px);
  pointer-events: auto;
}
.admin-dispatch__search-form {
  display: flex; flex: none; align-items: center; gap: .4rem; min-width: 0;
}
.admin-dispatch__search-form :deep(.v-input) { flex: 1 1 auto; min-width: 0; }
.admin-dispatch__search-menu-slot {
  display: grid; place-items: center; flex: none; width: 48px; height: 48px;
}
.admin-dispatch__search-results {
  min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: .15rem; border-radius: .75rem;
}
.admin-dispatch__search-result { display: flex; width: 100%; align-items: center;
  gap: .55rem; padding: .55rem; min-height: 44px; border: 0; border-radius: .65rem;
  background: transparent; color: inherit; text-align: start; font: inherit; cursor: pointer; }
.admin-dispatch__search-result:hover, .admin-dispatch__search-result:focus-visible {
  background: rgba(var(--v-theme-primary), .1); outline-color: rgb(var(--v-theme-primary)); }
.admin-dispatch__search-result small { display: block; color: var(--bb-color-muted); }
.admin-dispatch__search-results p { padding: .55rem; margin: 0; }
.admin-dispatch__search-results p button { color: rgb(var(--v-theme-primary)); min-height: 44px; }
.admin-dispatch__map-and-actions .dispatch-map-key {
  position: absolute; z-index: 4; bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
  right: 4.25rem; left: 24rem;
  width: max-content; max-width: calc(100% - 28.5rem);
  max-height: 7.5rem; overflow-y: auto; border-radius: 1rem;
  box-shadow: var(--bb-shadow-overlay);
}
.admin-dispatch__map-and-actions .dispatch-map-choices {
  /* Keep the whole chooser beside the 44px SOS/Broadcast/legend rail, not
     underneath its buttons. The width shrinks with narrow map viewports. */
  position: absolute; z-index: 15; right: calc(44px + 2rem);
  /* Use the empty lower map area, leaving a slim strip for map attribution. */
  left: auto; bottom: calc(1.75rem + env(safe-area-inset-bottom, 0px));
  max-height: min(15rem, calc(100% - 6rem));
}
:global(.dispatch-place-marker) {
  display: grid; justify-items: center; gap: 3px; max-width: min(12rem, 55vw);
  pointer-events: none; font: 800 .8rem/1.35 var(--bb-font-family);
}
:global(.dispatch-place-marker span) {
  padding: .35rem .65rem; border: 1px solid var(--bb-color-outline);
  border-radius: 1rem; background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface)); box-shadow: var(--bb-shadow-overlay);
  white-space: normal; overflow-wrap: anywhere; text-align: center;
}
:global(.dispatch-place-marker::after) {
  content: ""; display: block; width: 18px; height: 18px;
  border: 3px solid #fff; border-radius: 50%; background: #166bb1;
  box-shadow: 0 0 0 2px #166bb1, 0 3px 8px #142638;
}
@media (max-width: 1100px) {
  .admin-dispatch { --dispatch-sidebar-width: 19rem; }
  .admin-dispatch__map-and-actions .dispatch-map-key {
    left: .75rem; max-width: calc(100% - 5rem);
    bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));
  }
}
@media (max-width: 900px) {
  .admin-dispatch {
    --dispatch-current-sheet-height: min(40dvh, 21rem);
    --dispatch-incident-top: 6rem;
    --dispatch-incident-bottom-clearance: 2rem; /* Keep map attribution accessible above the sheet. */
  }
  .admin-dispatch:has(.admin-dispatch__sidebar--expanded) {
    --dispatch-current-sheet-height: var(--dispatch-expanded-sheet-height);
    --dispatch-incident-bottom-clearance: .75rem;
  }
  .admin-dispatch--incident-at-top { --dispatch-incident-top: 1rem; }
  .admin-dispatch__sidebar {
    top: auto; left: 0; right: 0; bottom: 0; width: 100%;
    height: min(40dvh, 21rem); padding: .7rem .8rem calc(.7rem + env(safe-area-inset-bottom, 0px));
    display: block; border-left: 0; border-top: 1px solid var(--bb-color-outline);
  }
  .admin-dispatch__queue, .admin-dispatch__nearby { display: block; min-height: 0; }
  .admin-dispatch__queue > #dispatch-queue, .admin-dispatch__nearby > #dispatch-responders {
    display: flex; height: auto;
  }
  .admin-dispatch__map-and-actions > #dispatch-map {
    inset: 0 0 min(40dvh, 21rem) 0; width: 100%; height: calc(100% - min(40dvh, 21rem));
  }
  .admin-dispatch__header { padding: 0; margin-bottom: .5rem !important; }
  .admin-dispatch__intro { display: none; }
  .admin-dispatch__filter-select { display: block !important; }
  .admin-dispatch__toolbar-actions { flex-wrap: wrap; }
  .admin-dispatch__search {
    /* The single-row search stays clear of the safe area and exposes more map. */
    top: calc(1rem + env(safe-area-inset-top, 0px)); right: .75rem;
    left: .75rem; width: auto; max-height: min(38dvh, 15rem);
    padding: .6rem; gap: .3rem;
  }
  .admin-dispatch__search-results { max-height: none; }
  /* Only a selected incident displaces search: while the sheet owns the map
     or the incident details are open. An empty sheet keeps search available. */
  .admin-dispatch__search--hidden { visibility: hidden; pointer-events: none; }
  .admin-dispatch__incident-panel {
    /* Below search at peek; in its place for an open sheet or open details.
       Use the actual sheet height so the panel never covers its drag handle. */
    --dispatch-incident-available-height: calc(100dvh - var(--dispatch-current-sheet-height) - var(--dispatch-incident-top) - var(--dispatch-incident-bottom-clearance) - env(safe-area-inset-top, 0px));
    top: calc(var(--dispatch-incident-top) + env(safe-area-inset-top, 0px)); left: .75rem; right: .75rem;
    width: auto; max-height: var(--dispatch-incident-available-height);
  }
  .admin-dispatch__incident-panel--expanded {
    height: var(--dispatch-incident-available-height);
  }
  .admin-dispatch__incident-panel--expanded #dispatch-incident-content { flex: 1 1 auto; }
  .admin-dispatch__map-and-actions .dispatch-map-key {
    bottom: calc(.5rem + env(safe-area-inset-bottom, 0px));
    left: .75rem; right: 4.25rem; width: calc(100% - 5rem);
    max-width: calc(100% - 5rem); max-height: none;
    flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden;
  }
  .admin-dispatch__map-and-actions .dispatch-map-key li { flex: none; }
  /* The map ends above the bottom sheet on phones; its home inset is below
     that sheet, not between this chooser and the map attribution. */
  .admin-dispatch__map-and-actions .dispatch-map-choices {
    bottom: 1.75rem;
  }
  .admin-dispatch__queue .dispatch-request-list, .admin-dispatch__responders .responder-list {
    max-height: 10rem;
  }
}

/* Dispatch rail: one calm surface with a clear hierarchy. Only actionable
   incident/responder rows are inset; the worklists themselves are not cards. */
#dispatch-sidebar.admin-dispatch__sidebar {
  overflow: hidden;
  padding-inline: .8rem;
  box-shadow: -12px 0 32px rgba(15, 40, 46, .08);
}
.admin-dispatch__header { padding: .8rem .35rem .7rem; margin-bottom: 0 !important; }
.admin-dispatch__intro { margin-bottom: .8rem; }
.admin-dispatch__heading { display: flex; align-items: center; gap: .7rem; min-width: 0; }
.admin-dispatch__brand-icon {
  display: grid; place-items: center; flex: none; width: 2.6rem; height: 2.6rem;
  border-radius: .85rem; color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), .1);
}
.admin-dispatch__heading-copy { min-width: 0; }
.admin-dispatch__eyebrow {
  display: block; color: var(--bb-color-muted); font-size: .8rem;
  line-height: 1.4; letter-spacing: .02em;
}
.admin-dispatch__heading h1 { margin: .1rem 0 0; font-size: 1.02rem !important; line-height: 1.5; font-weight: 800; }
.admin-dispatch__eyebrow span { padding-inline: .2rem; opacity: .6; }
.admin-dispatch__toolbar { gap: .45rem; }
.admin-dispatch__toolbar-actions { gap: .2rem; }
#dispatch-sidebar .admin-dispatch__toolbar-actions :deep(.v-btn) {
  border-radius: .7rem; background: var(--bb-color-inset);
}
#dispatch-sidebar .admin-dispatch__content {
  display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0;
  overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;
}
#dispatch-sidebar .admin-dispatch__queue,
#dispatch-sidebar .admin-dispatch__nearby { min-height: 0; }
#dispatch-sidebar .admin-dispatch__queue { border-top: 1px solid var(--bb-color-outline); padding-top: .55rem; }
#dispatch-sidebar .admin-dispatch__nearby { border-top: 1px solid var(--bb-color-outline); padding-top: .55rem; }
#dispatch-sidebar .admin-dispatch__surface :deep(.v-card-title) { padding: .4rem .35rem .45rem; }
.admin-dispatch__section-number {
  display: inline-grid; place-items: center; width: 1.65rem; height: 1.65rem;
  flex: none; border-radius: .55rem; color: var(--bb-color-primary);
  background: rgba(var(--v-theme-primary), .1); font-size: .8rem; font-weight: 800;
}
#dispatch-sidebar .dispatch-request-list,
#dispatch-sidebar .responder-list { scrollbar-width: thin; }
#dispatch-sidebar .dispatch-request-row,
#dispatch-sidebar .dispatch-responder-row {
  box-shadow: none; transition: border-color .16s, background-color .16s, box-shadow .16s;
}
#dispatch-sidebar .dispatch-request-row:hover,
#dispatch-sidebar .dispatch-responder-row:hover { box-shadow: 0 3px 12px rgba(14, 42, 45, .07); }
:global(:root.dark #dispatch-sidebar .dispatch-request-row),
:global(:root.dark #dispatch-sidebar .dispatch-responder-row) { box-shadow: none !important; }
#dispatch-sidebar .dispatch-request-row :deep(.v-list-item__content) { gap: .25rem; }
#dispatch-sidebar .dispatch-request-row__name { font-weight: 750; }
#dispatch-sidebar .admin-dispatch__submit {
  margin-top: auto; padding: .65rem .35rem .5rem !important;
  border-top: 1px solid var(--bb-color-outline);
  background: rgb(var(--v-theme-surface));
}
#dispatch-sidebar .admin-dispatch__submit :deep(.v-btn) { min-height: 42px; padding-inline: .75rem; }
#dispatch-sidebar .admin-dispatch__sheet-handle { display: none; }
#dispatch-sidebar .admin-dispatch__back-to-queue:focus-visible,
#dispatch-sidebar .admin-dispatch__sheet-handle:focus-visible {
  outline: 3px solid var(--bb-color-primary); outline-offset: -3px;
}
/* Both worklists share the form language: spacious touch rows, quiet
   surfaces, explicit selection and no stacked-card shadows. */
#dispatch-sidebar .dispatch-request-list,
#dispatch-sidebar .responder-list { padding: .25rem .15rem .65rem; }
#dispatch-sidebar .dispatch-request-row {
  min-height: 68px; margin-bottom: .4rem; padding: .55rem .6rem;
  background: var(--bb-color-inset);
}
#dispatch-sidebar .dispatch-request-row.v-list-item--active {
  border-color: var(--bb-color-primary);
  background: color-mix(in srgb, var(--bb-color-inset) 84%, var(--bb-color-primary));
}
#dispatch-sidebar .dispatch-request-row :deep(.v-list-item-title.dispatch-request-row__title) {
  gap: .4rem !important; font-size: .9rem; line-height: 1.4;
}
#dispatch-sidebar .dispatch-request-row__marker { width: 11px; height: 11px; }
#dispatch-sidebar .dispatch-request-row__details { gap: .3rem .4rem; }
#dispatch-sidebar .dispatch-request-row__status { min-height: 24px; padding-inline: .45rem; }
#dispatch-sidebar .dispatch-request-row__meta { gap: .25rem .5rem; }
#dispatch-sidebar .dispatch-request-row__attachment {
  justify-content: center; min-width: 26px; min-height: 26px;
  padding: .25rem; border-radius: .4rem; color: var(--bb-color-primary);
  background: rgba(var(--v-theme-primary), .09);
}
#dispatch-sidebar .dispatch-responder-row {
  min-height: 68px; margin-bottom: .4rem; border-radius: .85rem;
}
#dispatch-sidebar .dispatch-responder-row--selected {
  border-color: var(--bb-color-primary);
  background: color-mix(in srgb, var(--bb-color-inset) 84%, var(--bb-color-primary));
}
#dispatch-sidebar .dispatch-responder-row__select { min-height: 68px; padding: .55rem .45rem .55rem .6rem;
  gap: .3rem; }
#dispatch-sidebar .dispatch-responder-row__title { gap: .4rem; font-size: .9rem; line-height: 1.4; }
#dispatch-sidebar .dispatch-responder-row__identity { gap: .5rem; }
#dispatch-sidebar .dispatch-responder-row__selection {
  display: grid; place-items: center; flex: none; width: 1.65rem; height: 1.65rem;
  border: 1px solid var(--bb-color-outline); border-radius: .55rem;
  background: rgb(var(--v-theme-surface)); color: var(--bb-color-muted);
}
#dispatch-sidebar .dispatch-responder-row--selected .dispatch-responder-row__selection {
  border-color: var(--bb-color-primary); background: var(--bb-color-primary); color: white;
}
#dispatch-sidebar .dispatch-responder-row__distance { background: rgba(var(--v-theme-primary), .09);
  min-height: 24px; padding-inline: .4rem; }
#dispatch-sidebar .dispatch-responder-row__meta { gap: .2rem .55rem; line-height: 1.4; }
#dispatch-sidebar .dispatch-responder-row__map { min-width: 44px; min-height: 44px; }
@media (forced-colors: active) {
  #dispatch-sidebar .dispatch-request-row.v-list-item--active,
  #dispatch-sidebar .dispatch-responder-row--selected { outline: 2px solid Highlight; outline-offset: -2px; }
  #dispatch-sidebar .dispatch-responder-row__selection { border-color: CanvasText; }
}
@media (max-width: 900px) {
  #dispatch-sidebar.admin-dispatch__sidebar {
    display: flex; flex-direction: column;
    padding: .35rem max(.85rem, env(safe-area-inset-right, 0px))
      max(.45rem, env(safe-area-inset-bottom, 0px)) max(.85rem, env(safe-area-inset-left, 0px));
    border-radius: 1.15rem 1.15rem 0 0; box-shadow: 0 -12px 35px rgba(12, 34, 42, .18);
    transition: height .24s ease;
  }
  #dispatch-sidebar.admin-dispatch__sidebar--dragging { transition: none; }
  #dispatch-sidebar.admin-dispatch__sidebar--expanded { height: var(--dispatch-expanded-sheet-height); }
  #dispatch-sidebar .admin-dispatch__sheet-handle {
    display: grid; place-items: center; flex: none; width: 100%; height: 44px;
    padding: 0 0 18px; border: 0; border-radius: .75rem; background: transparent;
    cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
  }
  #dispatch-sidebar .admin-dispatch__sheet-handle span {
    display: block; width: 2.5rem; height: 5px; border-radius: 999px;
    background: color-mix(in srgb, var(--bb-color-muted) 75%, var(--bb-color-surface));
  }
  #dispatch-sidebar .admin-dispatch__sheet-handle:hover span,
  #dispatch-sidebar .admin-dispatch__sheet-handle:focus-visible span,
  #dispatch-sidebar.admin-dispatch__sidebar--dragging .admin-dispatch__sheet-handle span {
    background: var(--bb-color-primary);
  }
  #dispatch-sidebar.admin-dispatch__sidebar--dragging .admin-dispatch__sheet-handle { cursor: grabbing; }
  #dispatch-sidebar .admin-dispatch__header { flex: none; padding: 0 0 .3rem; }
  #dispatch-sidebar > :deep(.dispatch-quick-feedback) {
    margin: .1rem .2rem .35rem; padding: .45rem .55rem;
  }
  /* Keep the full page title on desktop without spending a mobile row on it. */
  #dispatch-sidebar .admin-dispatch__intro { display: none; }
  #dispatch-sidebar .admin-dispatch__toolbar { gap: .35rem; }
  #dispatch-sidebar .admin-dispatch__toolbar-actions { gap: .15rem; }
  #dispatch-sidebar .admin-dispatch__filter-select { width: 100%; }
  #dispatch-sidebar .admin-dispatch__back-to-queue {
    display: inline-flex; flex: none; padding: 0;
    width: 44px; min-width: 44px; height: 44px; min-height: 44px;
    color: var(--bb-color-primary);
  }
  #dispatch-sidebar .admin-dispatch__nearby-empty .admin-dispatch__back-to-queue {
    align-self: flex-start; margin-top: .3rem;
  }
  #dispatch-sidebar .admin-dispatch__content {
    flex: 1 1 auto; overflow-y: auto; padding-bottom: .5rem;
  }
  #dispatch-sidebar .admin-dispatch__section--hidden { display: none; }
  /* The mobile toolbar and worklist are one surface; desktop section rules
     remain intact, but do not draw another rule immediately below the filter. */
  #dispatch-sidebar .admin-dispatch__queue { flex: none; border-top: 0; }
  /* Grow the responder worklist into the remaining space. On short/peek
     sheets the card keeps room for its controls and the outer scrollport
     exposes them; on expanded sheets only its result rows need to scroll. */
  #dispatch-sidebar .admin-dispatch__nearby:not(.admin-dispatch__section--hidden) {
    display: flex; flex: 1 0 auto; flex-direction: column; min-height: 0;
    border-top: 0;
  }
  /* Use all available space for the SOS rows; the queue is the only mobile
     entry view, so its desktop heading would repeat the current context. */
  #dispatch-sidebar .admin-dispatch__queue :deep(.v-card-title) { display: none; }
  #dispatch-sidebar .admin-dispatch__queue { padding-top: .2rem; }
  #dispatch-sidebar .admin-dispatch__nearby { padding-top: .3rem; }
  #dispatch-sidebar .admin-dispatch__responders :deep(.v-card-title) { padding: .2rem .25rem .1rem; }
  #dispatch-sidebar .admin-dispatch__responder-search { padding: .1rem .2rem .15rem !important; }
  #dispatch-sidebar .admin-dispatch__responders .responder-list { padding: .15rem .1rem .2rem; }
  #dispatch-sidebar .dispatch-responder-row { margin-bottom: .25rem; }
  /* Separate the back action from the proposal button without adding a divider. */
  #dispatch-sidebar .admin-dispatch__submit {
    flex-wrap: nowrap !important; gap: .75rem !important;
    padding: .35rem .2rem .15rem !important; border-top: 0;
  }
  #dispatch-sidebar .admin-dispatch__submit :deep(.admin-dispatch__back-to-queue) {
    flex: 0 0 44px; width: 44px; min-width: 44px; padding: 0;
  }
  #dispatch-sidebar .admin-dispatch__submit :deep(#dispatch-action-17) {
    flex: 1 1 auto; min-width: 0; width: auto;
  }
  #dispatch-sidebar .admin-dispatch__queue .dispatch-request-list {
    max-height: none; overflow: visible;
  }
  #dispatch-sidebar .admin-dispatch__queue > #dispatch-queue { height: auto; }
  #dispatch-sidebar .admin-dispatch__nearby > #dispatch-responders {
    flex: 1 1 auto; height: 17rem; min-height: 17rem;
  }
  #dispatch-sidebar .admin-dispatch__responders .responder-list {
    flex: 1 1 auto; min-height: 4.5rem; max-height: none;
    overflow-y: auto; overscroll-behavior: contain;
  }
  /* The action stays below the growing result list, independently of the
     number of responders. Keep the card overflow visible for the sticky
     action on short sheets where the entire worklist must scroll. */
  #dispatch-sidebar .admin-dispatch__responders { overflow: visible !important; }
  #dispatch-sidebar .admin-dispatch__submit { position: sticky; bottom: 0; }
  #dispatch-sidebar .admin-dispatch__submit :deep(.v-btn) { min-height: 44px; }
  #dispatch-sidebar .admin-dispatch__responder-search :deep(.v-btn) { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  #dispatch-sidebar.admin-dispatch__sidebar,
  #dispatch-sidebar .dispatch-request-row,
  #dispatch-sidebar .dispatch-responder-row { transition: none; }
}
@media (forced-colors: active) {
  #dispatch-sidebar .admin-dispatch__sheet-handle,
  #dispatch-sidebar .admin-dispatch__brand-icon,
  #dispatch-sidebar .admin-dispatch__section-number { border: 1px solid CanvasText; }
}
</style>
