import { MAX_USER_DEVICE_NAME_LENGTH } from "@shared/index";

/**
 * The facts a native shell can report about the device it is running on, in the shape the Capacitor
 * `Device` plugin answers with — kept as a plain structural type so the mapping below is testable
 * without a plugin, a bridge, or a device.
 */
export interface NativeDeviceFacts {
  readonly model?: string;
  readonly manufacturer?: string;
  readonly platform?: string;
  readonly operatingSystem?: string;
  readonly osVersion?: string;
  /**
   * Reported by iOS and Android 7.1+, and deliberately never read: it is the *user-assigned* name
   * («John's iPhone»), which on iOS 16+ degrades to a generic string anyway. Copying a person's chosen
   * device name into `user_sessions.device_name` would put personal data in a column the Active Devices
   * table shows to whoever owns the account, and the model is both more stable and more useful there.
   */
  readonly name?: string;
}

/** The plugin spells these lowercase; the table should not read «ios 17.1». */
const OPERATING_SYSTEM_LABELS: Readonly<Record<string, string>> = {
  ios: "iOS",
  android: "Android",
  mac: "macOS",
  windows: "Windows",
  unknown: ""
};

function clean(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function operatingSystemLabel(value: string | undefined): string {
  const key = clean(value).toLowerCase();
  if (!key) return "";
  return OPERATING_SYSTEM_LABELS[key] ?? clean(value);
}

/**
 * The label a native build sends as `login.deviceName` (spec §7.3's "Samsung S23"), or `undefined` when
 * there is nothing honest to say — in which case the web client sends no field at all and the server
 * keeps deriving its own short label from the `User-Agent`.
 *
 * Bounded here rather than trusted to the schema on purpose: `loginSchema` parses the body with
 * `max(MAX_USER_DEVICE_NAME_LENGTH)`, so an over-long model string from an unusual ROM would not be
 * truncated by the server — it would fail validation and **lock the user out of logging in** because of a
 * label. Truncating is the only safe direction for a field that is display-only.
 */
export function nativeDeviceLabel(facts: NativeDeviceFacts | null | undefined): string | undefined {
  if (!facts) return undefined;
  const brand = clean(facts.manufacturer);
  const model = clean(facts.model);

  let label: string;
  if (model && brand && !model.toLowerCase().startsWith(brand.toLowerCase())) label = `${brand} ${model}`;
  else label = model || brand;

  if (!label) {
    const system = operatingSystemLabel(facts.operatingSystem);
    const version = clean(facts.osVersion).split(".")[0] ?? "";
    label = [system, version].filter(Boolean).join(" ");
  }
  if (!label) return undefined;
  return label.length > MAX_USER_DEVICE_NAME_LENGTH ? label.slice(0, MAX_USER_DEVICE_NAME_LENGTH).trimEnd() : label;
}
