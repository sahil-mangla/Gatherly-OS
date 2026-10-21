/**
 * @file quote-modal.js
 * @description Side-by-side vendor quote comparison modal and Raw Quote Seed Parser.
 */

import { store } from '../store.js';
import { compareQuotes, generateFollowUpQuestions } from '../domain/vendors.js';
import { askMara } from '../ai/mara-client.js';

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
  const seedPresets = {
    photo: `Hi Maya! We would love to capture your wedding on Sep 14. Our standard package is $2,400 with a $720 retainer upon signing. Includes 8 hours of photography and a high-resolution online gallery. Second shooter available upon request. Let us know if you want to proceed!`,
    cater: `Catering Estimate for Leila & Noor: 150 guests plated dinner buffet at $42/person plus welcome drinks ($6,300 base). Includes table linens and dinnerware. Deposit of $1,800 due on confirmation. Note: Bar setup and venue corkage billed separately.`
  };

  modalElement.querySelectorAll('.seed-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.preset;
      document.getElementById('raw-quote-text').value = seedPresets[p] || '';
    });
  });

  // Parse button handler
  document.getElementById('parse-quote-btn').addEventListener('click', handleParseQuote);
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

  // Look for vendors with multiple quotes or shortlist quotes
  const solStudio = vendors.find(v => v.id === 'ven-sol-studio') || vendors[1] || vendors[0];
  const quotesToCompare = solStudio?.quotes || [
    { name: 'Sol Studio (Main)', price: 2400, deposit: 720, inclusions: ['8 hrs coverage', 'Online gallery'], missing_fields: ['Overtime fee rate', 'Teardown terms'] },
    { name: 'Lumina Collective (Alt)', price: 2150, deposit: 500, inclusions: ['7 hrs coverage', 'Second shooter'], missing_fields: ['Raw clip policy', 'Cancellation refund clause'] }
  ];

  const compResult = compareQuotes(quotesToCompare);

  let html = `
    <div class="comparison-banner">
      <span class="sparkle-icon">✦</span>
      <p><b>Mara's Analysis:</b> ${escapeHtml(compResult.comparison_summary)}</p>
    </div>

    <div class="quote-matrix-grid">
  `;

  compResult.normalized.forEach(q => {
    const isCheapest = q.id === compResult.cheapest_id;
    const isLowestRisk = q.id === compResult.lowest_risk_id;

    html += `
      <div class="quote-column ${isCheapest ? 'cheapest' : ''} ${isLowestRisk ? 'recommended' : ''}">
        <div class="quote-col-header">
          ${isCheapest ? '<span class="quote-ribbon">Lowest Base Price</span>' : ''}
          ${isLowestRisk ? '<span class="quote-ribbon gold">Lowest Hidden Fee Risk</span>' : ''}
          <h3>${escapeHtml(q.name)}</h3>
          <div class="quote-price-tag">$${q.base_price.toLocaleString()}<small> / total base</small></div>
          <div class="quote-deposit">Deposit: $${q.deposit_amount.toLocaleString()} (${q.deposit_percent}%)</div>
        </div>

        <div class="quote-section">
          <h5>Inclusions</h5>
          <ul>
            ${q.inclusions.map(i => `<li>✓ ${escapeHtml(i)}</li>`).join('')}
          </ul>
        </div>

        <div class="quote-section warnings">
          <h5>Missing Fee Disclosures</h5>
          ${q.missing_disclosures.length > 0 ? `
            <ul class="missing-list">
              ${q.missing_disclosures.map(m => `<li>⚠️ <b>Unverified:</b> ${escapeHtml(m)}</li>`).join('')}
            </ul>
          ` : '<p class="clean-terms">✓ All standard terms disclosed.</p>'}
        </div>

        <div class="quote-footer">
          <button class="primary-btn draft-questions-btn" data-quote='${JSON.stringify(q).replace(/'/g, "&#39;")}'>
            Draft Follow-Up Email
          </button>
        </div>
      </div>
    `;
  });

  html += `</div><div id="drafted-email-box" style="display:none; margin-top:20px;"></div>`;
  container.innerHTML = html;

  // Wire draft questions buttons
  container.querySelectorAll('.draft-questions-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const quoteData = JSON.parse(btn.dataset.quote);
      const questions = generateFollowUpQuestions(quoteData);
      const box = document.getElementById('drafted-email-box');

      box.style.display = 'block';
      box.innerHTML = `
        <div class="drafted-email-card">
          <h4>Generated Clarification Email for ${escapeHtml(quoteData.name)}</h4>
          <p><em>Copy and send this message to ensure no surprise charges arise:</em></p>
          <pre class="email-preview">Hi ${escapeHtml(quoteData.name)},

Thank you so much for sending over the proposal for our upcoming celebration! We love your work and would love to clarify a few operational details before signing:

${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Looking forward to hearing from you!
Best regards,
Maya</pre>
          <button class="text-btn" id="copy-email-btn">Copy message to clipboard ↗</button>
        </div>
      `;

      document.getElementById('copy-email-btn').addEventListener('click', () => {
        const text = box.querySelector('.email-preview').innerText;
        navigator.clipboard?.writeText(text);
        alert('Copied follow-up email to clipboard!');
      });
      box.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

async function handleParseQuote() {
  const text = document.getElementById('raw-quote-text').value.trim();
  if (!text) {
    alert('Please enter or paste vendor quote text first.');
    return;
  }

  const btn = document.getElementById('parse-quote-btn');
  const resultContainer = document.getElementById('parsed-quote-result');
  btn.disabled = true;
  btn.innerText = 'Extracting entities with Mara...';

  const res = await askMara('parse_quote_seed', text);
  btn.disabled = false;
  btn.innerText = '✦ Extract & Audit Quote with Mara';

  if (!res.extracted_quote) {
    alert('Could not extract structured data. Please try again.');
    return;
  }

  const eq = res.extracted_quote;
  resultContainer.style.display = 'block';
  resultContainer.innerHTML = `
    <div class="parsed-result-card">
      <div class="parsed-header">
        <span class="sparkle-icon">✦</span>
        <div>
          <h4>Extracted: ${escapeHtml(eq.vendor_name)}</h4>
          <span class="badge-notice">${eq.service_type.toUpperCase()}</span>
        </div>
        <div class="parsed-amount">$${eq.quoted_base_amount.toLocaleString()}</div>
      </div>

      <div class="parsed-grid">
        <div>
          <b>Deposit:</b> $${eq.deposit_amount.toLocaleString()}
        </div>
        <div>
          <b>Confidence Score:</b> ${Math.round((eq.confidence_score || 0.9) * 100)}%
        </div>
      </div>

      ${eq.missing_fields && eq.missing_fields.length > 0 ? `
        <div class="parsed-missing">
          <b>⚠️ Missing Disclosures Detected:</b>
          <ul>
            ${eq.missing_fields.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="parsed-actions">
        <button class="primary-btn" id="save-parsed-vendor-btn">Save to Vendor Roster</button>
      </div>
    </div>
  `;

  document.getElementById('save-parsed-vendor-btn').addEventListener('click', () => {
    store.addVendor({
      name: eq.vendor_name,
      category: eq.service_type,
      quoted_amount: eq.quoted_base_amount,
      deposit_paid: 0,
      summary: `Imported via Mara raw seed parser. Base estimate: $${eq.quoted_base_amount}.`,
      inclusions: eq.inclusions || [],
      exclusions: eq.missing_fields || []
    });
    alert(`Added "${eq.vendor_name}" to your Vendor roster!`);
    closeQuoteModal();
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
