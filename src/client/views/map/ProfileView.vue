<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth.ts';
import { useSettingsStore } from '@/stores/settings.ts';
import { useOfflineStore } from '@/stores/offline.ts';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useToast } from '@/composables/useToast.ts';
import { errorMessage } from '@/api/client.ts';
import type { SavedPlaceView } from '@/api/types.ts';

/** Profile screen: identity, active devices, saved places, theme choice and offline dataset version. */
const auth = useAuthStore();
const settings = useSettingsStore();
const offline = useOfflineStore();
const map = useMapStore();
const format = useFormatters();
const toast = useToast();
const devices = computed(() => auth.devices);
const places = computed(() => map.places);

onMounted(() => {
  void auth.loadDevices();
  if (!places.value.length && !map.loading) void map.load();
});

const PLACE_ICONS = ['map-marker-outline', 'home-outline', 'star', 'map-marker-path'] as const;

const editingId = ref<string | null>(null);
const editName = ref('');
const editLabel = ref('');
const editAddress = ref('');
const editIcon = ref<string>('map-marker-outline');
const saving = ref(false);
const deletingId = ref<string | null>(null);

function startEdit(place: SavedPlaceView): void {
  editingId.value = place.id;
  editName.value = place.name;
  editLabel.value = place.label;
  editAddress.value = place.address;
  editIcon.value = place.icon || 'map-marker-outline';
}
function cancelEdit(): void {
  editingId.value = null;
}
const canSaveEdit = computed(() => editName.value.trim().length >= 1 && editLabel.value.trim().length >= 1 && editAddress.value.trim().length >= 1 && !saving.value);

async function saveEdit(place: SavedPlaceView): Promise<void> {
  if (editingId.value !== place.id || !canSaveEdit.value) return;
  saving.value = true;
  try {
    await map.updatePlace(place, {
      name: editName.value.trim(),
      label: editLabel.value.trim(),
      address: editAddress.value.trim(),
      icon: editIcon.value
    });
    toast.push('تغییرات مکان ذخیره شد.', 'success', 2400);
    editingId.value = null;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    saving.value = false;
  }
}

async function remove(place: SavedPlaceView): Promise<void> {
  if (deletingId.value) return;
  deletingId.value = place.id;
  try {
    await map.deletePlace(place.id);
    toast.push('مکان حذف شد.', 'success', 2400);
    if (editingId.value === place.id) editingId.value = null;
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>{{ auth.user?.username ?? 'کاربر' }}</strong>
      <span>{{ auth.user?.role }} · امتیاز {{ format.number(auth.user?.averageRating ?? 0) }}</span>
    </div>
    <button type="button" class="sheet__expand" aria-label="تغییر پوسته" @click="settings.cycle()">
      <span class="mdi mdi-theme-light-dark" aria-hidden="true" />
    </button>
  </div>
  <div class="sheet__body">
    <h3 class="sheet__subtitle">دستگاه‌های فعال</h3>
    <ul class="device-list">
      <li v-for="device in devices" :key="device.sessionId">
        <span class="mdi mdi-cellphone-link" aria-hidden="true" />
        <div>
          <strong>{{ device.deviceName }}</strong>
          <small>{{ device.ip }} · {{ format.dateTime(device.lastActiveAt) }}</small>
        </div>
        <!-- The current session cannot revoke itself: the button is disabled, not merely failing. -->
        <button type="button" class="text-link" :disabled="device.isCurrentDevice" @click="auth.revokeDevice(device.sessionId)">
          {{ device.isCurrentDevice ? 'این دستگاه' : 'پایان' }}
        </button>
      </li>
    </ul>
    <p v-if="!devices.length" class="sheet__status">دستگاه دیگری فعال نیست.</p>

    <h3 class="sheet__subtitle">مکان‌های ذخیره‌شده</h3>
    <ul class="place-list">
      <li v-for="place in places" :key="place.id" class="place-item">
        <div class="place-row" :class="{ 'is-editing': editingId === place.id }">
          <span :class="['mdi', `mdi-${place.icon || 'map-marker-outline'}`]" aria-hidden="true" />
          <span class="place-row__text">
            <strong>{{ place.label }}</strong>
            <small>{{ place.address }}</small>
          </span>
          <span class="place-row__actions">
            <button type="button" class="text-link" :data-testid="`edit-place-${place.id}`" @click="editingId === place.id ? cancelEdit() : startEdit(place)">
              {{ editingId === place.id ? 'بستن' : 'ویرایش' }}
            </button>
            <button type="button" class="text-link text-link--danger" :disabled="deletingId === place.id" :data-testid="`delete-place-${place.id}`" @click="remove(place)">
              {{ deletingId === place.id ? 'در حال حذف…' : 'حذف' }}
            </button>
          </span>
        </div>
        <form v-if="editingId === place.id" class="place-edit" @submit.prevent="saveEdit(place)">
          <label><span>نام</span><input v-model="editName" required maxlength="80" /></label>
          <label><span>برچسب</span><input v-model="editLabel" required maxlength="80" /></label>
          <label><span>نشانی</span><input v-model="editAddress" required maxlength="200" /></label>
          <fieldset class="save-place-form__icons">
            <legend>نماد</legend>
            <label v-for="icon in PLACE_ICONS" :key="icon" class="save-place-form__icon">
              <input v-model="editIcon" type="radio" :value="icon" :name="`edit-icon-${place.id}`" />
              <span :class="['mdi', `mdi-${icon}`]" aria-hidden="true" />
            </label>
          </fieldset>
          <div class="action-row">
            <button type="submit" class="primary-button" :disabled="!canSaveEdit">{{ saving ? 'در حال ذخیره…' : 'ذخیره تغییرات' }}</button>
            <button type="button" class="ghost-button" @click="cancelEdit">انصراف</button>
          </div>
        </form>
      </li>
    </ul>
    <p v-if="!places.length" class="sheet__status">هنوز مکانی ذخیره نشده است؛ روی نقشه ضربه بزنید و آن را ذخیره کنید.</p>
    <div class="info-card">
      <span class="mdi mdi-cloud-check-outline" aria-hidden="true" />
      <div>
        <strong>نسخه داده آفلاین</strong>
        <span>{{ offline.cachedVersion ?? 'در حال خواندن…' }}</span>
      </div>
    </div>
    <div class="info-card">
      <span class="mdi mdi-shield-check-outline" aria-hidden="true" />
      <div>
        <strong>پرسش‌های امنیتی</strong>
        <span>{{ auth.user?.securityReady ? 'تنظیم شده' : 'نیازمند تکمیل' }}</span>
      </div>
    </div>
  </div>
</template>
