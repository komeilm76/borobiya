import {
  ALLOWED_SOS_PHOTO_MIME_TYPES,
  MAX_SOS_PHOTO_BYTES,
  severitySchema,
  sosLocationSchema,
  type CreateSosRequestInput,
  type Severity,
  type SosLocation
} from "@shared/index";
import { ApiError } from "../api/http";
import { friendlyErrorMessage } from "../api/error-message";

export const SOS_DESCRIPTION_MIN_LENGTH = 10;
export const SOS_DESCRIPTION_MAX_LENGTH = 500;

export interface SosSeverityOption {
  value: Severity;
  label: string;
  hint: string;
  color: "info" | "warning" | "error";
  hex: string;
}

export const SOS_SEVERITY_OPTIONS: readonly SosSeverityOption[] = [
  {
    value: "low",
    label: "کم‌خطر",
    hint: "نیاز به همراهی یا امداد غیرفوری",
    color: "info",
    hex: "#0284c7"
  },
  {
    value: "medium",
    label: "متوسط",
    hint: "آسیب یا گرفتاری نیازمند اعزام امدادگر",
    color: "warning",
    hex: "#d97706"
  },
  {
    value: "high",
    label: "بحرانی / فوری",
    hint: "خطر جانی یا شرایط اضطراری فوری",
    color: "error",
    hex: "#dc2626"
  }
] as const;

export interface SosPhotoCandidate {
  size: number;
  type?: string;
  name?: string;
}

export interface SosFormDraft {
  severity: Severity;
  incidentTypeId: string;
  description: string;
  location: SosLocation | null;
  photo: SosPhotoCandidate | null;
}

export type SosDraftIssueCode =
  | "incident_type_required"
  | "description_too_short"
  | "description_too_long"
  | "location_required"
  | "location_invalid"
  | "photo_empty"
  | "photo_too_large"
  | "photo_unsupported_format";

export interface SosDraftIssue {
  code: SosDraftIssueCode;
  field: "incidentTypeId" | "description" | "location" | "photo";
}

/** Converts Persian (`۰-۹`) and Arabic-Indic (`٠-٩`) numerals to ASCII digits for coordinate input. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Builds an automatic GPS `SosLocation`. Missing or non-positive accuracy is omitted rather than
 * recorded as `0`, matching the server rule in `packages/server/src/sos/requests.ts`.
 */
export function gpsLocationDraft(coords: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}): SosLocation | null {
  const accuracy =
    typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy) && coords.accuracy > 0
      ? Math.round(coords.accuracy)
      : undefined;
  const parsed = sosLocationSchema.safeParse({
    lat: roundCoordinate(coords.latitude),
    lon: roundCoordinate(coords.longitude),
    ...(accuracy === undefined ? {} : { accuracy }),
    isManual: false
  });
  return parsed.success ? parsed.data : null;
}

/** Builds a manual map-picked `SosLocation` (`isManual: true`, no GPS accuracy claim). */
export function manualLocationDraft(lat: number, lon: number): SosLocation | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const parsed = sosLocationSchema.safeParse({
    lat: roundCoordinate(lat),
    lon: roundCoordinate(lon),
    isManual: true
  });
  return parsed.success ? parsed.data : null;
}

/** Parses manual latitude/longitude text fields (supporting Persian/Arabic digits). */
export function parseCoordinatePair(latInput: string, lonInput: string): SosLocation | null {
  const normalizedLat = normalizeDigits(latInput).trim();
  const normalizedLon = normalizeDigits(lonInput).trim();
  if (!normalizedLat || !normalizedLon) return null;
  const lat = Number(normalizedLat);
  const lon = Number(normalizedLon);
  return manualLocationDraft(lat, lon);
}

/** Pre-checks optional SOS photo metadata before spending mobile bandwidth on upload. */
export function validateSosPhoto(file: SosPhotoCandidate): SosDraftIssue | null {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { code: "photo_empty", field: "photo" };
  }
  if (file.size > MAX_SOS_PHOTO_BYTES) {
    return { code: "photo_too_large", field: "photo" };
  }
  const declaredType = (file.type ?? "").trim().toLowerCase();
  if (
    declaredType.length > 0 &&
    !(ALLOWED_SOS_PHOTO_MIME_TYPES as readonly string[]).includes(declaredType)
  ) {
    return { code: "photo_unsupported_format", field: "photo" };
  }
  return null;
}

