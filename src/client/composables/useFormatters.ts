import { formatClock, formatDistance, formatDuration, toPersianDigits } from '@shared/geo.ts';

/**
 * Persian display formatting shared by every screen.
 *
 * @returns Number, distance, duration, clock and date formatters.
 */
export function useFormatters() {
  const number = (value: string | number): string => toPersianDigits(value);
  const distance = (meters: number): string => formatDistance(meters);
  const duration = (seconds: number): string => formatDuration(seconds);
  const clock = (value: Date | string | number): string => formatClock(value);

  const date = (value: Date | string | number): string => {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(parsed);
    } catch {
      return parsed.toISOString().slice(0, 10);
    }
  };

  const dateTime = (value: Date | string | number): string => {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
    } catch {
      return parsed.toISOString();
    }
  };

  const relative = (value: number): string => {
    const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
    if (seconds < 60) return 'همین حالا';
    if (seconds < 3600) return `${toPersianDigits(Math.round(seconds / 60))} دقیقه پیش`;
    return `${toPersianDigits(Math.round(seconds / 3600))} ساعت پیش`;
  };

  return { number, distance, duration, clock, date, dateTime, relative };
}
