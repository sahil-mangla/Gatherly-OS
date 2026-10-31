/**
 * @file event-dates.js
 * @description Pure, DST-safe helpers for keeping event dates in the future and describing countdowns.
 */

import { parseDate } from './timeline-dates.js';
import { MS_PER_DAY, DAYS_PER_WEEK } from './constants.js';

const DEFAULT_LEAD_WEEKS = 18;
const COUNTDOWN_WEEKS_THRESHOLD_DAYS = 2 * DAYS_PER_WEEK;
const SATURDAY_ROUNDING_CUTOFF = 3;
const SATURDAY = 6;

/** Local midnight of the given date. */
export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The date `n` calendar days after `d` (negative `n` goes back). */
export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Local calendar date as `YYYY-MM-DD`. */
export function toIsoDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear()).padStart(4, '0')}-${m}-${day}`;
}

/** Whole calendar days from a to b (DST-safe: compares calendar dates, not elapsed ms). */
export function daysBetween(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

/** The Saturday closest to `leadWeeks` weeks after today. */
export function defaultEventDate(today, leadWeeks = DEFAULT_LEAD_WEEKS) {
  const base = addDays(startOfDay(today), leadWeeks * DAYS_PER_WEEK);
  const diff = (SATURDAY - base.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(base, diff > SATURDAY_ROUNDING_CUTOFF ? diff - DAYS_PER_WEEK : diff);
}

/** Shifts an ISO date string by whole calendar days; unparseable values pass through unchanged. */
export function shiftIso(value, days) {
  const d = parseDate(value);
  return d ? toIsoDate(addDays(d, days)) : value;
}

const isRecord = (value) => Boolean(value) && typeof value === 'object';

function shiftTask(task, days) {
  task.due_date = shiftIso(task.due_date, days);
  if (task.completed_at) task.completed_at = shiftIso(task.completed_at, days);
}

function shiftEventDates(event, days) {
  event.date = shiftIso(event.date, days);
  (event.tasks || []).filter(isRecord).forEach(task => shiftTask(task, days));
  (event.ideas || []).filter(idea => isRecord(idea) && idea.date_added).forEach(idea => {
    idea.date_added = shiftIso(idea.date_added, days);
  });
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

/** Infers a missing anchor from the event's template, or null for real fixed-date events. */
function inferAnchor(event, templates) {
  const tmpl = templates[event.id] || {};
  const tmplDate = parseDate(tmpl.date);
  const tmplAnchor = parseDate(tmpl.schedule_anchor);
  const current = parseDate(event.date);
  if (!(tmplDate && tmplAnchor && current)) return null;
  restoreTemplateIdeaDates(event, tmpl);
  return addDays(current, daysBetween(tmplDate, tmplAnchor));
}

/**
 * Keeps an event's whole schedule in step with the real calendar. `schedule_anchor` is the date
 * that "today" corresponds to within the event's authored timeline. Whenever real time moves a
 * full week past the anchor, every date shifts forward by whole weeks (weekdays are preserved)
 * and the anchor advances. Events saved before anchors existed get one inferred from their
 * template. Events with no anchor and no template, or flagged `fixed_date` (the user picked the
 * date themselves), are real, fixed-date events and are never touched. Returns true if changed.
 */
export function syncEventSchedule(event, today = new Date(), templates = {}) {
  if (!event || typeof event !== 'object' || event.fixed_date) return false;
  const anchor = parseDate(event.schedule_anchor) || inferAnchor(event, templates);
  if (!anchor) return false;

  const weeks = Math.floor(daysBetween(anchor, startOfDay(today)) / DAYS_PER_WEEK);
  const days = Math.max(0, weeks) * DAYS_PER_WEEK;
  if (days) shiftEventDates(event, days);
  const next = toIsoDate(addDays(anchor, days));
  if (!days && event.schedule_anchor === next) return false;
  event.schedule_anchor = next;
  return true;
}

/** Syncs every event's schedule to `today`; returns true when anything changed. */
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
  if (diff < COUNTDOWN_WEEKS_THRESHOLD_DAYS) return ` · ${diff} days to go`;
  return ` · ${Math.floor(diff / DAYS_PER_WEEK)} weeks to go`;
}
