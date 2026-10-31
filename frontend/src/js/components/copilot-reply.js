/**
 * @file copilot-reply.js
 * @description Builds Mara's reply markup (all values escaped) and wires proposal approve/dismiss actions.
 */

import { store } from '../store.js';
import { escapeHtml as esc } from '../views/helpers.js';

/** Human label for the `provider` field of a Mara response (absent means the local fallback answered). */
export function providerLabel(provider) {
  return /gemini/i.test(String(provider || '')) ? 'Live Gemini' : 'Offline planner';
}

function proposalCardHtml(prop, idx) {
  const title = esc(prop.title);
  return `
    <div class="proposal-card" data-idx="${idx}">
      <div class="prop-badge">Recommendation</div>
      <h3>${title}</h3>
      <p class="prop-desc">${esc(prop.description)}</p>
      <div class="prop-consequence"><b>Impact:</b> ${esc(prop.consequence || 'Preserves budget buffer.')}</div>
      <div class="prop-actions">
        <button type="button" class="apply-prop-btn proposal-apply-btn" aria-label="Approve and apply: ${title}">Approve and apply</button>
        <button type="button" class="dismiss-prop-btn" aria-label="Dismiss: ${title}">Dismiss</button>
      </div>
      <div class="prop-result" role="status" tabindex="-1"></div>
    </div>`;
}

const proposalsHtml = (r) => `
  <p><b>${esc(r.summary || 'I recommend these options:')}</b></p>
  <div class="proposal-stack">${r.proposals.map(proposalCardHtml).join('')}</div>`;

const adviceHtml = (r) => `<p><b>${esc(r.headline)}</b></p><p>${esc(r.advice || '')}</p>`;

const diagnosisHtml = (r) => `
  <p><b>Diagnosis:</b> ${esc(r.cause)}</p>
  <p><b>Consequence:</b> ${esc(r.consequence)}</p>
  <p><b>Recommended Move:</b> ${esc(r.suggested_action)}</p>`;

const plainHtml = (r) => `<p>${esc(r.response || r.summary || 'I updated my assessment of your event.')}</p>`;

const BUILDERS = [
  [(r) => Array.isArray(r.proposals) && r.proposals.length > 0, proposalsHtml],
  [(r) => Boolean(r.headline), adviceHtml],
  [(r) => Boolean(r.cause), diagnosisHtml]
];

/** Markup for one Mara response: proposals, advice, diagnosis or plain text, all values escaped. */
export function replyHtml(response) {
  const match = BUILDERS.find(([test]) => test(response));
  const body = (match ? match[1] : plainHtml)(response);
  return `${body}<small class="msg-provider">Source: ${providerLabel(response.provider)}</small>`;
}

function finishProposal(card, text, modifier) {
  card.classList.add(modifier);
  card.querySelector('.prop-actions').hidden = true;
  const result = card.querySelector('.prop-result');
  result.textContent = text;
  result.focus();
}

function applyOne(card, proposal) {
  try {
    const outcome = store.applyProposal(proposal);
    finishProposal(card, `Approved and applied. ${outcome.message}`, 'is-applied');
  } catch (err) {
    const result = card.querySelector('.prop-result');
    result.textContent = `Could not apply this proposal: ${err.message}`;
    result.classList.add('is-error');
  }
}

/** Delegated handler for the Approve/Dismiss buttons of one reply element. */
export function wireProposals(replyEl, proposals) {
  replyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.apply-prop-btn, .dismiss-prop-btn');
    if (!btn) return;
    const card = btn.closest('.proposal-card');
    const proposal = proposals[Number(card.dataset.idx)];
    if (btn.classList.contains('apply-prop-btn')) applyOne(card, proposal);
    else finishProposal(card, `Dismissed: ${proposal.title}`, 'is-dismissed');
  });
}
