/**
 * @file mara-fallbacks.test.js
 * @description Dispatch-table and grounding tests for the deterministic offline Mara responder.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalDeterministicMaraResponse as local, LOCAL_RESPONDERS } from '../src/js/ai/mara-fallbacks.js';
import { categoryStats, planReallocations, planTrim, MAX_MOVE } from '../src/js/ai/mara-budget.js';
import { calculateBudgetSummary } from '../src/js/domain/budget.js';
import { weddingTemplate } from '../src/js/templates/wedding.js';

const budgetOf = (expenses, total = 10000) => calculateBudgetSummary({ total_budget: total, expenses });
const exp = (category, planned, actual = 0, committed = 0) => ({ category, planned_amount: planned, actual_amount: actual, committed_amount: committed });
const ctx = (expenses, extra = {}) => ({ budget: budgetOf(expenses), ...extra });

describe('getLocalDeterministicMaraResponse routing', () => {
  test('routes by explicit operation and by prompt keywords in table order', () => {
    assert.equal(local('cost_saving_proposals', '').operation, 'cost_saving_proposals');
    assert.equal(local('prioritize_tasks', '').operation, 'prioritize_tasks');
    assert.equal(local('risk_explanation', '', { risks: [1, 2] }).summary, 'You currently have 2 active items on the Event Risk Radar.');
    assert.equal(local('general_advice', '').operation, 'general_advice');
    assert.equal(local(undefined, 'how can we SAVE money').operation, 'cost_saving_proposals');
    assert.equal(local('', 'what is my budget?').operation, 'cost_saving_proposals');
    assert.equal(local(null, 'plan my week').operation, 'prioritize_tasks');
    assert.equal(local(null, 'any risk?').operation, 'risk_explanation');
    assert.equal(local(null, 'save the risk task').operation, 'cost_saving_proposals');
    assert.equal(local('unknown_op', 'hello').operation, 'general_advice');
    assert.equal(LOCAL_RESPONDERS.length, 3);
  });

  test('is robust to null, array and malformed context', () => {
    for (const bad of [null, undefined, [], 'x', 5, { budget: 'x', risks: 'y', tasks: 3, event: [] }]) {
      for (const op of ['cost_saving_proposals', 'prioritize_tasks', 'risk_explanation', 'general_advice']) {
        assert.ok(local(op, null, bad).summary, `${op} with ${JSON.stringify(bad)}`);
      }
    }
    assert.match(local('risk_explanation', '', { risks: [1] }).summary, /1 active item on/);
    assert.match(local('risk_explanation', '').summary, /0 active items/);
  });

  test('parse_quote_seed uses the local extractor', () => {
    const res = local('parse_quote_seed', 'Sol Studio here: package $1,000.');
    assert.equal(res.extracted_quote.quoted_base_amount, 1000);
    assert.match(res.summary, /Extracted quote for Sol Studio \(\$1,000\)/);
    assert.equal(local('parse_quote_seed', '').extracted_quote.quoted_base_amount, 0);
  });
});

describe('cost saving proposals are computed from the event', () => {
  test('moves money from a category with room to one over its plan, capped and rounded to $10', () => {
    const res = local('cost_saving_proposals', '', { budget: calculateBudgetSummary(weddingTemplate) });
    const move = res.proposals.find(p => p.action_type === 'rebalance_budget');
    assert.deepEqual([move.from_category, move.to_category, move.amount], ['contingency', 'photo_music', 560]);
    assert.match(move.title, /Move \$560 from Contingency to Photo & music/);
    const shown = res.proposals.map(p => `${p.title} ${p.description} ${p.consequence}`).join(' ');
    assert.doesNotMatch(shown, /photo_music|Sol Studio|Lumina/);
  });

  test('the transfer never exceeds half the donor unspent amount, the deficit or $1,200', () => {
    const stats = categoryStats(budgetOf([exp('venue', 1000, 100), exp('catering', 9000, 9000 + 5000)]));
    const { plans } = planReallocations(stats);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].amount, 450); // half of venue's 900 unspent, below the 5,000 deficit and the cap
    const rich = categoryStats(budgetOf([exp('venue', 20000, 0), exp('catering', 1000, 9000)]));
    assert.equal(planReallocations(rich).plans[0].amount, MAX_MOVE);
    const small = categoryStats(budgetOf([exp('venue', 5000, 0), exp('catering', 1000, 1057)]));
    assert.equal(planReallocations(small).plans[0].amount, 50, 'deficit 57 rounds down to $50');
  });

  test('never proposes a reallocation without a donor that has room', () => {
    const none = ctx([exp('venue', 1000, 1000), exp('catering', 500, 900)]);
    const res = local('cost_saving_proposals', '', none);
    assert.equal(res.proposals, undefined);
    assert.match(res.response, /no savings changes to propose/);
    assert.equal(local('cost_saving_proposals', '', { budget: null }).proposals, undefined);
  });

  test('trim applies the percentage to the PLANNED amount, names the category and never cuts below spending', () => {
    const stats = categoryStats(budgetOf([exp('design', 2200, 1000), exp('venue', 5000, 5000), exp('contingency', 3000)]));
    const { room } = planReallocations(stats);
    const trim = planTrim(stats, room);
    assert.equal(trim.delta_amount, -220);
    assert.equal(trim.category, 'design');
    assert.match(trim.title, /Trim 10% from Design/);
    assert.match(trim.description, /\$2,200 planned/);
    const tight = categoryStats(budgetOf([exp('design', 2200, 2100)]));
    assert.equal(planTrim(tight, planReallocations(tight).room), null, 'only $100 unspent < the $220 trim');
    const buffer = categoryStats(budgetOf([exp('contingency', 5000)]));
    assert.equal(planTrim(buffer, planReallocations(buffer).room), null, 'the contingency buffer is never trimmed');
  });
});

describe('other offline answers use only the event context', () => {
  test('prioritize_tasks lists the next open milestones, and says so when there are none', () => {
    const tasks = [{ title: 'Book DJ', due_date: '2026-07-01', priority: 'high' }, { title: 'Send save-the-dates', due_date: '2026-07-09' }];
    const res = local('prioritize_tasks', '', { tasks });
    assert.equal(res.proposals, undefined);
    assert.match(res.response, /1\. Book DJ \(due Jul 1, 2026, high priority\); 2\. Send save-the-dates/);
    assert.match(local('prioritize_tasks', '', { tasks: [] }).response, /no open milestones/);
  });

  test('risk_explanation proposes resolving the top risk from the context, general_advice quotes the event numbers', () => {
    const risks = [{ title: 'Venue is over capacity', evidence: '160 guests for 140 seats', consequence: 'Fire code' }];
    const risk = local('risk_explanation', '', { risks });
    assert.equal(risk.proposals[0].title, 'Resolve: Venue is over capacity');
    assert.equal(risk.proposals[0].description, '160 guests for 140 seats');
    const advice = local('general_advice', '', { event: { name: 'Priya & Sam' }, budget: budgetOf([exp('venue', 1000, 250.5)], 2000), risks });
    assert.equal(advice.proposals, undefined);
    assert.match(advice.response, /Priya & Sam: \$250\.50 of \$2,000 is committed, with 1 active risk/);
  });

  test('no response mentions seeded vendor names or fixed dollar amounts', () => {
    for (const op of ['cost_saving_proposals', 'prioritize_tasks', 'risk_explanation', 'general_advice']) {
      assert.doesNotMatch(JSON.stringify(local(op, '', {})), /Sol Studio|Lumina|\$900|\$450|\$1,200/);
    }
  });
});
