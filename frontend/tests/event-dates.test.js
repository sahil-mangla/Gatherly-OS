/**
 * @file event-dates.test.js
 * @description Unit tests for event date normalization and countdown helpers.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  defaultEventDate,
  syncEventSchedule,
  describeCountdown,
  daysBetween,
  toIsoDate
} from '../src/js/domain/event-dates.js';

const TODAY = new Date(2026, 9, 28, 15, 30);

describe('defaultEventDate', () => {
  test('is always a Saturday ~18 weeks out, across DST changes', () => {
    for (const start of [new Date(2026, 2, 1), new Date(2026, 9, 28), new Date(2026, 10, 1), new Date(2027, 2, 10)]) {
      const d = defaultEventDate(start);
      assert.strictEqual(d.getDay(), 6, toIsoDate(d));
      const diff = daysBetween(start, d);
      assert.ok(diff >= 123 && diff <= 129, `${toIsoDate(start)} -> ${diff}`);
    }
  });
});

describe('describeCountdown', () => {
  const at = (days) => new Date(2026, 9, 28 + days);
  test('formats each range', () => {
    assert.strictEqual(describeCountdown(at(0), TODAY), ' · Today!');
    assert.strictEqual(describeCountdown(at(1), TODAY), ' · Tomorrow');
    assert.strictEqual(describeCountdown(at(5), TODAY), ' · 5 days to go');
    assert.strictEqual(describeCountdown(at(14), TODAY), ' · 2 weeks to go');
    assert.strictEqual(describeCountdown(at(20), TODAY), ' · 2 weeks to go');
    assert.strictEqual(describeCountdown(at(-3), TODAY), ' · Event date passed');
  });
});

describe('syncEventSchedule', () => {
  const templates = { e1: { id: 'e1', date: '2025-09-14', schedule_anchor: '2025-06-04' } };
  const make = () => ({
    id: 'e1', date: '2025-09-14', schedule_anchor: '2025-06-04',
    tasks: [{ due_date: '2025-06-02', status: 'done', completed_at: '2025-06-02' }, { due_date: '2025-06-12', status: 'todo' }],
    ideas: [{ date_added: '2025-05-30' }, { date_added: 'Just now' }]
  });
  const days = (a, b) => daysBetween(new Date(a + 'T00:00:00'), new Date(b + 'T00:00:00'));

  test('shifts the whole timeline by whole weeks so the anchor tracks today', () => {
    const ev = make();
    assert.strictEqual(syncEventSchedule(ev, TODAY, templates), true);
    const shift = days('2025-09-14', ev.date);
    assert.strictEqual(shift % 7, 0);
    assert.strictEqual(new Date(ev.date + 'T00:00:00').getDay(), 0);
    assert.strictEqual(days('2025-06-02', ev.tasks[0].due_date), shift);
    assert.strictEqual(ev.tasks[0].completed_at, ev.tasks[0].due_date);
    assert.strictEqual(days('2025-05-30', ev.ideas[0].date_added), shift);
    assert.strictEqual(ev.ideas[1].date_added, 'Just now');
    const gap = daysBetween(new Date(ev.schedule_anchor + 'T00:00:00'), new Date(2026, 9, 28));
    assert.ok(gap >= 0 && gap < 7, `anchor lags today by ${gap}`);
  });

  test('keeps the event ~14 weeks out and completed work in the past', () => {
    const ev = make();
    syncEventSchedule(ev, TODAY, templates);
    const out = daysBetween(new Date(2026, 9, 28), new Date(ev.date + 'T00:00:00'));
    assert.ok(out >= 100 && out <= 108, `event is ${out} days out`);
    assert.ok(new Date(ev.tasks[0].completed_at + 'T00:00:00') <= new Date(2026, 9, 28));
  });

  test('is idempotent and advances a week at a time as days pass', () => {
    const ev = make();
    syncEventSchedule(ev, TODAY, templates);
    const snapshot = JSON.stringify(ev);
    assert.strictEqual(syncEventSchedule(ev, TODAY, templates), false);
    assert.strictEqual(JSON.stringify(ev), snapshot);
    const before = ev.date;
    assert.strictEqual(syncEventSchedule(ev, new Date(2026, 10, 12), templates), true);
    assert.ok(days(before, ev.date) % 7 === 0 && days(before, ev.date) > 0);
  });

  test('infers an anchor for legacy saved events from their template', () => {
    const legacy = { id: 'e1', date: '2025-09-14', tasks: [{ due_date: '2025-06-12', status: 'todo' }] };
    assert.strictEqual(syncEventSchedule(legacy, TODAY, templates), true);
    assert.ok(legacy.schedule_anchor);
    assert.ok(new Date(legacy.date + 'T00:00:00') > new Date(2026, 9, 28));
  });

  test('never touches events with no anchor and no template', () => {
    const ev = { id: 'custom', date: '2024-01-01', tasks: [{ due_date: '2023-12-01' }] };
    assert.strictEqual(syncEventSchedule(ev, TODAY, templates), false);
    assert.strictEqual(ev.date, '2024-01-01');
    assert.strictEqual(ev.tasks[0].due_date, '2023-12-01');
  });

  test('converts legacy free-text idea dates using the template, keeps user-added ones', () => {
    const tmpl = { e1: { ...templates.e1, ideas: [{ id: 'i1', date_added: '2025-05-30' }] } };
    const legacy = {
      id: 'e1', date: '2025-09-14', tasks: [],
      ideas: [{ id: 'i1', date_added: 'May 30' }, { id: 'mine', date_added: 'Just now' }]
    };
    syncEventSchedule(legacy, TODAY, tmpl);
    assert.match(legacy.ideas[0].date_added, /^\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(days('2025-05-30', legacy.ideas[0].date_added), days('2025-09-14', legacy.date));
    assert.strictEqual(legacy.ideas[1].date_added, 'Just now');
  });
});
