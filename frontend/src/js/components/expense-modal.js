/**
 * @file expense-modal.js
 * @description Add budget expense modal form.
 */

import { store } from '../store.js';
import { EXPENSE_CATEGORIES } from '../domain/budget.js';
import { openFormModal, bindFormSubmit } from './form-dialog.js';

const value = (id) => document.getElementById(id).value;
const amount = (id) => parseFloat(value(id)) || 0;

export function openAddExpenseModal() {
  const catOptions = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c.replace('_', ' & ').toUpperCase()}</option>`).join('');

  openFormModal('Add Budget Expense', `
    <form id="add-expense-form" class="modal-form">
      <div class="form-group">
        <label for="exp-desc">Item Description <span class="req" aria-hidden="true">*</span></label>
        <input type="text" id="exp-desc" name="description" autocomplete="off" required placeholder="e.g. Ceremony floral archway" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="exp-cat">Category <span class="req" aria-hidden="true">*</span></label>
          <select id="exp-cat" name="category" required>${catOptions}</select>
        </div>
        <div class="form-group">
          <label for="exp-planned">Planned Amount ($) <span class="req" aria-hidden="true">*</span></label>
          <input type="number" id="exp-planned" name="planned_amount" autocomplete="off" inputmode="decimal" required min="0" step="1" placeholder="1200" />
        </div>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="exp-actual">Actual Spent ($)</label>
          <input type="number" id="exp-actual" name="actual_amount" autocomplete="off" inputmode="decimal" min="0" step="1" value="0" />
        </div>
        <div class="form-group">
          <label for="exp-committed">Committed / Retainer ($)</label>
          <input type="number" id="exp-committed" name="committed_amount" autocomplete="off" inputmode="decimal" min="0" step="1" value="0" />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Save Expense</button>
      </div>
    </form>
  `);

  bindFormSubmit('add-expense-form', () => store.addExpense({
    description: value('exp-desc'),
    category: value('exp-cat'),
    planned_amount: amount('exp-planned'),
    actual_amount: amount('exp-actual'),
    committed_amount: amount('exp-committed')
  }));
}
