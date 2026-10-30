/**
 * @file vendor-idea-modal.js
 * @description Add vendor and idea spark modal forms.
 */

import { store } from '../store.js';
import { openFormModal, bindFormSubmit } from './form-dialog.js';

const value = (id) => document.getElementById(id).value;
const amount = (id) => parseFloat(value(id)) || 0;

export function openAddVendorModal() {
  openFormModal('Add Vendor to Team', `
    <form id="add-vendor-form" class="modal-form">
      <div class="form-group">
        <label for="ven-name">Vendor or Studio Name <span class="req" aria-hidden="true">*</span></label>
        <input type="text" id="ven-name" name="name" autocomplete="organization" required placeholder="e.g. Wildflower Florals" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="ven-cat">Category <span class="req" aria-hidden="true">*</span></label>
          <input type="text" id="ven-cat" name="category" autocomplete="off" required placeholder="Florals, Catering, Photo" />
        </div>
        <div class="form-group">
          <label for="ven-amount">Quoted Base Fee ($)</label>
          <input type="number" id="ven-amount" name="quoted_amount" autocomplete="off" inputmode="decimal" min="0" placeholder="2400" />
        </div>
      </div>

      <div class="form-group">
        <label for="ven-summary">Service Description</label>
        <textarea id="ven-summary" name="summary" autocomplete="off" rows="2" placeholder="Key service scope and notes..."></textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Add to Team</button>
      </div>
    </form>
  `);

  bindFormSubmit('add-vendor-form', () => store.addVendor({
    name: value('ven-name'),
    category: value('ven-cat'),
    quoted_amount: amount('ven-amount'),
    summary: value('ven-summary')
  }));
}

export function openAddIdeaModal() {
  openFormModal('Add Idea Spark', `
    <form id="add-idea-form" class="modal-form">
      <div class="form-group">
        <label for="idea-title">Spark Title <span class="req" aria-hidden="true">*</span></label>
        <input type="text" id="idea-title" name="title" autocomplete="off" required placeholder="e.g. Polaroid guestbook table" />
      </div>

      <div class="form-group">
        <label for="idea-desc">Inspiration Description <span class="req" aria-hidden="true">*</span></label>
        <textarea id="idea-desc" name="description" autocomplete="off" rows="3" required placeholder="Describe the vibe, visual feeling, or concept..."></textarea>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="idea-cost">Estimated Cost ($)</label>
          <input type="number" id="idea-cost" name="estimated_cost" autocomplete="off" inputmode="decimal" min="0" step="10" placeholder="75" />
        </div>
        <div class="form-group">
          <label for="idea-author">Added By</label>
          <input type="text" id="idea-author" name="author" autocomplete="name" value="You" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Pin to Idea Board</button>
      </div>
    </form>
  `);

  bindFormSubmit('add-idea-form', () => store.addIdea({
    title: value('idea-title'),
    description: value('idea-desc'),
    estimated_cost: amount('idea-cost'),
    author: value('idea-author')
  }));
}