/** Validates an SOS draft locally using the same bounds the server contract enforces. */
export function sosDraftIssues(draft: SosFormDraft): SosDraftIssue[] {
  const issues: SosDraftIssue[] = [];
  if (!severitySchema.safeParse(draft.severity).success) {
    issues.push({ code: "incident_type_required", field: "incidentTypeId" });
  }
  if (!draft.incidentTypeId.trim()) {
    issues.push({ code: "incident_type_required", field: "incidentTypeId" });
  }

  const trimmedDescription = draft.description.trim();
  if (trimmedDescription.length < SOS_DESCRIPTION_MIN_LENGTH) {
    issues.push({ code: "description_too_short", field: "description" });
  } else if (trimmedDescription.length > SOS_DESCRIPTION_MAX_LENGTH) {
    issues.push({ code: "description_too_long", field: "description" });
  }

  if (!draft.location) {
    issues.push({ code: "location_required", field: "location" });
  } else if (!sosLocationSchema.safeParse(draft.location).success) {
    issues.push({ code: "location_invalid", field: "location" });
  }

  if (draft.photo) {
    const photoIssue = validateSosPhoto(draft.photo);
    if (photoIssue) issues.push(photoIssue);
  }

  return issues;
}

export function canSubmitSosDraft(draft: SosFormDraft): boolean {
  return sosDraftIssues(draft).length === 0;
}

export function buildSosCreatePayload(draft: SosFormDraft): CreateSosRequestInput {
  if (!draft.location) {
    throw new Error("Cannot build SOS payload without a location.");
  }
  return {
    severity: draft.severity,
    incidentTypeId: draft.incidentTypeId.trim(),
    description: draft.description.trim(),
    location: draft.location
  };
}

export function sosIssueMessage(code: SosDraftIssueCode): string {
  switch (code) {
    case "incident_type_required":
      return "نوع حادثه را از فهرست انتخاب کنید.";
    case "description_too_short":
      return `توضیحات حادثه باید حداقل ${SOS_DESCRIPTION_MIN_LENGTH} نویسه باشد.`;
    case "description_too_long":
      return `توضیحات حادثه نمی‌تواند بیشتر از ${SOS_DESCRIPTION_MAX_LENGTH} نویسه باشد.`;
    case "location_required":
      return "موقعیت حادثه مشخص نشده است؛ دکمهٔ GPS را بزنید یا روی نقشه نقطهٔ حادثه را لمس کنید.";
    case "location_invalid":
      return "مختصات انتخاب‌شده معتبر نیست (عرض بین ۹۰- تا ۹۰ و طول بین ۱۸۰- تا ۱۸۰).";
    case "photo_empty":
      return "فایل تصویر انتخاب‌شده خالی است.";
    case "photo_too_large":
      return "حجم تصویر باید حداکثر ۵ مگابایت باشد.";
    case "photo_unsupported_format":
      return "فرمت تصویر باید یکی از JPEG، PNG یا WebP باشد.";
  }
}

export function sosApiErrorMessage(
  error: unknown,
  fallback = "ارسال درخواست امداد انجام نشد؛ دوباره تلاش کنید."
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "نشست کاربری منقضی شده است؛ دوباره وارد حساب کاربری شوید.";
    }
    if (error.status === 429 || error.code === "RATE_LIMITED") {
      return "تعداد درخواست‌های ثبت‌شده در یک دقیقه به سقف مجاز رسیده است. کمی صبر کنید.";
    }
    if (error.status === 413 || error.code === "PHOTO_TOO_LARGE" || error.code === "PAYLOAD_TOO_LARGE") {
      return "حجم تصویر ارسالی بیش از حد مجاز سرور (۵ مگابایت) است.";
    }
    const issueCodes = error.issues
      .map((item) => (item && typeof item === "object" ? (item as { code?: unknown }).code : undefined))
      .filter((code): code is string => typeof code === "string");
    if (issueCodes.includes("unknown_incident_type")) {
      return "نوع حادثهٔ انتخاب‌شده دیگر در فهرست فعال نیست؛ فهرست را تازه کنید.";
    }
    if (issueCodes.includes("unsupported_format") || issueCodes.includes("truncated")) {
      return "فایل تصویر معتبر نیست؛ یک تصویر کامل با فرمت JPEG، PNG یا WebP انتخاب کنید.";
    }
    if (issueCodes.includes("empty") || issueCodes.includes("no_file")) {
      return "فایل تصویر انتخاب‌شده خالی است.";
    }
  }
  return friendlyErrorMessage(error, fallback);
}
