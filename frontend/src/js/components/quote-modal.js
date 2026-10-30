/**
 * @file quote-modal.js
 * @description Vendor quote comparison modal shell (ARIA tabs) and seed parser dialog.
 */

import { seedPresets, handleParseQuote } from './quote-seed-parser.js';
import { renderComparisonView } from './quote-compare.js';
import { openLayer, closeLayer } from './dialog-focus.js';
import { initTabs } from './tabs.js';

let modalElement = null;
let dialogElement = null;
let selectTab = null;

const MODAL_HTML = `
  <div class="modal-backdrop" id="quote-modal-backdrop">
    <div class="modal-dialog modal-large" id="quote-modal" role="dialog" aria-modal="true" aria-labelledby="quote-modal-title" aria-describedby="quote-modal-desc" tabindex="-1">
      <div class="modal-header">
        <div>
          <span class="eyebrow">VENDOR QUOTES</span>
          <h2 id="quote-modal-title">Compare vendor quotes</h2>
        </div>
        <button type="button" class="modal-close" id="quote-modal-close" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
      </div>
      <p class="sr-only" id="quote-modal-desc">Compare vendor quotes side by side, or paste a vendor's quote text to extract its price, deposit and missing terms.</p>

      <div class="modal-tabs" role="tablist" aria-label="Quote tools">
        <button type="button" class="tab-btn active" role="tab" id="tab-compare" data-tab="compare-tab" aria-controls="compare-tab" aria-selected="true">Side-by-Side Comparison</button>
        <button type="button" class="tab-btn" role="tab" id="tab-seed" data-tab="seed-tab" aria-controls="seed-tab" aria-selected="false" tabindex="-1">Paste quote text</button>
      </div>

      <div class="modal-body">
        <div class="tab-pane" role="tabpanel" id="compare-tab" aria-labelledby="tab-compare">
          <div id="quote-comparison-content"></div>
        </div>

        <div class="tab-pane" role="tabpanel" id="seed-tab" aria-labelledby="tab-seed" hidden>
          <div class="seed-parser-shell">
            <p class="seed-intro" id="seed-intro">Paste a quote, proposal text or email from any vendor. Gatherly pulls out the price, deposit, hidden fees and the terms the vendor never mentioned.</p>

            <div class="preset-row" role="group" aria-label="Example quotes to try">
              <span aria-hidden="true">Try an example:</span>
              <button type="button" class="seed-chip" data-preset="photo"><span aria-hidden="true">📷</span> Photo Proposal</button>
              <button type="button" class="seed-chip" data-preset="cater"><span aria-hidden="true">🍽️</span> Catering Estimate</button>
            </div>

            <label for="raw-quote-text">Vendor quote text</label>
            <textarea id="raw-quote-text" name="raw_quote" rows="5" autocomplete="off" placeholder="Paste vendor email or quote text here..." aria-describedby="seed-intro raw-quote-error"></textarea>
            <p class="field-error" id="raw-quote-error" role="alert"></p>
            <button type="button" class="primary-btn" id="parse-quote-btn"><span aria-hidden="true">✦</span> Extract details</button>

            <div id="parsed-quote-result" aria-live="polite" hidden></div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

export function initQuoteModal() {
  if (modalElement) return;

  document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
  modalElement = document.getElementById('quote-modal-backdrop');
  dialogElement = document.getElementById('quote-modal');

  document.getElementById('quote-modal-close').addEventListener('click', closeQuoteModal);
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) closeQuoteModal();
  });

  selectTab = initTabs(modalElement.querySelector('[role="tablist"]'));
  selectTab(document.getElementById('tab-compare'));

  modalElement.querySelectorAll('.seed-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('raw-quote-text').value = seedPresets[chip.dataset.preset] || '';
    });
  });

  document.getElementById('parse-quote-btn').addEventListener('click', () => handleParseQuote(closeQuoteModal));
}

export function openQuoteModal(vendorId = null) {
  if (!modalElement) initQuoteModal();
  renderComparisonView(vendorId);
  selectTab(document.getElementById('tab-compare'));
  modalElement.classList.add('open');
  openLayer({ container: dialogElement, roots: [modalElement], close: closeQuoteModal, initialFocus: '#tab-compare' });
}

export function closeQuoteModal() {
  if (!modalElement) return;
  modalElement.classList.remove('open');
  closeLayer(dialogElement);
}
