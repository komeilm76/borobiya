import { MISSION_MEMBER_ROLES, MISSION_STATUS, OFFER_STATUSES, SOS_STATUS, SUPPORT_REQUEST_STATUS } from '@shared/protocol.ts';

/** Persian labels for every SOS and mission lifecycle status (raw enums must never reach the UI). */
export const STATUS_LABELS: Record<string, string> = {
  [SOS_STATUS.PENDING]: 'در انتظار',
  [SOS_STATUS.DISPATCHED]: 'اعزام‌شده',
  [SOS_STATUS.ACCEPTED]: 'پذیرفته‌شده',
  [SOS_STATUS.IN_PROGRESS]: 'در حال رسیدگی',
  [SOS_STATUS.COMPLETED]: 'تکمیل‌شده',
  [SOS_STATUS.CANCELLED]: 'لغو‌شده',
  [SOS_STATUS.EXPIRED]: 'منقضی‌شده',
  [MISSION_STATUS.ASSIGNED]: 'تعیین‌شده',
  [MISSION_STATUS.ON_THE_WAY]: 'در راه',
  [MISSION_STATUS.ARRIVED]: 'رسیده'
};

/** Persian labels for the offer lifecycle. */
export const OFFER_STATUS_LABELS: Record<string, string> = {
  [OFFER_STATUSES.PENDING]: 'در انتظار پاسخ',
  [OFFER_STATUSES.ACCEPTED]: 'پذیرفته‌شده',
  [OFFER_STATUSES.DECLINED]: 'رد‌شده',
  [OFFER_STATUSES.EXPIRED]: 'منقضی‌شده',
  [OFFER_STATUSES.CANCELLED]: 'لغو‌شده'
};

/** Persian labels for the support-request lifecycle. */
export const SUPPORT_REQUEST_STATUS_LABELS: Record<string, string> = {
  [SUPPORT_REQUEST_STATUS.PENDING]: 'در انتظار بررسی',
  [SUPPORT_REQUEST_STATUS.PARTIALLY_APPROVED]: 'تأیید جزئی',
  [SUPPORT_REQUEST_STATUS.APPROVED]: 'تأییدشده',
  [SUPPORT_REQUEST_STATUS.REJECTED]: 'رد‌شده',
  [SUPPORT_REQUEST_STATUS.CANCELLED]: 'لغو‌شده'
};

/** Persian labels for mission membership roles. */
export const MISSION_MEMBER_ROLE_LABELS: Record<string, string> = {
  [MISSION_MEMBER_ROLES.LEADER]: 'سرپرست',
  [MISSION_MEMBER_ROLES.MEMBER]: 'عضو تیم'
};

/** Persian labels for SOS severity. */
export const SEVERITY_LABELS: Record<string, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'شدید'
};

/** status-pill tone for a SOS severity (accepted colors from the sos design parts). */
export const SEVERITY_TONES: Record<string, string> = {
  low: 'status-pill status-pill--success',
  medium: 'status-pill status-pill--warning',
  high: 'status-pill status-pill--danger'
};

/** Persian label for a responder group lifecycle status. */
export const GROUP_STATUS_LABELS: Record<string, string> = { active: 'فعال', paused: 'متوقف', inactive: 'غیرفعال' };

/** Persian label for a group status, falling back to the raw value for unknowns. */
export function groupStatusLabel(status: string): string {
  return GROUP_STATUS_LABELS[status] ?? status;
}

/** pill class for a SOS severity, defaulting to warning for unknowns. */
export function severityTone(severity: string): string {
  return SEVERITY_TONES[severity] ?? 'status-pill status-pill--warning';
}

/** Persian label for a lifecycle status, falling back to the raw value for unknowns. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** status-pill tone for a lifecycle status. */
export function statusTone(status: string): string {
  if (status === MISSION_STATUS.COMPLETED || status === SOS_STATUS.COMPLETED) return 'status-pill status-pill--success';
  if (status === MISSION_STATUS.CANCELLED || status === SOS_STATUS.CANCELLED || status === SOS_STATUS.EXPIRED) return 'status-pill status-pill--neutral';
  return 'status-pill status-pill--warning';
}
