/**
 * @file copilot-drawer.js
 * @description Slide-over Copilot Drawer for Mara with interactive decision loop (proposals & approval).
 */

import { store } from '../store.js';
import { askMara } from '../ai/mara-client.js';
import { calculateBudgetSummary } from '../domain/budget.js';
import { evaluateEventRisks } from '../domain/risks.js';

let drawerElement = null;

export function initCopilotDrawer() {
  if (drawerElement) return;

  const html = `
    <aside class="copilot-drawer" id="copilot-drawer" role="dialog" aria-modal="true" aria-label="Mara AI Planning Copilot" aria-hidden="true">
      <div class="drawer-header">
        <div class="drawer-title">
          <div class="assistant-orb mini">✦</div>
          <div>
            <h3>Mara</h3>
            <span class="drawer-status"><span class="status-dot"></span> Ready to advise</span>
          </div>
        </div>
        <button class="drawer-close-btn" id="copilot-close" aria-label="Close assistant">✕</button>
      </div>

      <div class="drawer-quick-prompts">
        <button class="chip-btn" data-op="cost_saving_proposals">💰 Smart ways to save</button>
        <button class="chip-btn" data-op="prioritize_tasks">⚡ What to do this week</button>
        <button class="chip-btn" data-op="risk_explanation">🛡️ Explain active risks</button>
      </div>

      <div class="drawer-messages" id="copilot-messages">
        <div class="msg assistant-msg">
          <p>Hello Maya! I'm observing your event state. What would you like to explore or optimize today?</p>
        </div>
      </div>

      <form class="drawer-input-bar" id="copilot-form">
        <input type="text" id="copilot-input" placeholder="Ask Mara or propose a change..." aria-label="Ask Mara" autocomplete="off" />
        <button type="submit" id="copilot-submit" aria-label="Send">↑</button>
      </form>
    </aside>
    <div class="drawer-backdrop" id="copilot-backdrop"></div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  drawerElement = document.getElementById('copilot-drawer');

  // Event handlers
  document.getElementById('copilot-close').addEventListener('click', closeCopilot);
  document.getElementById('copilot-backdrop').addEventListener('click', closeCopilot);

  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.op;
      const text = btn.innerText;
      handleUserAction(op, text);
    });
  });

  const form = document.getElementById('copilot-form');
  const input = document.getElementById('copilot-input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = '';
    handleUserAction('general_advice', prompt);
  });
}

export function openCopilot(prompt = '', operation = null) {
  if (!drawerElement) initCopilotDrawer();
  drawerElement.classList.add('open');
  drawerElement.setAttribute('aria-hidden', 'false');
  document.getElementById('copilot-backdrop').classList.add('open');

  if (prompt) {
    handleUserAction(operation || 'general_advice', prompt);
  }
}

export function closeCopilot() {
  if (!drawerElement) return;
  drawerElement.classList.remove('open');
  drawerElement.setAttribute('aria-hidden', 'true');
  document.getElementById('copilot-backdrop').classList.remove('open');
}

async function handleUserAction(operation, userText) {
  const messagesContainer = document.getElementById('copilot-messages');

  // Append user message
  const userMsgEl = document.createElement('div');
  userMsgEl.className = 'msg user-msg';
  userMsgEl.innerHTML = `<p>${escapeHtml(userText)}</p>`;
  messagesContainer.appendChild(userMsgEl);

  // Append thinking bubble
  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'msg assistant-msg thinking';
  thinkingEl.innerHTML = `<p><em>Mara is analyzing your event data...</em></p>`;
  messagesContainer.appendChild(thinkingEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Prepare context
  const event = store.getActiveEvent();
  const budget = calculateBudgetSummary(event);
  const risks = evaluateEventRisks(event);
  const context = { event: { id: event.id, name: event.name, expected_guests: event.expected_guests }, budget, risks: risks.risks };

  // Call client
  const response = await askMara(operation, userText, context);
  thinkingEl.remove();

  const replyEl = document.createElement('div');
  replyEl.className = 'msg assistant-msg';

  if (response.proposals && response.proposals.length > 0) {
    let proposalsHtml = `<p><b>${escapeHtml(response.summary || 'I recommend these options:')}</b></p>`;
    proposalsHtml += `<div class="proposal-stack">`;

    response.proposals.forEach((prop, idx) => {
      proposalsHtml += `
        <div class="proposal-card" id="prop-card-${idx}">
          <div class="prop-badge">Recommendation</div>
          <h4>${escapeHtml(prop.title)}</h4>
          <p class="prop-desc">${escapeHtml(prop.description)}</p>
          <div class="prop-consequence"><b>Impact:</b> ${escapeHtml(prop.consequence || 'Preserves budget buffer.')}</div>
          <div class="prop-actions">
            <button class="apply-prop-btn" data-prop='${JSON.stringify(prop).replace(/'/g, "&#39;")}'>Approve & Apply</button>
            <button class="dismiss-prop-btn">Dismiss</button>
          </div>
        </div>
      `;
    });
    proposalsHtml += `</div>`;
    replyEl.innerHTML = proposalsHtml;
  } else if (response.headline) {
    replyEl.innerHTML = `
      <p><b>${escapeHtml(response.headline)}</b></p>
      <p>${escapeHtml(response.advice || '')}</p>
    `;
  } else if (response.cause) {
    replyEl.innerHTML = `
      <p><b>Diagnosis:</b> ${escapeHtml(response.cause)}</p>
      <p><b>Consequence:</b> ${escapeHtml(response.consequence)}</p>
      <p><b>Recommended Move:</b> ${escapeHtml(response.suggested_action)}</p>
    `;
  } else {
    replyEl.innerHTML = `<p>${escapeHtml(response.response || response.summary || 'I updated my assessment of your event.')}</p>`;
  }

  messagesContainer.appendChild(replyEl);

  // Wire up proposal approval buttons
  replyEl.querySelectorAll('.apply-prop-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const propData = JSON.parse(btn.dataset.prop);
        const result = store.applyProposal(propData);
        const card = btn.closest('.proposal-card');
        card.innerHTML = `<div class="prop-success">✓ <b>Approved & Applied!</b><br><small>${escapeHtml(result.message)}</small></div>`;
      } catch (err) {
        alert(`Failed to apply proposal: ${err.message}`);
      }
    });
  });

  replyEl.querySelectorAll('.dismiss-prop-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.proposal-card').style.opacity = '0.4';
      btn.closest('.proposal-card').style.pointerEvents = 'none';
    });
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
