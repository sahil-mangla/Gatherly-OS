/**
 * @file timeline-dates.js
 * @description Date parsing helper for Gatherly timeline.
 */

export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const d = new Date(match[0] + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}
