/**
 * @file budget.test.js
 * @description Edge-case and parity tests for the refactored budget domain functions.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExpenseInput,
  calculateBudgetSummary,
  simulateRipple,
  EXPENSE_CATEGORIES
} from '../src/js/domain/budget.js';

describe('validateExpenseInput', () => {
  const valid = { description: 'Cake', planned_amount: 100 };

  test('accepts a minimal valid expense and zero amounts', () => {
    assert.deepEqual(validateExpenseInput(valid), { valid: true, errors: [] });
    assert.equal(validateExpenseInput({ ...valid, planned_amount: 0 }).valid, true);
    assert.equal(validateExpenseInput({ ...valid, planned_amount: null }).valid, false);
  });

  test('rejects non-objects with a single error', () => {
    for (const bad of [null, undefined, 'x', 42]) {
      assert.deepEqual(validateExpenseInput(bad), { valid: false, errors: ['Expense payload must be an object.'] });
    }
  });

  test('reports every violated rule in a stable order', () => {
    const res = validateExpenseInput({
      description: '   ', planned_amount: -1, actual_amount: -2, committed_amount: 'abc', category: 'bogus'
    });
    assert.equal(res.errors.length, 5);
    assert.match(res.errors[0], /Description/);
    assert.match(res.errors[1], /Planned/);
    assert.match(res.errors[2], /Actual/);
    assert.match(res.errors[3], /Committed/);
    assert.match(res.errors[4], /Invalid category 'bogus'/);
  });

  test('missing planned amount is invalid but missing actual/committed default to zero', () => {
    assert.deepEqual(validateExpenseInput({ description: 'x' }).errors.length, 1);
    assert.equal(validateExpenseInput({ ...valid, description: 5 }).valid, false);
  });

  test('every known category is accepted', () => {
    for (const category of EXPENSE_CATEGORIES) {
      assert.equal(validateExpenseInput({ ...valid, category }).valid, true);
    }
  });
});

describe('calculateBudgetSummary', () => {
  test('throws without an event and tolerates empty events', () => {
    assert.throws(() => calculateBudgetSummary(null), /valid event/);
    const s = calculateBudgetSummary({});
    assert.equal(s.total_budget, 0);
    assert.equal(s.percent_committed, 0);
    assert.equal(s.is_over_budget, false);
    assert.deepEqual(Object.keys(s.categories), EXPENSE_CATEGORIES);
  });

  test('routes unknown categories to other and clamps negatives to zero', () => {
    const s = calculateBudgetSummary({
      total_budget: 1000,
      expenses: [
        { category: 'mystery', planned_amount: 100, actual_amount: 50, committed_amount: -20 },
        { category: 'other', planned_amount: -5, actual_amount: 'x', committed_amount: 10 }
      ]
    });
    assert.equal(s.categories.other.planned, 100);
    assert.equal(s.categories.other.actual, 50);
    assert.equal(s.categories.other.committed, 10);
    assert.equal(s.total_allocated, 60);
  });

  test('over budget: deficit, capped percent and overrun flags', () => {
    const s = calculateBudgetSummary({
      total_budget: 100,
      expenses: [{ category: 'venue', planned_amount: 50, actual_amount: 300 }]
    });
    assert.equal(s.is_over_budget, true);
    assert.equal(s.deficit_amount, 200);
    assert.equal(s.percent_committed, 100);
    assert.equal(s.categories.venue.is_overrun, true);
    assert.equal(s.categories.venue.percent_of_budget, 300);
    assert.equal(s.remaining_uncommitted, -200);
  });

  test('zero budget never divides by zero; huge inputs stay finite', () => {
    const zero = calculateBudgetSummary({ total_budget: 0, expenses: [{ category: 'venue', actual_amount: 10 }] });
    assert.equal(zero.percent_committed, 0);
    assert.equal(zero.categories.venue.percent_of_budget, 0);
    const many = Array.from({ length: 50000 }, () => ({ category: 'catering', planned_amount: 2, actual_amount: 1 }));
    const huge = calculateBudgetSummary({ total_budget: 1e12, expenses: many });
    assert.equal(huge.total_spent, 50000);
    assert.equal(huge.categories.catering.planned, 100000);
  });
});

describe('simulateRipple', () => {
  const base = { total_budget: 10000, expected_guests: 100, venue_capacity: 120, expenses: [], tasks: [] };

  test('uses fallback catering assumptions when no catering expense exists', () => {
    const r = simulateRipple(base, { guest_delta: 10, catering_variance_pct: 10 });
    assert.equal(r.projected.cost_delta, 10 * 45 + 400);
    assert.equal(r.projected.capacity_breach, false);
    assert.equal(r.projected.excess_guests, 0);
  });

  test('defaults cost per guest to 40 for catering expenses without a rate', () => {
    const event = { ...base, expenses: [{ category: 'catering', planned_amount: 1000 }] };
    assert.equal(simulateRipple(event, { guest_delta: 2 }).projected.cost_delta, 80);
  });

  test('never drops below one guest and handles no deltas', () => {
    const r = simulateRipple({ ...base, expected_guests: 5 }, { guest_delta: -500 });
    assert.equal(r.projected.guests, 1);
    assert.equal(simulateRipple(base).projected.cost_delta, 0);
    assert.equal(simulateRipple({ ...base, expected_guests: 0 }).initial.guests, 100);
  });

  test('narrative covers overrun and capacity breach wording', () => {
    const r = simulateRipple({ ...base, total_budget: 100 }, { guest_delta: 40 });
    assert.match(r.narrative[0], /shifts by \+40 \(projected total: 140\)/);
    assert.match(r.narrative[3], /CRITICAL: Projected 140 guests exceeds venue capacity of 120 by 20/);
    assert.match(r.narrative[4], /Budget overrun of \$/);
    const calm = simulateRipple(base, { guest_delta: -10, catering_variance_pct: -5 });
    assert.match(calm.narrative[0], /shifts by -10/);
    assert.match(calm.narrative[2], /^Projected financial shift: -\$/);
    assert.match(calm.narrative[3], /comfortably holds 90 guests \(limit: 120\)/);
  });

  test('flags guest-, catering- and invitation-related tasks only', () => {
    const tasks = [
      { id: 'a', title: 'Finalize Seating chart', due_date: '2026-01-01' },
      { id: 'b', title: 'Book band', category: 'Music' },
      { id: 'c', title: 'Misc', category: 'Invitations' },
      { id: 'd', title: null, category: 'Catering' }
    ];
    const ids = simulateRipple({ ...base, tasks }).affected_tasks.map(t => t.id);
    assert.deepEqual(ids, ['a', 'c', 'd']);
  });

  test('unlimited capacity when venue_capacity is absent', () => {
    const r = simulateRipple({ ...base, venue_capacity: undefined }, { guest_delta: 5e5 });
    assert.equal(r.projected.capacity_breach, false);
    assert.match(r.narrative[3], /limit: 999999/);
  });

  test('capacity boundary is exclusive: guests == capacity holds, one more breaches', () => {
    const cases = [[19, false, 0], [20, false, 0], [21, true, 1], [22, true, 2]];
    for (const [delta, breach, excess] of cases) {
      const r = simulateRipple(base, { guest_delta: delta });
      assert.equal(r.projected.guests, 100 + delta);
      assert.equal(r.projected.capacity_breach, breach, `delta ${delta}`);
      assert.equal(r.projected.excess_guests, excess, `delta ${delta}`);
    }
  });

  test('guests exactly at capacity read "comfortably holds", one over reads CRITICAL', () => {
    const atLimit = simulateRipple(base, { guest_delta: 20 });
    assert.equal(atLimit.narrative[3], '✓ Venue capacity comfortably holds 120 guests (limit: 120).');
    assert.ok(!atLimit.narrative.some(line => line.includes('CRITICAL')));
    const over = simulateRipple(base, { guest_delta: 21 });
    assert.equal(over.narrative[3], '⚠️ CRITICAL: Projected 121 guests exceeds venue capacity of 120 by 1!');
  });
});
