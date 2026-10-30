/**
 * @file whatif-output.js
 * @description Result markup for the what-if simulator (stat tiles, narrative, spoken summary).
 */

import { escapeHtml } from '../views/helpers.js';
import { formatDollars as usd } from '../format.js';

const signedUsd = (n) => `${n >= 0 ? '+' : '-'}${usd(Math.abs(n))}`;

function statHtml(label, value, note, isDanger) {
  return `
    <div class="whatif-stat ${isDanger ? 'stat-danger' : 'stat-good'}">
      <span class="stat-kicker">${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </div>`;
}

function narrativeHtml(ripple) {
  const tasks = ripple.affected_tasks.length === 0 ? '' : `
    <div class="affected-tasks-bar">
      <b>Pressure Points on Timeline:</b>
      ${ripple.affected_tasks.map(t => `<span class="affected-task-tag">${escapeHtml(t.title)} (${escapeHtml(t.due_date)})</span>`).join('')}
    </div>`;
  return `
    <div class="whatif-narrative-card">
      <h3>Sandbox Trajectory Analysis</h3>
      <ul>${ripple.narrative.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
      ${tasks}
    </div>`;
}

export function simulationHtml(ripple) {
  const p = ripple.projected;
  const overBudget = p.deficit > 0;
  return `
    <div class="whatif-stats-row">
      ${statHtml('Projected Total Spend', usd(p.allocated), `${signedUsd(p.cost_delta)} vs baseline`, overBudget)}
      ${statHtml('Breathing Room', usd(p.remaining), overBudget ? '<span aria-hidden="true">⚠</span> Deficit requiring cut' : '<span aria-hidden="true">✓</span> Covered by contingency', overBudget)}
      ${statHtml('Venue Capacity Status', `${p.guests} guests`, p.capacity_breach ? `<span aria-hidden="true">⚠</span> Over limit by ${p.excess_guests}!` : '<span aria-hidden="true">✓</span> Safely within limit', p.capacity_breach)}
    </div>
    ${narrativeHtml(ripple)}`;
}

/** One-sentence summary for the polite live region (kept short so screen readers are not flooded). */
export function simulationSummary(ripple) {
  const p = ripple.projected;
  const budget = p.deficit > 0 ? `over budget by ${usd(p.deficit)}` : `${usd(p.remaining)} left in budget`;
  const capacity = p.capacity_breach ? `${p.excess_guests} guests over venue capacity` : 'within venue capacity';
  return `Projected spend ${usd(p.allocated)}, ${budget}, ${p.guests} guests, ${capacity}.`;
}

export function consultPrompt(ripple) {
  const p = ripple.projected;
  const sign = p.cost_delta >= 0 ? '+' : '';
  return `In our sandbox simulation: Guest count adjusted to ${p.guests} and catering variance is ${sign}$${p.cost_delta}. Projected remaining buffer is $${p.remaining}. What adjustments do you recommend?`;
}
