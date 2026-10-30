/**
 * @file quote-compare.js
 * @description Side-by-side vendor quote matrix and the generated clarification email draft.
 */

import { store } from '../store.js';
import { compareQuotes, generateFollowUpQuestions } from '../domain/vendors.js';
import { escapeHtml } from '../views/helpers.js';
import { scrollBehavior } from '../a11y.js';
import { showToast } from './toast.js';

const SAMPLE_QUOTES = [
  { name: 'Sol Studio (Main)', price: 2400, deposit: 720, inclusions: ['8 hrs coverage', 'Online gallery'], missing_fields: ['Overtime fee rate', 'Teardown terms'] },
  { name: 'Lumina Collective (Alt)', price: 2150, deposit: 500, inclusions: ['7 hrs coverage', 'Second shooter'], missing_fields: ['Raw clip policy', 'Cancellation refund clause'] }
];

const hasQuotes = (vendor) => Boolean(vendor) && Array.isArray(vendor.quotes) && vendor.quotes.length > 0;

/** Quotes to compare: the requested vendor's own quotes, else the default photographer's, else samples. */
export function pickQuotes(vendors, vendorId) {
  const requested = vendors.find(v => v.id === vendorId);
  const fallback = vendors.find(v => v.id === 'ven-sol-studio') || vendors[1] || vendors[0];
  const source = [requested, fallback].find(hasQuotes);
  return source ? source.quotes : SAMPLE_QUOTES;
}

function matrixCardHtml(q, summary) {
  const name = escapeHtml(q.name);
  const inclusions = q.inclusions.length > 0
    ? q.inclusions.map(i => `<li><span aria-hidden="true">✓</span> ${escapeHtml(i)}</li>`).join('')
    : '<li>Inclusions not stated. Ask the vendor what is covered.</li>';
  const missing = q.missing_disclosures.length > 0
    ? q.missing_disclosures.map(m => `<li class="missing-li"><span aria-hidden="true">?</span> ${escapeHtml(m)}</li>`).join('')
    : '<li class="clean-li"><span aria-hidden="true">✓</span> Fully disclosed terms</li>';
  const badges = `${q.id === summary.cheapest_id ? '<span class="badge-cheapest">Lowest Base Fee</span>' : ''}${q.id === summary.lowest_risk_id ? '<span class="badge-risk-low">Most Disclosed Terms</span>' : ''}`;
  return `
    <div class="matrix-card ${q.id === summary.cheapest_id ? 'highlight-card' : ''}">
      <div class="matrix-badges">${badges}</div>
      <h3>${name}</h3>
      <div class="matrix-price">
        <span class="price-val">$${Number(q.base_price).toLocaleString()}</span>
        <small>Deposit: $${Number(q.deposit_amount).toLocaleString()} (${Number(q.deposit_percent)}%)</small>
      </div>
      <div class="matrix-section"><b>Included:</b><ul>${inclusions}</ul></div>
      <div class="matrix-section risk-section"><b><span aria-hidden="true">⚠</span> Undisclosed Terms:</b><ul>${missing}</ul></div>
      <button type="button" class="select-quote-btn" data-quote-id="${escapeHtml(q.id)}" aria-label="Draft clarification questions for ${name}">Draft Clarification Questions</button>
    </div>`;
}

function draftHtml(quote) {
  const questions = generateFollowUpQuestions(quote).map((q, idx) => `${idx + 1}. ${escapeHtml(q)}`).join('\n');
  return `
    <div class="draft-email-card">
      <h4 id="followup-heading" tabindex="-1">Generated clarification draft for vendor</h4>
      <pre class="email-preview">Hi ${escapeHtml(quote.tier_name || quote.name)},

Thank you so much for sending over your detailed proposal! Before we finalize our agreement and deposit, could you clarify these items:

${questions}

Looking forward to hearing from you.
Warmly,
Maya</pre>
      <button type="button" class="text-btn" id="copy-email-btn">Copy message to clipboard <span aria-hidden="true">↗</span></button>
    </div>`;
}

async function copyDraft(box) {
  const text = box.querySelector('.email-preview').textContent;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied', 'Follow-up email copied to clipboard.');
  } catch {
    showToast('Copy unavailable', 'Please select the text and copy it manually.');
  }
}

function showDraft(quote) {
  const box = document.getElementById('followup-questions-box');
  box.hidden = false;
  box.innerHTML = draftHtml(quote);
  document.getElementById('copy-email-btn').addEventListener('click', () => copyDraft(box));
  box.scrollIntoView({ behavior: scrollBehavior() });
  document.getElementById('followup-heading').focus({ preventScroll: true });
}

export function renderComparisonView(vendorId) {
  const container = document.getElementById('quote-comparison-content');
  if (!container) return;

  const quotes = pickQuotes(store.getActiveEvent().vendors || [], vendorId);
  const result = compareQuotes(quotes);

  container.innerHTML = `
    <div class="comparison-banner">
      <div class="banner-summary">
        <strong>Intelligent Audit Result</strong>
        <p>${escapeHtml(result.comparison_summary)}</p>
      </div>
    </div>
    <div class="comparison-matrix">${result.normalized.map(q => matrixCardHtml(q, result)).join('')}</div>
    <div id="followup-questions-box" hidden></div>`;

  container.querySelectorAll('.select-quote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const quote = quotes.find(q => (q.quote_id || q.id) === btn.dataset.quoteId) || quotes[0];
      showDraft(quote);
    });
  });
}
