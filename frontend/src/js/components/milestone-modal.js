/**
 * @file milestone-modal.js
 * @description Schedule milestone modal form.
 */

import { store } from '../store.js';
import { TASK_PRIORITIES } from '../domain/timeline.js';
import { validateNewTask } from '../domain/dependencies.js';
import { openFormModal, bindFormSubmit } from './form-dialog.js';
import { dependencyFieldsetHtml, selectedDependencies, dependencyInputId } from './dependency-picker.js';

const value = (id) => document.getElementById(id).value;

function readDraft() {
  return {
    title: value('mile-title'),
    category: value('mile-cat'),
    due_date: value('mile-due'),
    priority: value('mile-prio'),
    is_fixed_deadline: document.getElementById('mile-fixed').checked,
    depends_on: selectedDependencies()
  };
}

/** Rejects a draft whose dependencies are cyclic or due later than it, pointing at the offending checkbox. */
function submitMilestone(tasks) {
  const draft = readDraft();
  const check = validateNewTask(tasks, draft);
  if (!check.valid) throw Object.assign(new Error(check.errors[0]), { fieldId: dependencyInputId(check.offender) });
  store.addTask(draft);
}

/** Opens the dialog for adding a milestone, with optional prerequisites. */
export function openAddMilestoneModal() {
  const tasks = store.getActiveEvent().tasks || [];
  const prioOptions = TASK_PRIORITIES.map(p => `<option value="${p}">${p.toUpperCase()}</option>`).join('');

  openFormModal('Schedule Milestone', `
    <form id="add-milestone-form" class="modal-form">
      <div class="form-group">
        <label for="mile-title">Milestone Title <span class="req" aria-hidden="true">*</span></label>
        <input type="text" id="mile-title" name="title" autocomplete="off" required placeholder="e.g. Confirm final guest headcount" />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="mile-cat">Category <span class="req" aria-hidden="true">*</span></label>
          <input type="text" id="mile-cat" name="category" autocomplete="off" required value="Planning" />
        </div>
        <div class="form-group">
          <label for="mile-due">Due Date <span class="req" aria-hidden="true">*</span></label>
          <input type="date" id="mile-due" name="due_date" autocomplete="off" required />
        </div>
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label for="mile-prio">Priority</label>
          <select id="mile-prio" name="priority">${prioOptions}</select>
        </div>
        <div class="form-group checkbox-group">
          <label><input type="checkbox" id="mile-fixed" name="is_fixed_deadline" /> Fixed Non-negotiable Deadline</label>
        </div>
      </div>

      ${dependencyFieldsetHtml(tasks)}

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">Add Milestone</button>
      </div>
    </form>
  `);

  bindFormSubmit('add-milestone-form', () => submitMilestone(tasks));
}
