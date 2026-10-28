/**
 * @file helpers.js
 * @description Common formatting and string sanitization helpers for Gatherly views.
 */

import { parseDate } from '../domain/timeline-dates.js';

export function formatDateSub(dateStr) {
  if (!dateStr) return '';
  const d = parseDate(dateStr) || new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Formats an ISO `date_added` as "May 30"; legacy free text such as "Just now" passes through. */
export function formatAdded(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : (value || 'Recently');
}

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
