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
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Returns `value` (lower-cased) when it is in `allowed`, otherwise `fallback`. Use for values that become CSS class names. */
export function safeToken(value, allowed, fallback) {
  const token = String(value ?? '').toLowerCase();
  return allowed.includes(token) ? token : fallback;
}

/** Human-readable `<time>` element for an ISO date; unknown values are escaped plain text. */
export function timeHtml(dateStr) {
  if (!dateStr) return 'Unscheduled';
  const d = parseDate(dateStr);
  if (!d) return escapeHtml(dateStr);
  return `<time datetime="${escapeHtml(String(dateStr).slice(0, 10))}">${escapeHtml(formatDateSub(dateStr))}</time>`;
}

/** Plain-text counterpart of {@link timeHtml}, for aria-labels and textContent. */
export function dateText(dateStr) {
  return dateStr ? formatDateSub(dateStr) || String(dateStr) : 'Unscheduled';
}

/** Escaped, upper-cased label text (for the monospace category tags). */
export function upperEscaped(value, fallback) {
  return escapeHtml(String(value || fallback).toUpperCase());
}

/** Sets `textContent` of the element with `id` (no-op when it does not exist). */
export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Sets `innerHTML` of the element with `id`; callers must escape interpolated values. */
export function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/** Asks the app shell to switch the visible view (decouples views from navigation internals). */
export function requestView(viewId) {
  document.dispatchEvent(new CustomEvent('gatherly:navigate', { detail: { view: viewId } }));
}

/** Binds `handler` to `container` exactly once (views re-render children, not the container). */
export function bindOnce(container, type, handler) {
  if (!container || container.dataset[`bound${type}`]) return;
  container.dataset[`bound${type}`] = 'true';
  container.addEventListener(type, handler);
}
