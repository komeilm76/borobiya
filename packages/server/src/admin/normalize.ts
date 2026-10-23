/**
 * Two helpers the admin catalog routes share, extracted from `./incidents` when `./categories` needed the
 * same rules. A rule that exists twice in two route files is a rule that will be fixed in only one of them.
 */

/**
 * Only `description` can arrive blank. `icon`/`color` are `min(1)` in their schemas, so clearing those means
 * sending `null` and an empty string is a validation error rather than a silent one; `description` accepts
 * `""`, and without this the column would hold "unset" in two representations forever. Collapsing it at the
 * boundary keeps one empty state, lets the stores' no-op checks see the same value back, and stops a
 * re-sent clear from adding an audit row.
 */
export function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Zod's issue objects are a union of variants whose `path` is a readonly `PropertyKey[]`, so the parameter
 * is deliberately wide: routes only re-emits `code`/`message`/`path` verbatim, exactly as `./users` does
 * inline. Narrowing it here would tie these files to one Zod release's issue shape for no gain.
 */
export function validationIssues(error: {
  issues: readonly { code: string; message: string; path: readonly unknown[] }[];
}) {
  return error.issues.map(({ code, message, path }) => ({ code, message, path }));
}
