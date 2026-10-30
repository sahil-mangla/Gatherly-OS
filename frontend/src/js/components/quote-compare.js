/**
 * @file quote-compare.js
 * @description Side-by-side matrix of the event's own vendor quotes (chosen with checkboxes) and the
 * generated clarification email draft. Example quotes appear only until two real quotes exist.
 */

import { store } from '../store.js';
import { compareQuotes, generateFollowUpQuestions } from '../domain/vendors.js';
import { escapeHtml } from '../views/helpers.js';
import { formatDollars } from '../format.js';
import { scrollBehavior } from '../a11y.js';
import { showToast } from './toast.js';
import {
  MAX_COMPARED, MIN_COMPARED, EXAMPLE_NOTE, quotedEntries, defaultSelection, sampleEntries, forCompare
} from './quote-entries.js';

const byId = (id) => document.getElementById(id);
const state = { entries: [], selected: new Set(), real: false, savedCount: 0, comparable: 0 };

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
        <span class="price-val">${escapeHtml(formatDollars(q.base_price))}</span>
        <small>Deposit: ${escapeHtml(formatDollars(q.deposit_amount))} (${Number(q.deposit_percent)}%)</small>
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
      <pre class="email-preview">Hi ${escapeHtml(quote.name)},

Thank you so much for sending over your detailed proposal! Before we finalize our agreement and deposit, could you clarify these items:

${questions}

Looking forward to hearing from you.
Warmly,
[Your name]</pre>
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
  const box = byId('followup-questions-box');
  box.hidden = false;
  box.innerHTML = draftHtml(quote);
  byId('copy-email-btn').addEventListener('click', () => copyDraft(box));
  box.scrollIntoView({ behavior: scrollBehavior() });
  byId('followup-heading').focus({ preventScroll: true });
}

function pickerHtml(entries) {
  const boxes = entries.map((e, i) => `
    <div class="quote-pick">
      <input type="checkbox" id="quote-pick-${i}" name="quote-pick" value="${escapeHtml(e.key)}"${e.comparable ? '' : ` disabled aria-describedby="quote-pick-${i}-reason"`}${state.selected.has(e.key) ? ' checked' : ''} />
      <label for="quote-pick-${i}">${escapeHtml(e.label)} <span class="quote-pick-price">${e.comparable ? escapeHtml(formatDollars(e.price)) : 'Price not found'}</span></label>
      ${e.comparable ? '' : `<small id="quote-pick-${i}-reason" class="quote-pick-reason">${escapeHtml(e.reason)}</small>`}
    </div>`).join('');
  return `<fieldset class="quote-picker" id="quote-picker"><legend>Vendors to compare <small>(choose ${MIN_COMPARED} to ${MAX_COMPARED})</small></legend>${boxes}</fieldset>`;
}

/** At the maximum, unchecked boxes are disabled so a fifth quote cannot be added. */
function syncPicker() {
  const full = state.selected.size >= MAX_COMPARED;
  document.querySelectorAll('#quote-picker input[name="quote-pick"]').forEach(box => {
    const entry = state.entries.find(e => e.key === box.value);
    box.disabled = !entry.comparable || (full && !box.checked);
  });
}

function renderMatrix() {
  const picked = state.entries.filter(e => state.selected.has(e.key));
  const status = byId('quote-compare-status');
  const matrix = byId('quote-compare-matrix');
  if (picked.length < MIN_COMPARED) {
    matrix.innerHTML = '';
    status.textContent = `Choose at least ${MIN_COMPARED} vendors to compare.`;
    return;
  }
  const result = compareQuotes(picked.map(forCompare));
  matrix.innerHTML = result.normalized.map(q => matrixCardHtml(q, result)).join('');
  status.textContent = result.comparison_summary;
}

function onChange(e) {
  if (e.target.name !== 'quote-pick') return;
  if (e.target.checked) state.selected.add(e.target.value);
  else state.selected.delete(e.target.value);
  syncPicker();
  renderMatrix();
}

function onClick(e) {
  const btn = e.target.closest('.select-quote-btn');
  const entry = btn && state.entries.find(en => en.key === btn.dataset.quoteId);
  if (entry) showDraft(forCompare(entry));
}

function introHtml() {
  if (state.real) return '';
  const saved = state.savedCount;
  const hint = saved > 0
    ? `You have ${saved} saved ${saved === 1 ? 'quote' : 'quotes'}; add ${MIN_COMPARED - state.comparable} more with a price to compare your own vendors.`
    : 'Open “Paste quote text” to add a vendor’s quote.';
  return `<p class="comparison-example" id="quote-example-note"><b>${EXAMPLE_NOTE}</b><br />${escapeHtml(hint)}</p>`;
}

export function renderComparisonView(vendorId) {
  const container = byId('quote-comparison-content');
  if (!container) return;

  const stored = quotedEntries(store.getActiveEvent().vendors || [], vendorId);
  const comparable = stored.filter(e => e.comparable);
  state.real = comparable.length >= MIN_COMPARED;
  state.savedCount = stored.length;
  state.comparable = comparable.length;
  state.entries = state.real ? stored : sampleEntries();
  state.selected = new Set(defaultSelection(state.entries));

  container.innerHTML = `
    ${introHtml()}
    ${state.real ? pickerHtml(state.entries) : ''}
    <div class="comparison-banner"><div class="banner-summary">
      <strong>Intelligent Audit Result</strong>
      <p id="quote-compare-status" role="status" aria-live="polite"></p>
    </div></div>
    <div class="comparison-matrix" id="quote-compare-matrix"></div>
    <div id="followup-questions-box" hidden></div>`;
  syncPicker();
  renderMatrix();
  if (!container.dataset.bound) {
    container.dataset.bound = 'true';
    container.addEventListener('change', onChange);
    container.addEventListener('click', onClick);
  }
}
