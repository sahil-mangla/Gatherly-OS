/**
 * @file timeline.js
 * @description Directed Acyclic Graph (DAG) task scheduler and dependency resolver for Gatherly client.
 */

import { parseDate } from './timeline-dates.js';
import { evaluateReschedule } from './timeline-reschedule.js';

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];
export const TASK_STATUSES = ['todo', 'in_progress', 'done'];

export { parseDate, evaluateReschedule };

const isBlank = (value) => !value || typeof value !== 'string' || !value.trim();

function enumError(label, value, allowed) {
  if (!value || allowed.includes(value)) return [];
  return [`Invalid ${label} '${value}'. Allowed: ${allowed.join(', ')}`];
}

export function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    return { valid: false, errors: ['Task must be an object.'] };
  }

  const errors = [
    ...(isBlank(task.title) ? ['Task title is required.'] : []),
    ...(!task.due_date || !parseDate(String(task.due_date))
      ? ['Valid due_date in YYYY-MM-DD format is required.']
      : []),
    ...enumError('priority', task.priority, TASK_PRIORITIES),
    ...enumError('status', task.status, TASK_STATUSES)
  ];

  return { valid: errors.length === 0, errors };
}

export function checkCircularDependencies(tasks) {
  const taskMap = new Map();
  for (const t of tasks) {
    if (t && t.id) taskMap.set(t.id, t);
  }

  const visited = new Set();
  const recursionStack = new Set();

  function dfs(taskId, path) {
    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const task = taskMap.get(taskId) || {};
    const deps = Array.isArray(task.depends_on) ? task.depends_on : [];

    for (const depId of deps) {
      if (!taskMap.has(depId)) continue;
      if (!visited.has(depId)) {
        const [hasCycle, cyclePath] = dfs(depId, path);
        if (hasCycle) return [true, cyclePath];
      } else if (recursionStack.has(depId)) {
        return [true, [...path, depId]];
      }
    }

    recursionStack.delete(taskId);
    path.pop();
    return [false, []];
  }

  for (const t of tasks) {
    if (t && t.id && !visited.has(t.id)) {
      const [hasCycle, cyclePath] = dfs(t.id, []);
      if (hasCycle) return [true, cyclePath];
    }
  }

  return [false, []];
}

function resolveRefDate(refDateStr) {
  const refDate = (refDateStr && parseDate(refDateStr)) || new Date();
  refDate.setHours(0, 0, 0, 0);
  return refDate;
}

/** Counts task statuses and buckets unfinished dated tasks into overdue / upcoming. */
function tallyTasks(taskList, refDate) {
  const tally = { completed: 0, inProgress: 0, todo: 0, overdue: [], upcoming: [] };
  for (const t of taskList) {
    if (!t || typeof t !== 'object') continue;
    const status = t.status || 'todo';
    if (status === 'done') {
      tally.completed++;
      continue;
    }
    if (status === 'in_progress') tally.inProgress++;
    else tally.todo++;

    const due = parseDate(t.due_date);
    if (due) (due < refDate ? tally.overdue : tally.upcoming).push(t);
  }
  return tally;
}

export function calculateTimelineProgress(tasks = [], refDateStr = null) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const total = taskList.length;
  const tally = tallyTasks(taskList, resolveRefDate(refDateStr));

  tally.upcoming.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));

  return {
    total,
    completed: tally.completed,
    in_progress: tally.inProgress,
    todo: tally.todo,
    percent_complete: total > 0 ? Math.round((tally.completed / total) * 100) : 0,
    overdue_tasks: tally.overdue,
    next_task: tally.upcoming[0] || null,
    upcoming_tasks: tally.upcoming
  };
}
