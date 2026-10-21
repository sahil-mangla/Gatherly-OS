/**
 * @file quote-modal.js
 * @description Side-by-side vendor quote comparison modal and seed parser dialog.
 */

import { store } from '../store.js';
import { compareQuotes, generateFollowUpQuestions } from '../domain/vendors.js';
import { seedPresets, handleParseQuote } from './quote-seed-parser.js';
import { escapeHtml } from '../views/helpers.js';

let modalElement = null;

export function initQuoteModal() {
  if (modalElement) return;

  const html = `
    <div class="modal-backdrop" id="quote-modal-backdrop">
      <div class="modal-dialog modal-large" id="quote-modal" role="dialog" aria-modal="true" aria-label="Vendor Quote Comparison and Seed Parser">
        <div class="modal-header">
          <div>
            <span class="eyebrow">INTELLIGENT VENDOR AUDIT</span>
            <h2>Vendor Quote Comparison & Seed Parser</h2>
          </div>
          <button class="modal-close" id="quote-modal-close" aria-label="Close modal">✕</button>
        </div>

        <div class="modal-tabs">
          <button class="tab-btn active" data-tab="compare-tab">Side-by-Side Comparison</button>
          <button class="tab-btn" data-tab="seed-tab">Paste Raw Quote (AI Seed Ingestion)</button>
        </div>

        <div class="modal-body">
          <div class="tab-pane active" id="compare-tab">
            <div id="quote-comparison-content"></div>
          </div>

          <div class="tab-pane" id="seed-tab">
            <div class="seed-parser-shell">
              <p class="seed-intro">Paste an unstructured quote, proposal PDF text, or email from any vendor. Mara will extract normalized fees and flag hidden omissions.</p>
              
              <div class="preset-row">
                <span>Quick demo seeds:</span>
                <button class="seed-chip" data-preset="photo">📷 Photo Proposal</button>
                <button class="seed-chip" data-preset="cater">🍽️ Catering Estimate</button>
              </div>

              <textarea id="raw-quote-text" rows="5" placeholder="Paste vendor email or quote text here..."></textarea>
              <button class="primary-btn" id="parse-quote-btn">✦ Extract & Audit Quote with Mara</button>

              <div id="parsed-quote-result" style="display:none; margin-top:20px;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  modalElement = document.getElementById('quote-modal-backdrop');

  document.getElementById('quote-modal-close').addEventListener('click', closeQuoteModal);
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) closeQuoteModal();
  });

  // Tab switching
  modalElement.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modalElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      modalElement.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Seed Presets
  modalElement.querySelectorAll('.seed-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.preset;
      document.getElementById('raw-quote-text').value = seedPresets[p] || '';
    });
  });

  // Parse button handler
  document.getElementById('parse-quote-btn').addEventListener('click', () => {
    handleParseQuote(closeQuoteModal);
  });
}

export function openQuoteModal(vendorId = null) {
  if (!modalElement) initQuoteModal();
  renderComparisonView(vendorId);
  modalElement.classList.add('open');
}

export function closeQuoteModal() {
  if (!modalElement) return;
  modalElement.classList.remove('open');
}

function renderComparisonView(vendorId) {
  const container = document.getElementById('quote-comparison-content');
  if (!container) return;

  const event = store.getActiveEvent();
  const vendors = event.vendors || [];

  const solStudio = vendors.find(v => v.id === 'ven-sol-studio') || vendors[1] || vendors[0];
  const quotesToCompare = solStudio?.quotes || [
    { name: 'Sol Studio (Main)', price: 2400, deposit: 720, inclusions: ['8 hrs coverage', 'Online gallery'], missing_fields: ['Overtime fee rate', 'Teardown terms'] },
    { name: 'Lumina Collective (Alt)', price: 2150, deposit: 500, inclusions: ['7 hrs coverage', 'Second shooter'], missing_fields: ['Raw clip policy', 'Cancellation refund clause'] }
  ];

  const compResult = compareQuotes(quotesToCompare);

  let html = `
    <div class="comparison-banner">
      <div class="banner-summary">
        <strong>Intelligent Audit Result</strong>
        <p>${escapeHtml(compResult.comparison_summary)}</p>
      </div>
    </div>

    <div class="comparison-matrix">
  `;

  compResult.normalized.forEach(q => {
    const isCheapest = q.id === compResult.cheapest_id;
    const isLowestRisk = q.id === compResult.lowest_risk_id;
    const incList = q.inclusions.map(i => `<li>✓ ${escapeHtml(i)}</li>`).join('');
    const misList = q.missing_disclosures.length > 0 
      ? q.missing_disclosures.map(m => `<li class="missing-li">? ${escapeHtml(m)}</li>`).join('')
      : '<li class="clean-li">✓ Fully disclosed terms</li>';

    html += `
      <div class="matrix-card ${isCheapest ? 'highlight-card' : ''}">
        <div class="matrix-badges">
          ${isCheapest ? '<span class="badge-cheapest">Lowest Base Fee</span>' : ''}
          ${isLowestRisk ? '<span class="badge-risk-low">Most Disclosed Terms</span>' : ''}
        </div>
        <h3>${escapeHtml(q.name)}</h3>
        <div class="matrix-price">
          <span class="price-val">$${q.base_price.toLocaleString()}</span>
          <small>Deposit: $${q.deposit_amount.toLocaleString()} (${q.deposit_percent}%)</small>
        </div>
        <div class="matrix-section"><b>Included:</b><ul>${incList}</ul></div>
        <div class="matrix-section risk-section"><b>⚠️ Undisclosed Terms:</b><ul>${misList}</ul></div>
        <button class="select-quote-btn" data-quote-id="${q.id}">Draft Clarification Questions</button>
      </div>`;
  });
  html += `</div><div id="followup-questions-box" style="display:none; margin-top:24px;"></div>`;
  container.innerHTML = html;

  container.querySelectorAll('.select-quote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.dataset.quoteId;
      const quote = quotesToCompare.find(q => (q.quote_id || q.id) === qId) || quotesToCompare[0];
      const questions = generateFollowUpQuestions(quote);

      const box = document.getElementById('followup-questions-box');
      box.style.display = 'block';
      box.innerHTML = `
        <div class="draft-email-card">
          <h4>Generated Clarification Draft for Vendor:</h4>
          <pre class="email-preview">Hi ${escapeHtml(quote.tier_name || quote.name)},

Thank you so much for sending over your detailed proposal! Before we finalize our agreement and deposit, could you clarify these items:

${questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n')}

Looking forward to hearing from you.
Warmly,
Maya</pre>
          <button class="text-btn" id="copy-email-btn">Copy message to clipboard ↗</button>
        </div>
      `;

      document.getElementById('copy-email-btn').addEventListener('click', () => {
        const text = box.querySelector('.email-preview').innerText;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => alert('Copied follow-up email to clipboard!'))
            .catch(() => alert('Please select and copy the text manually.'));
        } else {
          alert('Copied follow-up email draft.');
        }
      });
      box.scrollIntoView({ behavior: 'smooth' });
    });
  });
}
