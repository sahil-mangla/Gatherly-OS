/**
 * @file dependencies.test.js
 * @description Milestone dependency validation and blocked/unblocks helpers.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateNewTask, unfinishedDependencies, dependentsOf } from '../src/js/domain/dependencies.js';
import { addTaskAction } from '../src/js/store/actions.js';

const task = (id, due, over = {}) => ({ id, title: `Task ${id.toUpperCase()}`, due_date: due, status: 'todo', depends_on: [], ...over });
const tasks = () => [task('a', '2026-11-01', { status: 'done' }), task('b', '2026-11-10', { depends_on: ['a'] }), task('c', '2026-12-01', { depends_on: ['b'] })];
const draft = (over = {}) => ({ title: 'New one', due_date: '2026-12-15', depends_on: [], ...over });

describe('validateNewTask', () => {
  test('accepts no dependencies, and dependencies due on or before the milestone', () => {
    assert.equal(validateNewTask(tasks(), draft()).valid, true);
    assert.equal(validateNewTask(tasks(), draft({ depends_on: ['a', 'c'] })).valid, true);
    assert.equal(validateNewTask(tasks(), draft({ due_date: '2026-12-01', depends_on: ['c'] })).valid, true, 'same day is fine');
  });

  test('rejects a dependency due after the milestone and names it', () => {
    const result = validateNewTask(tasks(), draft({ due_date: '2026-11-05', depends_on: ['a', 'c'] }));
    assert.equal(result.valid, false);
    assert.equal(result.offender, 'c');
    assert.match(result.errors[0], /Task C/);
    assert.match(result.errors[0], /Dec 1, 2026/);
    assert.match(result.errors[0], /Nov 5, 2026/);
  });

  test('rejects a dependency that sits in a circular chain, naming it', () => {
    const loop = [task('x', '2026-11-01', { depends_on: ['y'] }), task('y', '2026-11-02', { depends_on: ['x'] }), task('z', '2026-11-03', { depends_on: ['y'] })];
    const direct = validateNewTask(loop, draft({ depends_on: ['x'] }));
    assert.equal(direct.valid, false);
    assert.match(direct.errors[0], /Task X|Task Y/);
    assert.match(direct.errors[0], /circular/);
    assert.equal(validateNewTask(loop, draft({ depends_on: ['z'] })).valid, false, 'downstream of the loop is also stuck');
    assert.equal(validateNewTask([...loop, task('ok', '2026-11-04')], draft({ depends_on: ['ok'] })).valid, true, 'unrelated dependency is fine');
  });

  test('rejects unknown dependency ids and invalid base fields', () => {
    const unknown = validateNewTask(tasks(), draft({ depends_on: ['ghost'] }));
    assert.deepEqual([unknown.valid, unknown.offender], [false, 'ghost']);
    const blank = validateNewTask(tasks(), draft({ title: '  ' }));
    assert.equal(blank.valid, false);
    assert.equal(blank.offender, null);
  });
});

describe('blocked / unblocks helpers', () => {
  test('lists only unfinished dependencies and unfinished dependents', () => {
    const list = tasks();
    assert.deepEqual(unfinishedDependencies(list[1], list), [], 'a is done');
    assert.deepEqual(unfinishedDependencies(list[2], list).map(t => t.id), ['b']);
    assert.deepEqual(dependentsOf(list[0], list).map(t => t.id), ['b']);
    assert.deepEqual(dependentsOf(list[2], list), []);
    list[1].status = 'done';
    assert.deepEqual(unfinishedDependencies(list[2], list), [], 'completing b unblocks c');
  });

  test('tolerates tasks without a depends_on list', () => {
    assert.deepEqual(unfinishedDependencies({ id: 'q' }, [{ id: 'r' }]), []);
    assert.deepEqual(dependentsOf({ id: 'r' }, [{ id: 'q' }]), []);
  });
});

describe('addTaskAction with dependencies', () => {
  test('stores depends_on and refuses invalid ones without mutating the event', () => {
    const event = { tasks: tasks() };
    const added = addTaskAction(event, draft({ depends_on: ['b'] }));
    assert.deepEqual(added.depends_on, ['b']);
    assert.equal(event.tasks.length, 4);
    assert.throws(() => addTaskAction(event, draft({ due_date: '2026-11-02', depends_on: ['c'] })), /Task C/);
    assert.equal(event.tasks.length, 4);
  });
});
