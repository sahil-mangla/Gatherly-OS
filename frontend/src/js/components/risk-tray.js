/**
 * @file risk-tray.js
 * @description Event Risk Radar dialog opened from the topbar bell (focus-managed, keyboard accessible).
 */

import { store } from '../store.js';
import { evaluateEventRisks } from '../domain/risks.js';
import { requestView, safeToken } from '../views/helpers.js';
import { scrollBehavior } from '../a11y.js';
import { openCopilot } from './copilot-drawer.js';
import { openQuoteModal } from './quote-modal.js';
import { openLayer, closeLayer } from './dialog-focus.js';
import { riskCardsHtml } from './risk-cards.js';

let trayElement = null;
let bellButton = null;
let currentActions = [];

const TRAY_HTML = `
  <div class="risk-tray" id="risk-tray" role="dialog" aria-modal="true" aria-labelledby="risk-tray-title" tabindex="-1">
    <div class="risk-tray-header">
      <div>
        <span class="eyebrow">GROUNDED INTELLIGENCE</span>
        <h2 id="risk-tray-title">Event Risk Radar</h2>
      </div>
      <button type="button" class="risk-tray-close" id="risk-tray-close" aria-label="Close risk radar"><span aria-hidden="true">✕</span></button>
    </div>
    <div class="risk-tray-list" id="risk-tray-list"></div>
  </div>
`;

const ACTIONS = {
  ask_mara: (act) => openCopilot(act.prompt || ''),
  open_whatif: () => {
    requestView('budget');
    document.getElementById('whatif-simulator-card')?.scrollIntoView({ behavior: scrollBehavior() });
  },
  open_timeline: () => requestView('timeline'),
  open_quotes: (act) => {
    requestView('vendors');
    openQuoteModal((act.payload && act.payload.vendor_id) || null);
  }
};

function runAction(act) {
  closeRiskTray();
  const handler = ACTIONS[safeToken(act.action_type, Object.keys(ACTIONS), '')];
  if (handler) handler(act);
}

function onListClick(e) {
  const dismiss = e.target.closest('.risk-dismiss-btn');
  const action = e.target.closest('.risk-act-btn');
  if (dismiss) {
    store.dismissRisk(dismiss.dataset.riskId);
    (document.querySelector('#risk-tray-list .risk-dismiss-btn') || document.getElementById('risk-tray-close')).focus();
  } else if (action) {
    runAction(currentActions[Number(action.dataset.actIdx)]);
  }
}

export function initRiskTray() {
  bellButton = document.getElementById('topbar-risk-btn');
  if (!bellButton || trayElement) return;

  document.body.insertAdjacentHTML('beforeend', TRAY_HTML);
  trayElement = document.getElementById('risk-tray');

  bellButton.addEventListener('click', toggleRiskTray);
  document.getElementById('risk-tray-close').addEventListener('click', closeRiskTray);
  document.getElementById('risk-tray-list').addEventListener('click', onListClick);
  document.addEventListener('click', (e) => {
    const outside = !trayElement.contains(e.target) && !bellButton.contains(e.target);
    if (outside && trayElement.classList.contains('open')) closeRiskTray();
  });

  store.subscribe(() => {
    updateRiskBadge();
    if (trayElement.classList.contains('open')) renderRiskList();
  });
  updateRiskBadge();
}

export function toggleRiskTray() {
  if (!trayElement) initRiskTray();
  if (trayElement.classList.contains('open')) closeRiskTray();
  else openRiskTray();
}

export function openRiskTray() {
  if (!trayElement) initRiskTray();
  renderRiskList();
  trayElement.classList.add('open');
  bellButton.setAttribute('aria-expanded', 'true');
  openLayer({ container: trayElement, roots: [trayElement], close: closeRiskTray, initialFocus: '#risk-tray-close' });
}

export function closeRiskTray() {
  if (!trayElement) return;
  trayElement.classList.remove('open');
  bellButton.setAttribute('aria-expanded', 'false');
  closeLayer(trayElement);
}

function updateRiskBadge() {
  const { total_count: total, critical_count: critical } = evaluateEventRisks(store.getActiveEvent());
  bellButton.setAttribute('aria-label', `Event Risk Radar, ${total === 0 ? 'no' : total} active ${total === 1 ? 'risk' : 'risks'}`);

  let dot = bellButton.querySelector('.notification-dot');
  if (total === 0) {
    if (dot) dot.remove();
    return;
  }
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'notification-dot';
    dot.setAttribute('aria-hidden', 'true');
    bellButton.appendChild(dot);
  }
  dot.textContent = total;
  dot.classList.toggle('critical', critical > 0);
}

function renderRiskList() {
  const listEl = document.getElementById('risk-tray-list');
  const { risks } = evaluateEventRisks(store.getActiveEvent());
  const rendered = riskCardsHtml(risks);
  currentActions = rendered.actions;
  listEl.innerHTML = rendered.html;
}
