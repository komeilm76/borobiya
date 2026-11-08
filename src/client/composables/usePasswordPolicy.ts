/**
 * Client-side mirror of the server's password policy.
 *
 * The server enforces this exactly (`password` in `src/server/core/validate.ts`): 12–128
 * characters, at least one Latin letter and at least one digit. It rejects a violation with a bare
 * `"Invalid request."` — the same message it uses for a malformed id anywhere in the API — which
 * tells a user nothing about what to type instead. Checking here first lets the form name the rule
 * in place, on the two screens where a password is chosen: registration and recovery.
 *
 * The server remains the authority; this only avoids a guaranteed round trip.
 */

/** Shortest accepted password. */
export const PASSWORD_MIN_LENGTH = 12;

/** Longest accepted password. */
export const PASSWORD_MAX_LENGTH = 128;

/** A named rule violation, so a caller can place the message where it belongs. */
export type PasswordIssue = 'length' | 'composition' | null;

/**
 * Checks a candidate password against the policy.
 *
 * @param value The candidate password exactly as it will be sent (never trimmed).
 * @returns `'length'`, `'composition'`, or `null` when the value is acceptable.
 */
export function passwordIssue(value: string): PasswordIssue {
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return 'length';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'composition';
  return null;
}

/**
 * Describes a password policy violation for display.
 *
 * @param issue The result of {@link passwordIssue}.
 * @returns A Persian message, or `null` when there is nothing to report.
 */
export function passwordIssueMessage(issue: PasswordIssue): string | null {
  if (issue === 'length') return `گذرواژه باید بین ۱۲ تا ۱۲۸ نویسه باشد.`;
  if (issue === 'composition') return 'گذرواژه باید هم حرف و هم رقم داشته باشد.';
  return null;
}
