/**
 * Eligibility / readiness policy decisions shared by every responder-picking flow:
 * offer dispatch, offer acceptance, immediate dispatch, team staffing and support-request
 * fulfillment. Keeping one implementation prevents the staffing flows from silently
 * drifting apart (for example, letting a ready-only worker onto a team while the
 * dispatch board would have refused them).
 *
 * A missing or deactivated job type always falls back to the strictest policy
 * (`ready_only`), which is also what protects legacy rows without a job type.
 */

export interface PolicyCandidate {
  active: number | boolean | null;
  ready_for_mission: number | boolean | null;
  job_type_active: number | boolean | null;
  offer_policy: string | null;
}

export type EffectiveOfferPolicy = 'all' | 'ready_only';

export type IneligibleReason = 'inactive' | 'not_ready';

/** Resolves the effective offer policy; missing/disabled job types are treated as ready_only. */
export function policyOf(row: Pick<PolicyCandidate, 'job_type_active' | 'offer_policy'>): EffectiveOfferPolicy {
  return row.offer_policy && Number(row.job_type_active) ? (row.offer_policy as EffectiveOfferPolicy) : 'ready_only';
}

/** The readiness gate every assignment path enforces before attaching a responder. */
export function readinessGate(row: PolicyCandidate): { ok: true } | { ok: false; reason: IneligibleReason } {
  if (!Number(row.active ?? 0)) return { ok: false, reason: 'inactive' };
  if (policyOf(row) === 'ready_only' && !Number(row.ready_for_mission ?? 0)) return { ok: false, reason: 'not_ready' };
  return { ok: true };
}
