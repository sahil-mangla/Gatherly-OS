/**
 * @file proposals.js
 * @description Mara proposal applicators: a handler map keyed by proposal action.
 */

import { PROPOSAL_TASK_LEAD_DAYS } from '../domain/constants.js';
import { formatDollars, prettyLabel } from '../format.js';
import { makeId, pushTo, isoDateFromNow } from './helpers.js';

const absAmount = (...candidates) => Math.abs(Number(candidates.find(Boolean) || 0));
const findByCategory = (event, category) => (event.expenses || []).find(e => e.category === category);

function addAllocationExpense(event, category, amount) {
  return pushTo(event, 'expenses', {
    id: makeId('exp'),
    category,
    description: `Allocation: ${category}`,
    planned_amount: amount,
    actual_amount: 0,
    committed_amount: 0,
    status: 'planned'
  });
}

function reallocateBudget(event, proposal) {
  const fromCat = proposal.from_category;
  const toCat = proposal.to_category || proposal.category;
  const amount = absAmount(proposal.amount, proposal.delta_amount);
  if (amount <= 0) throw new Error('Reallocation requires a positive amount.');

  const fromExp = findByCategory(event, fromCat);
  const toExp = findByCategory(event, toCat);
  if (fromExp) fromExp.planned_amount = Math.max(0, fromExp.planned_amount - amount);
  if (toExp) toExp.planned_amount += amount;
  else if (toCat) addAllocationExpense(event, toCat, amount);

  const source = fromCat ? `from ${prettyLabel(fromCat)} ` : '';
  return { success: true, message: `Reallocated ${formatDollars(amount)} ${source}to ${prettyLabel(toCat, 'budget')}.` };
}

function applySavings(event, proposal) {
  const cat = proposal.category;
  const savings = absAmount(proposal.savings, proposal.delta_amount);
  const targetExp = findByCategory(event, cat);
  if (targetExp && savings > 0) {
    targetExp.planned_amount = Math.max(0, targetExp.planned_amount - savings);
    return { success: true, message: `Saved ${formatDollars(savings)} on ${prettyLabel(cat)}.` };
  }
  return { success: true, message: `Applied savings of ${formatDollars(savings)} to ${prettyLabel(cat, 'event')}.` };
}

function createActionTask(event, proposal) {
  const task = pushTo(event, 'tasks', {
    id: makeId('task'),
    title: proposal.title || 'Implement Mara recommendation',
    category: 'Action',
    due_date: isoDateFromNow(PROPOSAL_TASK_LEAD_DAYS),
    status: 'todo',
    priority: 'high',
    depends_on: [],
    is_fixed_deadline: false
  });
  return { success: true, message: `Created task: "${task.title}".`, task };
}

export const PROPOSAL_HANDLERS = new Map([
  ['reallocate', reallocateBudget],
  ['rebalance_budget', reallocateBudget],
  ['update_expense', applySavings],
  ['adjust_expense', applySavings],
  ['custom', createActionTask],
  ['create_task', createActionTask],
  ['audit_vendors', createActionTask],
  ['review_risks', createActionTask]
]);

/** Applies an approved Mara proposal to the event and reports what changed. */
export function applyProposalAction(event, proposal) {
  if (!proposal || typeof proposal !== 'object') throw new Error('Invalid proposal payload.');

  const action = proposal.action || proposal.action_type || 'custom';
  const handler = PROPOSAL_HANDLERS.get(action);
  if (!handler) throw new Error(`Unsupported proposal action: "${action}"`);
  return handler(event, proposal);
}
