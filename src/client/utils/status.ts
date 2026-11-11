import { MISSION_STATUS, SOS_STATUS } from '@shared/protocol.ts';

/** Persian labels for every SOS and mission lifecycle status (raw enums must never reach the UI). */
export const STATUS_LABELS: Record<string, string> = {
  [SOS_STATUS.PENDING]: 'در انتظار',
  [SOS_STATUS.DISPATCHED]: 'اعزام‌شده',
  [SOS_STATUS.ACCEPTED]: 'پذیرفته‌شده',
  [SOS_STATUS.IN_PROGRESS]: 'در حال رسیدگی',
  [SOS_STATUS.COMPLETED]: 'تکمیل‌شده',
  [SOS_STATUS.CANCELLED]: 'لغو‌شده',
  [SOS_STATUS.EXPIRED]: 'منقضی‌شده',
  [MISSION_STATUS.ON_THE_WAY]: 'در راه',
  [MISSION_STATUS.ARRIVED]: 'رسیده'
};

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
