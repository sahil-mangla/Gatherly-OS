/**
 * @file budget.js
 * @description Pure deterministic financial calculations and constraint checking for the client.
 */

import {
  EXPENSE_CATEGORIES,
  DEFAULT_EXPECTED_GUESTS,
  DEFAULT_COST_PER_GUEST,
  FALLBACK_CATERING
} from './constants.js';

export { EXPENSE_CATEGORIES };
export { validateExpenseInput } from './expense-validation.js';

const PERCENT = 100;
const TITLE_KEYWORDS = ['guest', 'seating', 'stationer', 'cater', 'tasting'];
const CATEGORY_KEYWORDS = ['catering', 'invitations'];

export function safeNonNegativeNumber(val) {
  const num = Number(val);
  return isNaN(num) || num < 0 ? 0 : num;
}

export function formatMoney(val, currency = '$') {
  const num = safeNonNegativeNumber(val);
  return `${currency}${Math.round(num).toLocaleString()}`;
}

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
  entry.percent_of_budget = totalBudget > 0 ? Math.round((entry.allocated / totalBudget) * PERCENT) : 0;
}

export function calculateBudgetSummary(event) {
  if (!event) {
    throw new Error('calculateBudgetSummary requires a valid event object.');
  }

  const totalBudget = safeNonNegativeNumber(event.total_budget);
  const expenses = Array.isArray(event.expenses) ? event.expenses : [];
  const categoryMap = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c, emptyCategoryEntry(c)]));

  let totalSpent = 0;
  let totalCommitted = 0;
  for (const exp of expenses) {
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
    percent_committed: totalBudget > 0 ? Math.min(PERCENT, Math.round((totalAllocated / totalBudget) * PERCENT)) : 0,
    is_over_budget: totalAllocated > totalBudget,
    deficit_amount: Math.max(0, totalAllocated - totalBudget),
    categories: categoryMap
  };
}

const signed = (n) => (n >= 0 ? '+' : '');

function isRippleAffected(task) {
  const title = (task.title || '').toLowerCase();
  const cat = (task.category || '').toLowerCase();
  return TITLE_KEYWORDS.some(k => title.includes(k)) || CATEGORY_KEYWORDS.some(k => cat.includes(k));
}

function projectGuests(event, guestDelta) {
  const currentGuests = Math.max(1, Number(event.expected_guests || DEFAULT_EXPECTED_GUESTS));
  const newGuests = Math.max(1, currentGuests + guestDelta);
  const venueCapacity = Number(event.venue_capacity || Infinity);
  const capacityBreach = newGuests > venueCapacity;
  const excessGuests = capacityBreach ? newGuests - venueCapacity : 0;
  return { currentGuests, newGuests, venueCapacity, capacityBreach, excessGuests };
}

function cateringCostDelta(event, guestDelta, variancePct) {
  const catering = (event.expenses || []).find(e => e.category === 'catering') || FALLBACK_CATERING;
  const costPerGuest = Number(catering.cost_per_guest || DEFAULT_COST_PER_GUEST);
  const pctDelta = Math.round(Number(catering.planned_amount || 0) * (variancePct / PERCENT));
  return guestDelta * costPerGuest + pctDelta;
}

function buildRippleNarrative(n) {
  const shift = n.totalCostDelta;
  return [
    `Guest count shifts by ${signed(n.guestDelta)}${n.guestDelta} (now ${n.newGuests}).`,
    `Catering package variance: ${signed(n.variancePct)}${n.variancePct}%.`,
    `Total financial shift: ${shift >= 0 ? '+$' : '-$'}${Math.abs(shift).toLocaleString()}.`,
    n.capacityBreach
      ? `⚠️ CRITICAL: Projected ${n.newGuests} guests exceeds venue capacity of ${n.venueCapacity} by ${n.excessGuests}!`
      : `✓ Venue capacity comfortably holds ${n.newGuests} guests (limit: ${n.venueCapacity}).`,
    n.projectedRemaining >= 0
      ? `Contingency buffer absorbs the change with $${n.projectedRemaining.toLocaleString()} breathing room remaining.`
      : `⚠️ Budget overrun of $${n.projectedDeficit.toLocaleString()} projected! Reallocation needed.`
  ];
}

export function simulateRipple(event, deltas = {}) {
  const currentSummary = calculateBudgetSummary(event);
  const guestDelta = Number(deltas.guest_delta || 0);
  const variancePct = Number(deltas.catering_variance_pct || 0);
  const guests = projectGuests(event, guestDelta);

  const totalCostDelta = cateringCostDelta(event, guestDelta, variancePct);
  const projectedAllocated = currentSummary.total_allocated + totalCostDelta;
  const projectedRemaining = currentSummary.total_budget - projectedAllocated;
  const projectedDeficit = Math.max(0, projectedAllocated - currentSummary.total_budget);

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
    affected_tasks: (event.tasks || [])
      .filter(isRippleAffected)
      .map(t => ({ id: t.id, title: t.title, due_date: t.due_date }))
  };
}
