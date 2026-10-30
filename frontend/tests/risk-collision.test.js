/**
 * @file risk-collision.test.js
 * @description Dependency-collision risk rule: open tasks due before a prerequisite still open.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEventRisks } from '../src/js/domain/risks.js';
import { RISK_RULES, dependencyCollisionRule } from '../src/js/domain/risk-rules.js';

const REF = '2026-06-01';
const task = (id, title, due, extra = {}) => ({ id, title, due_date: due, status: 'todo', depends_on: null, ...extra });
const risks = (...tasks) => dependencyCollisionRule({ event: { tasks } });
const pair = (preDue = '2026-09-10', postDue = '2026-09-01', post = {}) => [
  task('a', 'Pre', preDue),
  task('b', 'Post', postDue, { depends_on: ['a'], ...post })
];
const dependents = (count) => Array.from({ length: count }, (_, i) => task(`d${i}`, `Dep ${i}`, '2026-09-01', { depends_on: ['p'] }));

describe('dependencyCollisionRule', () => {
  test('is registered right after the overdue rule', () => {
    const names = RISK_RULES.map(rule => rule.name);
    assert.equal(names.indexOf('dependencyCollisionRule'), names.indexOf('overdueMilestonesRule') + 1);
  });

  test('no tasks, non-array tasks and no collisions raise nothing', () => {
    assert.deepEqual(dependencyCollisionRule({ event: {} }), []);
    assert.deepEqual(dependencyCollisionRule({ event: { tasks: 'nope' } }), []);
    assert.deepEqual(risks(), []);
  });

  test('one collision has the documented shape', () => {
    const [risk, ...rest] = risks(...pair());
    assert.equal(rest.length, 0);
    assert.equal(risk.id, 'risk-dependency-collision');
    assert.equal(risk.type, 'dependency_collision');
    assert.equal(risk.severity, 'warning');
    assert.equal(risk.status, 'open');
    assert.equal(risk.title, '1 Dependency Collision(s)');
    assert.equal(risk.evidence, "Due before a prerequisite that is still open: 'Post'.");
    assert.deepEqual(risk.recommended_actions.map(a => a.action_type), ['open_timeline', 'ask_mara']);
  });

  test('boundary: equal due dates are not a collision, one day earlier is', () => {
    assert.deepEqual(risks(...pair('2026-09-10', '2026-09-10')), []);
    assert.equal(risks(...pair('2026-09-11', '2026-09-10')).length, 1);
    assert.deepEqual(risks(...pair('2026-09-01', '2026-09-10')), []);
  });

  test('three titles are listed plainly; more than three add a remaining count', () => {
    const [three] = risks(task('p', 'Pre', '2026-09-10'), ...dependents(3));
    assert.equal(three.title, '3 Dependency Collision(s)');
    assert.ok(three.evidence.endsWith("'Dep 0', 'Dep 1', 'Dep 2'."));
    const [many] = risks(task('p', 'Pre', '2026-09-10'), ...dependents(6));
    assert.equal(many.title, '6 Dependency Collision(s)');
    assert.equal(many.evidence, "Due before a prerequisite that is still open: 'Dep 0', 'Dep 1', 'Dep 2' and 3 more.");
  });

  test('a task colliding with two prerequisites counts once', () => {
    const tasks = [task('a', 'A', '2026-09-10'), task('c', 'C', '2026-09-12'), task('b', 'Post', '2026-09-01', { depends_on: ['a', 'c'] })];
    assert.equal(risks(...tasks)[0].title, '1 Dependency Collision(s)');
  });

  test('done tasks, missing ids, bad dependency shapes and invalid dates are ignored', () => {
    const ignored = [
      { status: 'done' }, { depends_on: ['ghost'] }, { depends_on: 'a' }, { depends_on: null },
      { depends_on: [['a'], { x: 1 }, null] }, { due_date: 'not-a-date' }, { due_date: '' }, { due_date: null },
      { due_date: '2026-02-30' }
    ];
    for (const change of ignored) assert.deepEqual(risks(...pair('2026-09-10', '2026-09-01', change)), [], JSON.stringify(change));
    const [pre, post] = pair();
    assert.deepEqual(risks({ ...pre, status: 'done' }, post), []);
    assert.deepEqual(risks({ ...pre, due_date: 'soon' }, post), []);
  });

  test('self dependencies and junk entries are ignored; untitled tasks use their id', () => {
    assert.deepEqual(risks(task('a', 'Loop', '2026-09-10', { depends_on: ['a'] }), null, 5, 'x', [], { title: 'no id' }), []);
    const [pre, post] = pair();
    assert.equal(risks(pre, { ...post, title: '' })[0].evidence, "Due before a prerequisite that is still open: 'b'.");
  });

  test('datetime due dates compare by calendar day and titles stay plain text', () => {
    assert.equal(risks(...pair('2026-09-11T00:00:00', '2026-09-10T23:59:59')).length, 1);
    assert.deepEqual(risks(...pair('2026-09-10T23:00:00', '2026-09-10T01:00:00')), []);
    const [pre, post] = pair();
    assert.ok(risks(pre, { ...post, title: 'Café <b>花</b>' })[0].evidence.includes("'Café <b>花</b>'"));
  });

  test('aggregator keeps severity order and honours dismissal', () => {
    const event = { expected_guests: 500, venue_capacity: 100, tasks: pair(), vendors: [{ id: 'v', name: 'V', status: 'shortlist' }] };
    const report = evaluateEventRisks(event, REF);
    assert.deepEqual(report.risks.map(r => r.id), ['risk-capacity-breach', 'risk-dependency-collision', 'risk-vendor-missing-v']);
    assert.equal(report.warning_count, 1);
    const dismissed = { tasks: pair(), dismissed_risk_ids: ['risk-dependency-collision'] };
    assert.equal(evaluateEventRisks(dismissed, REF).total_count, 0);
  });
});
