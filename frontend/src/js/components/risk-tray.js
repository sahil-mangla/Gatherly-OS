/**
 * @file risk-tray.js
 * @description Notification alert tray dropdown for the Event Risk Radar.
 */

import { store } from '../store.js';
import { evaluateEventRisks } from '../domain/risks.js';
import { openCopilot } from './copilot-drawer.js';

let trayElement = null;

export function initRiskTray() {
  const notifBtn = document.querySelector('.icon-btn[aria-label="Notifications"]') || document.querySelector('.icon-btn');
  if (!notifBtn) return;

  const html = `
    <div class="risk-tray" id="risk-tray" aria-label="Event Risk Radar" aria-hidden="true">
      <div class="risk-tray-header">
        <div>
          <span class="eyebrow">GROUNDED INTELLIGENCE</span>
          <h3>Event Risk Radar</h3>
        </div>
        <button class="risk-tray-close" id="risk-tray-close" aria-label="Close alert tray">✕</button>
      </div>
      <div class="risk-tray-list" id="risk-tray-list"></div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  trayElement = document.getElementById('risk-tray');

  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRiskTray();
  });

  document.getElementById('risk-tray-close').addEventListener('click', closeRiskTray);

  document.addEventListener('click', (e) => {
    if (trayElement && trayElement.classList.contains('open') && !trayElement.contains(e.target) && !notifBtn.contains(e.target)) {
      closeRiskTray();
    }
  });

  // Subscribe to store updates to keep risk count badge live
  store.subscribe(() => {
    updateRiskBadge();
    if (trayElement && trayElement.classList.contains('open')) {
      renderRiskList();
    }
  });

  updateRiskBadge();
}

export function toggleRiskTray() {
  if (!trayElement) initRiskTray();
  const isOpen = trayElement.classList.contains('open');
  if (isOpen) closeRiskTray();
  else openRiskTray();
}

export function openRiskTray() {
  if (!trayElement) initRiskTray();
  renderRiskList();
  trayElement.classList.add('open');
  trayElement.setAttribute('aria-hidden', 'false');
}

export function closeRiskTray() {
  if (!trayElement) return;
  trayElement.classList.remove('open');
  trayElement.setAttribute('aria-hidden', 'true');
}

function updateRiskBadge() {
  const notifBtn = document.querySelector('.icon-btn');
  if (!notifBtn) return;

  const event = store.getActiveEvent();
  const evaluation = evaluateEventRisks(event);
  let dot = notifBtn.querySelector('.notification-dot');

  if (evaluation.total_count > 0) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'notification-dot';
      notifBtn.appendChild(dot);
    }
    dot.innerText = evaluation.total_count;
    dot.classList.toggle('critical', evaluation.critical_count > 0);
  } else if (dot) {
    dot.remove();
  }
}

function renderRiskList() {
  const listEl = document.getElementById('risk-tray-list');
  if (!listEl) return;

  const event = store.getActiveEvent();
  const evaluation = evaluateEventRisks(event);

  if (evaluation.risks.length === 0) {
    listEl.innerHTML = `
      <div class="risk-empty-state">
        <span class="sparkle-icon">✦</span>
        <h4>All Clear</h4>
        <p>No active risks or constraint violations detected in your plan.</p>
      </div>
    `;
    return;
  }

  let html = '';
  evaluation.risks.forEach(risk => {
    const sevClass = risk.severity === 'critical' ? 'badge-critical' : risk.severity === 'warning' ? 'badge-warning' : 'badge-notice';
    html += `
      <div class="risk-item-card ${risk.severity}" id="risk-${risk.id}">
        <div class="risk-item-top">
          <span class="risk-badge ${sevClass}">${risk.severity.toUpperCase()}</span>
          <button class="risk-dismiss-btn" data-id="${risk.id}" title="Dismiss alert">✕</button>
        </div>
        <h4>${escapeHtml(risk.title)}</h4>
        <p class="risk-evidence">${escapeHtml(risk.evidence)}</p>
        <p class="risk-consequence"><b>Why it matters:</b> ${escapeHtml(risk.consequence)}</p>
        <div class="risk-actions">
    `;

    (risk.recommended_actions || []).forEach(act => {
      html += `
        <button class="risk-act-btn" data-type="${act.action_type}" data-prompt="${escapeHtml(act.prompt || '')}" data-payload='${JSON.stringify(act.payload || {})}'>
          ${escapeHtml(act.label)} →
        </button>
      `;
    });

    html += `</div></div>`;
  });

  listEl.innerHTML = html;

  // Wire dismiss buttons
  listEl.querySelectorAll('.risk-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const riskId = btn.dataset.id;
      store.dismissRisk(riskId);
    });
  });

  // Wire action buttons
  listEl.querySelectorAll('.risk-act-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const prompt = btn.dataset.prompt;

      closeRiskTray();
      if (type === 'ask_mara') {
        openCopilot(prompt);
      } else if (type === 'open_whatif') {
        // Switch to budget view and scroll to simulator
        const budgetNav = document.querySelector('.nav-item[data-view="budget"]');
        if (budgetNav) budgetNav.click();
        const whatIfCard = document.getElementById('whatif-simulator-card');
        if (whatIfCard) whatIfCard.scrollIntoView({ behavior: 'smooth' });
      } else if (type === 'open_timeline') {
        const timelineNav = document.querySelector('.nav-item[data-view="timeline"]');
        if (timelineNav) timelineNav.click();
      } else if (type === 'open_quotes') {
        const vendorNav = document.querySelector('.nav-item[data-view="vendors"]');
        if (vendorNav) vendorNav.click();
      }
    });
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
