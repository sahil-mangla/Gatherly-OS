/**
 * @file whatif-panel.js
 * @description Interactive Celebration Sandbox for multi-factor ripple simulation (Budget, Capacity, Milestones).
 * The panel is built once; store updates only refresh baselines so slider state and focus are preserved.
 */

import { simulateRipple } from '../domain/budget.js';
import { createViewContext } from '../views/context.js';
import { openCopilot } from './copilot-drawer.js';
import { simulationHtml, simulationSummary, consultPrompt } from './whatif-output.js';

const SUMMARY_DELAY_MS = 400;

const PANEL_HTML = `
  <div class="panel-heading">
    <div>
      <span class="eyebrow">WHAT-IF SCENARIO REHEARSAL</span>
      <h2>Celebration Simulation Sandbox</h2>
    </div>
    <button type="button" class="text-btn" id="reset-whatif-btn">Reset sliders <span aria-hidden="true">↺</span></button>
  </div>
  <p class="whatif-intro" id="whatif-intro">Test disruptions and test alternative scenarios with instant multi-factor ripple deductions across budget, capacity, and milestones.</p>

  <div class="whatif-controls-grid">
    <div class="control-box">
      <div class="control-top">
        <label for="guest-slider"><b>Guest Count Adjustment</b></label>
        <output class="slider-val" id="guest-delta-val" for="guest-slider"></output>
      </div>
      <input type="range" id="guest-slider" name="guest_delta" min="-40" max="50" step="5" value="0" aria-describedby="guest-caption" />
      <small class="slider-caption" id="guest-caption"></small>
    </div>

    <div class="control-box">
      <div class="control-top">
        <label for="catering-slider"><b>Catering &amp; Bar Package Variance</b></label>
        <output class="slider-val" id="catering-delta-val" for="catering-slider"></output>
      </div>
      <input type="range" id="catering-slider" name="catering_variance" min="-20" max="40" step="5" value="0" aria-describedby="catering-caption" />
      <small class="slider-caption" id="catering-caption">Simulates inflation or premium beverage upgrades</small>
    </div>
  </div>

  <div class="whatif-output-shell" id="whatif-output-shell" aria-live="off"></div>
  <p class="sr-only" id="whatif-live-summary" role="status" aria-live="polite"></p>

  <div class="whatif-action-row">
    <button type="button" class="primary-btn" id="consult-mara-whatif-btn" aria-haspopup="dialog">Consult Mara on this Simulation <span aria-hidden="true">↗</span></button>
  </div>
`;

const state = { event: null, ripple: null, frame: 0, summaryTimer: 0 };
const signed = (n) => `${n >= 0 ? '+' : ''}${n}`;

function readSliders() {
  return {
    guests: parseInt(document.getElementById('guest-slider').value, 10),
    catering: parseInt(document.getElementById('catering-slider').value, 10)
  };
}

/** Cheap, immediate feedback: value labels and aria-valuetext follow the thumb synchronously. */
function updateLabels() {
  const { guests, catering } = readSliders();
  const base = Number(state.event.expected_guests || 150);
  const guestText = `${signed(guests)} guests`;
  document.getElementById('guest-delta-val').textContent = `${signed(guests)} (Total: ${base + guests})`;
  document.getElementById('catering-delta-val').textContent = `${signed(catering)}%`;
  document.getElementById('guest-slider').setAttribute('aria-valuetext', guestText);
  document.getElementById('catering-slider').setAttribute('aria-valuetext', `${signed(catering)}%`);
}

function announceSummary() {
  clearTimeout(state.summaryTimer);
  state.summaryTimer = setTimeout(() => {
    document.getElementById('whatif-live-summary').textContent = simulationSummary(state.ripple);
  }, SUMMARY_DELAY_MS);
}

function runSimulation() {
  state.frame = 0;
  const { guests, catering } = readSliders();
  state.ripple = simulateRipple(state.event, { guest_delta: guests, catering_variance_pct: catering });
  document.getElementById('whatif-output-shell').innerHTML = simulationHtml(state.ripple);
  announceSummary();
}

function scheduleSimulation() {
  updateLabels();
  if (!state.frame) state.frame = requestAnimationFrame(runSimulation);
}

function buildCard(budgetView) {
  const card = document.createElement('div');
  card.id = 'whatif-simulator-card';
  card.className = 'panel whatif-simulator-panel';
  card.innerHTML = PANEL_HTML;
  const overview = budgetView.querySelector('.budget-overview');
  if (overview && overview.nextSibling) budgetView.insertBefore(card, overview.nextSibling);
  else budgetView.appendChild(card);

  card.querySelectorAll('input[type="range"]').forEach(slider => slider.addEventListener('input', scheduleSimulation));
  card.querySelector('#reset-whatif-btn').addEventListener('click', () => {
    card.querySelectorAll('input[type="range"]').forEach(slider => { slider.value = 0; });
    scheduleSimulation();
  });
  card.querySelector('#consult-mara-whatif-btn').addEventListener('click', () => {
    if (state.ripple) openCopilot(consultPrompt(state.ripple), 'cost_saving_proposals');
  });
  return card;
}

/** Renders (first call) or refreshes (later calls) the sandbox without resetting slider position. */
export function renderWhatIfPanel(ctx = createViewContext()) {
  const budgetView = document.getElementById('budget');
  if (!budgetView) return;

  const card = document.getElementById('whatif-simulator-card') || buildCard(budgetView);
  const { event } = ctx;
  if (card.dataset.eventId !== event.id) {
    card.querySelectorAll('input[type="range"]').forEach(slider => { slider.value = 0; });
    card.dataset.eventId = event.id;
  }
  state.event = event;
  document.getElementById('guest-caption').textContent = `Venue Capacity Limit: ${Number(event.venue_capacity || 140)} guests`;
  scheduleSimulation();
}
