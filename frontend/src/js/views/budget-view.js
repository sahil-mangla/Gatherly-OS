/**
 * @file budget-view.js
 * @description Budget view renderer showing category allocations, overruns, and expense records.
 */

import { formatMoney } from '../domain/budget.js';
import { renderWhatIfPanel } from '../components/whatif-panel.js';
import { setProgress } from '../a11y.js';
import { createViewContext } from './context.js';
import { prettyLabel } from '../format.js';
import { capitalize, escapeHtml, setHtml, setText } from './helpers.js';

const CATEGORY_COLORS = {
  venue: '#f47b63',
  catering: '#e3a449',
  design: '#799f83',
  photo_music: '#927b9d',
  contingency: '#ddb04d',
  other: '#817783'
};
const DEFAULT_COLOR = '#f47b63';
const PAID_STATUSES = ['paid'];

function renderOverviewBar({ budget, cur }) {
  const pct = budget.percent_committed;
  setHtml('budget-big-number', `${escapeHtml(formatMoney(budget.total_allocated, cur))} <small>allocated of ${escapeHtml(formatMoney(budget.total_budget, cur))}</small>`);
  const bar = document.getElementById('budget-big-bar');
  if (bar) bar.style.width = `${Math.min(100, pct)}%`;
  setProgress(document.getElementById('budget-big-track'), {
    now: pct,
    label: 'Budget committed',
    valuetext: `${pct}% of the budget is committed`
  });
  setText('budget-committed-label', `${pct}% committed`);

  const available = document.getElementById('budget-available-label');
  if (!available) return;
  available.className = budget.is_over_budget ? 'is-deficit' : 'is-ok';
  available.innerHTML = budget.is_over_budget
    ? `<span aria-hidden="true">⚠</span> Deficit: ${escapeHtml(formatMoney(budget.deficit_amount, cur))}`
    : `${escapeHtml(formatMoney(budget.remaining_uncommitted, cur))} available`;
}

function categoryHtml(key, data, cur) {
  const color = CATEGORY_COLORS[key] || DEFAULT_COLOR;
  const width = data.planned > 0 ? Math.min(100, Math.round((data.allocated / data.planned) * 100)) : 0;
  const note = data.is_overrun
    ? `<span aria-hidden="true">⚠</span> Overrun by ${escapeHtml(formatMoney(data.variance, cur))}`
    : `Planned: ${escapeHtml(formatMoney(data.planned, cur))}`;
  return `
    <div class="category">
      <div class="category-head">
        <span class="category-dot" aria-hidden="true" style="background:${color}"></span>
        <h3>${escapeHtml(prettyLabel(key))}</h3>
        <small>${data.percent_of_budget}% of total budget</small>
      </div>
      <strong>${escapeHtml(formatMoney(data.allocated, cur))}</strong>
      <div class="tiny-bar" aria-hidden="true"><span style="width:${width}%;background:${color}"></span></div>
      <small class="category-note ${data.is_overrun ? 'is-overrun' : ''}">${note}</small>
    </div>`;
}

function renderCategories({ budget, cur }) {
  const html = Object.entries(budget.categories)
    .filter(([, data]) => data.planned !== 0 || data.allocated !== 0)
    .map(([key, data]) => categoryHtml(key, data, cur))
    .join('');
  setHtml('budget-category-grid', html);
}

function expenseRowHtml(exp, cur) {
  const status = PAID_STATUSES.includes(exp.status) ? 'paid' : 'pending';
  const category = prettyLabel(exp.category, 'Other');
  const amount = (exp.actual_amount || 0) + (exp.committed_amount || 0);
  return `
    <tr>
      <th scope="row"><b>${escapeHtml(exp.description)}</b><small>Planned ${escapeHtml(formatMoney(exp.planned_amount || 0, cur))}</small></th>
      <td data-label="Category">${escapeHtml(category)}</td>
      <td data-label="Status"><span class="pill ${status}">${escapeHtml(capitalize(exp.status || 'pending'))}</span></td>
      <td class="num"><strong>${escapeHtml(formatMoney(amount, cur))}</strong></td>
    </tr>`;
}

function renderExpenses({ event, cur }) {
  const expenses = event.expenses || [];
  setHtml('budget-table-rows', expenses.length === 0
    ? '<tr><td colspan="4" class="table-empty">No expense records added yet.</td></tr>'
    : expenses.map(exp => expenseRowHtml(exp, cur)).join(''));
}

export function renderBudget(ctx = createViewContext()) {
  renderOverviewBar(ctx);
  renderCategories(ctx);
  renderExpenses(ctx);
  renderWhatIfPanel(ctx);
}
