/**
 * @file confirm-dialog.js
 * @description Accessible replacement for window.confirm(), built on the shared form dialog.
 */

import { openFormModal, closeFormModal } from './form-dialog.js';
import { escapeHtml } from '../views/helpers.js';

/** Opens a confirm/cancel dialog; `onConfirm` runs only when the user confirms. */
export function openConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm }) {
  openFormModal(title, `
    <p class="confirm-message" id="confirm-message">${escapeHtml(message)}</p>
    <div class="form-actions">
      <button type="button" class="text-btn cancel-btn">Cancel</button>
      <button type="button" class="primary-btn" id="confirm-ok-btn">${escapeHtml(confirmLabel)}</button>
    </div>
  `, { describedBy: 'confirm-message', initialFocus: '.cancel-btn' });

  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    closeFormModal();
    onConfirm();
  });
}
