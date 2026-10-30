/**
 * @file actions.js
 * @description Pure transactional mutations and proposal state applicators for Gatherly EventStore.
 */

import { validateExpenseInput } from '../domain/budget.js';
import { validateNewTask } from '../domain/dependencies.js';
import { IDEA_TASK_LEAD_DAYS } from '../domain/constants.js';
import { makeId, toAmount, orElse, asArray, pushTo } from './helpers.js';

export { applyProposalAction } from './proposals.js';

const IDEA_COLORS = ['idea-yellow', 'idea-coral', 'idea-green', 'idea-pink'];

function failIfInvalid(label, validation) {
  if (!validation.valid) {
    throw new Error(`${label} validation failed: ${validation.errors.join(', ')}`);
  }
}

function defaultExpenseStatus(rawExpense) {
  return rawExpense.actual_amount > 0 ? 'paid' : 'pending';
}

export function addExpenseAction(event, rawExpense) {
  failIfInvalid('Expense', validateExpenseInput(rawExpense));

  return pushTo(event, 'expenses', {
    id: makeId('exp'),
    category: orElse(rawExpense.category, 'other'),
    description: rawExpense.description.trim(),
    planned_amount: toAmount(rawExpense.planned_amount),
    actual_amount: toAmount(rawExpense.actual_amount),
    committed_amount: toAmount(rawExpense.committed_amount),
    status: orElse(rawExpense.status, defaultExpenseStatus(rawExpense)),
    cost_per_guest: toAmount(rawExpense.cost_per_guest),
    vendor_id: orElse(rawExpense.vendor_id, null)
  });
}

export function addTaskAction(event, rawTask) {
  failIfInvalid('Task', validateNewTask(event.tasks || [], rawTask));

  return pushTo(event, 'tasks', {
    id: makeId('task'),
    title: rawTask.title.trim(),
    category: orElse(rawTask.category, 'General'),
    due_date: rawTask.due_date,
    status: orElse(rawTask.status, 'todo'),
    priority: orElse(rawTask.priority, 'medium'),
    depends_on: asArray(rawTask.depends_on),
    is_fixed_deadline: Boolean(rawTask.is_fixed_deadline)
  });
}

export function addVendorAction(event, rawVendor) {
  if (!rawVendor.name) throw new Error('Vendor name is required.');

  return pushTo(event, 'vendors', {
    id: makeId('ven'),
    name: rawVendor.name.trim(),
    category: orElse(rawVendor.category, 'General'),
    status: orElse(rawVendor.status, 'shortlist'),
    quoted_amount: toAmount(rawVendor.quoted_amount),
    deposit_paid: toAmount(rawVendor.deposit_paid),
    avatar_emoji: orElse(rawVendor.avatar_emoji, '🤝'),
    summary: orElse(rawVendor.summary, ''),
    inclusions: asArray(rawVendor.inclusions),
    exclusions: asArray(rawVendor.exclusions),
    notes: orElse(rawVendor.notes, ''),
    ...(Array.isArray(rawVendor.quotes) && rawVendor.quotes.length > 0 ? { quotes: rawVendor.quotes } : {})
  });
}

export function addIdeaAction(event, rawIdea) {
  if (!rawIdea.title || !rawIdea.description) {
    throw new Error('Idea title and description are required.');
  }

  const newIdea = {
    id: makeId('idea'),
    title: rawIdea.title.trim(),
    description: rawIdea.description.trim(),
    author: orElse(rawIdea.author, 'You'),
    date_added: 'Just now',
    bg_color: IDEA_COLORS[Math.floor(Math.random() * IDEA_COLORS.length)],
    estimated_cost: toAmount(rawIdea.estimated_cost),
    converted_task_id: null,
    requirements: orElse(rawIdea.requirements, '')
  };

  event.ideas = event.ideas || [];
  event.ideas.unshift(newIdea);
  return newIdea;
}

export function convertIdeaToTaskAction(event, ideaId) {
  const idea = (event.ideas || []).find(i => i.id === ideaId);
  if (!idea) throw new Error('Idea not found.');

  const existing = (event.tasks || []).find(t => t.id === idea.converted_task_id);
  if (idea.converted_task_id && existing) return { idea, task: existing };

  const due = new Date();
  due.setDate(due.getDate() + IDEA_TASK_LEAD_DAYS);

  const newTask = pushTo(event, 'tasks', {
    id: makeId('task-from-idea'),
    title: `Implement Idea: ${idea.title}`,
    category: 'Creative Spark',
    due_date: due.toISOString().split('T')[0],
    status: 'todo',
    priority: 'medium',
    depends_on: [],
    is_fixed_deadline: false
  });
  idea.converted_task_id = newTask.id;
  return { idea, task: newTask };
}
