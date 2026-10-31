/**
 * @file event-validation.js
 * @description Pure per-field validation for the New event / Edit event details form.
 * Every rule returns `{ value }` (normalised) or `{ error }` (a user-facing message).
 */

import { parseDate } from './timeline-dates.js';
import { addDays, startOfDay, toIsoDate } from './event-dates.js';

export const EVENT_TYPES = ['wedding', 'birthday', 'community'];
export const EVENT_LIMITS = Object.freeze({
  nameMax: 80,
  guestsMax: 5000,
  budgetMax: 10000000,
  yearsAhead: 5,
  pastGraceDays: 1
});
export const CAPACITY_WARNING = 'This is over capacity — Gatherly will flag it on your Risk Radar';
export const EDITABLE_FIELDS = ['name', 'date', 'guests', 'capacity', 'budget'];

const ok = (value) => ({ value });
const fail = (error) => ({ error });
const text = (raw) => String(raw ?? '').trim();
const wholeNumber = (raw) => (/^\d{1,9}$/.test(text(raw)) ? Number(text(raw)) : null);

function ruleType(raw) {
  const value = text(raw).toLowerCase();
  return EVENT_TYPES.includes(value) ? ok(value) : fail('Choose an event type.');
}

function ruleName(raw) {
  const value = text(raw);
  if (!value) return fail('Give your event a name.');
  return value.length > EVENT_LIMITS.nameMax
    ? fail(`Keep the name to ${EVENT_LIMITS.nameMax} characters or fewer.`)
    : ok(value);
}

function ruleDate(raw, today) {
  const value = text(raw);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDate(value) : null;
  if (!parsed || toIsoDate(parsed) !== value) return fail('Choose a valid event date.');
  if (parsed < addDays(today, -EVENT_LIMITS.pastGraceDays)) {
    return fail('That date is in the past. Choose today or a later date.');
  }
  const latest = new Date(today.getFullYear() + EVENT_LIMITS.yearsAhead, today.getMonth(), today.getDate());
  return parsed > latest ? fail(`Choose a date within the next ${EVENT_LIMITS.yearsAhead} years.`) : ok(value);
}

function ruleGuests(raw) {
  const n = wholeNumber(raw);
  return n !== null && n >= 1 && n <= EVENT_LIMITS.guestsMax
    ? ok(n)
    : fail('Enter a whole number of guests from 1 to 5,000.');
}

function ruleCapacity(raw) {
  const n = wholeNumber(raw);
  return n !== null && n >= 1 ? ok(n) : fail('Enter a whole number of 1 or more for venue capacity.');
}

function ruleBudget(raw) {
  const value = text(raw);
  const n = /^\d{1,8}(\.\d{1,2})?$/.test(value) ? Number(value) : NaN;
  return n > 0 && n <= EVENT_LIMITS.budgetMax
    ? ok(n)
    : fail('Enter a budget above $0 and up to $10,000,000 (cents allowed).');
}

const RULES = {
  type: ruleType,
  name: ruleName,
  date: ruleDate,
  guests: ruleGuests,
  capacity: ruleCapacity,
  budget: ruleBudget
};

/**
 * Validates the named fields of `input`.
 * @returns {{valid:boolean, errors:Object<string,string>, values:Object}} normalised values and per-field messages
 */
export function validateEventBasics(input, now = new Date(), fields = Object.keys(RULES)) {
  const today = startOfDay(now);
  const errors = {};
  const values = {};
  for (const field of fields) {
    const result = RULES[field](input ? input[field] : undefined, today);
    if (result.error) errors[field] = result.error;
    else values[field] = result.value;
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

/** Edit-mode validation: only supplied fields are checked, and an unchanged date is never re-judged. */
export function validateEventEdit(event, input, now = new Date()) {
  const fields = EDITABLE_FIELDS.filter(f => input[f] !== undefined && !(f === 'date' && input.date === event.date));
  return validateEventBasics(input, now, fields);
}

/** True when both numbers are valid and the guests exceed the capacity (a non-blocking warning). */
export function isOverCapacity(guests, capacity) {
  const check = validateEventBasics({ guests, capacity }, new Date(), ['guests', 'capacity']);
  return check.valid && check.values.guests > check.values.capacity;
}

/** Builds the Error thrown for invalid input; `fields` carries the per-field messages. */
export function validationError(errors) {
  const err = new Error(`Event validation failed: ${Object.values(errors).join(' ')}`);
  err.fields = errors;
  return err;
}
