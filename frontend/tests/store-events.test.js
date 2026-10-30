/**
 * @file store-events.test.js
 * @description EventStore.createEvent / updateEventBasics: persistence, active event and emitted events.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const data = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  }
});
const { EventStore } = await import('../src/js/store.js');
const { evaluateEventRisks } = await import('../src/js/domain/risks.js');

const future = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const payload = (over = {}) => ({ type: 'birthday', name: 'Mia’s 30th', date: future(120), guests: 40, capacity: 60, budget: 5000.5, ...over });

describe('EventStore event creation', () => {
  let store;
  let seen;
  beforeEach(() => {
    data.clear();
    store = new EventStore();
    seen = [];
    store.subscribe(({ type }) => seen.push(type));
  });

  test('createEvent saves, activates, emits once and survives a reload', () => {
    const created = store.createEvent(payload());
    assert.equal(store.getActiveEvent().id, created.id);
    assert.deepEqual(seen, ['event:created']);
    assert.equal(store.getAllEvents().length, 4);

    const reloaded = new EventStore();
    assert.equal(reloaded.getAllEvents().length, 4);
    assert.equal(reloaded.getActiveEvent().id, created.id, 'active event is remembered');
    assert.deepEqual(reloaded.getActiveEvent(), created);
  });

  test('a rejected payload throws and leaves the store untouched', () => {
    const before = store.getAllEvents().length;
    assert.throws(() => store.createEvent(payload({ guests: 0 })), (err) => 'guests' in err.fields);
    assert.equal(store.getAllEvents().length, before);
    assert.deepEqual(seen, []);
    assert.equal(new EventStore().getAllEvents().length, before);
  });

  test('duplicate names create distinct events', () => {
    const [a, b] = [store.createEvent(payload()), store.createEvent(payload())];
    assert.notEqual(a.id, b.id);
    assert.equal(store.getAllEvents().length, 5);
  });

  test('a created event keeps its own date after reload (no schedule roll)', () => {
    const created = store.createEvent(payload({ date: future(30) }));
    const reloaded = new EventStore();
    assert.equal(reloaded.events[created.id].date, created.date);
    assert.deepEqual(reloaded.events[created.id].tasks.map(t => t.due_date), created.tasks.map(t => t.due_date));
  });

  test('resetToDefaults drops user events', () => {
    store.createEvent(payload());
    store.resetToDefaults();
    assert.equal(store.getAllEvents().length, 3);
  });

  test('updateEventBasics edits the active event, persists and flips the capacity risk', () => {
    const created = store.createEvent(payload({ guests: 40, capacity: 60 }));
    seen.length = 0;
    store.updateEventBasics({ capacity: 30, name: ' Mia’s big 3-0 ' });
    assert.deepEqual(seen, ['event:updated']);
    const risky = new EventStore().events[created.id];
    assert.equal(risky.name, 'Mia’s big 3-0');
    assert.ok(evaluateEventRisks(risky).risks.some(r => r.id === 'risk-capacity-breach'));
    store.updateEventBasics({ capacity: 80 });
    assert.ok(!evaluateEventRisks(new EventStore().events[created.id]).risks.some(r => r.id === 'risk-capacity-breach'));
  });

  test('updateEventBasics rejects bad input without emitting', () => {
    store.createEvent(payload());
    seen.length = 0;
    assert.throws(() => store.updateEventBasics({ budget: 0 }), (err) => 'budget' in err.fields);
    assert.deepEqual(seen, []);
  });
});
