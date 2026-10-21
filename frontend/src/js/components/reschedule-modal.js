/**
 * @file reschedule-modal.js
 * @description Milestone reschedule dialog with real-time dependency collision auditing.
 */

import { store } from '../store.js';
import { evaluateReschedule } from '../domain/timeline.js';
import { escapeHtml } from '../views/helpers.js';

export function openRescheduleModal(task, openFormModal, closeFormModal) {
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
        const conflictListHtml = result.conflicts.map(c => `<li>${escapeHtml(c.message)}</li>`).join('');
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
