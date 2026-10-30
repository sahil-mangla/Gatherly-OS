/**
 * @file store-methods.test.js
 * @description EventStore mutation methods, event emission and subscriber isolation.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
const { EventStore } = await import('../src/js/store.js');

let store;
let events;
let realError;

describe('EventStore methods', () => {
  beforeEach(() => {
    realError = console.error;
    store = new EventStore();
    events = [];
    store.subscribe(({ type }) => events.push(type));
  });
  afterEach(() => { console.error = realError; });

  test('add* methods mutate the active event and emit', () => {
    store.addExpense({ description: 'Cake', planned_amount: 10 });
    store.addTask({ title: 'T', due_date: '2026-05-01' });
    store.addVendor({ name: 'V' });
    store.addIdea({ title: 'I', description: 'D' });
    const event = store.getActiveEvent();
    assert.ok(event.expenses.some(e => e.description === 'Cake'));
    assert.ok(event.tasks.some(t => t.title === 'T'));
    assert.deepEqual(events, ['expense:added', 'task:added', 'vendor:added', 'idea:added']);
  });

  test('toggleTask flips status, stamps completion and ignores unknown ids', () => {
    store.addTask({ title: 'T', due_date: '2026-05-01' });
    const task = store.getActiveEvent().tasks.at(-1);
    store.toggleTask(task.id);
    assert.equal(task.status, 'done');
    assert.match(task.completed_at, /^\d{4}-\d{2}-\d{2}$/);
    store.toggleTask(task.id);
    assert.equal(task.status, 'todo');
    assert.equal('completed_at' in task, false);
    const before = events.length;
    store.toggleTask('nope');
    assert.equal(events.length, before);
  });

  test('rescheduleTask updates the due date or throws for unknown tasks', () => {
    store.addTask({ title: 'T', due_date: '2026-05-01' });
    const task = store.getActiveEvent().tasks.at(-1);
    store.rescheduleTask(task.id, '2027-01-01');
    assert.equal(task.due_date, '2027-01-01');
    assert.throws(() => store.rescheduleTask('nope', '2027-01-01'), /Task not found/);
  });

  test('dismissRisk is idempotent; applyProposal and convertIdeaToTask emit results', () => {
    store.dismissRisk('r1');
    store.dismissRisk('r1');
    assert.deepEqual(store.getActiveEvent().dismissed_risk_ids.filter(id => id === 'r1'), ['r1']);
    assert.equal(events.filter(t => t === 'risk:dismissed').length, 1);

    assert.equal(store.applyProposal({ action: 'create_task', title: 'P' }).success, true);
    store.addIdea({ title: 'I', description: 'D' });
    const idea = store.getActiveEvent().ideas[0];
    assert.equal(store.convertIdeaToTask(idea.id).id, idea.converted_task_id);
    assert.ok(events.includes('proposal:applied') && events.includes('idea:converted'));
  });

  test('switchEvent, resetToDefaults and getAllEvents', () => {
    const ids = store.getAllEvents().map(e => e.id);
    store.switchEvent(ids[1]);
    assert.equal(store.activeEventId, ids[1]);
    store.switchEvent('unknown');
    assert.equal(store.activeEventId, ids[1]);
    store.resetToDefaults();
    assert.equal(store.activeEventId, ids[0]);
    assert.ok(events.includes('event:switched') && events.includes('store:reset'));
  });

  test('a throwing subscriber does not stop other subscribers', () => {
    console.error = () => {};
    const seen = [];
    store.subscribe(() => { throw new Error('boom'); });
    store.subscribe(({ type }) => seen.push(type));
    store.dismissRisk('r2');
    assert.deepEqual(seen, ['risk:dismissed']);
  });

  test('unsubscribe stops notifications', () => {
    const seen = [];
    const off = store.subscribe(({ type }) => seen.push(type));
    off();
    store.dismissRisk('r3');
    assert.deepEqual(seen, []);
  });
});
