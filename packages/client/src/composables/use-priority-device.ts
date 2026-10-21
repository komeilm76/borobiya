import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { LocationShare, UserDevice } from "@shared/index";
import { fetchUserDevices } from "@/api/devices";
import { listLocationShares } from "@/api/location";
import { ownDeviceId } from "@/composables/device-identity";

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

  async function refresh(): Promise<void> {
    const accessToken = options.accessToken.value;
    if (!accessToken) {
      devices.value = [];
      liveShares.value = [];
      loadedAtMs.value = null;
      failed.value = false;
      return;
    }
    loading.value = true;
    try {
      const [deviceList, shares] = await Promise.all([fetchUserDevices(accessToken), listLocationShares(accessToken)]);
      devices.value = deviceList;
      liveShares.value = shares.owned;
      loadedAtMs.value = Date.now();
      failed.value = false;
    } catch {
      // A failed refresh keeps the previous answer: “you are not the priority device” is a claim about the
      // server's current state, and a list that could not be re-read is not evidence that it changed.
      failed.value = true;
    } finally {
      loading.value = false;
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
    refresh
  };
}
