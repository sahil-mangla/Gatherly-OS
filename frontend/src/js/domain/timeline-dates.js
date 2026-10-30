/**
 * @file timeline-dates.js
 * @description Date parsing helper for Gatherly timeline (mirrors backend timeline_dates.parse_date).
 */

// YYYY-MM-DD, optionally followed by a time part ("T..." or " ..."); nothing else is a date.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\s\S]*)?$/;

/** Local-midnight Date for a real calendar day (2026-02-30 is rejected, not rolled over), else null. */
export function parseDate(dateStr) {
  const match = typeof dateStr === 'string' ? ISO_DATE.exec(dateStr) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month - 1, day);
  const real = year >= 1 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? date : null;
}
