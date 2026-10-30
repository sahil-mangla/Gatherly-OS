/**
 * @file parity-regressions.test.js
 * @description Regression tests for every Python/JS disagreement the parity fixtures exposed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudgetSummary, formatMoney, simulateRipple, validateExpenseInput } from '../src/js/domain/budget.js';
import { toIsoDate } from '../src/js/domain/event-dates.js';
import { formatAmount, formatSignedTenths, numberOr, safeNonNegativeNumber, toInt } from '../src/js/domain/numeric.js';
import { evaluateEventRisks } from '../src/js/domain/risks.js';
import { parseDate } from '../src/js/domain/timeline-dates.js';
import { validateTask } from '../src/js/domain/timeline.js';

const base = { total_budget: 10000, expected_guests: 100, venue_capacity: 120, expenses: [], tasks: [] };

describe('parseDate', () => {
  test('rejects impossible calendar dates instead of rolling them over', () => {
    for (const bad of ['2023-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-06-00', '0000-01-01']) {
      assert.equal(parseDate(bad), null, bad);
    }
    assert.equal(toIsoDate(parseDate('2024-02-29')), '2024-02-29');
  });

  test('accepts only YYYY-MM-DD with an optional time part', () => {
    for (const bad of ['2026-06-01garbage', '20260601', '2026-6-1', ' 2026-06-01', '2026-06-01\n', '２０２６-０６-０１', null, 20260601, true]) {
      assert.equal(parseDate(bad), null, String(bad));
    }
    for (const good of ['2026-06-01', '2026-06-01T10:30:00', '2026-06-01 10:30', '2026-06-01 ']) {
      assert.equal(toIsoDate(parseDate(good)), '2026-06-01', good);
    }
  });

  test('year one keeps its zero padding in ISO output', () => {
    assert.equal(toIsoDate(parseDate('0001-01-01')), '0001-01-01');
    assert.equal(validateTask({ title: 'x', due_date: '2026-02-30' }).valid, false);
  });
});

describe('numeric helpers', () => {
  test('numberOr accepts plain decimals only and rejects non-finite or exotic input', () => {
    assert.equal(numberOr(' 12 ', 0), 12);
    assert.equal(numberOr('1e3', 0), 1000);
    assert.equal(numberOr(true, 0), 1);
    for (const bad of ['nan', 'inf', 'Infinity', '1_000', '0x10', '', ' ', null, undefined, [5], {}, NaN, Infinity, '1e999']) {
      assert.equal(numberOr(bad, -1), -1, String(bad));
    }
    assert.equal(safeNonNegativeNumber('nan'), 0);
    assert.equal(safeNonNegativeNumber(Infinity), 0);
  });

  test('rounding sends halves up and never prints negative zero', () => {
    assert.equal(formatAmount(1234.5), '1,235');
    assert.equal(formatAmount(-0.4), '0');
    assert.equal(formatMoney(2.5), '$3');
    assert.equal(formatSignedTenths(12.25), '+12.3');
    assert.equal(formatSignedTenths(-0.04), '-0.0');
    assert.equal(toInt('2.9', 0), 2);
    assert.equal(toInt(-2.7, 0), -2);
    assert.equal(toInt('x', 7), 7);
  });
});

describe('budget and expense parity fixes', () => {
  test('junk expense entries are skipped and a half percent rounds up', () => {
    const event = { ...base, total_budget: 1000, expenses: [null, 5, 'x', [], { category: 'venue', planned_amount: 500, actual_amount: 100, committed_amount: 25 }] };
    assert.equal(calculateBudgetSummary(event).categories.venue.percent_of_budget, 13);
    assert.throws(() => calculateBudgetSummary([]));
  });

  test('validation uses the backend wording and rejects arrays and blank numbers', () => {
    assert.deepEqual(validateExpenseInput([]), { valid: false, errors: ['Expense payload must be an object.'] });
    assert.deepEqual(validateTask([]), { valid: false, errors: ['Task must be an object.'] });
    const bad = validateExpenseInput({ description: 'x', planned_amount: 'abc', actual_amount: '', committed_amount: 'inf' });
    assert.deepEqual(bad.errors, [
      'Planned amount must be a valid number.',
      'Actual amount must be a valid number.',
      'Committed amount must be a valid number.'
    ]);
  });
});

describe('simulation parity fixes', () => {
  test('narrative wording and number formats match the backend', () => {
    const r = simulateRipple({ ...base, expenses: [{ category: 'catering', planned_amount: 1234567.5 }] }, { guest_delta: 3, catering_variance_pct: 12.25 });
    assert.equal(r.narrative[0], 'Guest count shifts by +3 (projected total: 103).');
    assert.equal(r.narrative[1], 'Catering package variance: +12.3%.');
    assert.equal(r.narrative[2], 'Projected financial shift: +$151,355.');
  });

  test('zero capacity and zero guests mean "not set"; fractional deltas truncate', () => {
    const open = simulateRipple({ ...base, venue_capacity: 0, expected_guests: 0 }, { guest_delta: 2.7 });
    assert.equal(open.projected.capacity_breach, false);
    assert.equal(open.initial.guests, 100);
    assert.equal(open.projected.guests, 102);
    assert.match(open.narrative[3], /limit: 999999/);
  });

  test('garbage deltas fall back to zero and junk expenses and tasks are skipped', () => {
    const event = { ...base, expenses: [null, 'x', { category: 'catering', planned_amount: 200, cost_per_guest: 10 }], tasks: [null, 'x', { title: 'Cater test' }] };
    const r = simulateRipple(event, { guest_delta: 'abc', catering_variance_pct: null });
    assert.equal(r.projected.cost_delta, 0);
    assert.deepEqual(r.affected_tasks, [{ id: null, title: 'Cater test', due_date: null }]);
    assert.equal(simulateRipple(event, [1, 2]).projected.guests, 100);
    assert.equal(simulateRipple({ ...base, expenses: [{ category: 'catering', cost_per_guest: 0 }] }, { guest_delta: 5 }).projected.cost_delta, 0);
    assert.equal(simulateRipple({ ...base, expenses: [{ category: 'catering', cost_per_guest: -9 }] }, { guest_delta: 5 }).projected.cost_delta, 0);
  });

  test('invitation and guest-category tasks are affected, like the backend', () => {
    const tasks = [{ id: 'a', title: 'Send invitation drafts' }, { id: 'b', title: 'x', category: 'guest favours' }];
    assert.deepEqual(simulateRipple({ ...base, tasks }).affected_tasks.map(t => t.id), ['a', 'b']);
  });
});

describe('risk radar parity fixes', () => {
  test('arrays are not events and money text is grouped and rounded half up', () => {
    assert.equal(evaluateEventRisks([]).total_count, 0);
    const event = { ...base, total_budget: 1234567.5, expenses: [{ category: 'venue', actual_amount: 2000000.5 }] };
    const [risk] = evaluateEventRisks(event).risks;
    assert.equal(risk.evidence, 'Total allocated spend ($2,000,001) exceeds total budget ($1,234,568) by $765,433.');
  });

  test('capacity text uses whole numbers, never locale grouping', () => {
    const [risk] = evaluateEventRisks({ ...base, expected_guests: 2500000, venue_capacity: 1234567 }).risks;
    assert.match(risk.evidence, /\(2500000\).*\(1234567\) by 1265433 guests/);
  });
});
