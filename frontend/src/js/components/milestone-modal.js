/**
 * @file milestone-modal.js
 * @description Schedule milestone modal form.
 */

import { store } from '../store.js';
import { TASK_PRIORITIES } from '../domain/timeline.js';
import { openFormModal, closeFormModal } from './form-dialog.js';

export function openAddMilestoneModal() {
  const prioOptions = TASK_PRIORITIES.map(p => `<option value="${p}">${p.toUpperCase()}</option>`).join('');

  const bodyHtml = `
    <form id="add-milestone-form" class="modal-form">
      <div class="form-group">
        <label for="mile-title">Milestone Title *</label>
        <input type="text" id="mile-title" required placeholder="e.g. Confirm final guest headcount" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="mile-cat">Category *</label>
          <input type="text" id="mile-cat" required value="Planning" />
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
        <div class="form-group checkbox-group" style="padding-top:28px;">
          <label><input type="checkbox" id="mile-fixed" /> Fixed Non-negotiable Deadline</label>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Add Milestone</button>
      </div>
    </form>
  `;

  openFormModal('Schedule Milestone', bodyHtml);

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
