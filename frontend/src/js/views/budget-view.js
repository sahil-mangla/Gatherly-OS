/**
 * @file budget-view.js
 * @description Budget view renderer showing category allocations, overruns, and expense records.
 */

import { store } from '../store.js';
import { calculateBudgetSummary, formatMoney } from '../domain/budget.js';
import { renderWhatIfPanel } from '../components/whatif-panel.js';
import { capitalize, escapeHtml } from './helpers.js';

export function renderBudget() {
  const event = store.getActiveEvent();
  const summary = calculateBudgetSummary(event);
  const cur = event.currency || '$';

  const bigNum = document.getElementById('budget-big-number');
  const bigBar = document.getElementById('budget-big-bar');
  const committedLabel = document.getElementById('budget-committed-label');
  const availableLabel = document.getElementById('budget-available-label');

  if (bigNum) bigNum.innerHTML = `${formatMoney(summary.total_allocated, cur)} <small>allocated of ${formatMoney(summary.total_budget, cur)}</small>`;
  if (bigBar) bigBar.style.width = `${Math.min(100, summary.percent_committed)}%`;
  if (committedLabel) committedLabel.innerText = `${summary.percent_committed}% committed`;
  if (availableLabel) {
    if (summary.is_over_budget) {
      availableLabel.style.color = '#d84534';
      availableLabel.innerText = `⚠️ Deficit: ${formatMoney(summary.deficit_amount, cur)}`;
    } else {
      availableLabel.style.color = '#a9d2a9';
      availableLabel.innerText = `${formatMoney(summary.remaining_uncommitted, cur)} available`;
    }
  }

  // Category Breakdown Grid
  const catGrid = document.getElementById('budget-category-grid');
  if (catGrid) {
    const catColors = {
      venue: '#f47b63',
      catering: '#e3a449',
      design: '#799f83',
      photo_music: '#927b9d',
      contingency: '#ddb04d',
      other: '#817783'
    };

    let gridHtml = '';
    for (const [catKey, catData] of Object.entries(summary.categories)) {
      if (catData.planned === 0 && catData.allocated === 0) continue;
      const color = catColors[catKey] || '#f47b63';
      const pctWidth = catData.planned > 0 ? Math.min(100, Math.round((catData.allocated / catData.planned) * 100)) : 0;

      gridHtml += `
        <div class="category">
          <div>
            <span class="category-dot" style="background:${color}"></span>
            <b>${capitalize(catKey.replace('_', ' '))}</b>
            <small>${catData.percent_of_budget}% of total budget</small>
          </div>
          <strong>${formatMoney(catData.allocated, cur)}</strong>
          <div class="tiny-bar"><span style="width:${pctWidth}%;background:${color}"></span></div>
          <small style="color:${catData.is_overrun ? '#d84534' : 'var(--muted)'}; font-size:10px; margin-top:6px; display:block;">
            ${catData.is_overrun ? `⚠️ Overrun by ${formatMoney(catData.variance, cur)}` : `Planned: ${formatMoney(catData.planned, cur)}`}
          </small>
        </div>
      `;
    }
    catGrid.innerHTML = gridHtml;
  }

  // Expense Activity Table
  const tableRows = document.getElementById('budget-table-rows');
  if (tableRows) {
    tableRows.innerHTML = '';
    const expenses = event.expenses || [];

    if (expenses.length === 0) {
      tableRows.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No expense records added yet.</div>';
    } else {
      expenses.forEach(exp => {
        const row = document.createElement('div');
        row.className = 'expense-row';
        const pillClass = exp.status === 'paid' ? 'pill paid' : 'pill pending';

        row.innerHTML = `
          <span><b>${escapeHtml(exp.description)}</b><small>Planned ${formatMoney(exp.planned_amount || 0, cur)}</small></span>
          <span>${capitalize((exp.category || 'other').replace('_', ' '))}</span>
          <span class="${pillClass}">${capitalize(exp.status || 'pending')}</span>
          <strong>${formatMoney((exp.actual_amount || 0) + (exp.committed_amount || 0), cur)}</strong>
        `;
        tableRows.appendChild(row);
      });
    }
  }

  // Render What-If Panel
  renderWhatIfPanel();
}
