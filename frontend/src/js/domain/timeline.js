/**
 * @file timeline.js
 * @description Directed Acyclic Graph (DAG) task scheduler and dependency resolver for Gatherly client.
 */

import { parseDate } from './timeline-dates.js';
import { evaluateReschedule } from './timeline-reschedule.js';

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];
export const TASK_STATUSES = ['todo', 'in_progress', 'done'];

export { parseDate, evaluateReschedule };

export function validateTask(task) {
  const errors = [];
  if (!task || typeof task !== 'object') {
    return { valid: false, errors: ['Task must be an object.'] };
  }

  const title = task.title;
  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('Task title is required.');
  }

  const dueDate = task.due_date;
  if (!dueDate || !parseDate(String(dueDate))) {
    errors.push('Valid due_date in YYYY-MM-DD format is required.');
  }

  const prio = task.priority;
  if (prio && !TASK_PRIORITIES.includes(prio)) {
    errors.push(`Invalid priority '${prio}'. Allowed: ${TASK_PRIORITIES.join(', ')}`);
  }

  const status = task.status;
  if (status && !TASK_STATUSES.includes(status)) {
    errors.push(`Invalid status '${status}'. Allowed: ${TASK_STATUSES.join(', ')}`);
  }

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

export function calculateTimelineProgress(tasks = [], refDateStr = null) {
  const refDate = refDateStr ? parseDate(refDateStr) || new Date() : new Date();
  refDate.setHours(0, 0, 0, 0);

  const taskList = Array.isArray(tasks) ? tasks : [];
  const total = taskList.length;
  let completed = 0;
  let inProgress = 0;
  let todo = 0;
  const overdueTasks = [];
  const upcomingTasks = [];

  for (const t of taskList) {
    if (!t || typeof t !== 'object') continue;
    const status = t.status || 'todo';
    if (status === 'done') {
      completed++;
    } else {
      if (status === 'in_progress') {
        inProgress++;
      } else {
        todo++;
      }

      const due = parseDate(t.due_date);
      if (due) {
        if (due < refDate) {
          overdueTasks.push(t);
        } else {
          upcomingTasks.push(t);
        }
      }
    }
  }

  upcomingTasks.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    in_progress: inProgress,
    todo,
    percent_complete: percentComplete,
    overdue_tasks: overdueTasks,
    next_task: upcomingTasks[0] || null,
    upcoming_tasks: upcomingTasks
  };
}
