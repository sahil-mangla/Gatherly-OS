/**
 * @file event-update.test.js
 * @description updateEventBasics: revalidation, capacity-risk flips and date shifting.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEventFromTemplate, updateEventBasics } from '../src/js/domain/event-factory.js';
import { evaluateEventRisks } from '../src/js/domain/risks.js';
import { syncEventSchedule, daysBetween } from '../src/js/domain/event-dates.js';
import { parseDate } from '../src/js/domain/timeline-dates.js';
import { INITIAL_TEMPLATES } from '../src/js/templates.js';

const NOW = new Date(2026, 9, 29, 12);
const TODAY = '2026-10-29';
const base = (over = {}) => ({ type: 'wedding', name: 'Priya & Sam', date: '2027-03-20', guests: '120', capacity: '150', budget: '24000.01', ...over });
const build = (over, now = NOW) => createEventFromTemplate(base(over), INITIAL_TEMPLATES, now);
const templateFor = (type) => Object.values(INITIAL_TEMPLATES).find(t => t.type === type);
const hasCapacityRisk = (event) => evaluateEventRisks(event).risks.some(r => r.id === 'risk-capacity-breach');

describe('updateEventBasics', () => {
  test('capacity risk appears and disappears as guests/capacity change', () => {
    const event = build({ guests: 100, capacity: 150 });
    assert.equal(hasCapacityRisk(event), false);
    updateEventBasics(event, { capacity: '80' }, NOW);
    assert.equal(event.venue_capacity, 80);
    assert.equal(hasCapacityRisk(event), true);
    updateEventBasics(event, { guests: '70' }, NOW);
    assert.equal(hasCapacityRisk(event), false);
    updateEventBasics(event, { guests: '90', capacity: '90' }, NOW);
    assert.equal(hasCapacityRisk(event), false, 'equal is within capacity');
    updateEventBasics(event, { guests: '91' }, NOW);
    assert.equal(hasCapacityRisk(event), true);
  });

  test('an invalid edit changes nothing', () => {
    const event = build();
    const before = JSON.stringify(event);
    assert.throws(() => updateEventBasics(event, { name: 'Fine', guests: 0, budget: -1 }, NOW), (err) => 'guests' in err.fields && 'budget' in err.fields);
    assert.equal(JSON.stringify(event), before);
  });

  test('updates name and budget with trimming', () => {
    const event = build();
    updateEventBasics(event, { name: '  Renamed  ', budget: '30000' }, NOW);
    assert.deepEqual([event.name, event.total_budget], ['Renamed', 30000]);
  });

  test('a new date shifts every task by the same number of days and pins the schedule', () => {
    const event = build({ date: '2027-03-20' });
    const before = event.tasks.map(t => t.due_date);
    updateEventBasics(event, { date: '2027-03-27' }, NOW);
    assert.equal(event.date, '2027-03-27');
    event.tasks.forEach((t, i) => assert.equal(daysBetween(parseDate(before[i]), parseDate(t.due_date)), 7));
    assert.equal(event.fixed_date, true);
    assert.equal(event.schedule_anchor, undefined);
  });

  test('moving the date earlier clamps still-open tasks to today instead of the past', () => {
    const event = build({ date: '2027-03-20' });
    updateEventBasics(event, { date: '2026-11-20' }, NOW);
    assert.ok(event.tasks.every(t => t.due_date >= TODAY), event.tasks.map(t => t.due_date).join());
  });

  test('an unchanged date is not re-judged, so past events stay editable', () => {
    const event = build();
    event.date = '2020-01-01';
    updateEventBasics(event, { date: '2020-01-01', guests: '60' }, NOW);
    assert.equal(event.expected_guests, 60);
    assert.throws(() => updateEventBasics(event, { date: '2020-02-02' }, NOW), (err) => 'date' in err.fields);
  });

  test('a user-set date on a seeded event stops the weekly schedule roll', () => {
    const seed = structuredClone(templateFor('wedding'));
    seed.date = '2027-03-20';
    assert.equal(syncEventSchedule(structuredClone(seed), new Date(2027, 5, 1), INITIAL_TEMPLATES), true, 'still rolls without the flag');
    updateEventBasics(seed, { date: '2027-04-03' }, NOW);
    assert.equal(syncEventSchedule(seed, new Date(2027, 5, 1), INITIAL_TEMPLATES), false);
    assert.equal(seed.date, '2027-04-03');
  });
});
