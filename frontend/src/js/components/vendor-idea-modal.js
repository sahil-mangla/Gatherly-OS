/**
 * @file vendor-idea-modal.js
 * @description Add vendor and idea spark modal forms.
 */

import { store } from '../store.js';
import { openFormModal, closeFormModal } from './form-dialog.js';

export function openAddVendorModal() {
  const bodyHtml = `
    <form id="add-vendor-form" class="modal-form">
      <div class="form-group">
        <label for="ven-name">Vendor or Studio Name *</label>
        <input type="text" id="ven-name" required placeholder="e.g. Wildflower Florals" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="ven-cat">Category *</label>
          <input type="text" id="ven-cat" required placeholder="Florals, Catering, Photo" />
        </div>
        <div class="form-group">
          <label for="ven-amount">Quoted Base Fee ($)</label>
          <input type="number" id="ven-amount" min="0" placeholder="2400" />
        </div>
      </div>

      <div class="form-group">
        <label for="ven-summary">Service Description</label>
        <textarea id="ven-summary" rows="2" placeholder="Key service scope and notes..."></textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Add to Team</button>
      </div>
    </form>
  `;

  openFormModal('Add Vendor to Team', bodyHtml);

  document.getElementById('add-vendor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      store.addVendor({
        name: document.getElementById('ven-name').value,
        category: document.getElementById('ven-cat').value,
        quoted_amount: parseFloat(document.getElementById('ven-amount').value) || 0,
        summary: document.getElementById('ven-summary').value
      });
      closeFormModal();
    } catch (err) {
      alert(err.message);
    }
  });

  document.querySelector('.cancel-btn').addEventListener('click', closeFormModal);
}

export function openAddIdeaModal() {
  const bodyHtml = `
    <form id="add-idea-form" class="modal-form">
      <div class="form-group">
        <label for="idea-title">Spark Title *</label>
        <input type="text" id="idea-title" required placeholder="e.g. Polaroid guestbook table" />
      </div>

      <div class="form-group">
        <label for="idea-desc">Inspiration Description *</label>
        <textarea id="idea-desc" rows="3" required placeholder="Describe the vibe, visual feeling, or concept..."></textarea>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="idea-cost">Estimated Cost ($)</label>
          <input type="number" id="idea-cost" min="0" step="10" placeholder="75" />
        </div>
        <div class="form-group">
          <label for="idea-author">Added By</label>
          <input type="text" id="idea-author" value="Maya" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Pin to Idea Board</button>
      </div>
    </form>
  `;

  openFormModal('Add Idea Spark', bodyHtml);

  document.getElementById('add-idea-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      store.addIdea({
        title: document.getElementById('idea-title').value,
        description: document.getElementById('idea-desc').value,
        estimated_cost: parseFloat(document.getElementById('idea-cost').value) || 0,
        author: document.getElementById('idea-author').value
      });
      closeFormModal();
    } catch (err) {
      alert(err.message);
    }
  });

  document.querySelector('.cancel-btn').addEventListener('click', closeFormModal);
}
