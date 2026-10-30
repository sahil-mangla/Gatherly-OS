/**
 * @file event-factory.js
 * @description Pure builders for user-created events: clone a template, scale it to the user's
 * numbers and dates, and revalidate basic edits. Templates are never mutated.
 */

import { makeId } from '../store/helpers.js';
import { parseDate } from './timeline-dates.js';
import { addDays, daysBetween, shiftIso, startOfDay, toIsoDate } from './event-dates.js';
import { validateEventBasics, validateEventEdit, validationError } from './event-validation.js';

const TYPE_THEMES = {
  wedding: 'Your story, told your way',
  birthday: 'Good company, good food, good stories',
  community: 'Neighbours showing up for each other'
};

const toCents = (amount) => Math.round(Number(amount || 0) * 100);

/** Splits `totalCents` in proportion to `weights`; the rounding remainder goes to the largest weight so the sum is exact. */
function allocateCents(weights, totalCents) {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, w) => a + w, 0);
  const shares = weights.map(w => (sum > 0 ? Math.round((w * totalCents) / sum) : Math.floor(totalCents / weights.length)));
  const drift = totalCents - shares.reduce((a, s) => a + s, 0);
  shares[weights.indexOf(Math.max(...weights))] += drift;
  return shares;
}

/** Per-guest rates keep the template's relationship: they follow the budget scale and divide across the new headcount. */
function scaledRate(rate, planned, source, ctx) {
  const budgetScale = source.planned_amount > 0 ? planned / source.planned_amount : 1;
  return Math.round(Number(rate || 0) * budgetScale * (ctx.templateGuests / ctx.guests) * 100) / 100;
}

function buildExpenses(expenses, ctx) {
  const shares = allocateCents(expenses.map(e => toCents(e.planned_amount)), toCents(ctx.budget));
  return expenses.map((source, i) => {
    const planned = shares[i] / 100;
    return {
      ...source,
      id: makeId('exp'),
      planned_amount: planned,
      actual_amount: 0,
      committed_amount: 0,
      status: 'planned',
      cost_per_guest: scaledRate(source.cost_per_guest, planned, source, ctx),
      vendor_id: null
    };
  });
}

function dueDateFor(task, ctx) {
  const original = parseDate(task.due_date);
  const shifted = original ? addDays(ctx.eventDate, daysBetween(ctx.templateDate, original)) : ctx.today;
  return toIsoDate(shifted < ctx.today ? ctx.today : shifted);
}

/** Keeps each task's distance from the event date; anything that would land before today is clamped to today (order kept). */
function buildTasks(tasks, ctx) {
  const ids = new Map(tasks.map(t => [t.id, makeId('task')]));
  return tasks.map(source => {
    const task = {
      ...source,
      id: ids.get(source.id),
      due_date: dueDateFor(source, ctx),
      status: 'todo',
      depends_on: (source.depends_on || []).map(dep => ids.get(dep)).filter(Boolean)
    };
    delete task.completed_at;
    return task;
  });
}

function findTemplate(templates, type) {
  const template = Object.values(templates || {}).find(t => t && t.type === type);
  if (!template) throw new Error(`No template available for event type "${type}".`);
  return structuredClone(template);
}

/**
 * Builds a complete event from the template matching `type`.
 * Seed names, vendors and ideas are dropped (no "Leila & Noor" in someone else's wedding); schedule_anchor is
 * omitted because the user chose the date, so the schedule must never roll forward on its own.
 * @param {{type:string,name:string,date:string,guests:number|string,capacity:number|string,budget:number|string}} input
 * @param {Object} templates map of template events
 * @param {Date} [now]
 * @throws {Error} with a `fields` map when the input is invalid
 */
export function createEventFromTemplate(input, templates, now = new Date()) {
  const { valid, errors, values } = validateEventBasics(input, now);
  if (!valid) throw validationError(errors);
  const template = findTemplate(templates, values.type);
  const ctx = {
    budget: values.budget,
    guests: values.guests,
    templateGuests: Number(template.expected_guests) || values.guests,
    templateDate: parseDate(template.date) || startOfDay(now),
    eventDate: parseDate(values.date),
    today: startOfDay(now)
  };
  return {
    id: makeId('event'),
    name: values.name,
    subtitle: template.subtitle,
    type: values.type,
    date: values.date,
    currency: template.currency || '$',
    total_budget: values.budget,
    expected_guests: values.guests,
    venue_capacity: values.capacity,
    theme: TYPE_THEMES[values.type],
    color_accent: template.color_accent,
    expenses: buildExpenses(template.expenses || [], ctx),
    tasks: buildTasks(template.tasks || [], ctx),
    vendors: [],
    ideas: [],
    dismissed_risk_ids: []
  };
}

/** Moves every task by the same number of days as the event; open tasks that would slip behind today are clamped to today. */
function moveSchedule(event, newDate, today) {
  const days = daysBetween(parseDate(event.date), parseDate(newDate));
  for (const task of event.tasks || []) {
    const wasCurrent = parseDate(task.due_date) >= today;
    task.due_date = shiftIso(task.due_date, days);
    if (task.completed_at) task.completed_at = shiftIso(task.completed_at, days);
    if (wasCurrent && task.status !== 'done' && parseDate(task.due_date) < today) task.due_date = toIsoDate(today);
  }
  event.date = newDate;
  delete event.schedule_anchor;
  event.fixed_date = true;
}

/**
 * Applies edited basics to `event` in place after revalidating; nothing changes when anything is invalid.
 * A changed date shifts every task by the same offset and pins the date so it no longer rolls forward.
 * @throws {Error} with a `fields` map when the input is invalid
 */
export function updateEventBasics(event, input, now = new Date()) {
  const { valid, errors, values } = validateEventEdit(event, input, now);
  if (!valid) throw validationError(errors);
  if (values.date && values.date !== event.date) moveSchedule(event, values.date, startOfDay(now));
  if (values.name !== undefined) event.name = values.name;
  if (values.guests !== undefined) event.expected_guests = values.guests;
  if (values.capacity !== undefined) event.venue_capacity = values.capacity;
  if (values.budget !== undefined) event.total_budget = values.budget;
  return event;
}
