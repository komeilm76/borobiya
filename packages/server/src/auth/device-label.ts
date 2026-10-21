import { MAX_USER_DEVICE_NAME_LENGTH } from "@borobiya/shared";

/**
 * Human-readable labels for `user_sessions.device_name` (spec §7.3 shows "Chrome Windows",
 * "Samsung S23" in the Active Devices table).
 *
 * The column is user-visible text on a settings page, so the raw `User-Agent` is deliberately not
 * stored: it is long, machine-oriented, and leaks client detail into a list the account owner reads.
 * A native/hybrid client may name itself at login (`loginSchema.deviceName`) — that label always wins.
 */

/** Browsers, most specific first: an Edge UA also contains "Chrome", so order matters. */
const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|OS)?\//, "Microsoft Edge"],
  [/OPR\/|\bOpera\b/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Silk\//, "Amazon Silk"],
  [/mssdk|Slackbot|Googlebot|Bingbot|curl\//i, "Automated client"],
  [/CriOS\//, "Chrome"],
  [/FxiOS\//, "Firefox"],
  [/EdgiOS\//, "Microsoft Edge"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
  [/\bSafari\//, "Safari"]
];

/** Operating systems / device families, most specific first. */
const PLATFORM_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\biPod\b/, "iPod touch"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows NT/, "Windows"],
  [/Windows/, "Windows"],
  [/(?:Mac OS X|Macintosh)/, "macOS"],
  [/Linux|X11/, "Linux"]
];

/** Control characters and runs of whitespace never belong in a label. */
function sanitize(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trims, de-noises, and bounds one label. Returns `null` for anything that is not usable text. */
export function normalizeDeviceName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const cleaned = sanitize(value);
  if (cleaned.length === 0) return null;
  return cleaned.length > MAX_USER_DEVICE_NAME_LENGTH
    ? cleaned.slice(0, MAX_USER_DEVICE_NAME_LENGTH).trimEnd()
    : cleaned;
}

/**
 * "Chrome on Windows", "Safari on iPhone", "Samsung Internet on Android" — or the single half that
 * was recognized, or `null` when nothing usable is in the string. Unrecognized text is dropped
 * rather than stored, so the column can never become an archive of arbitrary client detail.
 *
 * Matching uses the whole sanitized UA (identifying tokens sit at both ends of a real UA string)
 * while only the resulting label is length-bounded. Every pattern above is a literal with no nested
 * quantifier, and the HTTP layer already caps header size, so a long UA cannot blow up the matcher.
 */
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (typeof userAgent !== "string") return null;
  const cleaned = sanitize(userAgent);
  if (cleaned.length === 0) return null;
  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(cleaned))?.[1];
  const platform = PLATFORM_PATTERNS.find(([pattern]) => pattern.test(cleaned))?.[1];

  if (browser && platform) return normalizeDeviceName(`${browser} on ${platform}`);
  if (browser) return normalizeDeviceName(browser);
  if (platform) return normalizeDeviceName(platform);
  return null;
}

/**
 * The label to persist for a login: the client's own name when it sent a usable one (Capacitor can
 * report the exact model), otherwise the `User-Agent` summary.
 */
export function resolveLoginDeviceName(input: {
  deviceName?: string | null;
  userAgent?: string | null;
}): string | null {
  return normalizeDeviceName(input.deviceName) ?? describeUserAgent(input.userAgent);
}
