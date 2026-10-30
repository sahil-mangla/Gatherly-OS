/**
 * @file quote-seed-parser.js
 * @description Raw quote seed parser handlers and UI rendering for unstructured vendor emails.
 */

import { store } from '../store.js';
import { askMara } from '../ai/mara-client.js';
import { escapeHtml } from '../views/helpers.js';
import { formatDollars as money, formatFee } from '../format.js';
import { makeId } from '../store/helpers.js';
import { showToast } from './toast.js';

export const seedPresets = {
  photo: `Hi there! We would love to capture your event. Our standard package is $2,400 with a $720 retainer upon signing. Includes 8 hours of photography and a high-resolution online gallery. Second shooter available upon request. Let us know if you want to proceed!`,
  cater: `Catering estimate: 150 guests plated dinner buffet at $42/person plus welcome drinks ($6,300 base). Includes table linens and dinnerware. Deposit of $1,800 due on confirmation. Note: Bar setup and venue corkage billed separately.`
};

const BUTTON_LABEL = '<span aria-hidden="true">✦</span> Extract details';

function setSeedError(message) {
  const field = document.getElementById('raw-quote-text');
  document.getElementById('raw-quote-error').textContent = message;
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  if (message) field.focus();
}

function missingHtml(fields) {
  if (!fields || fields.length === 0) return '';
  return `
    <div class="parsed-missing">
      <b><span aria-hidden="true">⚠</span> Missing Disclosures Detected:</b>
      <ul>${fields.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    </div>`;
}

function feesHtml(fees) {
  if (!fees || fees.length === 0) return '';
  return `
    <div class="parsed-missing">
      <b><span aria-hidden="true">⚠</span> Hidden fees found:</b>
      <ul class="parsed-fees">${fees.map(f => `<li>${escapeHtml(f.label)}: ${escapeHtml(formatFee(f))}</li>`).join('')}</ul>
    </div>`;
}

/** Plain-language caveats driven by the extractor's flags/notes (no price is shown when none was found). */
function noticeHtml(eq) {
  const flags = eq.flags || [];
  const lines = [];
  if (flags.includes('no_amount_found')) lines.push('No price was found in this text, so no base amount is shown.');
  else if (flags.includes('amount_estimated')) lines.push('The base amount is an estimate pieced together from the text, so please confirm it with the vendor.');
  if (eq.deposit_stated === false && eq.quoted_base_amount > 0) lines.push('No deposit was stated; the deposit shown is an estimate.');
  return lines.map(l => `<p class="parsed-note">${escapeHtml(l)}</p>`).join('');
}

function resultHtml(eq, sourceText) {
  const hasPrice = !(eq.flags || []).includes('no_amount_found') && Number(eq.quoted_base_amount) > 0;
  return `
    <div class="parsed-result-card">
      <div class="parsed-header">
        <span class="sparkle-icon" aria-hidden="true">✦</span>
        <div>
          <h3 id="parsed-heading" tabindex="-1">Extracted: ${escapeHtml(eq.vendor_name)}</h3>
          <span class="badge-notice">${escapeHtml(String(eq.service_type || 'vendor').toUpperCase())}</span>
        </div>
        <div class="parsed-amount">${hasPrice ? money(eq.quoted_base_amount) : 'Price not found'}</div>
      </div>
      <div class="parsed-grid">
        <div><b>Deposit:</b> ${hasPrice ? money(eq.deposit_amount) : 'Not available'}</div>
        <div><b>Confidence Score:</b> ${Math.round((eq.confidence_score ?? 0.9) * 100)}%</div>
      </div>
      <p class="parsed-source">From your text: “${escapeHtml(sourceText.slice(0, 90))}${sourceText.length > 90 ? '…' : ''}”</p>
      ${noticeHtml(eq)}
      ${feesHtml(eq.hidden_fees)}
      ${missingHtml(eq.missing_fields)}
      <div class="parsed-actions">
        <button type="button" class="primary-btn" id="save-parsed-vendor-btn">Save to Vendor Roster</button>
      </div>
    </div>`;
}

/** The extracted quote in the shape stored on a vendor and compared later by the quote matrix. */
export function storedQuoteFrom(eq) {
  return {
    id: makeId('quote'),
    name: eq.vendor_name,
    base_amount: Number(eq.quoted_base_amount) || 0,
    deposit_amount: Number(eq.deposit_amount) || 0,
    hidden_fees: eq.hidden_fees || [],
    inclusions: eq.inclusions || [],
    missing_disclosures: eq.missing_fields || [],
    service_type: eq.service_type,
    flags: eq.flags || []
  };
}

function saveVendor(eq, closeModalCallback) {
  try {
    store.addVendor({
      name: eq.vendor_name,
      category: eq.service_type,
      quoted_amount: eq.quoted_base_amount,
      deposit_paid: 0,
      summary: Number(eq.quoted_base_amount) > 0
        ? `Imported from pasted quote text. Base estimate: ${money(eq.quoted_base_amount)}.`
        : 'Imported from pasted quote text. No price was found in the text.',
      inclusions: eq.inclusions || [],
      exclusions: eq.missing_fields || [],
      quotes: [storedQuoteFrom(eq)]
    });
  } catch (err) {
    setSeedError(err.message);
    return;
  }
  showToast('Vendor added', `Added "${eq.vendor_name}" to your Vendor roster.`);
  if (closeModalCallback) closeModalCallback();
}

async function extractQuote(text) {
  const btn = document.getElementById('parse-quote-btn');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = 'Extracting details…';
  try {
    return await askMara('parse_quote_seed', text);
  } catch (err) {
    console.error('Quote extraction failed:', err);
    return {};
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = BUTTON_LABEL;
  }
}

export async function handleParseQuote(closeModalCallback) {
  setSeedError('');
  const text = document.getElementById('raw-quote-text').value.trim();
  if (!text) {
    setSeedError('Please enter or paste vendor quote text first.');
    return;
  }

  const res = await extractQuote(text);
  if (!res.extracted_quote) {
    setSeedError('Could not extract structured data. Please try again.');
    return;
  }

  const eq = res.extracted_quote;
  const resultContainer = document.getElementById('parsed-quote-result');
  resultContainer.hidden = false;
  resultContainer.innerHTML = resultHtml(eq, text);
  document.getElementById('parsed-heading').focus();
  document.getElementById('save-parsed-vendor-btn').addEventListener('click', () => saveVendor(eq, closeModalCallback));
}
