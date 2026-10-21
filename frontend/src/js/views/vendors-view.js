/**
 * @file vendors-view.js
 * @description Vendors page renderer showing vendor cards, allocation metrics, and quote reviews.
 */

import { store } from '../store.js';
import { calculateBudgetSummary } from '../domain/budget.js';
import { openQuoteModal } from '../components/quote-modal.js';
import { escapeHtml } from './helpers.js';

export function renderVendors() {
  const event = store.getActiveEvent();
  const vendors = event.vendors || [];
  const budget = calculateBudgetSummary(event);

  const booked = vendors.filter(v => v.status === 'booked').length;
  const toReview = vendors.filter(v => v.status === 'shortlist').length;
  const vendorSpent = vendors.reduce((acc, v) => acc + (v.deposit_paid || v.quoted_amount || 0), 0);

  const summaryCards = document.getElementById('vendor-summary-cards');
  if (summaryCards) {
    summaryCards.innerHTML = `
      <div>
        <span class="eyebrow">BOOKED</span>
        <strong>${booked} / ${vendors.length}</strong>
        <small>vendors confirmed</small>
      </div>
      <div>
        <span class="eyebrow">TO REVIEW</span>
        <strong class="${toReview > 0 ? 'coral-text' : ''}">${toReview}</strong>
        <small>quotes waiting review</small>
      </div>
      <div>
        <span class="eyebrow">ALLOCATED</span>
        <strong>$${vendorSpent.toLocaleString()}</strong>
        <small>of $${budget.total_budget.toLocaleString()} total budget</small>
      </div>
    `;
  }

  const grid = document.getElementById('vendor-cards-grid');
  if (grid) {
    grid.innerHTML = '';
    if (vendors.length === 0) {
      grid.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);grid-column:1/-1">No vendors added yet. Click "+ Add vendor" or "Compare Quotes".</div>';
      return;
    }

    vendors.forEach(v => {
      const card = document.createElement('div');
      card.className = 'vendor-card-large';
      const isBooked = v.status === 'booked';

      card.innerHTML = `
        <div class="vendor-photo ${v.category?.toLowerCase() || 'general'}-photo">${v.avatar_emoji || '🤝'}</div>
        <div class="vendor-details">
          <span class="vendor-category">${(v.category || 'VENDOR').toUpperCase()} · ${(v.status || 'PENDING').toUpperCase()}</span>
          <h3>${escapeHtml(v.name)}</h3>
          <p>${escapeHtml(v.summary || 'Vendor service partner')}</p>
          <div class="vendor-bottom">
            <span>$${(v.quoted_amount || 0).toLocaleString()} · ${isBooked ? 'Deposit paid' : 'Quote received'}</span>
            <button class="review-quote-btn" data-id="${v.id}">${isBooked ? 'View details →' : 'Review quote →'}</button>
          </div>
        </div>
      `;

      card.querySelector('.review-quote-btn').addEventListener('click', () => {
        openQuoteModal(v.id);
      });

      grid.appendChild(card);
    });
  }
}
