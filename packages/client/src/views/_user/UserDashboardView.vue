<template>
  <section class="user-dashboard" aria-labelledby="user-dashboard-title">
    <header class="user-dashboard__header">
      <div>
        <p class="user-dashboard__eyebrow">
          <v-icon icon="mdi-view-dashboard-outline" size="18" />
          فضای کاربری
        </p>
        <h1 id="user-dashboard-title">پیشخوان</h1>
        <p class="user-dashboard__welcome">
          خوش آمدید، <bdi class="user-dashboard__username" dir="ltr">{{ username }}</bdi>
        </p>
        <div v-if="auth.userCategories.length > 0" class="mt-2 flex flex-wrap items-center gap-1">
          <span class="text-xs opacity-75">گروه امدادگر:</span>
          <v-chip
            v-for="category in auth.userCategories"
            :key="category.id"
            size="small"
            color="primary"
            variant="tonal"
          >
            {{ category.name }}
          </v-chip>
        </div>
      </div>
      <v-btn
        class="user-dashboard__map-action"
        to="/_user/map"
        color="primary"
        variant="flat"
        rounded="lg"
      >
        <v-icon class="me-2" icon="mdi-map-outline" />
        نمایش نقشهٔ تمام‌صفحه
      </v-btn>
    </header>

    <div class="user-dashboard__grid">
      <v-card class="user-dashboard__map-card" elevation="0" rounded="xl">
        <div class="user-dashboard__card-header">
          <div>
            <p class="user-dashboard__card-kicker">نمای کلی</p>
            <h2 id="dashboard-map-title">نقشهٔ محلی تهران</h2>
            <p>نقشه را مرور کنید؛ برای دید کامل‌تر آن را تمام‌صفحه باز کنید.</p>
          </div>
          <v-btn
            class="user-dashboard__open-map"
            to="/_user/map"
            variant="tonal"
            color="primary"
            rounded="lg"
            aria-label="باز کردن نقشهٔ تمام‌صفحه"
          >
            <v-icon icon="mdi-arrow-expand-all" />
          </v-btn>
        </div>

        <div class="user-dashboard__map-preview">
          <MapCanvas
            :style-url="mapStyleUrl"
            aria-label="پیش‌نمایش نقشهٔ تعاملی"
          />
        </div>

        <div class="user-dashboard__broadcast">
          <LiveBroadcastBar />
        </div>
      </v-card>

      <aside class="user-dashboard__side" aria-label="وضعیت امکانات بوروبیا">
        <ShareLists ref="shareLists" @create="shareOpen = true" @changed="onSharesChanged" />

        <v-card class="user-dashboard__feature-card" elevation="0" rounded="xl">
          <v-chip class="user-dashboard__coming-soon" color="error" variant="tonal" size="small">
            فعال — اضطراری
          </v-chip>
          <div class="user-dashboard__feature-icon" aria-hidden="true">
            <v-icon icon="mdi-alarm-light" size="28" />
          </div>
          <h2>درخواست امداد فوری (SOS)</h2>
          <p>
            در شرایط اضطراری، دکمهٔ قرمز SOS همیشه در پایین صفحه در دسترس است یا از همین‌جا فرم امداد و انتخاب محل روی نقشه را باز کنید.
          </p>
          <v-btn
            class="mt-3"
            color="error"
            variant="flat"
            rounded="lg"
            block
            prepend-icon="mdi-alarm-light"
            @click="sosSheet.openSheet()"
          >
            ارسال درخواست امداد (SOS)
          </v-btn>
        </v-card>

        <v-card class="user-dashboard__note-card user-dashboard__devices-card" elevation="0" rounded="xl">
          <v-icon icon="mdi-devices" size="23" />
          <div>
            <h2>دستگاه پخش‌کننده</h2>
            <p>اگر با دو دستگاه وارد شده‌اید، مشخص کنید کدام موقعیت بفرستد — و هر وقت خواستید عوضش کنید.</p>
          </div>
          <v-btn class="user-dashboard__devices-link" size="small" variant="tonal" color="primary" to="/_user/devices">
            دستگاه‌ها
          </v-btn>
        </v-card>

        <v-card class="user-dashboard__note-card" elevation="0" rounded="xl">
          <v-icon icon="mdi-shield-check-outline" size="23" />
          <div>
            <h2>حریم خصوصی در اولویت است</h2>
            <p>تا وقتی خودتان اشتراکی باز نکنید، هیچ موقعیت زنده‌ای دیده نمی‌شود. فهرست بالا همیشه از همین سرور خوانده می‌شود، نه از حافظهٔ مرورگر.</p>
          </div>
        </v-card>
      </aside>
    </div>

    <ShareDialog v-model="shareOpen" @shared="onShared" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MapCanvas from "@/components/map/MapCanvas.vue";
