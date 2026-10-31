/**
 * @file vendors-view.js
 * @description Vendors page renderer showing vendor cards, allocation metrics, and quote reviews.
 */

import { formatMoney } from '../domain/budget.js';
import { openQuoteModal } from '../components/quote-modal.js';
import { createViewContext } from './context.js';
import { escapeHtml, upperEscaped, bindOnce, setHtml } from './helpers.js';

const PHOTO_CLASSES = {
  cake: 'cake', bakery: 'cake', photo: 'photo', photography: 'photo', florals: 'flower', flowers: 'flower', floral: 'flower'
};

function photoClass(category) {
  const key = String(category || '').toLowerCase();
  return `${PHOTO_CLASSES[key] || 'general'}-photo`;
}

function summaryHtml(vendors, { budget, cur }) {
  const booked = vendors.filter(v => v.status === 'booked').length;
  const toReview = vendors.filter(v => v.status === 'shortlist').length;
  const spent = vendors.reduce((acc, v) => acc + (v.deposit_paid || v.quoted_amount || 0), 0);
  return `
    <div><span class="eyebrow">BOOKED</span><strong>${booked} / ${vendors.length}</strong><small>vendors confirmed</small></div>
    <div><span class="eyebrow">TO REVIEW</span><strong class="${toReview > 0 ? 'coral-text' : ''}">${toReview}</strong><small>quotes waiting review</small></div>
    <div><span class="eyebrow">ALLOCATED</span><strong>${escapeHtml(formatMoney(spent, cur))}</strong><small>of ${escapeHtml(formatMoney(budget.total_budget, cur))} total budget</small></div>`;
}

function vendorCardHtml(v, cur) {
  const isBooked = v.status === 'booked';
  const id = escapeHtml(v.id);
  const name = escapeHtml(v.name);
  const action = isBooked ? 'View details' : 'Review quote';
  return `
    <article class="vendor-card-large">
      <div class="vendor-photo ${photoClass(v.category)}" aria-hidden="true">${escapeHtml(v.avatar_emoji || '🤝')}</div>
      <div class="vendor-details">
        <span class="vendor-category">${upperEscaped(v.category, 'VENDOR')} · ${upperEscaped(v.status, 'PENDING')}</span>
        <h3>${name}</h3>
        <p>${escapeHtml(v.summary || 'Vendor service partner')}</p>
        <div class="vendor-bottom">
          <span>${escapeHtml(formatMoney(v.quoted_amount || 0, cur))} · ${isBooked ? 'Deposit paid' : 'Quote received'}</span>
          <button type="button" class="review-quote-btn" data-id="${id}" data-focus-key="vendor:${id}" aria-label="${action}: ${name}">${action} <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </article>`;
}

function onGridClick(e) {
  const btn = e.target.closest('.review-quote-btn');
  if (btn) openQuoteModal(btn.dataset.id);
}

/** Renders the Vendors view. */
export function renderVendors(ctx = createViewContext()) {
  const vendors = ctx.event.vendors || [];
  setHtml('vendor-summary-cards', summaryHtml(vendors, ctx));

  const grid = document.getElementById('vendor-cards-grid');
  if (!grid) return;
  bindOnce(grid, 'click', onGridClick);
  grid.innerHTML = vendors.length === 0
    ? '<p class="empty-note">No vendors added yet. Use “+ Add vendor” or “Compare Quotes”.</p>'
    : vendors.map(v => vendorCardHtml(v, ctx.cur)).join('');
}
