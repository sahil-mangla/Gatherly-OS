/**
 * @file dependencies.js
 * @description Milestone dependency helpers: what blocks a task, what it unblocks, and draft validation.
 */

import { checkCircularDependencies, validateTask } from './timeline.js';
import { parseDate } from './timeline-dates.js';

const DRAFT_ID = '__new-milestone__';

const depIds = (task) => (Array.isArray(task && task.depends_on) ? task.depends_on : []);
const isOpen = (task) => task.status !== 'done';
const quoted = (task) => `“${task.title}”`;

function dayText(isoDate) {
  const d = parseDate(isoDate);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : String(isoDate);
}

/** Dependencies of `task` that are not finished yet, in the order the task lists them. */
export function unfinishedDependencies(task, tasks) {
  const wanted = new Set(depIds(task));
  return tasks.filter(t => wanted.has(t.id) && isOpen(t));
}

/** Unfinished tasks that list `task` as a dependency. */
export function dependentsOf(task, tasks) {
  return tasks.filter(t => isOpen(t) && depIds(t).includes(task.id));
}

function closureOf(ids, byId) {
  const seen = new Set();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop();
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    queue.push(...depIds(byId.get(id)));
  }
  return seen;
}

function cycleProblem(tasks, draft, byId) {
  const [hasCycle, path] = checkCircularDependencies([...tasks, { ...draft, id: DRAFT_ID }]);
  if (!hasCycle) return null;
  const reachable = closureOf(depIds(draft), byId);
  const offender = path.find(id => reachable.has(id));
  if (!offender) return null;
  const names = path.filter(id => byId.has(id)).map(id => quoted(byId.get(id))).join(' → ');
  return { offender, message: `${quoted(byId.get(offender))} is stuck in a circular dependency (${names}), so this milestone could never be unblocked. Remove it from the list.` };
}

function lateProblem(draft, byId) {
  const day = (value) => String(value).slice(0, 10);
  const late = depIds(draft)
    .map(id => byId.get(id))
    .find(dep => dep.due_date && draft.due_date && day(dep.due_date) > day(draft.due_date));
  if (!late) return null;
  return {
    offender: late.id,
    message: `${quoted(late)} is due ${dayText(late.due_date)}, after this milestone’s due date of ${dayText(draft.due_date)}. Pick a later due date or remove that dependency.`
  };
}

/**
 * Validates a milestone that is about to be added: field rules plus its dependencies.
 * @param {Object[]} tasks the event's existing tasks
 * @param {Object} draft candidate task (title, due_date, depends_on...)
 * @returns {{valid:boolean, errors:string[], offender:string|null}} offender is the id of the dependency to blame
 */
export function validateNewTask(tasks, draft) {
  const base = validateTask(draft);
  if (!base.valid) return { ...base, offender: null };
  const byId = new Map(tasks.map(t => [t.id, t]));
  const unknown = depIds(draft).find(id => !byId.has(id));
  if (unknown) return { valid: false, errors: [`Unknown dependency “${unknown}”.`], offender: unknown };
  const problem = lateProblem(draft, byId) || cycleProblem(tasks, draft, byId);
  return problem
    ? { valid: false, errors: [problem.message], offender: problem.offender }
    : { valid: true, errors: [], offender: null };
}
