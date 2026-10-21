/**
 * @file timeline-reschedule.js
 * @description Dependency precedence evaluation and collision detector for milestone rescheduling.
 */

import { parseDate } from './timeline-dates.js';

export function evaluateReschedule(tasks, taskId, newDateStr) {
  const targetTask = (tasks || []).find(t => t.id === taskId);
  if (!targetTask) {
    throw new Error(`Task with id '${taskId}' not found.`);
  }

  const newDate = parseDate(newDateStr);
  if (!newDate) {
    throw new Error(`Invalid target date: '${newDateStr}'`);
  }

  const conflicts = [];
  const impactedDependents = [];

  if (targetTask.is_fixed_deadline) {
    conflicts.push({
      type: 'fixed_deadline_override',
      task_id: targetTask.id,
      title: targetTask.title,
      severity: 'warning',
      message: `'${targetTask.title}' is designated as a fixed deadline.`
    });
  }

  function findDependents(currentId) {
    return (tasks || []).filter(t => Array.isArray(t.depends_on) && t.depends_on.includes(currentId));
  }

  const queue = [...findDependents(taskId)];
  const visited = new Set();

  while (queue.length > 0) {
    const dep = queue.shift();
    if (!dep || !dep.id || visited.has(dep.id)) continue;
    visited.add(dep.id);

    const depDue = parseDate(dep.due_date);
    if (depDue && depDue <= newDate) {
      conflicts.push({
        type: 'dependency_precedence_violation',
        dependent_id: dep.id,
        dependent_title: dep.title,
        prerequisite_id: targetTask.id,
        prerequisite_title: targetTask.title,
        severity: dep.is_fixed_deadline ? 'critical' : 'warning',
        message: `Dependent task '${dep.title}' (${dep.due_date}) would be due on or before prerequisite '${targetTask.title}' (${newDateStr}).`
      });
    }

    impactedDependents.push(dep);
    queue.push(...findDependents(dep.id));
  }

  return {
    task_id: taskId,
    original_date: targetTask.due_date,
    proposed_date: newDateStr,
    has_conflicts: conflicts.length > 0,
    conflicts,
    impacted_dependents_count: impactedDependents.length,
    impacted_dependents: impactedDependents.map(d => ({
      id: d.id,
      title: d.title,
      due_date: d.due_date
    }))
  };
}
