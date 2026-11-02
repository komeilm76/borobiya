/**
 * `%` and `_` are wildcards *inside* an ILIKE pattern, so a username or a description containing either one would
 * quietly match more than the admin typed. Escaping them (and the escape character itself) is what makes a search
 * box mean the characters it shows.
 *
 * Shared by every admin list that offers free text, so the two lists cannot disagree about what a literal `_` is.
 */
export function escapeLikeSearchTerm(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Escaped `%term%` for a contains-match, the shape every admin search uses. */
export function containsPattern(value: string): string {
  return `%${escapeLikeSearchTerm(value)}%`;
}
