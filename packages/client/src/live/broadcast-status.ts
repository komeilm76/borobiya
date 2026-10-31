import type { BroadcastStatus } from "@/composables/useLiveLocationBroadcast";

export type BroadcastTone = "neutral" | "active" | "warn" | "error";

export interface BroadcastPrioritySnapshot {
  readonly hasMultipleDevices: boolean;
  readonly broadcastingCount: number;
  readonly ignoredCount: number;
  readonly hasShares: boolean;
}

export interface BroadcastStatusInput {
  readonly status: BroadcastStatus;
  readonly lastErrorCode: string | null;
  readonly peerCount: number;
  readonly isSupported: boolean;
  readonly priority: BroadcastPrioritySnapshot;
}

export interface BroadcastStatusView {
  readonly tone: BroadcastTone;
  readonly isActive: boolean;
  readonly actionLabel: string;
  readonly headline: string;
  readonly detail: string;
}

function errorDetail(code: string | null): { tone: "warn" | "error"; headline: string; detail: string } {
  switch (code) {
    case "WRONG_DEVICE":
    case "PRIORITY_DEVICE_REQUIRED":
      return {
        tone: "warn",
        headline: "پخش از دستگاه دیگر فعال است",
        detail: "برای اشتراک‌های فعلی دستگاه دیگری به‌عنوان پخش‌کننده انتخاب شده است؛ از بخش «اشتراک‌های من» دستگاه پخش‌کنندهٔ هر همراه را تغییر دهید."
      };
    case "GEOLOCATION_DENIED":
      return {
        tone: "error",
        headline: "دسترسی به موقعیت مکانی رد شد",
        detail: "در تنظیمات مرورگر اجازهٔ دسترسی به موقعیت مکانی را بدهید و دوباره «شروع پخش موقعیت زنده» را بزنید."
      };
    case "GEOLOCATION_UNAVAILABLE":
      return {
        tone: "error",
        headline: "موقعیت مکانی دریافت نشد",
        detail: "مرورگر یا سامانه نتوانست موقعیت فعلی را بخواند؛ وضعیت GPS یا شبیه‌ساز حسگر را بررسی کنید."
      };
    case "RATE_LIMITED":
      return {
        tone: "warn",
        headline: "ارسال موقتاً محدود شد",
        detail: "تعداد موقعیت‌های ارسالی از سقف مجاز در دقیقه گذشت؛ چند ثانیه صبر کنید."
      };
    case "SOCKET_TIMEOUT":
      return {
        tone: "warn",
        headline: "پاسخی از سرور نرسید",
        detail: "ارتباط لحظه‌ای کند یا قطع شده است؛ اتصال را بررسی کنید و دوباره تلاش کنید."
      };
    case "ACCOUNT_INACTIVE":
    case "ACCOUNT_SUSPENDED":
      return {
        tone: "error",
        headline: "حساب مجاز به پخش نیست",
        detail: "این حساب غیرفعال یا مسدود شده است."
      };
    default:
      return {
        tone: "error",
        headline: "پخش موقعیت متوقف شد",
        detail: "ارتباط زنده برقرار نشد؛ پس از بررسی اتصال دوباره تلاش کنید."
      };
  }
}

/**
 * Pure presentation model for `<LiveBroadcastBar />`.
 *
 * Keeps all conditional wording out of `.vue` files so every branch (unsupported browser, non-priority
 * device warning, active peer count, permission denial, idle/stopped) is deterministic and unit-tested.
 */
export function describeBroadcastState(input: BroadcastStatusInput): BroadcastStatusView {
  const { status, lastErrorCode, peerCount, isSupported, priority } = input;
  const isActive = status === "connecting" || status === "broadcasting";

  if (!isSupported) {
    return {
      tone: "error",
      isActive: false,
      actionLabel: "پخش زنده پشتیبانی نمی‌شود",
      headline: "مرورگر موقعیت مکانی نمی‌دهد",
      detail: "پخش زنده نیاز به بافت امن (HTTPS یا localhost) و پشتیبانی Geolocation دارد.",
    };
  }

  if (status === "rejected") {
    const failure = errorDetail(lastErrorCode);
    return {
      tone: failure.tone,
      isActive: false,
      actionLabel: "تلاش دوباره برای پخش زنده",
      headline: failure.headline,
      detail: failure.detail,
    };
  }

  if (status === "connecting") {
    return {
      tone: "active",
      isActive: true,
      actionLabel: "توقف پخش زنده",
      headline: "در حال اتصال و خواندن موقعیت…",
      detail: "پس از دریافت اولین نقطه، موقعیت شما هر ۴ ثانیه ارسال می‌شود.",
    };
  }

  if (status === "broadcasting") {
    if (priority.ignoredCount > 0 && priority.broadcastingCount === 0) {
      return {
        tone: "warn",
        isActive: true,
        actionLabel: "توقف پخش زنده",
        headline: "این دستگاه پخش‌کنندهٔ انتخابی نیست",
        detail: `${priority.ignoredCount.toLocaleString("fa-IR")} اشتراک به دستگاه دیگری وصل است و موقعیت این مرورگر جایگزین آن نمی‌شود.`,
      };
    }
    const detail =
      peerCount > 0
        ? `موقعیت شما زنده برای ${peerCount.toLocaleString("fa-IR")} همراه ارسال می‌شود.`
        : priority.ignoredCount > 0
          ? `ارسال فعال است (${priority.ignoredCount.toLocaleString("fa-IR")} اشتراک به دستگاه دیگری وصل است).`
          : "موقعیت شما در حال ثبت است؛ برای دیدن توسط دیگران یک اشتراک فعال بسازید.";
    return {
      tone: "active",
      isActive: true,
      actionLabel: "توقف پخش زنده",
      headline: "پخش زنده فعال است",
      detail,
    };
  }

  const idleNote =
    priority.ignoredCount > 0 && priority.broadcastingCount === 0
      ? "اشتراک‌های فعلی روی دستگاه دیگری تنظیم شده‌اند؛ پیش از پخش، دستگاه هر همراه را در «اشتراک‌های من» بررسی کنید."
      : status === "stopped"
        ? "پخش زنده متوقف شد؛ هر زمان آماده بودید دوباره روشنش کنید."
        : "برای ارسال موقعیت لحظه‌ای خود به همراهان مجاز، پخش زنده را روشن کنید.";

  return {
    tone: priority.ignoredCount > 0 && priority.broadcastingCount === 0 ? "warn" : "neutral",
    isActive: false,
    actionLabel: "شروع پخش موقعیت زنده",
    headline: status === "stopped" ? "پخش زنده خاموش است" : "آمادهٔ پخش موقعیت",
    detail: idleNote,
  };
}
