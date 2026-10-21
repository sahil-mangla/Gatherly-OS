/**
 * @file expense-modal.js
 * @description Add budget expense modal form.
 */

import { store } from '../store.js';
import { EXPENSE_CATEGORIES } from '../domain/budget.js';
import { openFormModal, closeFormModal } from './form-dialog.js';

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
          <select id="exp-cat" required>${catOptions}</select>
        </div>
        <div class="form-group">
          <label for="exp-planned">Planned Amount ($) *</label>
          <input type="number" id="exp-planned" required min="0" step="1" placeholder="1200" />
        </div>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="exp-actual">Actual Spent ($)</label>
          <input type="number" id="exp-actual" min="0" step="1" value="0" />
        </div>
        <div class="form-group">
          <label for="exp-committed">Committed / Retainer ($)</label>
          <input type="number" id="exp-committed" min="0" step="1" value="0" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Save Expense</button>
      </div>
    </form>
  `;

  openFormModal('Add Budget Expense', bodyHtml);

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