import LiveBroadcastBar from "@/components/sharing/LiveBroadcastBar.vue";
import ShareDialog from "@/components/sharing/ShareDialog.vue";
import ShareLists from "@/components/sharing/ShareLists.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { useAuthStore } from "@/stores/auth";
import { useBroadcastStore } from "@/stores/broadcast";
import { useSosSheetStore } from "@/stores/sos-sheet";
import { useThemeStore } from "@/stores/theme";

const auth = useAuthStore();
const broadcast = useBroadcastStore();
const sosSheet = useSosSheetStore();
const theme = useThemeStore();
const username = computed(() => auth.user?.username ?? "همراه");

onMounted(() => {
  void auth.refreshProfile();
});
const mapStyleUrl = computed(() => mapStyleForTheme(theme.isDark));
const shareOpen = ref(false);
const shareLists = ref<InstanceType<typeof ShareLists> | null>(null);

/** The dialog reports success after a 201; the lists and priority state re-read from the server. */
function onShared(): void {
  void shareLists.value?.refresh();
  void broadcast.refreshPriority();
}

function onSharesChanged(): void {
  void broadcast.refreshPriority();
}
</script>

<style scoped>
.user-dashboard {
  width: min(100%, 78rem);
  min-height: calc(100vh - 132px);
  margin-inline: auto;
  padding: clamp(1.25rem, 3vw, 2.5rem) clamp(1rem, 4vw, 3rem) 3rem;
}

.user-dashboard__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.user-dashboard__eyebrow,
.user-dashboard__card-kicker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: #536d6c;
  font-size: 0.82rem;
  font-weight: 800;
}

.user-dashboard h1 {
  margin: 0.45rem 0 0.15rem;
  color: #173b3c;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  font-weight: 800;
  letter-spacing: -0.035em;
}

.user-dashboard__welcome {
  margin: 0;
  color: #536d6c;
  font-size: 0.96rem;
}

.user-dashboard__username {
  color: #0e6666;
  font-weight: 700;
}

.user-dashboard__map-action {
  flex: 0 0 auto;
  min-height: 44px;
}

.user-dashboard__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(16rem, 0.85fr);
  align-items: start;
  gap: 1.25rem;
}

.user-dashboard__map-card,
.user-dashboard__feature-card,
.user-dashboard__note-card {
  border: 1px solid rgba(25, 53, 54, 0.08);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 12px 34px rgba(25, 53, 54, 0.055);
}

.user-dashboard__card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.35rem 1rem;
}

.user-dashboard__card-kicker {
  margin-bottom: 0.3rem;
  color: var(--bb-color-muted);
  font-size: 0.73rem;
}

.user-dashboard__card-header h2,
.user-dashboard__feature-card h2,
.user-dashboard__note-card h2 {
  margin: 0;
  color: #193536;
  font-size: 1.08rem;
  font-weight: 800;
}

.user-dashboard__card-header p {
  margin: 0.35rem 0 0;
  color: var(--bb-color-muted);
  font-size: 0.84rem;
  line-height: 1.7;
}

.user-dashboard__open-map {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
}

.user-dashboard__map-preview {
  height: clamp(18rem, 38vw, 27rem);
  margin-inline: 1rem;
  overflow: hidden;
  border-radius: 0.9rem;
  background: #e8efec;
}

.user-dashboard__broadcast {
  padding: 0.85rem 1rem 1rem;
}

