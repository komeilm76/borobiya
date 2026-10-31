const pad = (number: number) => String(number).padStart(2, "0");

/** Convert the local wall-clock date used by the API payload to Vuetify's native Date model. */
export function dateForPicker(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day
    ? date : undefined;
}

/** Preserve the user's clock time when picking a new calendar day. Never parse a UTC date string. */
export function withPickerDate(current: string, selected: unknown): string | null {
  if (!(selected instanceof Date) || !Number.isFinite(selected.getTime())) return null;
  const day = `${selected.getFullYear()}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}`;
  return `${day}T${/^\d{2}:\d{2}$/.test(current.slice(11)) ? current.slice(11) : "00:00"}`;
}

export function withPickerTime(current: string, selected: unknown): string | null {
  if (typeof selected !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(selected)) return null;
  if (!dateForPicker(current)) return null;
  return `${current.slice(0, 10)}T${selected}`;
}
