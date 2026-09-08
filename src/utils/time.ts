import { config } from '../config';

/**
 * Returns current timestamp as ISO 8601 string in UTC.
 */
export function nowUtc(): string {
  return new Date().toISOString();
}

/**
 * Formats a duration in seconds into human-readable string (e.g. "2h 15m" or "48m" or "12s").
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0 || isNaN(totalSeconds)) return '0m';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || (hours > 0 && seconds > 0)) parts.push(`${minutes}m`);
  if (hours === 0 && minutes === 0) parts.push(`${seconds}s`);

  return parts.join(' ') || '0m';
}

/**
 * Formats a Date object or ISO string in the configured timezone (e.g. Asia/Kolkata).
 * Example output: "08 Sep 2026, 8:42 PM IST"
 */
export function formatDateTime(dateInput: Date | string, timezone: string = config.timezone): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'Invalid Date';

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  };

  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

/**
 * Formats just the time in the configured timezone (e.g. "8:42:15 PM IST").
 */
export function formatTimeOnly(dateInput: Date | string, timezone: string = config.timezone): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'Invalid Time';

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  };

  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

/**
 * Formats a date to "YYYY-MM-DD" string in the configured timezone.
 */
export function getDateKeyInTz(date: Date, timezone: string = config.timezone): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

/**
 * Calculates start and end Date objects in UTC for a specific date string (YYYY-MM-DD)
 * in the specified timezone (default Asia/Kolkata).
 */
export function getDayBoundsInTz(dateKey: string, timezone: string = config.timezone): { start: Date; end: Date } {
  // Parse year, month, day
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // For Asia/Kolkata (IST), offset is always +05:30 (fixed offset, no DST)
  // To support any IANA timezone reliably:
  const tzOffsetMinutes = getTimezoneOffsetMinutes(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)), timezone);

  // Midnight start in UTC
  const startUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - tzOffsetMinutes * 60 * 1000);
  // Continuous end of day (start of next day in UTC)
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { start: startUtc, end: endUtc };
}

/**
 * Gets the offset in minutes between UTC and the specified timezone at a given date.
 */
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}

/**
 * Returns { start, end } Date range for today in configured timezone.
 */
export function getTodayBounds(timezone: string = config.timezone): { start: Date; end: Date; dateKey: string } {
  const now = new Date();
  const dateKey = getDateKeyInTz(now, timezone);
  const bounds = getDayBoundsInTz(dateKey, timezone);
  return { ...bounds, dateKey };
}

/**
 * Returns { start, end } Date range for yesterday in configured timezone.
 */
export function getYesterdayBounds(timezone: string = config.timezone): { start: Date; end: Date; dateKey: string } {
  const { start } = getTodayBounds(timezone);
  // Subtract 1 second to fall into yesterday, then get bounds
  const yesterdayTime = new Date(start.getTime() - 1000);
  const dateKey = getDateKeyInTz(yesterdayTime, timezone);
  const bounds = getDayBoundsInTz(dateKey, timezone);
  return { ...bounds, dateKey };
}

/**
 * Returns { start, end } Date range for this week (starting Monday) in configured timezone.
 */
export function getThisWeekBounds(timezone: string = config.timezone): { start: Date; end: Date } {
  const now = new Date();
  const todayKey = getDateKeyInTz(now, timezone);
  const { start: todayStart } = getDayBoundsInTz(todayKey, timezone);

  const fullDay = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(now);
  const days: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const currentDay = days[fullDay] ?? 1;
  const daysSinceMonday = (currentDay + 6) % 7;

  const startUtc = new Date(todayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  const endUtc = new Date(startUtc.getTime() + 7 * 24 * 60 * 60 * 1000);

  return { start: startUtc, end: endUtc };
}

/**
 * Returns { start, end } Date range for this month in configured timezone.
 */
export function getThisMonthBounds(timezone: string = config.timezone): { start: Date; end: Date } {
  const now = new Date();
  const dateKey = getDateKeyInTz(now, timezone);
  const [yearStr, monthStr] = dateKey.split('-');
  const firstDayKey = `${yearStr}-${monthStr}-01`;
  const { start } = getDayBoundsInTz(firstDayKey, timezone);

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonthNum = month === 12 ? 1 : month + 1;
  const nextMonthKey = `${nextMonthYear}-${String(nextMonthNum).padStart(2, '0')}-01`;
  const { start: nextMonthStart } = getDayBoundsInTz(nextMonthKey, timezone);

  return { start, end: nextMonthStart };
}

/**
 * Calculates the exact overlapping duration (in seconds) of a session [sessionStart, sessionEnd]
 * within a query window [windowStart, windowEnd].
 * Handles sessions that cross midnight accurately.
 */
export function calculateOverlapSeconds(
  sessionStart: Date,
  sessionEnd: Date,
  windowStart: Date,
  windowEnd: Date
): number {
  const effectiveStart = Math.max(sessionStart.getTime(), windowStart.getTime());
  const effectiveEnd = Math.min(sessionEnd.getTime(), windowEnd.getTime());

  if (effectiveEnd <= effectiveStart) {
    return 0;
  }

  return Math.floor((effectiveEnd - effectiveStart) / 1000);
}

/**
 * Slices a session across calendar day boundaries in the given timezone.
 * Returns array of { dateKey: "YYYY-MM-DD", seconds: number }.
 */
export function splitSessionAcrossDays(
  sessionStart: Date,
  sessionEnd: Date,
  timezone: string = config.timezone
): Array<{ dateKey: string; seconds: number }> {
  if (sessionEnd <= sessionStart) return [];

  const results: Array<{ dateKey: string; seconds: number }> = [];
  let currentStart = new Date(sessionStart);

  while (currentStart < sessionEnd) {
    const dateKey = getDateKeyInTz(currentStart, timezone);
    const { end: dayEnd } = getDayBoundsInTz(dateKey, timezone);

    const sliceEnd = sessionEnd < dayEnd ? sessionEnd : dayEnd;
    const seconds = Math.floor((sliceEnd.getTime() - currentStart.getTime()) / 1000);

    if (seconds > 0) {
      results.push({ dateKey, seconds });
    }

    // Move currentStart to beginning of next day
    currentStart = dayEnd;
  }

  return results;
}
