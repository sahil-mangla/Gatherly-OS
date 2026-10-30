/**
 * @file e2e-contracts.test.js
 * @description End-to-end behavioral contract test suite for full user journey flows.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudgetSummary, simulateRipple } from '../src/js/domain/budget.js';
import { extractQuoteFromRawText, auditQuoteCompleteness } from '../src/js/domain/vendors.js';
import { evaluateReschedule, checkCircularDependencies } from '../src/js/domain/timeline.js';
import { evaluateEventRisks } from '../src/js/domain/risks.js';
import { applyProposalAction } from '../src/js/store/actions.js';

describe('Full User Journey E2E Contracts', () => {
  const mockEvent = {
    id: 'evt-e2e-test',
    title: 'Autumn Loft Gathering',
    total_budget: 25000,
    expected_guests: 100,
    venue_capacity: 120,
    expenses: [
      { category: 'venue', planned_amount: 7000, actual_amount: 7000, committed_amount: 0 },
      { category: 'catering', planned_amount: 10000, actual_amount: 9500, committed_amount: 0, cost_per_guest: 50 },
      { category: 'design', planned_amount: 3000, actual_amount: 2800, committed_amount: 0 },
    ],
    timeline: {
      tasks: [
        { id: 't1', title: 'Book Venue', due_date: '2026-05-01', priority: 'high', status: 'done', depends_on: [] },
        { id: 't2', title: 'Catering Tasting', due_date: '2026-06-01', priority: 'medium', status: 'todo', depends_on: ['t1'] },
        { id: 't3', title: 'Final Headcount', due_date: '2026-08-01', priority: 'high', status: 'todo', depends_on: ['t2'] },
      ],
    },
  };

  it('Journey 1: Initial load renders authoritative budget & risk radar', () => {
    const summary = calculateBudgetSummary(mockEvent);
    assert.equal(summary.total_spent, 19300);
    assert.equal(summary.remaining_uncommitted, 5700);
    assert.equal(summary.is_over_budget, false);

    const risks = evaluateEventRisks(mockEvent);
    assert.ok(Array.isArray(risks.risks));
    assert.equal(risks.risks.some((r) => r.type === 'capacity_breach'), false);
  });

  it('Journey 2: What-If simulation slider recalculates ripples and detects capacity breach', () => {
    const ripple = simulateRipple(mockEvent, { guest_delta: 30, catering_variance_pct: 15 });
    assert.equal(ripple.projected.guests, 130);
    assert.equal(ripple.projected.capacity_breach, true);
    assert.equal(ripple.projected.excess_guests, 10);
    assert.ok(ripple.projected.cost_delta > 0);
  });

  it('Journey 3: Raw vendor quote seed ingestion audits missing cleanup fee', () => {
    const rawQuote = 'Catering quote: Full reception dinner for $6,500 with a deposit. Excludes cleanup & staff.';
    const extracted = extractQuoteFromRawText(rawQuote);
    assert.equal(extracted.quoted_base_amount, 6500);
    // A deposit is mentioned but no figure is given: never fabricate a 30% deposit.
    assert.equal(extracted.deposit_amount, 0);
    assert.equal(extracted.deposit_stated, false);

    const audit = auditQuoteCompleteness({ inclusions: [] });
    assert.equal(audit.isComplete, false);
    assert.ok(audit.missing.some((m) => m.includes('cleanup')));
    assert.ok(audit.missing.some((m) => m.includes('staff')));
  });

  it('Journey 4: Mara Copilot proposal approval atomically reallocates budget categories', () => {
    const eventCopy = JSON.parse(JSON.stringify(mockEvent));
    const proposal = {
      action: 'reallocate',
      from_category: 'design',
      to_category: 'catering',
      amount: 1000,
    };

    const res = applyProposalAction(eventCopy, proposal);
    assert.equal(res.success, true);
    assert.equal(eventCopy.expenses.find((e) => e.category === 'design').planned_amount, 2000);
    assert.equal(eventCopy.expenses.find((e) => e.category === 'catering').planned_amount, 11000);
  });

  it('Journey 5: Milestone reschedule detects DAG precedence collision and cycle protection', () => {
    const tasks = [
      { id: 'venue', title: 'Venue Contract', due_date: '2026-05-01', depends_on: [] },
      { id: 'cater', title: 'Confirm Catering', due_date: '2026-05-15', depends_on: ['venue'] },
    ];
    // Delaying venue past catering causes collision
    const check = evaluateReschedule(tasks, 'venue', '2026-05-20');
    assert.equal(check.has_conflicts, true);
    assert.equal(check.impacted_dependents_count, 1);

    // Cycle check
    const [hasCycle] = checkCircularDependencies([
      { id: 'a', depends_on: ['b'] },
      { id: 'b', depends_on: ['a'] },
    ]);
    assert.equal(hasCycle, true);
  });
});
