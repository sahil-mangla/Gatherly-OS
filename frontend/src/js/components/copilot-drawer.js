/**
 * @file copilot-drawer.js
 * @description Slide-over Copilot Drawer for Mara with interactive decision loop (proposals & approval).
 */

import { store } from '../store.js';
import { askMara } from '../ai/mara-client.js';
import { buildMaraContext } from '../ai/mara-context.js';
import { escapeHtml } from '../views/helpers.js';
import { replyHtml, wireProposals, providerLabel } from './copilot-reply.js';
import { openLayer, closeLayer } from './dialog-focus.js';

let drawerElement = null;
let backdropElement = null;

const DRAWER_HTML = `
  <div class="copilot-drawer" id="copilot-drawer" role="dialog" aria-modal="true" aria-labelledby="copilot-title" aria-describedby="copilot-desc" tabindex="-1" inert>
    <div class="drawer-header">
      <div class="drawer-title">
        <div class="assistant-orb mini" aria-hidden="true">✦</div>
        <div>
          <h2 id="copilot-title">Mara</h2>
          <span class="drawer-status"><span class="status-dot" aria-hidden="true"></span> <span id="copilot-status">Ready to advise</span></span>
        </div>
      </div>
      <button type="button" class="drawer-close-btn" id="copilot-close" aria-label="Close assistant"><span aria-hidden="true">✕</span></button>
    </div>
    <p class="sr-only" id="copilot-desc">Ask Mara about your budget, timeline and vendors. Proposals only change your plan after you approve them.</p>

    <div class="drawer-quick-prompts" role="group" aria-label="Suggested questions">
      <button type="button" class="chip-btn" data-op="cost_saving_proposals" data-prompt="Smart ways to save"><span aria-hidden="true">💰</span> Smart ways to save</button>
      <button type="button" class="chip-btn" data-op="prioritize_tasks" data-prompt="What to do this week"><span aria-hidden="true">⚡</span> What to do this week</button>
      <button type="button" class="chip-btn" data-op="risk_explanation" data-prompt="Explain active risks"><span aria-hidden="true">🛡️</span> Explain active risks</button>
    </div>

    <div class="drawer-messages" id="copilot-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with Mara" tabindex="0">
      <div class="msg assistant-msg">
        <p>Hello! I'm looking at your event's budget, timeline and vendors. What would you like to explore or optimize today?</p>
      </div>
    </div>

    <form class="drawer-input-bar" id="copilot-form">
      <label class="sr-only" for="copilot-input">Ask Mara</label>
      <input type="text" id="copilot-input" name="message" placeholder="Ask Mara or propose a change..." autocomplete="off" />
      <button type="submit" id="copilot-submit" aria-label="Send message"><span aria-hidden="true">↑</span></button>
    </form>
  </div>
  <div class="drawer-backdrop" id="copilot-backdrop"></div>
`;

/** Builds the Mara drawer and wires its toggle, suggestions, form and keyboard handling. */
export function initCopilotDrawer() {
  if (drawerElement) return;

  document.body.insertAdjacentHTML('beforeend', DRAWER_HTML);
  drawerElement = document.getElementById('copilot-drawer');
  backdropElement = document.getElementById('copilot-backdrop');

  document.getElementById('copilot-close').addEventListener('click', closeCopilot);
  backdropElement.addEventListener('click', closeCopilot);

  drawerElement.querySelector('.drawer-quick-prompts').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-btn');
    if (chip) handleUserAction(chip.dataset.op, chip.dataset.prompt);
  });

  const input = document.getElementById('copilot-input');
  document.getElementById('copilot-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = '';
    handleUserAction('general_advice', prompt);
  });
}

/** Opens the Mara drawer, optionally sending `prompt` for `operation` straight away. */
export function openCopilot(prompt = '', operation = null) {
  if (!drawerElement) initCopilotDrawer();
  drawerElement.inert = false;
  drawerElement.classList.add('open');
  backdropElement.classList.add('open');
  openLayer({ container: drawerElement, roots: [drawerElement, backdropElement], close: closeCopilot, initialFocus: '#copilot-input' });

  if (prompt) handleUserAction(operation || 'general_advice', prompt);
}

/** Closes the Mara drawer and returns focus to where it was opened from. */
export function closeCopilot() {
  if (!drawerElement) return;
  drawerElement.classList.remove('open');
  backdropElement.classList.remove('open');
  drawerElement.inert = true;
  closeLayer(drawerElement);
}

function appendMessage(log, className, html) {
  const el = document.createElement('div');
  el.className = `msg ${className}`;
  el.innerHTML = html;
  log.appendChild(el);
  return el;
}

async function fetchResponse(operation, userText) {
  try {
    return await askMara(operation, userText, buildMaraContext(store.getActiveEvent()));
  } catch (err) {
    console.error('Mara copilot error:', err);
    return { response: "I encountered a minor hitch retrieving advice. Here's my quick recommendation: check your critical path milestones." };
  }
}

async function handleUserAction(operation, userText) {
  const log = document.getElementById('copilot-messages');
  appendMessage(log, 'user-msg', `<p>${escapeHtml(userText)}</p>`);
  const thinking = appendMessage(log, 'assistant-msg thinking', '<p><em>Mara is analyzing your event data...</em></p>');
  thinking.setAttribute('aria-busy', 'true');
  log.setAttribute('aria-busy', 'true');
  log.scrollTop = log.scrollHeight;

  const response = await fetchResponse(operation, userText);

  thinking.remove();
  const reply = appendMessage(log, 'assistant-msg', replyHtml(response));
  wireProposals(reply, response.proposals || []);
  document.getElementById('copilot-status').textContent = `Ready to advise · ${providerLabel(response.provider)}`;
  log.removeAttribute('aria-busy');
  log.scrollTop = log.scrollHeight;
}
