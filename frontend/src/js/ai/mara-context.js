/**
 * @file mara-context.js
 * @description Builds the compact event context sent to Mara (and used by the offline planner).
 */

import { calculateBudgetSummary } from '../domain/budget.js';
import { evaluateEventRisks } from '../domain/risks.js';

const MAX_TASKS = 5;

/** The next few open milestones by due date. */
function nextOpenTasks(event) {
  return (event.tasks || [])
    .filter(t => t.status !== 'done')
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
    .slice(0, MAX_TASKS)
    .map(t => ({ id: t.id, title: t.title, due_date: t.due_date, priority: t.priority }));
}

/** The event facts sent with every Mara request: identity, budget summary, active risks and the next open tasks. */
export function buildMaraContext(event) {
  return {
    event: { id: event.id, name: event.name, expected_guests: event.expected_guests },
    budget: calculateBudgetSummary(event),
    risks: evaluateEventRisks(event).risks,
    tasks: nextOpenTasks(event)
  };
}
