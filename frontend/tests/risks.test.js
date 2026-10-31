/**
 * @file risks.test.js
 * @description Per-rule tests for the Event Risk Radar rule list.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEventRisks } from '../src/js/domain/risks.js';
import { RISK_RULES, makeRisk, capacityRule, vendorFeesRule } from '../src/js/domain/risk-rules.js';

const calmEvent = {
  total_budget: 10000, expected_guests: 50, venue_capacity: 100, expenses: [], tasks: [], vendors: []
};

describe('evaluateEventRisks', () => {
  test('returns an empty radar for non-objects and calm events', () => {
    for (const bad of [null, undefined, 'x', 0]) {
      assert.deepEqual(evaluateEventRisks(bad), {
        critical_count: 0, warning_count: 0, notice_count: 0, total_count: 0, risks: []
      });
    }
    assert.equal(evaluateEventRisks(calmEvent).total_count, 0);
    assert.equal(RISK_RULES.length, 6);
  });

  test('capacity rule: reports the excess and a what-if payload', () => {
    const [risk] = evaluateEventRisks({ ...calmEvent, expected_guests: 130 }).risks;
    assert.equal(risk.id, 'risk-capacity-breach');
    assert.equal(risk.recommended_actions[0].payload.guest_delta, -30);
    assert.match(risk.evidence, /\(130\).*\(100\) by 30 guests/);
    assert.equal(risk.status, 'open');
  });

  test('capacity rule ignores zero capacity and defaults missing capacity to unlimited', () => {
    assert.equal(evaluateEventRisks({ ...calmEvent, venue_capacity: 0, expected_guests: 5 }).total_count, 0);
    assert.equal(evaluateEventRisks({ ...calmEvent, venue_capacity: undefined, expected_guests: 5e5 }).total_count, 0);
    assert.equal(capacityRule({ event: { expected_guests: 2, venue_capacity: 1 } }).length, 1);
  });

  test('budget rule and category overrun rule fire with correct severities and order', () => {
    const event = {
      ...calmEvent,
      total_budget: 100,
      expenses: [{ category: 'venue', planned_amount: 50, actual_amount: 80 }, { category: 'design', planned_amount: 10, actual_amount: 50 }]
    };
    const res = evaluateEventRisks(event);
    assert.equal(res.critical_count, 1);
    assert.equal(res.warning_count, 2);
    assert.deepEqual(res.risks.map(r => r.severity), ['critical', 'warning', 'warning']);
    assert.deepEqual(res.risks.slice(1).map(r => r.id), ['risk-category-overrun-venue', 'risk-category-overrun-design']);
    assert.equal(res.total_count, 3);
  });

  test('overdue milestones rule respects the reference date and ignores done tasks', () => {
    const tasks = [
      { id: 'a', title: 'Old', due_date: '2026-01-01', status: 'todo' },
      { id: 'b', title: 'Done', due_date: '2026-01-01', status: 'done' },
      { id: 'c', title: 'Later', due_date: '2026-12-01', status: 'todo' }
    ];
    const res = evaluateEventRisks({ ...calmEvent, tasks }, '2026-06-01');
    assert.equal(res.risks.length, 1);
    assert.equal(res.risks[0].title, '1 Milestone(s) Overdue');
    assert.match(res.risks[0].evidence, /'Old'\./);
    assert.equal(evaluateEventRisks({ ...calmEvent, tasks }, '2025-01-01').total_count, 0);
  });

  test('vendor rule only flags shortlisted, incomplete, object vendors', () => {
    const vendors = [
      { id: 'v1', name: 'Short', status: 'shortlist' },
      { id: 'v2', name: 'Booked', status: 'booked' },
      null,
      'junk',
      { name: 'NoId', status: 'shortlist', inclusions: ['clean', 'staff', 'overtime', 'refund'] },
      { name: 'Anon', status: 'shortlist' }
    ];
    const res = evaluateEventRisks({ ...calmEvent, vendors });
    assert.deepEqual(res.risks.map(r => r.id), ['risk-vendor-missing-v1', 'risk-vendor-missing-vendor']);
    assert.equal(res.notice_count, 2);
    assert.equal(res.risks[0].recommended_actions[0].payload.vendor_id, 'v1');
    assert.deepEqual(vendorFeesRule({ event: { vendors: 'nope' } }), []);
  });

  test('dismissed ids are removed from results and counts', () => {
    const event = { ...calmEvent, expected_guests: 500, dismissed_risk_ids: ['risk-capacity-breach'] };
    assert.equal(evaluateEventRisks(event).total_count, 0);
    assert.equal(evaluateEventRisks({ ...event, dismissed_risk_ids: 'bad' }).total_count, 1);
  });

  test('makeRisk builds the canonical shape', () => {
    const risk = makeRisk({
      id: 'i', type: 't', severity: 's', title: 'T', evidence: 'E', consequence: 'C', actions: []
    });
    assert.deepEqual(Object.keys(risk), [
      'id', 'type', 'severity', 'title', 'evidence', 'consequence', 'recommended_actions', 'status'
    ]);
  });

  test('handles a large number of vendors', () => {
    const vendors = Array.from({ length: 5000 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, status: 'shortlist' }));
    assert.equal(evaluateEventRisks({ ...calmEvent, vendors }).notice_count, 5000);
  });
});
