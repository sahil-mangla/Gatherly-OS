/**
 * @file forms.js
 * @description Modals and input forms for adding expenses, milestones, vendors, ideas, and resetting demo data.
 */

import { store } from '../store.js';
import { EXPENSE_CATEGORIES } from '../domain/budget.js';
import { TASK_PRIORITIES, evaluateReschedule } from '../domain/timeline.js';

let formModalBackdrop = null;

export function initFormModals() {
  if (formModalBackdrop) return;

  const html = `
    <div class="modal-backdrop" id="generic-form-backdrop">
      <div class="modal-dialog" id="generic-form-dialog" role="dialog" aria-modal="true" aria-labelledby="form-modal-title">
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

export function openRescheduleModal(task) {
  if (!task || !task.id) return;
  const event = store.getActiveEvent();

  const bodyHtml = `
    <form id="reschedule-form" class="modal-form">
      <div style="background:#f9f6f3; padding:14px; border-radius:10px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <strong style="font-size:16px;">${escapeHtml(task.title)}</strong>
          <span class="badge-notice">${(task.category || 'TASK').toUpperCase()}</span>
        </div>
        <p style="margin:0; font-size:13px; color:var(--muted);">
          Current Due Date: <b>${task.due_date || 'Unscheduled'}</b>
          ${task.is_fixed_deadline ? ' · <span style="color:var(--coral); font-weight:600;">[Fixed Milestone]</span>' : ''}
        </p>
      </div>

      <div class="form-group">
        <label for="reschedule-date">Proposed New Due Date *</label>
        <input type="date" id="reschedule-date" required value="${task.due_date || ''}" />
        <small style="color:var(--muted)">Changing this date will audit all downstream milestones.</small>
      </div>

      <div id="reschedule-collision-preview" style="margin-top:12px; margin-bottom:16px;"></div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn" id="confirm-reschedule-btn">Approve & Reschedule</button>
      </div>
    </form>
  `;

  openFormModal('Milestone Reschedule & Dependency Audit', bodyHtml);

  const dateInput = document.getElementById('reschedule-date');
  const previewDiv = document.getElementById('reschedule-collision-preview');
  const confirmBtn = document.getElementById('confirm-reschedule-btn');

  function updatePreview() {
    const newDate = dateInput.value;
    if (!newDate) {
      previewDiv.innerHTML = '';
      return;
    }

    try {
      const result = evaluateReschedule(event.tasks || [], task.id, newDate);
      if (result.has_conflicts) {
        confirmBtn.className = 'primary-btn danger-btn';
        confirmBtn.innerText = 'Acknowledge & Reschedule Anyway';
        let conflictListHtml = result.conflicts.map(c => `<li>${escapeHtml(c.message)}</li>`).join('');
        previewDiv.innerHTML = `
          <div style="background:#fff3f0; border-left:4px solid var(--coral); padding:12px; border-radius:6px;">
            <strong style="color:var(--coral); display:block; margin-bottom:4px;">⚠️ Schedule Conflicts Detected (${result.conflicts.length})</strong>
            <ul style="margin:0; padding-left:18px; font-size:13px; color:#5c2d22;">
              ${conflictListHtml}
            </ul>
            <small style="display:block; margin-top:6px; color:var(--muted);">Impacts ${result.impacted_dependents_count} downstream task(s).</small>
          </div>
        `;
      } else {
        confirmBtn.className = 'primary-btn';
        confirmBtn.innerText = 'Approve & Reschedule';
        previewDiv.innerHTML = `
          <div style="background:#f0f9f3; border-left:4px solid #2e7d32; padding:12px; border-radius:6px; color:#1b5e20; font-size:13px;">
            ✓ <b>Schedule Feasible:</b> No dependency collisions detected. ${result.impacted_dependents_count} dependent task(s) stay intact.
          </div>
        `;
      }
    } catch (err) {
      previewDiv.innerHTML = `<div style="color:var(--coral); font-size:13px;">${escapeHtml(err.message)}</div>`;
    }
  }

  dateInput.addEventListener('input', updatePreview);
  updatePreview();

  document.getElementById('reschedule-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newDate = dateInput.value;
    if (!newDate) return;
    try {
      store.rescheduleTask(task.id, newDate);
      closeFormModal();
    } catch (err) {
      alert(err.message);
    }
  });

  document.querySelector('.cancel-btn').addEventListener('click', closeFormModal);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
