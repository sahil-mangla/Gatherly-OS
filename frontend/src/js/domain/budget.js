/**
 * @file budget.js
 * @description Pure deterministic financial calculations and constraint checking for the client.
 */

import {
  EXPENSE_CATEGORIES,
  DEFAULT_EXPECTED_GUESTS,
  DEFAULT_COST_PER_GUEST,
  FALLBACK_CATERING,
  UNLIMITED_VENUE_CAPACITY
} from './constants.js';
import {
  formatAmount, formatSignedTenths, numberOr, roundHalfUp, safeNonNegativeNumber, toInt
} from './numeric.js';

export { EXPENSE_CATEGORIES };
export { validateExpenseInput } from './expense-validation.js';
export { safeNonNegativeNumber };

const PERCENT = 100;
const TASK_KEYWORDS = ['guest', 'seating', 'stationer', 'cater', 'tasting', 'invitation'];

export function formatMoney(val, currency = '$') {
  return `${currency}${formatAmount(safeNonNegativeNumber(val))}`;
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function emptyCategoryEntry(category) {
  return {
    category,
    planned: 0,
    actual: 0,
    committed: 0,
    allocated: 0,
    variance: 0,
    percent_of_budget: 0,
    is_overrun: false
  };
}

function addExpenseToCategory(categoryMap, exp) {
  const actual = safeNonNegativeNumber(exp.actual_amount);
  const committed = safeNonNegativeNumber(exp.committed_amount);
  const key = EXPENSE_CATEGORIES.includes(exp.category) ? exp.category : 'other';
  const entry = categoryMap[key];
  entry.planned += safeNonNegativeNumber(exp.planned_amount);
  entry.actual += actual;
  entry.committed += committed;
  entry.allocated += actual + committed;
  return { actual, committed };
}

function finalizeCategory(entry, totalBudget) {
  entry.variance = entry.allocated - entry.planned;
  entry.is_overrun = entry.allocated > entry.planned && entry.planned > 0;
  entry.percent_of_budget = totalBudget > 0 ? roundHalfUp((entry.allocated / totalBudget) * PERCENT) : 0;
}

export function calculateBudgetSummary(event) {
  if (!isRecord(event)) {
    throw new Error('calculateBudgetSummary requires a valid event object.');
  }

  const totalBudget = safeNonNegativeNumber(event.total_budget);
  const expenses = Array.isArray(event.expenses) ? event.expenses : [];
  const categoryMap = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c, emptyCategoryEntry(c)]));

  let totalSpent = 0;
  let totalCommitted = 0;
  for (const exp of expenses.filter(isRecord)) {
    const { actual, committed } = addExpenseToCategory(categoryMap, exp);
    totalSpent += actual;
    totalCommitted += committed;
  }

  const totalAllocated = totalSpent + totalCommitted;
  Object.values(categoryMap).forEach(entry => finalizeCategory(entry, totalBudget));

  return {
    total_budget: totalBudget,
    total_spent: totalSpent,
    total_committed: totalCommitted,
    total_allocated: totalAllocated,
    remaining_uncommitted: totalBudget - totalAllocated,
    percent_committed: totalBudget > 0 ? Math.min(PERCENT, roundHalfUp((totalAllocated / totalBudget) * PERCENT)) : 0,
    is_over_budget: totalAllocated > totalBudget,
    deficit_amount: Math.max(0, totalAllocated - totalBudget),
    categories: categoryMap
  };
}

const signed = (n) => (n >= 0 ? '+' : '');

function isRippleAffected(task) {
  const haystack = `${String(task.title ?? '').toLowerCase()}\n${String(task.category ?? '').toLowerCase()}`;
  return TASK_KEYWORDS.some(k => haystack.includes(k));
}

function projectGuests(event, guestDelta) {
  // Like capacity, a recorded guest count of zero means "not set".
  const currentGuests = Math.max(1, toInt(event.expected_guests, 0) || DEFAULT_EXPECTED_GUESTS);
  const newGuests = Math.max(1, currentGuests + guestDelta);
  // A recorded capacity of zero means "not set": it never produces a breach.
  const venueCapacity = safeNonNegativeNumber(event.venue_capacity) || UNLIMITED_VENUE_CAPACITY;
  const capacityBreach = newGuests > venueCapacity;
  const excessGuests = capacityBreach ? roundHalfUp(newGuests - venueCapacity) : 0;
  return { currentGuests, newGuests, venueCapacity, capacityBreach, excessGuests };
}

function cateringCostDelta(event, guestDelta, variancePct) {
  const expenses = Array.isArray(event.expenses) ? event.expenses : [];
  const catering = expenses.find(e => isRecord(e) && e.category === 'catering') || FALLBACK_CATERING;
  const costPerGuest = Math.max(0, numberOr(catering.cost_per_guest, DEFAULT_COST_PER_GUEST));
  const pctDelta = roundHalfUp(safeNonNegativeNumber(catering.planned_amount) * (variancePct / PERCENT));
  return guestDelta * costPerGuest + pctDelta;
}

function buildRippleNarrative(n) {
  const shift = n.totalCostDelta;
  const limit = roundHalfUp(n.venueCapacity);
  return [
    `Guest count shifts by ${signed(n.guestDelta)}${n.guestDelta} (projected total: ${n.newGuests}).`,
    `Catering package variance: ${formatSignedTenths(n.variancePct)}%.`,
    `Projected financial shift: ${shift >= 0 ? '+$' : '-$'}${formatAmount(Math.abs(shift))}.`,
    n.capacityBreach
      ? `⚠️ CRITICAL: Projected ${n.newGuests} guests exceeds venue capacity of ${limit} by ${n.excessGuests}!`
      : `✓ Venue capacity comfortably holds ${n.newGuests} guests (limit: ${limit}).`,
    n.projectedRemaining >= 0
      ? `Contingency buffer absorbs the change with $${formatAmount(n.projectedRemaining)} breathing room remaining.`
      : `⚠️ Budget overrun of $${formatAmount(n.projectedDeficit)} projected! Reallocation needed.`
  ];
}

export function simulateRipple(event, deltas = {}) {
  const currentSummary = calculateBudgetSummary(event);
  const change = isRecord(deltas) ? deltas : {};
  const guestDelta = toInt(change.guest_delta, 0);
  const variancePct = numberOr(change.catering_variance_pct, 0);
  const guests = projectGuests(event, guestDelta);

  const totalCostDelta = cateringCostDelta(event, guestDelta, variancePct);
  const projectedAllocated = currentSummary.total_allocated + totalCostDelta;
  const projectedRemaining = currentSummary.total_budget - projectedAllocated;
  const projectedDeficit = Math.max(0, projectedAllocated - currentSummary.total_budget);
  const tasks = Array.isArray(event.tasks) ? event.tasks : [];

  return {
    initial: {
      guests: guests.currentGuests,
      allocated: currentSummary.total_allocated,
      remaining: currentSummary.remaining_uncommitted
    },
    projected: {
      guests: guests.newGuests,
      allocated: projectedAllocated,
      remaining: projectedRemaining,
      deficit: projectedDeficit,
      cost_delta: totalCostDelta,
      capacity_breach: guests.capacityBreach,
      excess_guests: guests.excessGuests
    },
    narrative: buildRippleNarrative({
      ...guests, guestDelta, variancePct, totalCostDelta, projectedRemaining, projectedDeficit
    }),
    affected_tasks: tasks
      .filter(t => isRecord(t) && isRippleAffected(t))
      .map(t => ({ id: t.id ?? null, title: t.title ?? null, due_date: t.due_date ?? null }))
  };
}
