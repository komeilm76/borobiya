/** Public username fallback when no peer portrait is supplied by the share contract. */
export function avatarInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "؟";
}
