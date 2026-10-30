/**
 * @file event-validation.test.js
 * @description Table-driven rejection / boundary tests for the New event form rules.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEventFromTemplate } from '../src/js/domain/event-factory.js';
import { validateEventBasics, isOverCapacity } from '../src/js/domain/event-validation.js';
import { INITIAL_TEMPLATES } from '../src/js/templates.js';

const NOW = new Date(2026, 9, 29, 12);
const TODAY = '2026-10-29';
const base = (over = {}) => ({ type: 'wedding', name: 'Priya & Sam', date: '2027-03-20', guests: '120', capacity: '150', budget: '24000.01', ...over });
const build = (over, now = NOW) => createEventFromTemplate(base(over), INITIAL_TEMPLATES, now);

describe('field validation', () => {
  const long = (n) => 'x'.repeat(n);
  const REJECTED = [
    ['type', { type: 'party' }], ['type', { type: '' }],
    ['name', { name: '' }], ['name', { name: '   ' }], ['name', { name: long(81) }],
    ['date', { date: '' }], ['date', { date: 'soon' }], ['date', { date: '2026-02-30' }], ['date', { date: '2026-10-27' }],
    ['date', { date: '2031-10-30' }], ['date', { date: '27/03/2027' }],
    ['guests', { guests: 0 }], ['guests', { guests: 5001 }], ['guests', { guests: '1.5' }], ['guests', { guests: 'many' }], ['guests', { guests: '' }], ['guests', { guests: -4 }],
    ['capacity', { capacity: 0 }], ['capacity', { capacity: '-3' }], ['capacity', { capacity: '2.5' }], ['capacity', { capacity: '' }],
    ['budget', { budget: 0 }], ['budget', { budget: -5 }], ['budget', { budget: 10000000.01 }], ['budget', { budget: '12.345' }], ['budget', { budget: 'lots' }], ['budget', { budget: '' }]
  ];
  for (const [field, over] of REJECTED) {
    test(`rejects ${field}: ${JSON.stringify(over[field])}`, () => {
      const check = validateEventBasics(base(over), NOW);
      assert.equal(check.valid, false);
      assert.deepEqual(Object.keys(check.errors), [field]);
      assert.ok(check.errors[field].length > 10);
      assert.throws(() => build(over), (err) => field in err.fields);
    });
  }

  const ACCEPTED = [
    { name: long(80) }, { date: '2026-10-28' }, { date: TODAY }, { date: '2031-10-29' },
    { guests: 1 }, { guests: 5000 }, { capacity: 1 }, { capacity: 100000 }, { budget: 0.01 }, { budget: 10000000 }
  ];
  for (const over of ACCEPTED) {
    test(`accepts boundary ${JSON.stringify(over)}`, () => {
      assert.equal(validateEventBasics(base(over), NOW).valid, true);
    });
  }

  test('reports every invalid field at once', () => {
    const check = validateEventBasics({}, NOW);
    assert.deepEqual(Object.keys(check.errors), ['type', 'name', 'date', 'guests', 'capacity', 'budget']);
  });

  test('isOverCapacity is false until both numbers are valid', () => {
    assert.equal(isOverCapacity('200', '150'), true);
    assert.equal(isOverCapacity('150', '150'), false);
    assert.equal(isOverCapacity('', '150'), false);
    assert.equal(isOverCapacity('200', 'abc'), false);
  });
});
