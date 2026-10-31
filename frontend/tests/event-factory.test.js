/**
 * @file event-factory.test.js
 * @description createEventFromTemplate: shape, budget allocation, per-guest scaling, date shifting
 * (pure domain, no DOM).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEventFromTemplate } from '../src/js/domain/event-factory.js';
import { EVENT_TYPES } from '../src/js/domain/event-validation.js';
import { daysBetween } from '../src/js/domain/event-dates.js';
import { parseDate } from '../src/js/domain/timeline-dates.js';
import { INITIAL_TEMPLATES } from '../src/js/templates.js';

const NOW = new Date(2026, 9, 29, 12);
const TODAY = '2026-10-29';
const base = (over = {}) => ({ type: 'wedding', name: 'Priya & Sam', date: '2027-03-20', guests: '120', capacity: '150', budget: '24000.01', ...over });
const build = (over, now = NOW) => createEventFromTemplate(base(over), INITIAL_TEMPLATES, now);
const cents = (event) => Math.round(event.expenses.reduce((sum, e) => sum + e.planned_amount * 100, 0));
const templateFor = (type) => Object.values(INITIAL_TEMPLATES).find(t => t.type === type);

describe('createEventFromTemplate', () => {
  for (const type of EVENT_TYPES) {
    test(`${type}: builds a complete event in the template shape`, () => {
      const event = build({ type });
      const tmpl = templateFor(type);
      assert.equal(event.type, type);
      assert.equal(event.name, 'Priya & Sam');
      assert.equal(event.date, '2027-03-20');
      assert.deepEqual([event.expected_guests, event.venue_capacity, event.total_budget], [120, 150, 24000.01]);
      assert.equal(event.expenses.length, tmpl.expenses.length);
      assert.equal(event.tasks.length, tmpl.tasks.length);
      assert.ok(event.id.startsWith('event-') && !(event.id in INITIAL_TEMPLATES));
      assert.equal(event.schedule_anchor, undefined, 'a user-chosen date must never roll forward');
      for (const key of Object.keys(tmpl).filter(k => k !== 'schedule_anchor')) assert.ok(key in event, `missing ${key}`);
    });
  }

  test('planned amounts sum exactly to awkward budgets', () => {
    for (const type of EVENT_TYPES) {
      for (const budget of [24000.01, 0.01, 1, 33333.33, 9999999.99, 10000000, '7777.77']) {
        const event = build({ type, budget });
        assert.equal(cents(event), Math.round(Number(budget) * 100), `${type} ${budget}`);
        assert.ok(event.expenses.every(e => e.planned_amount >= 0));
      }
    }
  });

  test('the rounding remainder lands in the largest category', () => {
    const event = build({ budget: 24000.01 });
    const tmpl = templateFor('wedding');
    const venue = event.expenses.find(e => e.category === 'venue');
    assert.equal(venue.planned_amount, 9600.01);
    const others = event.expenses.filter(e => e !== venue).map(e => e.planned_amount);
    const expected = tmpl.expenses.filter(e => e.category !== 'venue').map(e => e.planned_amount);
    assert.deepEqual(others, expected);
  });

  test('new events start with nothing spent, no seed vendors or ideas, and open tasks', () => {
    const event = build();
    assert.ok(event.expenses.every(e => e.actual_amount === 0 && e.committed_amount === 0 && e.status === 'planned' && e.vendor_id === null));
    assert.deepEqual([event.vendors, event.ideas, event.dismissed_risk_ids], [[], [], []]);
    assert.ok(event.tasks.every(t => t.status === 'todo' && !('completed_at' in t)));
  });

  test('per-guest costs follow the budget scale and the new headcount', () => {
    const catering = (over) => build(over).expenses.find(e => e.category === 'catering').cost_per_guest;
    assert.equal(catering({ guests: 150, budget: 24000 }), 48, 'identity at template guests and budget');
    assert.equal(catering({ guests: 300, budget: 24000 }), 24, 'double the guests halves the rate');
    assert.equal(catering({ guests: 150, budget: 48000 }), 96, 'double the budget doubles the rate');
    assert.equal(build().expenses.find(e => e.category === 'venue').cost_per_guest, 0);
  });

  test('task due dates keep their offset from the event date', () => {
    const tmpl = templateFor('wedding');
    const event = build({ date: '2027-03-20' });
    tmpl.tasks.forEach((source, i) => {
      const before = daysBetween(parseDate(source.due_date), parseDate(tmpl.date));
      assert.equal(daysBetween(parseDate(event.tasks[i].due_date), parseDate('2027-03-20')), before, source.title);
    });
  });

  test('tasks that would fall before today are clamped to today with order preserved', () => {
    const event = build({ date: '2026-11-12' });
    const dues = event.tasks.map(t => t.due_date);
    assert.ok(dues.every(d => d >= TODAY && d <= '2026-11-12'), dues.join());
    assert.deepEqual([...dues].sort(), dues, 'template order is still chronological');
    assert.ok(dues.filter(d => d === TODAY).length >= 2, 'several early tasks share today');
  });

  test('dependencies are remapped onto the fresh task ids', () => {
    const event = build();
    const oldIds = new Set(templateFor('wedding').tasks.map(t => t.id));
    const ids = new Set(event.tasks.map(t => t.id));
    assert.equal(ids.size, event.tasks.length);
    assert.ok(event.tasks.every(t => !oldIds.has(t.id)));
    const withDeps = event.tasks.filter(t => t.depends_on.length > 0);
    assert.ok(withDeps.length > 0);
    assert.ok(withDeps.every(t => t.depends_on.every(d => ids.has(d))));
  });

  test('never mutates the templates and never reuses their objects', () => {
    const before = JSON.stringify(INITIAL_TEMPLATES);
    const event = build();
    event.expenses[0].planned_amount = -1;
    event.tasks[0].title = 'changed';
    assert.equal(JSON.stringify(INITIAL_TEMPLATES), before);
  });

  test('drops the seed couple, vendors and authors from the new event', () => {
    for (const type of EVENT_TYPES) {
      assert.doesNotMatch(JSON.stringify(build({ type })), /Leila|Noor|Maya|Dad|Velvet|Crumb|Sol Studio|Stem Society|Metro Sound|Committee/);
    }
  });

  test('two creations never share ids; duplicate names are fine', () => {
    const [a, b] = [build(), build()];
    assert.notEqual(a.id, b.id);
    assert.equal(a.name, b.name);
    assert.ok(a.expenses.every(e => !b.expenses.some(o => o.id === e.id)));
  });

  test('trims text and accepts numeric inputs', () => {
    const event = createEventFromTemplate({ type: ' Birthday ', name: '  Mia’s 30th  ', date: ' 2027-01-09 ', guests: 40, capacity: 50, budget: 5000 }, INITIAL_TEMPLATES, NOW);
    assert.deepEqual([event.type, event.name, event.date], ['birthday', 'Mia’s 30th', '2027-01-09']);
  });

  test('throws when no template matches the type', () => {
    assert.throws(() => createEventFromTemplate(base(), {}, NOW), /No template/);
  });
});
