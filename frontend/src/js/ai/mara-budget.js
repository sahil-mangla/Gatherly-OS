/**
 * @file mara-budget.js
 * @description Offline savings proposals computed only from the event's own budget: unspent = planned - spent
 * per category, money moves FROM a category with room TO a category that is over its plan, and trims are a
 * percentage of the category's PLANNED amount.
 */

import { formatDollars as money, prettyLabel } from '../format.js';

export const ROUND_TO = 10;
export const MAX_MOVE = 1200;
export const SHARE_OF_UNSPENT = 0.5;
export const TRIM_PERCENT = 10;
export const MAX_REALLOCATIONS = 2;
const PERCENT = 100;
const BUFFER_CATEGORY = 'contingency';

const roundDown = (n) => Math.floor(n / ROUND_TO) * ROUND_TO;

/** Per-category planned / spent (paid plus committed) / unspent / over-plan figures from `calculateBudgetSummary`. */
export function categoryStats(budget) {
  return Object.entries((budget && budget.categories) || {})
    .map(([key, c]) => {
      const planned = Number(c.planned) || 0;
      const spent = Number(c.allocated) || 0;
      return { key, label: prettyLabel(key), planned, spent, unspent: Math.max(0, planned - spent), deficit: Math.max(0, spent - planned) };
    })
    .filter(s => s.planned > 0 || s.spent > 0);
}

function reallocationProposal(from, to, amount) {
  return {
    id: `prop-move-${from.key}-${to.key}`,
    action_type: 'rebalance_budget',
    from_category: from.key,
    to_category: to.key,
    category: to.key,
    amount,
    title: `Move ${money(amount)} from ${from.label} to ${to.label}`,
    description: `${from.label} has ${money(from.unspent)} unspent (planned ${money(from.planned)}, spent ${money(from.spent)}). ${to.label} is ${money(to.deficit)} over its ${money(to.planned)} plan.`,
    consequence: `${to.label} gets ${money(amount)} closer to covering what you have spent; ${from.label} still keeps ${money(from.unspent - amount)} unspent.`
  };
}

/** Largest-deficit categories first; each donor gives at most half its unspent amount, at most $1,200, rounded down to $10. */
export function planReallocations(stats) {
  const room = new Map(stats.map(s => [s.key, s.unspent]));
  const plans = [];
  const needy = stats.filter(s => s.deficit > 0).sort((a, b) => b.deficit - a.deficit);
  for (const to of needy) {
    const from = stats.filter(s => s.key !== to.key && room.get(s.key) > 0).sort((a, b) => room.get(b.key) - room.get(a.key))[0];
    const amount = from ? roundDown(Math.min(room.get(from.key) * SHARE_OF_UNSPENT, to.deficit, MAX_MOVE)) : 0;
    if (amount < ROUND_TO || plans.length >= MAX_REALLOCATIONS) continue;
    plans.push(reallocationProposal({ ...from, unspent: room.get(from.key) }, to, amount));
    room.set(from.key, room.get(from.key) - amount);
  }
  return { plans, room };
}

/** Trims TRIM_PERCENT of the PLANNED amount of the category with the most unspent money (never the contingency buffer). */
export function planTrim(stats, room) {
  const best = stats.filter(s => s.key !== BUFFER_CATEGORY && s.deficit === 0)
    .sort((a, b) => room.get(b.key) - room.get(a.key))[0];
  const cut = best ? roundDown((best.planned * TRIM_PERCENT) / PERCENT) : 0;
  if (!best || cut < ROUND_TO || cut > room.get(best.key)) return null;
  return {
    id: `prop-trim-${best.key}`,
    action_type: 'adjust_expense',
    category: best.key,
    delta_amount: -cut,
    title: `Trim ${TRIM_PERCENT}% from ${best.label}`,
    description: `${TRIM_PERCENT}% of the ${money(best.planned)} planned for ${best.label} is ${money(cut)}. You have spent ${money(best.spent)} there so far, so ${money(room.get(best.key))} is still unspent.`,
    consequence: `Frees ${money(cut)} in the plan while ${best.label} still covers the ${money(best.spent)} already spent or committed.`
  };
}

const NOTHING_TO_PROPOSE = 'I compared planned and spent amounts for every budget category. Nothing is over its plan and there is no unspent room worth trimming, so I have no savings changes to propose right now.';

export function costSavingResponse({ budget }) {
  const stats = categoryStats(budget);
  const { plans, room } = planReallocations(stats);
  const trim = planTrim(stats, room);
  const proposals = trim ? [...plans, trim] : plans;
  if (proposals.length === 0) return { operation: 'cost_saving_proposals', summary: NOTHING_TO_PROPOSE, response: NOTHING_TO_PROPOSE };
  return {
    operation: 'cost_saving_proposals',
    summary: `I compared planned and spent amounts per category and found ${proposals.length} adjustment${proposals.length === 1 ? '' : 's'} grounded in your numbers:`,
    proposals
  };
}
