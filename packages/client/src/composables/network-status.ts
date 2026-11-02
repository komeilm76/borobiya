import { ref } from "vue";
import { apiRoutes } from "@shared/api";
import { requestJson } from "../api/http";

export type NetworkStatus = "checking" | "reachable" | "unavailable" | "offline";

export const NETWORK_STATUS_PRESENTATION: Record<NetworkStatus, { icon: string; color: string; label: string }> = {
  checking: { icon: "mdi-wifi-sync", color: "info", label: "در حال بررسی ارتباط با سرور…" },
  reachable: { icon: "mdi-wifi-check", color: "success", label: "ارتباط با سرور برقرار است" },
  unavailable: { icon: "mdi-wifi-alert", color: "warning", label: "ارتباط با سرور برقرار نیست؛ برای بررسی دوباره بزنید" },
  offline: { icon: "mdi-wifi-off", color: "error", label: "دستگاه آفلاین است؛ پس از اتصال دوباره بررسی می‌شود" }
};

const PROBE_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 30_000;

async function probeApi(signal: AbortSignal): Promise<boolean> {
  const response = await requestJson<unknown>(apiRoutes.public.health.url, { signal, cache: "no-store" });
  return response !== null && typeof response === "object" && "status" in response && response.status === "ok";
}

interface MonitorOptions {
  /** Browser events and probe are injectable so reconnection races can be tested without mounting Vue. */
  events?: Pick<Window, "addEventListener" | "removeEventListener">;
  isOnline?: () => boolean;
  probe?: (signal: AbortSignal) => Promise<boolean>;
}

/** Reports reachability of the app API, not GPS, map tiles, realtime rooms or the Internet at large. */
export function createNetworkStatusMonitor(options: MonitorOptions = {}) {
  const events = options.events ?? (typeof window !== "undefined" ? window : undefined);
  const isOnline = options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
  const probe = options.probe ?? probeApi;
  const status = ref<NetworkStatus>(isOnline() ? "checking" : "offline");
  let started = false;
  let request: AbortController | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  function cancelProbe(): void {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    request?.abort();
    request = null;
  }

  async function check(): Promise<void> {
    if (!started) return;
    if (!isOnline()) {
      cancelProbe();
      status.value = "offline";
      return;
    }
    cancelProbe();
    const controller = new AbortController();
    request = controller;
    status.value = "checking";
    timeout = setTimeout(() => {
      // An abort is advisory: a service worker or injected transport may never
      // settle its promise. End checking on time and fence any late response.
      if (started && request === controller) {
        request = null;
        timeout = null;
        status.value = isOnline() ? "unavailable" : "offline";
      }
      controller.abort();
    }, PROBE_TIMEOUT_MS);
    try {
      const ok = await probe(controller.signal);
      if (started && request === controller) status.value = ok ? "reachable" : "unavailable";
    } catch {
      if (started && request === controller) status.value = isOnline() ? "unavailable" : "offline";
    } finally {
      if (request === controller) {
        if (timeout !== null) clearTimeout(timeout);
        timeout = null;
        request = null;
      }
    }
  }

  function onOffline(): void {
    cancelProbe();
    status.value = "offline";
  }

  function onOnline(): void { void check(); }
  function onVisibilityChange(): void {
    if (typeof document === "undefined" || document.visibilityState === "visible") void check();
  }

  function start(): void {
    if (started) return;
    started = true;
    events?.addEventListener("offline", onOffline);
    events?.addEventListener("online", onOnline);
    events?.addEventListener("pageshow", onOnline);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
    poll = setInterval(() => { void check(); }, POLL_INTERVAL_MS);
    void check();
  }

  function stop(): void {
    if (!started) return;
    started = false;
    events?.removeEventListener("offline", onOffline);
    events?.removeEventListener("online", onOnline);
    events?.removeEventListener("pageshow", onOnline);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    if (poll !== null) clearInterval(poll);
    poll = null;
    cancelProbe();
  }

  return { status, check, start, stop };
}
