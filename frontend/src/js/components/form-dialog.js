/**
 * @file form-dialog.js
 * @description Generic modal dialog shell: labelled dialog, focus management and inline (non-blocking) form errors.
 */

import { openLayer, closeLayer } from './dialog-focus.js';

const ERROR_ID = 'form-modal-error';
const FIELD_SELECTOR = ['input', 'select', 'textarea'].map(tag => `#form-modal-body ${tag}:invalid`).join(', ');
const FIRST_FIELD = 'input:not([type="hidden"]), select, textarea';
let backdrop = null;
let dialog = null;

function toggleToken(el, attr, token, on) {
  const tokens = new Set((el.getAttribute(attr) || '').split(/\s+/).filter(Boolean));
  if (on) tokens.add(token);
  else tokens.delete(token);
  if (tokens.size > 0) el.setAttribute(attr, [...tokens].join(' '));
  else el.removeAttribute(attr);
}

/** Clears the dialog's error message and the invalid state of its fields. */
export function clearFormError() {
  const box = document.getElementById(ERROR_ID);
  if (box) box.textContent = '';
  dialog?.querySelectorAll('[aria-invalid]').forEach(field => {
    field.removeAttribute('aria-invalid');
    toggleToken(field, 'aria-describedby', ERROR_ID, false);
  });
}

/** Shows an inline `role="alert"` error and flags the offending field (given by id, else the first invalid one). */
export function showFormError(message, fieldId = null) {
  clearFormError();
  document.getElementById(ERROR_ID).textContent = message;
  const field = fieldId ? document.getElementById(fieldId) : document.querySelector(FIELD_SELECTOR);
  if (!field) return;
  field.setAttribute('aria-invalid', 'true');
  toggleToken(field, 'aria-describedby', ERROR_ID, true);
  field.focus();
}

/** Creates the shared form dialog once and wires its close, backdrop and input handlers. */
export function initFormModals() {
  if (backdrop) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="generic-form-backdrop">
      <div class="modal-dialog" id="generic-form-dialog" role="dialog" aria-modal="true" aria-labelledby="form-modal-title" tabindex="-1">
        <div class="modal-header">
          <h2 id="form-modal-title">Form</h2>
          <button type="button" class="modal-close" id="form-modal-close" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
        </div>
        <div class="form-error" id="${ERROR_ID}" role="alert"></div>
        <div class="modal-body" id="form-modal-body"></div>
      </div>
    </div>
  `);
  backdrop = document.getElementById('generic-form-backdrop');
  dialog = document.getElementById('generic-form-dialog');

  document.getElementById('form-modal-close').addEventListener('click', closeFormModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeFormModal();
  });
  document.getElementById('form-modal-body').addEventListener('input', clearFormError);
}

/** Closes the shared form dialog and restores focus to the control that opened it. */
export function closeFormModal() {
  if (!backdrop) return;
  backdrop.classList.remove('open');
  clearFormError();
  closeLayer(dialog);
}

/**
 * Opens the shared dialog.
 * @param {string} title dialog title (plain text)
 * @param {string} bodyHtml trusted, pre-escaped HTML for the dialog body
 * @param {{describedBy?:string, initialFocus?:string}} [options] id of descriptive text; selector to focus first
 */
export function openFormModal(title, bodyHtml, options = {}) {
  if (!backdrop) initFormModals();
  document.getElementById('form-modal-title').textContent = title;
  clearFormError();
  const bodyEl = document.getElementById('form-modal-body');
  bodyEl.innerHTML = bodyHtml;
  if (bodyEl.querySelector('[required]')) {
    bodyEl.insertAdjacentHTML('afterbegin', '<p class="form-note">Fields marked with * are required.</p>');
  }
  bodyEl.querySelector('.cancel-btn')?.addEventListener('click', closeFormModal);
  if (options.describedBy) dialog.setAttribute('aria-describedby', options.describedBy);
  else dialog.removeAttribute('aria-describedby');

  backdrop.classList.add('open');
  openLayer({
    container: dialog,
    roots: [backdrop],
    close: closeFormModal,
    initialFocus: options.initialFocus || FIRST_FIELD
  });
}

/** Wires a form's submit: runs `onSubmit`, closes on success and shows failures inline. */
export function bindFormSubmit(formId, onSubmit) {
  document.getElementById(formId).addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      onSubmit();
      closeFormModal();
    } catch (err) {
      showFormError(err.message, err.fieldId || null);
    }
  });
}
