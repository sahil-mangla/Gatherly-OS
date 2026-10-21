/**
 * @file budget.js
 * @description Pure deterministic financial calculations and constraint checking for the client.
 */

export const EXPENSE_CATEGORIES = [
  'venue',
  'catering',
  'design',
  'photo_music',
  'contingency',
  'other'
];

export function safeNonNegativeNumber(val) {
  const num = Number(val);
  return isNaN(num) || num < 0 ? 0 : num;
}

export function validateExpenseInput(item) {
  const errors = [];
  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Expense payload must be an object.'] };
  }

  if (!item.description || typeof item.description !== 'string' || item.description.trim().length === 0) {
    errors.push('Description is required and must not be empty.');
  }

  const planned = Number(item.planned_amount);
  if (isNaN(planned) || planned < 0) {
    errors.push('Planned amount must be a positive number or zero.');
  }

  const actual = Number(item.actual_amount ?? 0);
  if (isNaN(actual) || actual < 0) {
    errors.push('Actual amount cannot be negative.');
  }

  const committed = Number(item.committed_amount ?? 0);
  if (isNaN(committed) || committed < 0) {
    errors.push('Committed amount cannot be negative.');
  }

  if (item.category && !EXPENSE_CATEGORIES.includes(item.category)) {
    errors.push(`Invalid category: "${item.category}". Allowed: ${EXPENSE_CATEGORIES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

export function calculateBudgetSummary(event) {
  if (!event) {
    throw new Error('calculateBudgetSummary requires a valid event object.');
  }

  const totalBudget = safeNonNegativeNumber(event.total_budget);
  const expenses = Array.isArray(event.expenses) ? event.expenses : [];

  let totalSpent = 0;
  let totalCommitted = 0;

  const categoryMap = {};
  for (const cat of EXPENSE_CATEGORIES) {
    categoryMap[cat] = {
      category: cat,
      planned: 0,
      actual: 0,
      committed: 0,
      allocated: 0,
      variance: 0,
      percent_of_budget: 0,
      is_overrun: false
    };
  }

  for (const exp of expenses) {
    const actual = safeNonNegativeNumber(exp.actual_amount);
    const committed = safeNonNegativeNumber(exp.committed_amount);
    const planned = safeNonNegativeNumber(exp.planned_amount);

    totalSpent += actual;
    totalCommitted += committed;

    const cat = EXPENSE_CATEGORIES.includes(exp.category) ? exp.category : 'other';
    categoryMap[cat].planned += planned;
    categoryMap[cat].actual += actual;
    categoryMap[cat].committed += committed;
    categoryMap[cat].allocated += (actual + committed);
  }

  const totalAllocated = totalSpent + totalCommitted;
  const remainingUncommitted = totalBudget - totalAllocated;
  const percentCommitted = totalBudget > 0 ? Math.min(100, Math.round((totalAllocated / totalBudget) * 100)) : 0;
  const isOverBudget = totalAllocated > totalBudget;
  const deficitAmount = Math.max(0, totalAllocated - totalBudget);

  for (const cat of Object.keys(categoryMap)) {
    const entry = categoryMap[cat];
    entry.variance = entry.allocated - entry.planned;
    entry.is_overrun = entry.allocated > entry.planned && entry.planned > 0;
    entry.percent_of_budget = totalBudget > 0 ? Math.round((entry.allocated / totalBudget) * 100) : 0;
  }

  return {
    total_budget: totalBudget,
    total_spent: totalSpent,
    total_committed: totalCommitted,
    total_allocated: totalAllocated,
    remaining_uncommitted: remainingUncommitted,
    percent_committed: percentCommitted,
    is_over_budget: isOverBudget,
    deficit_amount: deficitAmount,
    categories: categoryMap
  };
}

export function simulateRipple(event, deltas = {}) {
  const currentSummary = calculateBudgetSummary(event);
  const guestDelta = Number(deltas.guest_delta || 0);
  const cateringVariancePct = Number(deltas.catering_variance_pct || 0);

  const currentGuests = Math.max(1, Number(event.expected_guests || 100));
  const newGuests = Math.max(1, currentGuests + guestDelta);
  const venueCapacity = Number(event.venue_capacity || Infinity);

  const capacityBreach = newGuests > venueCapacity;
  const excessGuests = capacityBreach ? newGuests - venueCapacity : 0;

  const cateringExp = (event.expenses || []).find(e => e.category === 'catering') || {
    planned_amount: 4000,
    cost_per_guest: 45
  };

  const costPerGuest = Number(cateringExp.cost_per_guest || 40);
  const variableGuestCostDelta = guestDelta * costPerGuest;
  const cateringPctCostDelta = Math.round(Number(cateringExp.planned_amount || 0) * (cateringVariancePct / 100));

  const totalCostDelta = variableGuestCostDelta + cateringPctCostDelta;
  const projectedAllocated = currentSummary.total_allocated + totalCostDelta;
  const projectedRemaining = currentSummary.total_budget - projectedAllocated;
  const projectedDeficit = Math.max(0, projectedAllocated - currentSummary.total_budget);

  const affectedTasks = (event.tasks || []).filter(t => {
    const title = (t.title || '').toLowerCase();
    const cat = (t.category || '').toLowerCase();
    return (
      title.includes('guest') ||
      title.includes('seating') ||
      title.includes('stationer') ||
      title.includes('cater') ||
      title.includes('tasting') ||
      cat.includes('catering') ||
      cat.includes('invitations')
    );
  }).map(t => ({ id: t.id, title: t.title, due_date: t.due_date }));

  return {
    initial: {
      guests: currentGuests,
      allocated: currentSummary.total_allocated,
      remaining: currentSummary.remaining_uncommitted
    },
    projected: {
      guests: newGuests,
      allocated: projectedAllocated,
      remaining: projectedRemaining,
      deficit: projectedDeficit,
      cost_delta: totalCostDelta,
      capacity_breach: capacityBreach,
      excess_guests: excessGuests
    },
    narrative: [
      `Guest count shifts by ${guestDelta >= 0 ? '+' : ''}${guestDelta} (now ${newGuests}).`,
      `Catering package variance: ${cateringVariancePct >= 0 ? '+' : ''}${cateringVariancePct}%.`,
      `Total financial shift: ${totalCostDelta >= 0 ? '+$' : '-$'}${Math.abs(totalCostDelta).toLocaleString()}.`,
      capacityBreach
        ? `⚠️ CRITICAL: Projected ${newGuests} guests exceeds venue capacity of ${venueCapacity} by ${excessGuests}!`
        : `✓ Venue capacity comfortably holds ${newGuests} guests (limit: ${venueCapacity}).`,
      projectedRemaining >= 0
        ? `Contingency buffer absorbs the change with $${projectedRemaining.toLocaleString()} breathing room remaining.`
        : `⚠️ Budget overrun of $${projectedDeficit.toLocaleString()} projected! Reallocation needed.`
    ],
    affected_tasks: affectedTasks
  };
}
