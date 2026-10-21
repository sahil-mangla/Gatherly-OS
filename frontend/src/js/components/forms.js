/**
 * @file forms.js
 * @description Modals and input forms for adding expenses, milestones, vendors, ideas, and resetting demo data.
 */

import { store } from '../store.js';
import { EXPENSE_CATEGORIES } from '../domain/budget.js';
import { TASK_PRIORITIES } from '../domain/timeline.js';

let formModalBackdrop = null;

export function initFormModals() {
  if (formModalBackdrop) return;

  const html = `
    <div class="modal-backdrop" id="generic-form-backdrop">
      <div class="modal-dialog" id="generic-form-dialog">
        <div class="modal-header">
          <h3 id="form-modal-title">Form</h3>
          <button class="modal-close" id="form-modal-close" aria-label="Close modal">✕</button>
        </div>
        <div class="modal-body" id="form-modal-body"></div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  formModalBackdrop = document.getElementById('generic-form-backdrop');

  document.getElementById('form-modal-close').addEventListener('click', closeFormModal);
  formModalBackdrop.addEventListener('click', (e) => {
    if (e.target === formModalBackdrop) closeFormModal();
  });
}

export function closeFormModal() {
  if (!formModalBackdrop) return;
  formModalBackdrop.classList.remove('open');
}

function openFormModal(title, bodyHtml) {
  if (!formModalBackdrop) initFormModals();
  document.getElementById('form-modal-title').innerText = title;
  document.getElementById('form-modal-body').innerHTML = bodyHtml;
  formModalBackdrop.classList.add('open');
}

export function openAddExpenseModal() {
  const catOptions = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c.replace('_', ' & ').toUpperCase()}</option>`).join('');

  const bodyHtml = `
    <form id="add-expense-form" class="modal-form">
      <div class="form-group">
        <label for="exp-desc">Item Description *</label>
        <input type="text" id="exp-desc" required placeholder="e.g. Ceremony floral archway" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="exp-cat">Category *</label>
          <select id="exp-cat">${catOptions}</select>
        </div>
        <div class="form-group">
          <label for="exp-planned">Planned Budget ($) *</label>
          <input type="number" id="exp-planned" required min="0" step="10" placeholder="1200" />
        </div>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="exp-actual">Paid to Date ($)</label>
          <input type="number" id="exp-actual" min="0" step="10" value="0" />
        </div>
        <div class="form-group">
          <label for="exp-committed">Committed Balance ($)</label>
          <input type="number" id="exp-committed" min="0" step="10" value="0" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Save Expense</button>
      </div>
    </form>
  `;

  openFormModal('Add Expense Record', bodyHtml);

  document.getElementById('add-expense-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      store.addExpense({
        description: document.getElementById('exp-desc').value,
        category: document.getElementById('exp-cat').value,
        planned_amount: parseFloat(document.getElementById('exp-planned').value) || 0,
        actual_amount: parseFloat(document.getElementById('exp-actual').value) || 0,
        committed_amount: parseFloat(document.getElementById('exp-committed').value) || 0
      });
      closeFormModal();
    } catch (err) {
      alert(err.message);
    }
  });

  document.querySelector('.cancel-btn').addEventListener('click', closeFormModal);
}

export function openAddMilestoneModal() {
  const prioOptions = TASK_PRIORITIES.map(p => `<option value="${p}">${p.toUpperCase()}</option>`).join('');

  const bodyHtml = `
    <form id="add-milestone-form" class="modal-form">
      <div class="form-group">
        <label for="mile-title">Milestone Title *</label>
        <input type="text" id="mile-title" required placeholder="e.g. Finalize reception playlist" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="mile-cat">Category *</label>
          <input type="text" id="mile-cat" required placeholder="Music / Ceremony / Invitations" />
        </div>
        <div class="form-group">
          <label for="mile-due">Due Date *</label>
          <input type="date" id="mile-due" required />
        </div>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="mile-prio">Priority</label>
          <select id="mile-prio">${prioOptions}</select>
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="mile-fixed" />
            <b>Fixed deadline (cannot slip)</b>
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Save Milestone</button>
      </div>
    </form>
  `;

  openFormModal('Add Timeline Milestone', bodyHtml);

  document.getElementById('add-milestone-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      store.addTask({
        title: document.getElementById('mile-title').value,
        category: document.getElementById('mile-cat').value,
        due_date: document.getElementById('mile-due').value,
        priority: document.getElementById('mile-prio').value,
        is_fixed_deadline: document.getElementById('mile-fixed').checked
      });
      closeFormModal();
    } catch (err) {
      alert(err.message);
    }
  });

  document.querySelector('.cancel-btn').addEventListener('click', closeFormModal);
}

export function openAddVendorModal() {
  const bodyHtml = `
    <form id="add-vendor-form" class="modal-form">
      <div class="form-group">
        <label for="ven-name">Vendor or Company Name *</label>
        <input type="text" id="ven-name" required placeholder="e.g. Sweet Laurel Bakery" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="ven-cat">Service Category *</label>
          <input type="text" id="ven-cat" required placeholder="Cake, Photo, Florals, Catering" />
        </div>
        <div class="form-group">
          <label for="ven-amount">Quoted Amount ($)</label>
          <input type="number" id="ven-amount" min="0" step="50" placeholder="1500" />
        </div>
      </div>

      <div class="form-group">
        <label for="ven-summary">Summary & Style Details</label>
        <textarea id="ven-summary" rows="3" placeholder="Brief summary of offerings, notes, and package inclusions..."></textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Save Vendor</button>
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
