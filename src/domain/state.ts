import { MISSION_STATUS, MISSION_STAGES, ROLES, SOS_STATUS, SOS_STAGES } from '../../public/js/protocol.js';

export type TransitionResult =
  | { ok: true; next: string }
  | { ok: false; reason?: string };

const SOS_TRANSITIONS: Record<string, Record<string, string>> = {
  [SOS_STATUS.PENDING]: { dispatch: SOS_STATUS.DISPATCHED, cancel: SOS_STATUS.CANCELLED, expire: SOS_STATUS.EXPIRED },
  [SOS_STATUS.DISPATCHED]: { accept: SOS_STATUS.ACCEPTED, cancel: SOS_STATUS.CANCELLED, expire: SOS_STATUS.EXPIRED },
  [SOS_STATUS.ACCEPTED]: { start: SOS_STATUS.IN_PROGRESS, cancel: SOS_STATUS.CANCELLED },
  [SOS_STATUS.IN_PROGRESS]: { complete: SOS_STATUS.COMPLETED, cancel: SOS_STATUS.CANCELLED }
};

const MISSION_TRANSITIONS: Record<string, Record<string, string>> = {
  [MISSION_STATUS.PENDING]: { accept: MISSION_STATUS.ON_THE_WAY, cancel: MISSION_STATUS.CANCELLED },
  [MISSION_STATUS.ON_THE_WAY]: { arrive: MISSION_STATUS.ARRIVED, cancel: MISSION_STATUS.CANCELLED },
  [MISSION_STATUS.ARRIVED]: { start: MISSION_STATUS.IN_PROGRESS, cancel: MISSION_STATUS.CANCELLED },
  [MISSION_STATUS.IN_PROGRESS]: { complete: MISSION_STATUS.COMPLETED, cancel: MISSION_STATUS.CANCELLED }
};

export function transitionSos(status: string, action: string, role: string): TransitionResult {
  if (role !== ROLES.ADMIN && role !== ROLES.RESPONDER && role !== ROLES.USER) return { ok: false, reason: 'unknown role' };
  const next = SOS_TRANSITIONS[status]?.[action];
  if (!next) return { ok: false, reason: `transition ${status} + ${action} is not allowed` };
  if (action === 'cancel' && role === ROLES.RESPONDER && status === SOS_STATUS.PENDING) {
    return { ok: false, reason: 'a responder cannot cancel an undispatched request' };
  }
  return { ok: true, next };
}

export function transitionMission(status: string, action: string): TransitionResult {
  const next = MISSION_TRANSITIONS[status]?.[action];
  return next ? { ok: true, next } : { ok: false, reason: `transition ${status} + ${action} is not allowed` };
}

export function sosStageIndex(status: string): number {
  const mapping: Record<string, number> = {
    [SOS_STATUS.PENDING]: 0,
    [SOS_STATUS.DISPATCHED]: 1,
    [SOS_STATUS.ACCEPTED]: 2,
    [SOS_STATUS.IN_PROGRESS]: 3,
    [SOS_STATUS.COMPLETED]: 4,
    [SOS_STATUS.CANCELLED]: -1,
    [SOS_STATUS.EXPIRED]: -1
  };
  return mapping[status] ?? -1;
}

export function missionStageIndex(status: string): number {
  return (MISSION_STAGES as readonly string[]).indexOf(status);
}

export const SOS_STAGE_COUNT = SOS_STAGES.length;
export const MISSION_STAGE_COUNT = MISSION_STAGES.length;

const TERMINAL_STATUSES: readonly string[] = [
  SOS_STATUS.COMPLETED, SOS_STATUS.CANCELLED, SOS_STATUS.EXPIRED,
  MISSION_STATUS.COMPLETED, MISSION_STATUS.CANCELLED
];

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canCancelSos(status: string): boolean {
  return !isTerminal(status);
}