.user-dashboard__side {
  display: grid;
  gap: 1rem;
}

.user-dashboard__feature-card {
  position: relative;
  padding: 1.35rem;
}

.user-dashboard__coming-soon {
  position: absolute;
  inset-block-start: 1.2rem;
  inset-inline-end: 1.2rem;
}

.user-dashboard__feature-icon {
  display: grid;
  width: 3.1rem;
  height: 3.1rem;
  margin-bottom: 1rem;
  place-items: center;
  border-radius: 1rem;
  color: #0e6666;
  background: rgba(14, 102, 102, 0.09);
}

.user-dashboard__feature-card h2 {
  max-width: 13rem;
  font-size: 1.12rem;
  line-height: 1.6;
}

.user-dashboard__feature-card > p {
  margin: 0.5rem 0 1.1rem;
  color: var(--bb-color-muted);
  font-size: 0.84rem;
  line-height: 1.8;
}

.user-dashboard__feature-list {
  display: grid;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(25, 53, 54, 0.08);
}

.user-dashboard__feature-list > div {
  display: grid;
  grid-template-columns: 1.3rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  color: #536d6c;
  font-size: 0.78rem;
}

.user-dashboard__feature-list :deep(.v-icon) {
  color: #0e6666;
}

.user-dashboard__feature-state {
  color: #9a7951;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}

.user-dashboard__note-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  color: #347c61;
  background: rgba(52, 124, 97, 0.07);
}

.user-dashboard__devices-link {
  flex: 0 0 auto;
  align-self: center;
}

.user-dashboard__note-card > .v-icon {
  flex: 0 0 auto;
  margin-top: 0.1rem;
}

.user-dashboard__note-card h2 {
  font-size: 0.87rem;
}

.user-dashboard__note-card p {
  margin: 0.25rem 0 0;
  color: #536d6c;
  font-size: 0.76rem;
  line-height: 1.7;
}

:global(:root.dark) .user-dashboard__eyebrow,
:global(:root.dark) .user-dashboard__card-kicker {
  color: #9fc4bc;
}

:global(:root.dark) .user-dashboard h1,
:global(:root.dark) .user-dashboard__card-header h2,
:global(:root.dark) .user-dashboard__feature-card h2,
:global(:root.dark) .user-dashboard__note-card h2 {
  color: #edf5f2;
}

:global(:root.dark) .user-dashboard__welcome,
:global(:root.dark) .user-dashboard__card-header p,
:global(:root.dark) .user-dashboard__feature-card > p,
:global(:root.dark) .user-dashboard__map-caption,
:global(:root.dark) .user-dashboard__note-card p {
  color: #a0b6b2;
}

:global(:root.dark) .user-dashboard__username {
  color: #71c7be;
}

:global(:root.dark) .user-dashboard__map-card,
:global(:root.dark) .user-dashboard__feature-card {
  border-color: rgba(190, 221, 213, 0.11);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.14);
}

:global(:root.dark) .user-dashboard__feature-icon {
  color: #71c7be;
  background: rgba(113, 199, 190, 0.11);
}

:global(:root.dark) .user-dashboard__feature-list {
  border-top-color: rgba(190, 221, 213, 0.12);
}

:global(:root.dark) .user-dashboard__feature-list > div {
  color: #c1d2cd;
}

:global(:root.dark) .user-dashboard__note-card {
  color: #6bbe93;
  background: rgba(107, 190, 147, 0.1);
}

:global(:root.dark) .user-dashboard__note-card p {
  color: #a0b6b2;
}

@media (max-width: 900px) {
  .user-dashboard__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .user-dashboard__side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .user-dashboard {
    padding-inline: 1rem;
  }

  .user-dashboard__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .user-dashboard__map-action {
    width: 100%;
  }

  .user-dashboard__card-header {
    align-items: flex-start;
    padding-inline: 1rem;
  }

  .user-dashboard__card-header p {
    max-width: 24rem;
  }

  .user-dashboard__map-preview {
    height: 20rem;
    margin-inline: 0.6rem;
  }

  .user-dashboard__map-caption {
    padding-inline: 1rem;
  }

  .user-dashboard__side {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
