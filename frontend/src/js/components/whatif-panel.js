/**
 * @file whatif-panel.js
 * @description Interactive Celebration Sandbox for multi-factor ripple simulation (Budget, Capacity, Milestones).
 */

import { store } from '../store.js';
import { simulateRipple } from '../domain/budget.js';
import { openCopilot } from './copilot-drawer.js';

let panelContainer = null;

export function renderWhatIfPanel() {
  const budgetView = document.getElementById('budget');
  if (!budgetView) return;

  let existing = document.getElementById('whatif-simulator-card');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'whatif-simulator-card';
    existing.className = 'panel whatif-simulator-panel';
    // Insert right after the budget overview card
    const overview = budgetView.querySelector('.budget-overview');
    if (overview && overview.nextSibling) {
      budgetView.insertBefore(existing, overview.nextSibling);
    } else {
      budgetView.appendChild(existing);
    }
  }

  const event = store.getActiveEvent();
  const baseGuests = Number(event.expected_guests || 150);
  const capacity = Number(event.venue_capacity || 140);

  existing.innerHTML = `
    <div class="panel-heading">
      <div>
        <span class="eyebrow">WHAT-IF SCENARIO REHEARSAL</span>
        <h2>Celebration Simulation Sandbox</h2>
      </div>
      <button class="text-btn" id="reset-whatif-btn">Reset sliders ↺</button>
    </div>
    <p class="whatif-intro">Test disruptions and test alternative scenarios with instant multi-factor ripple deductions across budget, capacity, and milestones.</p>

    <div class="whatif-controls-grid">
      <div class="control-box">
        <div class="control-top">
          <label for="guest-slider"><b>Guest Count Adjustment</b></label>
          <span class="slider-val" id="guest-delta-val">+0 (Total: ${baseGuests})</span>
        </div>
        <input type="range" id="guest-slider" min="-40" max="50" step="5" value="0" aria-label="Guest count adjustment" />
        <small class="slider-caption">Venue Capacity Limit: ${capacity} guests</small>
      </div>

      <div class="control-box">
        <div class="control-top">
          <label for="catering-slider"><b>Catering & Bar Package Variance</b></label>
          <span class="slider-val" id="catering-delta-val">0%</span>
        </div>
        <input type="range" id="catering-slider" min="-20" max="40" step="5" value="0" aria-label="Catering package variance" />
        <small class="slider-caption">Simulates inflation or premium beverage upgrades</small>
      </div>
    </div>

    <div class="whatif-output-shell" id="whatif-output-shell"></div>
  `;

  const guestSlider = existing.querySelector('#guest-slider');
  const cateringSlider = existing.querySelector('#catering-slider');
  const guestVal = existing.querySelector('#guest-delta-val');
  const cateringVal = existing.querySelector('#catering-delta-val');

  function updateSimulation() {
    const gDelta = parseInt(guestSlider.value, 10);
    const cDelta = parseInt(cateringSlider.value, 10);

    const projectedGuests = baseGuests + gDelta;
    guestVal.innerText = `${gDelta >= 0 ? '+' : ''}${gDelta} (Total: ${projectedGuests})`;
    cateringVal.innerText = `${cDelta >= 0 ? '+' : ''}${cDelta}%`;

    const ripple = simulateRipple(event, {
      guest_delta: gDelta,
      catering_variance_pct: cDelta
    });

    renderSimulationOutput(ripple);
  }

  guestSlider.addEventListener('input', updateSimulation);
  cateringSlider.addEventListener('input', updateSimulation);

  existing.querySelector('#reset-whatif-btn').addEventListener('click', () => {
    guestSlider.value = 0;
    cateringSlider.value = 0;
    updateSimulation();
  });

  updateSimulation();
}

function renderSimulationOutput(ripple) {
  const container = document.getElementById('whatif-output-shell');
  if (!container) return;

  const isBreached = ripple.projected.capacity_breach;
  const isOverBudget = ripple.projected.deficit > 0;

  let html = `
    <div class="whatif-stats-row">
      <div class="whatif-stat ${isOverBudget ? 'stat-danger' : 'stat-good'}">
        <span class="stat-kicker">Projected Total Spend</span>
        <strong>$${ripple.projected.allocated.toLocaleString()}</strong>
        <small>${ripple.projected.cost_delta >= 0 ? '+$' : '-$'}${Math.abs(ripple.projected.cost_delta).toLocaleString()} vs baseline</small>
      </div>

      <div class="whatif-stat ${isOverBudget ? 'stat-danger' : 'stat-good'}">
        <span class="stat-kicker">Breathing Room</span>
        <strong>$${ripple.projected.remaining.toLocaleString()}</strong>
        <small>${isOverBudget ? '⚠️ Deficit requiring cut' : '✓ Covered by contingency'}</small>
      </div>

      <div class="whatif-stat ${isBreached ? 'stat-danger' : 'stat-good'}">
        <span class="stat-kicker">Venue Capacity Status</span>
        <strong>${ripple.projected.guests} guests</strong>
        <small>${isBreached ? `⚠️ Over limit by ${ripple.projected.excess_guests}!` : '✓ Safely within limit'}</small>
      </div>
    </div>

    <div class="whatif-narrative-card">
      <h5>Sandbox Trajectory Analysis</h5>
      <ul>
        ${ripple.narrative.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
      </ul>
      ${ripple.affected_tasks.length > 0 ? `
        <div class="affected-tasks-bar">
          <b>Pressure Points on Timeline:</b>
          ${ripple.affected_tasks.map(t => `<span class="affected-task-tag">${escapeHtml(t.title)} (${t.due_date})</span>`).join('')}
        </div>
      ` : ''}
    </div>

    <div class="whatif-action-row">
      <button class="primary-btn" id="consult-mara-whatif-btn">
        Consult Mara on this Simulation ↗
      </button>
    </div>
  `;

  container.innerHTML = html;

  container.querySelector('#consult-mara-whatif-btn').addEventListener('click', () => {
    const summary = `In our sandbox simulation: Guest count adjusted to ${ripple.projected.guests} and catering variance is ${ripple.projected.cost_delta >= 0 ? '+' : ''}$${ripple.projected.cost_delta}. Projected remaining buffer is $${ripple.projected.remaining}. What adjustments do you recommend?`;
    openCopilot(summary, 'cost_saving_proposals');
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
