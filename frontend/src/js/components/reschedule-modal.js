/**
 * @file reschedule-modal.js
 * @description Milestone reschedule dialog with real-time dependency collision auditing.
 */

import { store } from '../store.js';
import { evaluateReschedule } from '../domain/timeline.js';
import { escapeHtml, upperEscaped, dateText } from '../views/helpers.js';
import { showFormError } from './form-dialog.js';

function bodyHtml(task) {
  const due = task.due_date ? escapeHtml(dateText(task.due_date)) : 'Unscheduled';
  return `
    <form id="reschedule-form" class="modal-form">
      <div class="reschedule-summary">
        <div class="reschedule-summary-top">
          <strong>${escapeHtml(task.title)}</strong>
          <span class="badge-notice">${upperEscaped(task.category, 'TASK')}</span>
        </div>
        <p>Current due date: <b>${due}</b>${task.is_fixed_deadline ? ' · <span class="fixed-flag">Fixed milestone</span>' : ''}</p>
      </div>

      <div class="form-group">
        <label for="reschedule-date">Proposed New Due Date <span class="req" aria-hidden="true">*</span></label>
        <input type="date" id="reschedule-date" name="due_date" autocomplete="off" required value="${escapeHtml(task.due_date || '')}" aria-describedby="reschedule-hint reschedule-collision-preview" />
        <small class="field-hint" id="reschedule-hint">Changing this date will audit all downstream milestones.</small>
      </div>

      <div id="reschedule-collision-preview" class="collision-preview" role="status"></div>

      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn" id="confirm-reschedule-btn">Approve &amp; Reschedule</button>
      </div>
    </form>`;
}

function conflictHtml(result) {
  const items = result.conflicts.map(c => `<li>${escapeHtml(c.message)}</li>`).join('');
  return `
    <div class="collision conflict">
      <strong><span aria-hidden="true">⚠</span> Schedule conflicts detected (${result.conflicts.length})</strong>
      <ul>${items}</ul>
      <small>Impacts ${result.impacted_dependents_count} downstream task(s).</small>
    </div>`;
}

function feasibleHtml(result) {
  return `
    <div class="collision feasible">
      <span aria-hidden="true">✓</span> <b>Schedule feasible:</b> No dependency collisions detected. ${result.impacted_dependents_count} dependent task(s) stay intact.
    </div>`;
}

function previewFor(taskId, date) {
  try {
    const result = evaluateReschedule(store.getActiveEvent().tasks || [], taskId, date);
    return { conflicts: result.has_conflicts, html: result.has_conflicts ? conflictHtml(result) : feasibleHtml(result) };
  } catch (err) {
    return { conflicts: false, html: `<div class="collision conflict">${escapeHtml(err.message)}</div>` };
  }
}

export function openRescheduleModal(task, openFormModal, closeFormModal) {
  if (!task || !task.id) return;
  openFormModal('Milestone Reschedule & Dependency Audit', bodyHtml(task), { describedBy: 'reschedule-hint' });

  const dateInput = document.getElementById('reschedule-date');
  const previewDiv = document.getElementById('reschedule-collision-preview');
  const confirmBtn = document.getElementById('confirm-reschedule-btn');

  function updatePreview() {
    if (!dateInput.value) {
      previewDiv.innerHTML = '';
      return;
    }
    const { conflicts, html } = previewFor(task.id, dateInput.value);
    confirmBtn.className = conflicts ? 'primary-btn danger-btn' : 'primary-btn';
    confirmBtn.textContent = conflicts ? 'Acknowledge & Reschedule Anyway' : 'Approve & Reschedule';
    previewDiv.innerHTML = html;
  }

  dateInput.addEventListener('input', updatePreview);
  updatePreview();

  document.getElementById('reschedule-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!dateInput.value) return;
    try {
      store.rescheduleTask(task.id, dateInput.value);
      closeFormModal();
    } catch (err) {
      showFormError(err.message, 'reschedule-date');
    }
  });
}
