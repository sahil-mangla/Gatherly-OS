/**
 * @file actions.test.js
 * @description Automated unit tests for Gatherly transactional actions and proposal applicator.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  addExpenseAction,
  addTaskAction,
  convertIdeaToTaskAction,
  applyProposalAction
} from '../src/js/store/actions.js';

describe('Transactional EventStore Actions', () => {

  test('applyProposalAction handles reallocate and rebalance_budget', () => {
    const event = {
      expenses: [
        { category: 'design', planned_amount: 2000, actual_amount: 0, committed_amount: 0 },
        { category: 'catering', planned_amount: 4000, actual_amount: 0, committed_amount: 0 }
      ]
    };

    // Reallocate $500 from design to catering
    const res = applyProposalAction(event, {
      action: 'reallocate',
      from_category: 'design',
      to_category: 'catering',
      amount: 500
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(event.expenses[0].planned_amount, 1500);
    assert.strictEqual(event.expenses[1].planned_amount, 4500);

    // Fallback schema (action_type: rebalance_budget)
    const res2 = applyProposalAction(event, {
      action_type: 'rebalance_budget',
      from_category: 'catering',
      to_category: 'design',
      delta_amount: 200
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(event.expenses[1].planned_amount, 4300);
    assert.strictEqual(event.expenses[0].planned_amount, 1700);
  });

  test('applyProposalAction handles update_expense and adjust_expense', () => {
    const event = {
      expenses: [
        { category: 'catering', planned_amount: 5000, description: 'Dinner buffet' }
      ]
    };

    const res = applyProposalAction(event, {
      action: 'update_expense',
      category: 'catering',
      savings: 800
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(event.expenses[0].planned_amount, 4200);

    // Fallback schema (action_type: adjust_expense with delta_amount: -400)
    const res2 = applyProposalAction(event, {
      action_type: 'adjust_expense',
      category: 'catering',
      delta_amount: -400
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(event.expenses[0].planned_amount, 3800);
  });

  test('applyProposalAction creates task for custom and create_task', () => {
    const event = { tasks: [] };

    const res = applyProposalAction(event, {
      action_type: 'create_task',
      title: 'Distribute run sheet to band'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(event.tasks.length, 1);
    assert.strictEqual(event.tasks[0].title, 'Distribute run sheet to band');
  });

  test('convertIdeaToTaskAction is idempotent and links task to idea', () => {
    const event = {
      ideas: [{ id: 'idea-1', title: 'Polaroid Guestbook', description: 'Photo station' }],
      tasks: []
    };

    const { idea, task } = convertIdeaToTaskAction(event, 'idea-1');
    assert.strictEqual(idea.converted_task_id, task.id);
    assert.strictEqual(event.tasks.length, 1);

    // Second call returns existing task without duplication
    const secondCall = convertIdeaToTaskAction(event, 'idea-1');
    assert.strictEqual(secondCall.task.id, task.id);
    assert.strictEqual(event.tasks.length, 1);
  });

  test('addExpenseAction and addTaskAction validate required contracts', () => {
    const event = { expenses: [], tasks: [] };

    assert.throws(() => addExpenseAction(event, { description: '', planned_amount: -10 }), /validation failed/);
    assert.throws(() => addTaskAction(event, { title: '', due_date: 'invalid' }), /validation failed/);

    const exp = addExpenseAction(event, { description: 'Cake deposit', planned_amount: 300, category: 'catering' });
    assert.strictEqual(exp.planned_amount, 300);
    assert.strictEqual(event.expenses.length, 1);
  });

});
