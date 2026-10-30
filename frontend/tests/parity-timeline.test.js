/**
 * @file parity-timeline.test.js
 * @description JS side of the parity suite: progress, task validation, cycles and rescheduling.
 */

import { test } from 'node:test';
import {
  calculateTimelineProgress,
  checkCircularDependencies,
  evaluateReschedule,
  validateTask
} from '../src/js/domain/timeline.js';
import { runFixture } from './parity-domain-support.js';

const cycles = (tasks) => {
  const [hasCycle, path] = checkCircularDependencies(tasks);
  return { has_cycle: hasCycle, path };
};

runFixture(test, 'progress', ({ tasks, ref_date: refDate }) => calculateTimelineProgress(tasks, refDate));
runFixture(test, 'tasks', validateTask);
runFixture(test, 'cycles', cycles);
runFixture(test, 'reschedule', ({ tasks, task_id: id, new_date: date }) => evaluateReschedule(tasks, id, date));
