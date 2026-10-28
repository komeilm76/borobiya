import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { LocationShare, UserDevice } from "@shared/index";
import { fetchUserDevices } from "@/api/devices";
import { listLocationShares } from "@/api/location";
import { decodeAccessTokenClaims, ownDeviceId } from "@/composables/device-identity";

/**
 * “Am I the device that broadcasts?” — the read-only half of spec §7.3, for the screens that have to say
 * something about it without owning the Active Devices table (`useDeviceSettings` writes; this answers).
 *
 * Two boundaries it deliberately stays on the correct side of:
 *
 * - **It never suppresses a broadcast.** `location:update` is refused per share by the server (T2.3.4),
 *   which is the only party that knows the current pin; a client that stopped sending on a stale snapshot
 *   would create a device that cannot be made priority again without a reload. What this exposes is the
 *   *explanation* — `ignoredShareIds` — so a status line can say why nothing moves.
 * - **A share with no pin is not ignored.** `priorityDeviceId === null` means the account had one live
 *   session when the share was created (T2.3.3's auto-pin rule), so any of its devices may send; treating
 *   a null as “somebody else's” would report the opposite of what the server does.
 */
export interface UsePriorityDeviceOptions {
  accessToken: ComputedRef<string | null> | Ref<string | null>;
  /** The authenticated account, independently of the bearer (which may rotate within a session). */
  ownerId: ComputedRef<string | null> | Ref<string | null>;
  ensureSession?: () => Promise<unknown>;
  /**
   * Overrides the id read from the access token. The native shell is the reason this exists: a build that
   * keeps its own stable install id can report it here instead of trusting the token claim, and nothing
   * downstream changes.
   */
  ownDeviceId?: ComputedRef<string | null> | Ref<string | null>;
}

export function usePriorityDevice(options: UsePriorityDeviceOptions) {
  const devices = ref<UserDevice[]>([]);
  const liveShares = ref<LocationShare[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  /** When the two lists were last read, so a caller can age its own sentence instead of guessing. */
  const loadedAtMs = ref<number | null>(null);
  let readVersion = 0;
  // Null while signed out or while the account and token belong to different users during a switch.
  // Access-token renewal for the same account/session must not discard a last-good answer.
  const sessionKey = computed(() => {
    const owner = options.ownerId.value;
    const bearer = options.accessToken.value;
    if (!owner || !bearer) return null;
    const claims = decodeAccessTokenClaims(bearer);
    if (claims && claims.sub !== owner) return null;
    return JSON.stringify([owner, typeof claims?.sessionId === "string" ? claims.sessionId : null]);
  });

  const ownId = computed(() => {
    const override = options.ownDeviceId?.value;
    if (typeof override === "string" && override.length > 0) return override;
    return ownDeviceId(options.accessToken.value);
  });

  const ownDevice = computed(() => devices.value.find((device) => device.deviceId === ownId.value) ?? null);
  const isListed = computed(() => ownDevice.value !== null);
  const isOnline = computed(() => ownDevice.value?.isOnline === true);
  const hasMultipleDevices = computed(() => devices.value.length > 1);
  const broadcastingShares = computed(() => liveShares.value.filter((share) => share.priorityDeviceId === ownId.value));
  const isBroadcastingAnything = computed(() => broadcastingShares.value.length > 0);
  /** Shares another device owns — the ones whose `location:update` from here the server will drop. */
  const ignoredShareIds = computed(() =>
    liveShares.value
      .filter((share) => share.priorityDeviceId !== null && share.priorityDeviceId !== ownId.value)
      .map((share) => share.id)
  );
  const unassignedShares = computed(() => liveShares.value.filter((share) => share.priorityDeviceId === null));
  const ownLabel = computed(() => ownDevice.value?.deviceName ?? null);
  const hasData = computed(() => loadedAtMs.value !== null);

  function clear(): void {
    ++readVersion; // Also invalidates responses already on the wire, not just the displayed rows.
    devices.value = [];
    liveShares.value = [];
    loadedAtMs.value = null;
    failed.value = false;
    loading.value = false;
  }

  watch(sessionKey, (next, previous) => {
    // Going from no session to a first session has no old rows to clear. In particular, a
    // refresh that just recovered its own token through ensureSession can continue.
    if (previous !== null || next === null) clear();
  }, { flush: "sync" });

  async function refresh(): Promise<void> {
    const version = ++readVersion;
    const startingOwner = options.ownerId.value;
    let accessToken = options.accessToken.value;
    if (!accessToken && options.ensureSession) {
      try {
        await options.ensureSession();
      } catch {
        // Handled by null-token check below.
      }
      accessToken = options.accessToken.value;
    }
    const key = sessionKey.value;
    if (version !== readVersion || startingOwner !== options.ownerId.value) return;
    if (!accessToken || !key) {
      clear();
      return;
    }
    const isCurrent = () => version === readVersion && sessionKey.value === key;
    loading.value = true;
    try {
      const [deviceList, shares] = await Promise.all([
        fetchUserDevices(accessToken),
        listLocationShares(accessToken)
      ]).catch(async (error: unknown) => {
        if (isCurrent() && (error as { status?: unknown } | null)?.status === 401 && options.ensureSession) {
          await options.ensureSession();
          const refreshed = options.accessToken.value;
          if (isCurrent() && refreshed && refreshed !== accessToken) {
            return Promise.all([fetchUserDevices(refreshed), listLocationShares(refreshed)]);
          }
        }
        throw error;
      });
      if (!isCurrent()) return;
      devices.value = deviceList;
      liveShares.value = shares.owned;
      loadedAtMs.value = Date.now();
      failed.value = false;
    } catch {
      if (!isCurrent()) return;
      // A failed refresh keeps the previous *same-session* answer: a failed read is not evidence
      // that this device's priority changed. Account/session changes clear it synchronously above.
      failed.value = true;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }

  return {
    ownId,
    ownDevice,
    ownLabel,
    devices,
    liveShares,
    broadcastingShares,
    unassignedShares,
    ignoredShareIds,
    isListed,
    isOnline,
    isBroadcastingAnything,
    hasMultipleDevices,
    hasData,
    loading,
    failed,
    loadedAtMs,
    clear,
    refresh
  };
}
