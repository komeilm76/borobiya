import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useOnline, useNetwork, useEventListener } from '@vueuse/core';

/**
 * Connectivity and service-worker state.
 * Online detection, connection metadata and the `online`/`offline` listeners all come
 * from VueUse rather than hand-written DOM plumbing.
 */
export const useOfflineStore = defineStore('offline', () => {
  const online = useOnline();
  const network = useNetwork();
  const serviceWorkerReady = ref(false);
  const cachedVersion = ref<string | null>(null);
  const lastOfflineAt = ref<number | null>(null);

  const offline = computed(() => !online.value);
  const effectiveType = computed(() => network.effectiveType.value ?? 'unknown');
  const statusLabel = computed(() => (offline.value ? 'حالت آفلاین' : 'متصل'));

  /**
   * Registers the generated service worker.
   *
   * @returns True when registration succeeded.
   */
  async function registerServiceWorker(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    if (window.location.protocol === 'file:') return false;
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const registration = await navigator.serviceWorker.ready;
      serviceWorkerReady.value = Boolean(registration);
      return serviceWorkerReady.value;
    } catch {
      serviceWorkerReady.value = false;
      return false;
    }
  }

  /**
   * Reads the generated cache manifest so the UI can show the offline dataset version.
   *
   * @returns The manifest version, or null when unavailable.
   */
  async function loadCacheVersion(): Promise<string | null> {
    try {
      const response = await fetch('/assets/cache-manifest.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const manifest = (await response.json()) as { version?: string };
      cachedVersion.value = manifest.version ?? null;
      return cachedVersion.value;
    } catch {
      return null;
    }
  }

  useEventListener(window, 'offline', () => {
    lastOfflineAt.value = Date.now();
  });

  watch(offline, (value) => {
    if (value) document.documentElement.setAttribute('data-offline', 'true');
    else document.documentElement.removeAttribute('data-offline');
  }, { immediate: true });

  return {
    online,
    offline,
    network,
    effectiveType,
    statusLabel,
    serviceWorkerReady,
    cachedVersion,
    lastOfflineAt,
    registerServiceWorker,
    loadCacheVersion
  };
});
