/**
 * @file store.test.js
 * @description EventStore resilience against missing, blocked and corrupt localStorage.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const memoryStorage = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  };
};
const throwingStorage = () => ({
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('quota'); },
  removeItem() { throw new Error('blocked'); }
});

const setStorage = (value) => Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true });

setStorage(undefined);
const { EventStore, store: singleton } = await import('../src/js/store.js');
const { parseEventsMap } = await import('../src/js/store/storage.js');
const { INITIAL_TEMPLATES } = await import('../src/js/templates.js');

const TEMPLATE_IDS = Object.keys(INITIAL_TEMPLATES);
let warn;
let error;

describe('EventStore storage resilience', () => {
  beforeEach(() => {
    warn = console.warn;
    error = console.error;
    console.warn = () => {};
    console.error = () => {};
  });
  afterEach(() => {
    console.warn = warn;
    console.error = error;
    delete globalThis.localStorage;
  });

  test('module-level singleton constructs without any localStorage', () => {
    assert.deepEqual(Object.keys(singleton.events), TEMPLATE_IDS);
  });

  test('works when localStorage is undefined', () => {
    setStorage(undefined);
    const s = new EventStore();
    assert.equal(s.activeEventId, TEMPLATE_IDS[0]);
    assert.doesNotThrow(() => s.addTask({ title: 'x', due_date: '2026-05-01' }));
    assert.doesNotThrow(() => s.switchEvent(TEMPLATE_IDS[1]));
    assert.doesNotThrow(() => s.resetToDefaults());
  });

  test('works when every storage call throws', () => {
    setStorage(throwingStorage());
    const s = new EventStore();
    assert.deepEqual(Object.keys(s.events), TEMPLATE_IDS);
    assert.doesNotThrow(() => s.save());
    assert.doesNotThrow(() => s.switchEvent(TEMPLATE_IDS[1]));
    assert.doesNotThrow(() => s.resetToDefaults());
    assert.equal(s.activeEventId, TEMPLATE_IDS[0]);
  });

  test('falls back to templates for corrupt or wrongly-shaped JSON', () => {
    const corrupt = ['{not json', '[]', '"str"', 'null', '{}', '{"a": 1}', '{"a": null}', '{"a": []}'];
    for (const payload of corrupt) {
      setStorage(memoryStorage({ gatherly_events_v4: payload }));
      const s = new EventStore();
      assert.deepEqual(Object.keys(s.events), TEMPLATE_IDS, `payload ${payload}`);
    }
  });

  test('restores saved events and the saved active event', () => {
    const saved = { mine: { id: 'mine', title: 'Saved' } };
    setStorage(memoryStorage({ gatherly_events_v4: JSON.stringify(saved), gatherly_active_event_v4: 'mine' }));
    const s = new EventStore();
    assert.equal(s.getActiveEvent().title, 'Saved');
    assert.equal(s.activeEventId, 'mine');
  });

  test('ignores prototype keys and unknown ids for the active event', () => {
    const saved = { mine: { id: 'mine' } };
    for (const bogus of ['constructor', '__proto__', 'missing']) {
      setStorage(memoryStorage({ gatherly_events_v4: JSON.stringify(saved), gatherly_active_event_v4: bogus }));
      assert.equal(new EventStore().activeEventId, 'mine');
    }
    const s = new EventStore();
    s.switchEvent('constructor');
    assert.notEqual(s.activeEventId, 'constructor');
  });

  test('persists mutations to storage when available', () => {
    const storage = memoryStorage();
    setStorage(storage);
    const s = new EventStore();
    s.addTask({ title: 'Persist me', due_date: '2026-05-01' });
    const persisted = JSON.parse(storage.data.get('gatherly_events_v4'));
    assert.ok(persisted[s.activeEventId].tasks.some(t => t.title === 'Persist me'));
  });

  test('parseEventsMap validates structure', () => {
    assert.equal(parseEventsMap(''), null);
    assert.equal(parseEventsMap(null), null);
    assert.deepEqual(parseEventsMap('{"a":{"id":"a"}}'), { a: { id: 'a' } });
  });
});
