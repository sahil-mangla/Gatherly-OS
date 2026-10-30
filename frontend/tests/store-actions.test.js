/**
 * @file store-actions.test.js
 * @description Edge-case tests for transactional actions, proposal handlers and id generation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addExpenseAction,
  addTaskAction,
  addVendorAction,
  addIdeaAction,
  convertIdeaToTaskAction,
  applyProposalAction
} from '../src/js/store/actions.js';
import { PROPOSAL_HANDLERS } from '../src/js/store/proposals.js';
import { makeId, pushTo, isoDateFromNow } from '../src/js/store/helpers.js';

describe('id and helper utilities', () => {
  test('makeId never collides within the same millisecond', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => makeId('exp')));
    assert.equal(ids.size, 5000);
    assert.ok([...ids].every(id => id.startsWith('exp-')));
  });

  test('makeId falls back to a monotonic counter without crypto.randomUUID', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 1000 }, () => makeId('task')));
      assert.equal(ids.size, 1000);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });

  test('pushTo creates missing lists; isoDateFromNow adds whole days', () => {
    const event = {};
    pushTo(event, 'tasks', { id: 1 });
    assert.deepEqual(event.tasks, [{ id: 1 }]);
    assert.equal(isoDateFromNow(7, Date.UTC(2026, 0, 1)), '2026-01-08');
  });
});

describe('add* actions', () => {
  test('addExpenseAction applies defaults, derives status and trims', () => {
    const event = {};
    const paid = addExpenseAction(event, { description: ' Cake ', planned_amount: '10', actual_amount: 5 });
    assert.deepEqual(
      [paid.description, paid.planned_amount, paid.status, paid.category, paid.vendor_id],
      ['Cake', 10, 'paid', 'other', null]
    );
    const pending = addExpenseAction(event, { description: 'x', planned_amount: 0, status: 'planned', vendor_id: 'v1' });
    assert.deepEqual([pending.status, pending.vendor_id], ['planned', 'v1']);
    assert.equal(addExpenseAction(event, { description: 'y', planned_amount: 1 }).status, 'pending');
    assert.equal(event.expenses.length, 3);
    assert.notEqual(paid.id, pending.id);
  });

  test('addExpenseAction rejects invalid payloads without mutating the event', () => {
    const event = { expenses: [] };
    assert.throws(() => addExpenseAction(event, null), /Expense validation failed/);
    assert.throws(() => addExpenseAction(event, { description: 'x', planned_amount: -1 }), /Planned/);
    assert.equal(event.expenses.length, 0);
  });

  test('addTaskAction normalises optional fields', () => {
    const event = {};
    const t = addTaskAction(event, { title: ' Book ', due_date: '2026-05-01', depends_on: 'x', is_fixed_deadline: 1 });
    assert.deepEqual(
      [t.title, t.category, t.status, t.priority, t.depends_on, t.is_fixed_deadline],
      ['Book', 'General', 'todo', 'medium', [], true]
    );
    assert.throws(() => addTaskAction(event, { title: 'x', due_date: '2026-05-01', priority: 'urgent' }), /Task validation failed/);
  });

  test('addVendorAction applies defaults and requires a name', () => {
    const event = {};
    const v = addVendorAction(event, { name: ' Acme ', quoted_amount: '1200', inclusions: ['a'], exclusions: 'no' });
    assert.deepEqual(
      [v.name, v.quoted_amount, v.deposit_paid, v.category, v.status, v.avatar_emoji, v.exclusions, v.inclusions],
      ['Acme', 1200, 0, 'General', 'shortlist', '🤝', [], ['a']]
    );
    assert.throws(() => addVendorAction(event, { name: '' }), /Vendor name is required/);
    assert.throws(() => addVendorAction(event, {}), /Vendor name is required/);
  });

  test('addIdeaAction prepends ideas with a valid colour', () => {
    const event = { ideas: [{ id: 'old' }] };
    const idea = addIdeaAction(event, { title: ' T ', description: ' D ', estimated_cost: '50' });
    assert.equal(event.ideas[0], idea);
    assert.deepEqual([idea.title, idea.description, idea.author, idea.estimated_cost], ['T', 'D', 'You', 50]);
    assert.match(idea.bg_color, /^idea-(yellow|coral|green|pink)$/);
    assert.throws(() => addIdeaAction(event, { title: 'only' }), /required/);
  });

  test('convertIdeaToTaskAction rejects unknown ideas and recreates a task whose link was lost', () => {
    const event = { ideas: [{ id: 'i', title: 'Idea', converted_task_id: 'gone' }], tasks: [] };
    assert.throws(() => convertIdeaToTaskAction(event, 'zzz'), /Idea not found/);
    const { idea, task } = convertIdeaToTaskAction(event, 'i');
    assert.equal(idea.converted_task_id, task.id);
    assert.equal(event.tasks.length, 1);
  });
});

describe('applyProposalAction', () => {
  test('rejects invalid payloads and unsupported or prototype-named actions', () => {
    for (const bad of [null, undefined, 'x', 3]) {
      assert.throws(() => applyProposalAction({}, bad), /Invalid proposal payload/);
    }
    assert.throws(() => applyProposalAction({}, { action: 'explode' }), /Unsupported proposal action: "explode"/);
    assert.throws(() => applyProposalAction({}, { action: 'constructor' }), /Unsupported/);
    assert.throws(() => applyProposalAction({}, { action: '__proto__' }), /Unsupported/);
  });

  test('handler map covers every documented action', () => {
    assert.deepEqual([...PROPOSAL_HANDLERS.keys()].sort(), [
      'adjust_expense', 'audit_vendors', 'create_task', 'custom', 'rebalance_budget',
      'reallocate', 'review_risks', 'update_expense'
    ].sort());
  });

  test('reallocate requires a non-zero amount and accepts negative deltas as magnitudes', () => {
    assert.throws(() => applyProposalAction({}, { action: 'reallocate', amount: 0 }), /positive amount/);
    const event = { expenses: [{ category: 'a', planned_amount: 100 }, { category: 'b', planned_amount: 0 }] };
    applyProposalAction(event, { action: 'reallocate', from_category: 'a', to_category: 'b', delta_amount: -300 });
    assert.deepEqual(event.expenses.map(e => e.planned_amount), [0, 300]);
  });

  test('reallocate creates a destination expense, and tolerates a missing destination', () => {
    const event = {};
    const res = applyProposalAction(event, { action: 'reallocate', category: 'design', amount: 250 });
    assert.equal(event.expenses[0].category, 'design');
    assert.equal(event.expenses[0].planned_amount, 250);
    assert.equal(event.expenses[0].status, 'planned');
    assert.equal(res.message, 'Reallocated $250 to Design.');
    const none = applyProposalAction({ expenses: [] }, { action: 'reallocate', amount: 5 });
    assert.equal(none.message, 'Reallocated $5 to budget.');
  });

  test('savings clamp at zero and fall back to a generic message', () => {
    const event = { expenses: [{ category: 'c', planned_amount: 50 }] };
    assert.match(applyProposalAction(event, { action: 'update_expense', category: 'c', savings: 500 }).message, /Saved \$500 on C/);
    assert.equal(event.expenses[0].planned_amount, 0);
    assert.match(applyProposalAction(event, { action: 'adjust_expense', category: 'zz', delta_amount: -9 }).message, /Applied savings of \$9 to Zz/);
    assert.match(applyProposalAction({}, { action: 'adjust_expense' }).message, /to event/);
  });

  test('task-creating actions share one handler and default title', () => {
    const event = {};
    for (const action of ['custom', 'create_task', 'audit_vendors', 'review_risks']) {
      applyProposalAction(event, { action_type: action });
    }
    assert.equal(event.tasks.length, 4);
    assert.equal(event.tasks[0].title, 'Implement Mara recommendation');
    assert.equal(new Set(event.tasks.map(t => t.id)).size, 4);
    assert.equal(applyProposalAction({}, {}).task.priority, 'high');
  });
});
