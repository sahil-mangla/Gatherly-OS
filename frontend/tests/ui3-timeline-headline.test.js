/**
 * @file ui3-timeline-headline.test.js
 * @description The timeline headline must not say "right on time" while a milestone is due before its prerequisite.
 * The DOM test is skipped automatically when jsdom is not installed.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from './ui-env.js';

let env = null;
let views = null;
before(async () => {
  env = await bootApp();
  if (env) views = await import('../src/js/views/timeline-view.js');
});

const PROGRESS = { overdue_tasks: [], percent_complete: 40, completed: 2, total: 5 };
const task = (id, due, extra = {}) => ({ id, title: `Task ${id}`, status: 'todo', priority: 'medium', due_date: due, ...extra });

describe('headlineFor', () => {
  it('keeps the on-time message when nothing collides', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    assert.equal(views.headlineFor(PROGRESS, false), 'You’re right on time.');
  });

  it('warns about a collision before claiming the plan is on time', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    assert.match(views.headlineFor(PROGRESS, true), /due before what they depend on/);
  });

  it('still reports overdue work first', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const overdue = { ...PROGRESS, overdue_tasks: [{ id: 'x' }] };
    assert.equal(views.headlineFor(overdue, true), '1 task(s) need attention!');
  });
});

describe('hasDependencyCollision', () => {
  it('detects a milestone due before its open prerequisite', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const event = { tasks: [task('a', '2030-06-10'), task('b', '2030-06-01', { depends_on: ['a'] })] };
    assert.equal(views.hasDependencyCollision(event), true);
  });

  it('ignores a dismissed radar alert (the headline must still tell the truth)', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const event = {
      tasks: [task('a', '2030-06-10'), task('b', '2030-06-01', { depends_on: ['a'] })],
      dismissed_risk_ids: ['risk-dependency-collision']
    };
    assert.equal(views.hasDependencyCollision(event), true);
  });

  it('is false for correctly ordered, equal-dated or finished prerequisites', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const ordered = { tasks: [task('a', '2030-06-01'), task('b', '2030-06-10', { depends_on: ['a'] })] };
    const sameDay = { tasks: [task('a', '2030-06-05'), task('b', '2030-06-05', { depends_on: ['a'] })] };
    const finished = { tasks: [task('a', '2030-06-10', { status: 'done' }), task('b', '2030-06-01', { depends_on: ['a'] })] };
    assert.deepEqual([ordered, sameDay, finished].map(views.hasDependencyCollision), [false, false, false]);
  });
});

describe('timeline view after accepting a colliding reschedule', () => {
  it('shows the collision headline in the page', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const event = env.store.getActiveEvent();
    event.tasks = [task('a', '2030-06-10'), task('b', '2030-06-01', { depends_on: ['a'] })];
    env.document.querySelector('.nav-item[data-view="timeline"]').click();
    env.store.emit('task:updated', {});
    assert.match(env.document.getElementById('timeline-status-headline').textContent, /due before what they depend on/);
    env.store.resetToDefaults();
  });
});
