/**
 * @file quote-seed-parser.js
 * @description Raw quote seed parser handlers and UI rendering for unstructured vendor emails.
 */

import { store } from '../store.js';
import { askMara } from '../ai/mara-client.js';

export const seedPresets = {
  photo: `Hi Maya! We would love to capture your wedding on Sep 14. Our standard package is $2,400 with a $720 retainer upon signing. Includes 8 hours of photography and a high-resolution online gallery. Second shooter available upon request. Let us know if you want to proceed!`,
  cater: `Catering Estimate for Leila & Noor: 150 guests plated dinner buffet at $42/person plus welcome drinks ($6,300 base). Includes table linens and dinnerware. Deposit of $1,800 due on confirmation. Note: Bar setup and venue corkage billed separately.`
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function handleParseQuote(closeModalCallback) {
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
        <div><b>Deposit:</b> $${eq.deposit_amount.toLocaleString()}</div>
        <div><b>Confidence Score:</b> ${Math.round((eq.confidence_score || 0.9) * 100)}%</div>
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
    if (closeModalCallback) closeModalCallback();
  });
}
