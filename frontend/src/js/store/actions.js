/**
 * @file actions.js
 * @description Pure transactional mutations and proposal state applicators for Gatherly EventStore.
 */

import { validateExpenseInput } from '../domain/budget.js';
import { validateTask } from '../domain/timeline.js';

export function addExpenseAction(event, rawExpense) {
  const validation = validateExpenseInput(rawExpense);
  if (!validation.valid) {
    throw new Error(`Expense validation failed: ${validation.errors.join(', ')}`);
  }

  const newExpense = {
    id: `exp-${Date.now()}`,
    category: rawExpense.category || 'other',
    description: rawExpense.description.trim(),
    planned_amount: Number(rawExpense.planned_amount || 0),
    actual_amount: Number(rawExpense.actual_amount || 0),
    committed_amount: Number(rawExpense.committed_amount || 0),
    status: rawExpense.status || (rawExpense.actual_amount > 0 ? 'paid' : 'pending'),
    cost_per_guest: Number(rawExpense.cost_per_guest || 0),
    vendor_id: rawExpense.vendor_id || null
  };

  event.expenses = event.expenses || [];
  event.expenses.push(newExpense);
  return newExpense;
}

export function addTaskAction(event, rawTask) {
  const validation = validateTask(rawTask);
  if (!validation.valid) {
    throw new Error(`Task validation failed: ${validation.errors.join(', ')}`);
  }

  const newTask = {
    id: `task-${Date.now()}`,
    title: rawTask.title.trim(),
    category: rawTask.category || 'General',
    due_date: rawTask.due_date,
    status: rawTask.status || 'todo',
    priority: rawTask.priority || 'medium',
    depends_on: Array.isArray(rawTask.depends_on) ? rawTask.depends_on : [],
    is_fixed_deadline: Boolean(rawTask.is_fixed_deadline)
  };

  event.tasks = event.tasks || [];
  event.tasks.push(newTask);
  return newTask;
}

export function addVendorAction(event, rawVendor) {
  if (!rawVendor.name) {
    throw new Error('Vendor name is required.');
  }

  const newVendor = {
    id: `ven-${Date.now()}`,
    name: rawVendor.name.trim(),
    category: rawVendor.category || 'General',
    status: rawVendor.status || 'shortlist',
    quoted_amount: Number(rawVendor.quoted_amount || 0),
    deposit_paid: Number(rawVendor.deposit_paid || 0),
    avatar_emoji: rawVendor.avatar_emoji || '🤝',
    summary: rawVendor.summary || '',
    inclusions: Array.isArray(rawVendor.inclusions) ? rawVendor.inclusions : [],
    exclusions: Array.isArray(rawVendor.exclusions) ? rawVendor.exclusions : [],
    notes: rawVendor.notes || ''
  };

  event.vendors = event.vendors || [];
  event.vendors.push(newVendor);
  return newVendor;
}

export function addIdeaAction(event, rawIdea) {
  if (!rawIdea.title || !rawIdea.description) {
    throw new Error('Idea title and description are required.');
  }

  const colors = ['idea-yellow', 'idea-coral', 'idea-green', 'idea-pink'];
  const chosenColor = colors[Math.floor(Math.random() * colors.length)];

  const newIdea = {
    id: `idea-${Date.now()}`,
    title: rawIdea.title.trim(),
    description: rawIdea.description.trim(),
    author: rawIdea.author || 'You',
    date_added: 'Just now',
    bg_color: chosenColor,
    estimated_cost: Number(rawIdea.estimated_cost || 0),
    converted_task_id: null,
    requirements: rawIdea.requirements || ''
  };

  event.ideas = event.ideas || [];
  event.ideas.unshift(newIdea);
  return newIdea;
}

export function convertIdeaToTaskAction(event, ideaId) {
  const idea = (event.ideas || []).find(i => i.id === ideaId);
  if (!idea) throw new Error('Idea not found.');

  const due = new Date();
  due.setDate(due.getDate() + 14);
  const dueIso = due.toISOString().split('T')[0];

  const newTask = {
    id: `task-from-idea-${Date.now()}`,
    title: `Implement Idea: ${idea.title}`,
    category: 'Creative Spark',
    due_date: dueIso,
    status: 'todo',
    priority: 'medium',
    depends_on: [],
    is_fixed_deadline: false
  };

  idea.converted_task_id = newTask.id;
  event.tasks = event.tasks || [];
  event.tasks.push(newTask);
  return { idea, task: newTask };
}

export function applyProposalAction(event, proposal) {
  if (!proposal || !proposal.action) {
    throw new Error('Invalid proposal payload.');
  }

  if (proposal.action === 'reallocate') {
    const fromCat = proposal.from_category;
    const toCat = proposal.to_category;
    const amount = Number(proposal.amount || 0);

    if (!fromCat || !toCat || amount <= 0) {
      throw new Error('Reallocation requires valid from_category, to_category, and positive amount.');
    }

    const fromExp = (event.expenses || []).find(e => e.category === fromCat);
    const toExp = (event.expenses || []).find(e => e.category === toCat);

    if (fromExp) fromExp.planned_amount = Math.max(0, fromExp.planned_amount - amount);
    if (toExp) toExp.planned_amount += amount;

    return { success: true, message: `Reallocated $${amount.toLocaleString()} from ${fromCat} to ${toCat}.` };
  }

  if (proposal.action === 'update_expense') {
    const cat = proposal.category;
    const savings = Number(proposal.savings || 0);
    const targetExp = (event.expenses || []).find(e => e.category === cat);
    if (targetExp && savings > 0) {
      targetExp.planned_amount = Math.max(0, targetExp.planned_amount - savings);
      return { success: true, message: `Saved $${savings.toLocaleString()} on ${cat}.` };
    }
  }

  if (proposal.action === 'custom') {
    const newTask = {
      id: `task-${Date.now()}`,
      title: proposal.title || 'Implement Mara recommendation',
      category: 'Action',
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      status: 'todo',
      priority: 'high',
      depends_on: [],
      is_fixed_deadline: false
    };
    event.tasks = event.tasks || [];
    event.tasks.push(newTask);
    return { success: true, message: `Created follow-up task: "${proposal.title}".`, task: newTask };
  }

  throw new Error(`Unsupported proposal action: "${proposal.action}"`);
}
