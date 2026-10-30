/**
 * @file domain.test.js
 * @description Automated unit test suite for Gatherly client domain logic.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  calculateBudgetSummary,
  safeNonNegativeNumber,
  formatMoney,
  simulateRipple
} from '../src/js/domain/budget.js';

import {
  validateTask,
  checkCircularDependencies,
  evaluateReschedule
} from '../src/js/domain/timeline.js';

import {
  auditQuoteCompleteness,
  compareQuotes,
  extractQuoteFromRawText
} from '../src/js/domain/vendors.js';

import { evaluateEventRisks } from '../src/js/domain/risks.js';

describe('Gatherly Client Domain Engine', () => {

  describe('Budget Intelligence & Math Guards', () => {
    test('safeNonNegativeNumber handles invalid and negative inputs', () => {
      assert.strictEqual(safeNonNegativeNumber(-100), 0);
      assert.strictEqual(safeNonNegativeNumber('invalid'), 0);
      assert.strictEqual(safeNonNegativeNumber(null), 0);
      assert.strictEqual(safeNonNegativeNumber(250.75), 250.75);
    });

    test('formatMoney formats amounts with currency symbol', () => {
      assert.strictEqual(formatMoney(25000, '$'), '$25,000');
      assert.strictEqual(formatMoney(800000, '₹'), '₹800,000');
      assert.strictEqual(formatMoney(1500, '€'), '€1,500');
    });

    test('calculateBudgetSummary produces authoritative totals without double-counting', () => {
      const mockEvent = {
        total_budget: 30000,
        expected_guests: 150,
        venue_capacity: 180,
        expenses: [
          { category: 'venue', planned_amount: 8000, actual_amount: 4000, committed_amount: 4000 },
          { category: 'catering', planned_amount: 9000, actual_amount: 10000, committed_amount: 0 },
          { category: 'design', planned_amount: 3000, actual_amount: 1500, committed_amount: 500 }
        ]
      };

      const summary = calculateBudgetSummary(mockEvent);
      assert.strictEqual(summary.total_budget, 30000);
      assert.strictEqual(summary.total_spent, 15500);
      assert.strictEqual(summary.total_committed, 4500);
      assert.strictEqual(summary.total_allocated, 20000);
      assert.strictEqual(summary.remaining_uncommitted, 10000);
      assert.strictEqual(summary.is_over_budget, false);
      assert.strictEqual(summary.categories.catering.is_overrun, true);
      assert.strictEqual(summary.categories.catering.variance, 1000);
    });

    test('simulateRipple computes financial shift and flags capacity breach', () => {
      const mockEvent = {
        total_budget: 20000,
        expected_guests: 100,
        venue_capacity: 120,
        expenses: [{ category: 'catering', planned_amount: 4000, cost_per_guest: 45 }]
      };

      // Scenario A: Guest surge beyond capacity
      const ripple = simulateRipple(mockEvent, { guest_delta: 30, catering_variance_pct: 10 });
      assert.strictEqual(ripple.projected.guests, 130);
      assert.strictEqual(ripple.projected.capacity_breach, true);
      assert.strictEqual(ripple.projected.excess_guests, 10);
      assert(ripple.projected.cost_delta > 0);
    });
  });

  describe('Adaptive Timeline & DAG Dependencies', () => {
    test('validateTask checks title, date, priority and status contracts', () => {
      const valid = validateTask({ title: 'Book Florist', due_date: '2026-09-01', priority: 'high', status: 'todo' });
      assert.strictEqual(valid.valid, true);

      const invalid = validateTask({ title: '', due_date: 'invalid-date' });
      assert.strictEqual(invalid.valid, false);
      assert(invalid.errors.length >= 2);
    });

    test('checkCircularDependencies detects cycles in DAG', () => {
      const cyclic = [
        { id: 't1', title: 'Task 1', due_date: '2026-05-01', depends_on: ['t2'] },
        { id: 't2', title: 'Task 2', due_date: '2026-05-02', depends_on: ['t1'] }
      ];
      const [hasCycle] = checkCircularDependencies(cyclic);
      assert.strictEqual(hasCycle, true);

      const acyclic = [
        { id: 't1', title: 'Task 1', due_date: '2026-05-01', depends_on: [] },
        { id: 't2', title: 'Task 2', due_date: '2026-05-02', depends_on: ['t1'] }
      ];
      const [noCycle] = checkCircularDependencies(acyclic);
      assert.strictEqual(noCycle, false);
    });

    test('evaluateReschedule detects dependency precedence violations', () => {
      const tasks = [
        { id: 'venue', title: 'Venue Contract', due_date: '2026-05-01', depends_on: [] },
        { id: 'cater', title: 'Confirm Catering', due_date: '2026-05-15', depends_on: ['venue'] }
      ];

      // Delaying venue past catering causes collision
      const rescheduleCheck = evaluateReschedule(tasks, 'venue', '2026-05-20');
      assert.strictEqual(rescheduleCheck.has_conflicts, true);
      assert.strictEqual(rescheduleCheck.conflicts[0].type, 'dependency_precedence_violation');
      assert.strictEqual(rescheduleCheck.impacted_dependents_count, 1);
    });
  });

  describe('Vendor Audit & Seed Ingestion', () => {
    test('auditQuoteCompleteness identifies missing disclosures', () => {
      const partialQuote = {
        name: 'Basic Photography',
        inclusions: ['6 hours coverage'],
        notes: 'Online gallery delivery'
      };
      const { isComplete, missing } = auditQuoteCompleteness(partialQuote);
      assert.strictEqual(isComplete, false);
      assert(missing.some(m => m.includes('cleanup')));
      assert(missing.some(m => m.includes('staff')));
      assert(missing.some(m => m.includes('Overtime')));
    });

    test('compareQuotes sorts quotes by price and highlights lowest risk', () => {
      const quotes = [
        { id: 'q1', name: 'Vendor A', price: 3000, inclusions: ['clean', 'staff', 'overtime', 'refund'] },
        { id: 'q2', name: 'Vendor B', price: 2200, inclusions: [] }
      ];
      const result = compareQuotes(quotes);
      assert.strictEqual(result.cheapest_id, 'q2');
      assert.strictEqual(result.lowest_risk_id, 'q1');
    });

    test('extractQuoteFromRawText parses unstructured text proposals', () => {
      const rawText = 'Lumina Collective: We can provide full reception photography for $2,400 with a $720 deposit.';
      const extracted = extractQuoteFromRawText(rawText);
      assert.strictEqual(extracted.quoted_base_amount, 2400);
      assert.strictEqual(extracted.deposit_amount, 720);
      assert.strictEqual(extracted.service_type, 'photography');
      assert(extracted.follow_up_questions.length > 0);
    });
  });

  describe('Event Risk Radar', () => {
    test('evaluates capacity breaches and budget deficits accurately', () => {
      const riskyEvent = {
        total_budget: 10000,
        expected_guests: 160,
        venue_capacity: 140,
        expenses: [
          { category: 'venue', planned_amount: 8000, actual_amount: 8000, committed_amount: 0 },
          { category: 'catering', planned_amount: 3000, actual_amount: 4000, committed_amount: 0 }
        ],
        tasks: [],
        vendors: []
      };

      const risks = evaluateEventRisks(riskyEvent);
      assert.strictEqual(risks.critical_count, 2); // capacity breach + total budget overrun
      assert(risks.risks.some(r => r.type === 'capacity_breach'));
      assert(risks.risks.some(r => r.type === 'budget_overrun'));
    });

    test('filters dismissed risk IDs', () => {
      const riskyEvent = {
        total_budget: 10000,
        expected_guests: 160,
        venue_capacity: 140,
        expenses: [],
        dismissed_risk_ids: ['risk-capacity-breach']
      };

      const risks = evaluateEventRisks(riskyEvent);
      assert.strictEqual(risks.risks.some(r => r.id === 'risk-capacity-breach'), false);
    });
  });

});
