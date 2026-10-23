import { nativeDeviceLabel, type NativeDeviceFacts } from "./native-label";

/**
 * The only file in the client that touches Capacitor.
 *
 * Both modules are loaded with `import()` inside the probe rather than at the top of the file: a browser
 * build has no bridge, and paying for the Capacitor runtime in the entry chunk — or importing a plugin
 * whose native implementation cannot exist there — to conclude "not native" is the worse trade. Lazy
 * loading also means the whole path degrades to `undefined`, i.e. to today's web behavior.
 */

export type NativeFactsReader = () => Promise<NativeDeviceFacts | null>;

async function readNativeFacts(): Promise<NativeDeviceFacts | null> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Device } = await import("@capacitor/device");
  const info = await Device.getInfo();
  return {
    model: info.model,
    manufacturer: info.manufacturer,
    platform: info.platform,
    operatingSystem: info.operatingSystem,
    osVersion: info.osVersion,
    name: info.name
  };
}

/**
 * Device facts for this run, or `null`.
 *
 * Every failure path — no bridge, a plugin that is not installed in this build, a rejected call — answers
 * `null` rather than throwing. This runs while the user is pressing "log in", and an unavailable label is
 * a cosmetic gap in a table, not a reason to refuse someone their own account.
 */
export async function detectNativeDeviceFacts(read: NativeFactsReader = readNativeFacts): Promise<NativeDeviceFacts | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** What to put in `login.deviceName`: a bounded human label, or nothing at all. */
export async function loginDeviceName(read?: NativeFactsReader): Promise<string | undefined> {
  return nativeDeviceLabel(await detectNativeDeviceFacts(read));
}
