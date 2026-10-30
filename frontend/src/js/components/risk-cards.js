/**
 * @file risk-cards.js
 * @description Markup for Event Risk Radar cards. Every dynamic value is escaped or whitelisted.
 */

import { escapeHtml as esc, safeToken } from '../views/helpers.js';

const SEVERITIES = ['critical', 'warning', 'notice'];

const EMPTY_HTML = `
  <div class="risk-empty-state">
    <span class="sparkle-icon" aria-hidden="true">✦</span>
    <h3>All Clear</h3>
    <p>No active risks or constraint violations detected in your plan.</p>
  </div>`;

function actionButtonHtml(risk, act, idx) {
  return `<button type="button" class="risk-act-btn" data-act-idx="${idx}" aria-label="${esc(act.label)} — ${esc(risk.title)}">${esc(act.label)} <span aria-hidden="true">→</span></button>`;
}

function riskCardHtml(risk, actions) {
  const severity = safeToken(risk.severity, SEVERITIES, 'notice');
  const buttons = (risk.recommended_actions || []).map(act => {
    actions.push(act);
    return actionButtonHtml(risk, act, actions.length - 1);
  }).join('');
  return `
    <article class="risk-item-card ${severity}" id="risk-${esc(risk.id)}">
      <div class="risk-item-top">
        <span class="risk-badge badge-${severity}">${severity.toUpperCase()}</span>
        <button type="button" class="risk-dismiss-btn" data-risk-id="${esc(risk.id)}" aria-label="Dismiss alert: ${esc(risk.title)}"><span aria-hidden="true">✕</span></button>
      </div>
      <h3>${esc(risk.title)}</h3>
      <p class="risk-evidence">${esc(risk.evidence)}</p>
      <p class="risk-consequence"><b>Why it matters:</b> ${esc(risk.consequence)}</p>
      <div class="risk-actions">${buttons}</div>
    </article>`;
}

/** Returns the list markup plus the flat action array that `data-act-idx` indexes into. */
export function riskCardsHtml(risks) {
  if (risks.length === 0) return { html: EMPTY_HTML, actions: [] };
  const actions = [];
  const html = risks.map(risk => riskCardHtml(risk, actions)).join('');
  return { html, actions };
}
