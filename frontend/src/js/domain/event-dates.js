/**
 * @file event-dates.js
 * @description Pure, DST-safe helpers for keeping event dates in the future and describing countdowns.
 */

import { parseDate } from './timeline-dates.js';

const DEFAULT_LEAD_WEEKS = 18;
const SATURDAY = 6;

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function toIsoDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole calendar days from a to b (DST-safe: compares calendar dates, not elapsed ms). */
export function daysBetween(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

/** The Saturday closest to `leadWeeks` weeks after today. */
export function defaultEventDate(today, leadWeeks = DEFAULT_LEAD_WEEKS) {
  const base = addDays(startOfDay(today), leadWeeks * 7);
  const diff = (SATURDAY - base.getDay() + 7) % 7;
  return addDays(base, diff > 3 ? diff - 7 : diff);
}

function shiftIso(value, days) {
  const d = parseDate(value);
  return d ? toIsoDate(addDays(d, days)) : value;
}

function shiftEventDates(event, days) {
  event.date = shiftIso(event.date, days);
  for (const task of event.tasks || []) {
    if (!task) continue;
    task.due_date = shiftIso(task.due_date, days);
    if (task.completed_at) task.completed_at = shiftIso(task.completed_at, days);
  }
  for (const idea of event.ideas || []) {
    if (idea && idea.date_added) idea.date_added = shiftIso(idea.date_added, days);
  }
}

/** Legacy saves stored free text like "May 30"; swap in the template's real date so it can shift. */
function restoreTemplateIdeaDates(event, tmpl) {
  const byId = new Map((tmpl.ideas || []).map(i => [i.id, i.date_added]));
  for (const idea of event.ideas || []) {
    if (idea && !parseDate(idea.date_added) && parseDate(byId.get(idea.id))) {
      idea.date_added = byId.get(idea.id);
    }
  }
}

/**
 * Keeps an event's whole schedule in step with the real calendar. `schedule_anchor` is the date
 * that "today" corresponds to within the event's authored timeline. Whenever real time moves a
 * full week past the anchor, every date shifts forward by whole weeks (weekdays are preserved)
 * and the anchor advances. Events saved before anchors existed get one inferred from their
 * template. Events with no anchor and no template are real, fixed-date events and are never
 * touched. Returns true if changed.
 */
export function syncEventSchedule(event, today = new Date(), templates = {}) {
  if (!event || typeof event !== 'object') return false;
  let anchor = parseDate(event.schedule_anchor);
  if (!anchor) {
    const tmpl = templates[event.id] || {};
    const tmplDate = parseDate(tmpl.date);
    const tmplAnchor = parseDate(tmpl.schedule_anchor);
    const current = parseDate(event.date);
    if (!(tmplDate && tmplAnchor && current)) return false;
    anchor = addDays(current, daysBetween(tmplDate, tmplAnchor));
    restoreTemplateIdeaDates(event, tmpl);
  }

  const weeks = Math.floor(daysBetween(anchor, startOfDay(today)) / 7);
  const days = Math.max(0, weeks) * 7;
  if (days) shiftEventDates(event, days);
  const next = toIsoDate(addDays(anchor, days));
  if (!days && event.schedule_anchor === next) return false;
  event.schedule_anchor = next;
  return true;
}

export function normalizeAllEventDates(events, today = new Date(), templates = {}) {
  let changed = false;
  for (const event of Object.values(events || {})) {
    if (syncEventSchedule(event, today, templates)) changed = true;
  }
  return changed;
}

/** Human countdown text such as " · 18 weeks to go", " · Tomorrow", or " · Today!". */
export function describeCountdown(eventDate, today = new Date()) {
  const diff = daysBetween(startOfDay(today), eventDate);
  if (diff < 0) return ' · Event date passed';
  if (diff === 0) return ' · Today!';
  if (diff === 1) return ' · Tomorrow';
  if (diff < 14) return ` · ${diff} days to go`;
  return ` · ${Math.floor(diff / 7)} weeks to go`;
}
