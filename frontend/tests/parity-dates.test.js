/**
 * @file parity-dates.test.js
 * @description JS side of the parity suite: date parsing and the anchored event schedule.
 */

import { test } from 'node:test';
import { syncEventSchedule, toIsoDate } from '../src/js/domain/event-dates.js';
import { parseDate } from '../src/js/domain/timeline-dates.js';
import { runFixture } from './parity-domain-support.js';

const localDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

function sync({ event, today }) {
  const changed = syncEventSchedule(event, localDate(today));
  return { changed, event };
}

runFixture(test, 'dates', (value) => {
  const parsed = parseDate(value);
  return parsed ? toIsoDate(parsed) : null;
});
runFixture(test, 'schedule', sync);
