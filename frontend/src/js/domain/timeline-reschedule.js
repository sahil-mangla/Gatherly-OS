/**
 * @file timeline-reschedule.js
 * @description Dependency precedence evaluation and collision detector for milestone rescheduling.
 */

import { parseDate } from './timeline-dates.js';

/** Builds prerequisite id -> dependent tasks (in task order) once, so traversal is O(n + e). */
export function buildDependentsMap(tasks) {
  const dependents = new Map();
  for (const task of tasks || []) {
    if (!task || !Array.isArray(task.depends_on)) continue;
    for (const prereqId of new Set(task.depends_on)) {
      if (!dependents.has(prereqId)) dependents.set(prereqId, []);
      dependents.get(prereqId).push(task);
    }
  }
  return dependents;
}

/** Breadth-first walk of everything downstream of `rootId`, each task visited once. */
export function collectDependents(dependentsMap, rootId) {
  const queue = [...(dependentsMap.get(rootId) || [])];
  const visited = new Set();
  const ordered = [];

  for (let i = 0; i < queue.length; i++) {
    const dep = queue[i];
    if (!dep || !dep.id || visited.has(dep.id)) continue;
    visited.add(dep.id);
    ordered.push(dep);
    queue.push(...(dependentsMap.get(dep.id) || []));
  }
  return ordered;
}

function fixedDeadlineConflict(task) {
  return {
    type: 'fixed_deadline_override',
    task_id: task.id,
    title: task.title,
    severity: 'warning',
    message: `'${task.title}' is designated as a fixed deadline.`
  };
}

function precedenceConflict(dep, target, newDateStr) {
  return {
    type: 'dependency_precedence_violation',
    dependent_id: dep.id,
    dependent_title: dep.title,
    prerequisite_id: target.id,
    prerequisite_title: target.title,
    severity: dep.is_fixed_deadline ? 'critical' : 'warning',
    message: `Dependent task '${dep.title}' (${dep.due_date}) would be due on or before prerequisite '${target.title}' (${newDateStr}).`
  };
}

function collidesWith(dep, newDate) {
  const depDue = parseDate(dep.due_date);
  return Boolean(depDue) && depDue <= newDate;
}

/** Evaluates moving a task's due date and detects the downstream collisions it would cause. */
export function evaluateReschedule(tasks, taskId, newDateStr) {
  const targetTask = (tasks || []).find(t => t.id === taskId);
  if (!targetTask) throw new Error(`Task with id '${taskId}' not found.`);

  const newDate = parseDate(newDateStr);
  if (!newDate) throw new Error(`Invalid target date: '${newDateStr}'`);

  const impacted = collectDependents(buildDependentsMap(tasks), taskId);
  const conflicts = [
    ...(targetTask.is_fixed_deadline ? [fixedDeadlineConflict(targetTask)] : []),
    ...impacted
      .filter(dep => collidesWith(dep, newDate))
      .map(dep => precedenceConflict(dep, targetTask, newDateStr))
  ];

  return {
    task_id: taskId,
    original_date: targetTask.due_date,
    proposed_date: newDateStr,
    has_conflicts: conflicts.length > 0,
    conflicts,
    impacted_dependents_count: impacted.length,
    impacted_dependents: impacted.map(d => ({ id: d.id, title: d.title, due_date: d.due_date }))
  };
}
