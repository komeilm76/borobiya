/** Five visible stars, always backed by a stored integer score. */
export function stars(value: number): string {
  const count = Math.max(0, Math.min(5, Math.trunc(value)));
  return "★".repeat(count) + "☆".repeat(5 - count);
}
