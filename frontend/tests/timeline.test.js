/**
 * @file timeline.test.js
 * @description Edge-case tests for task validation, progress and the reschedule collision engine.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTask,
  calculateTimelineProgress,
  checkCircularDependencies
} from '../src/js/domain/timeline.js';
import { evaluateReschedule, buildDependentsMap, collectDependents } from '../src/js/domain/timeline-reschedule.js';

const task = (id, due, deps = [], extra = {}) => ({ id, title: `T-${id}`, due_date: due, depends_on: deps, ...extra });

describe('validateTask', () => {
  test('accepts valid tasks and rejects non-objects', () => {
    assert.equal(validateTask(task('a', '2026-01-01')).valid, true);
    assert.deepEqual(validateTask(null), { valid: false, errors: ['Task must be an object.'] });
  });

  test('reports title, date, priority and status errors in order', () => {
    const r = validateTask({ title: ' ', due_date: '2026-13-99x', priority: 'urgent', status: 'blocked' });
    assert.equal(r.errors.length, 4);
    assert.match(r.errors[2], /Invalid priority 'urgent'/);
    assert.match(r.errors[3], /Invalid status 'blocked'/);
    assert.equal(validateTask({ title: 5, due_date: 20260101 }).errors.length, 2);
  });
});

describe('calculateTimelineProgress', () => {
  const tasks = [
    task('a', '2026-01-01', [], { status: 'done' }),
    task('b', '2026-02-01', [], { status: 'in_progress' }),
    task('c', '2026-09-01'),
    task('d', '2026-08-01', [], { status: 'todo' }),
    task('e', 'garbage')
  ];

  test('buckets statuses, overdue and sorted upcoming tasks', () => {
    const p = calculateTimelineProgress([...tasks, null, 'x'], '2026-06-01');
    assert.deepEqual(
      [p.total, p.completed, p.in_progress, p.todo, p.percent_complete],
      [7, 1, 1, 3, 14]
    );
    assert.deepEqual(p.overdue_tasks.map(t => t.id), ['b']);
    assert.deepEqual(p.upcoming_tasks.map(t => t.id), ['d', 'c']);
    assert.equal(p.next_task.id, 'd');
  });

  test('handles empty and invalid input and falls back for bad ref dates', () => {
    assert.deepEqual(calculateTimelineProgress(undefined).upcoming_tasks, []);
    assert.equal(calculateTimelineProgress('nope').total, 0);
    assert.equal(calculateTimelineProgress([]).next_task, null);
    assert.equal(calculateTimelineProgress(tasks, 'not-a-date').total, 5);
  });
});

describe('evaluateReschedule', () => {
  test('throws for unknown tasks and invalid dates', () => {
    assert.throws(() => evaluateReschedule([], 'x', '2026-01-01'), /not found/);
    assert.throws(() => evaluateReschedule([task('a', '2026-01-01')], 'a', 'bad'), /Invalid target date/);
  });

  test('fixed deadlines add a warning and critical dependents are escalated', () => {
    const tasks = [
      task('a', '2026-05-01', [], { is_fixed_deadline: true }),
      task('b', '2026-05-10', ['a'], { is_fixed_deadline: true })
    ];
    const r = evaluateReschedule(tasks, 'a', '2026-05-10');
    assert.deepEqual(r.conflicts.map(c => c.type), ['fixed_deadline_override', 'dependency_precedence_violation']);
    assert.equal(r.conflicts[1].severity, 'critical');
    assert.equal(evaluateReschedule(tasks, 'a', '2026-05-09').conflicts.length, 1);
  });

  test('walks transitive dependents breadth-first through a diamond exactly once', () => {
    const tasks = [
      task('a', '2026-01-01'), task('b', '2026-02-01', ['a']), task('c', '2026-03-01', ['a']),
      task('d', '2026-04-01', ['b', 'c', 'b'])
    ];
    const r = evaluateReschedule(tasks, 'a', '2026-02-15');
    assert.deepEqual(r.impacted_dependents.map(d => d.id), ['b', 'c', 'd']);
    assert.deepEqual(r.conflicts.map(c => c.dependent_id), ['b']);
    assert.equal(r.has_conflicts, true);
  });

  test('terminates on cycles and self-dependencies', () => {
    const tasks = [task('a', '2026-01-01', ['b']), task('b', '2026-01-02', ['a']), task('s', '2026-01-03', ['s'])];
    assert.equal(evaluateReschedule(tasks, 'a', '2026-06-01').impacted_dependents_count, 2);
    assert.equal(evaluateReschedule(tasks, 's', '2026-06-01').impacted_dependents_count, 1);
    assert.equal(checkCircularDependencies(tasks)[0], true);
  });

  test('ignores non-array depends_on and builds the adjacency map once', () => {
    const tasks = [task('a', '2026-01-01'), { id: 'b', title: 'B', depends_on: 'a' }, null];
    const map = buildDependentsMap(tasks);
    assert.equal(map.size, 0);
    assert.deepEqual(collectDependents(buildDependentsMap([task('a', 'x'), task('b', 'x', ['a'])]), 'a').map(t => t.id), ['b']);
  });

  test('scales linearly on a 20,000-task chain', () => {
    const tasks = Array.from({ length: 20000 }, (_, i) => task(`t${i}`, '2026-01-01', i ? [`t${i - 1}`] : []));
    const started = Date.now();
    const r = evaluateReschedule(tasks, 't0', '2026-06-01');
    assert.equal(r.impacted_dependents_count, 19999);
    assert.ok(Date.now() - started < 3000);
  });
});
