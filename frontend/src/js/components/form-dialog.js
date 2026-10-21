/**
 * @file form-dialog.js
 * @description Generic modal dialog shell with ARIA accessibility.
 */

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

export function openFormModal(title, bodyHtml) {
  if (!formModalBackdrop) initFormModals();
  document.getElementById('form-modal-title').innerText = title;
  const bodyEl = document.getElementById('form-modal-body');
  bodyEl.innerHTML = bodyHtml;
  bodyEl.querySelector('.cancel-btn')?.addEventListener('click', closeFormModal);
  formModalBackdrop.classList.add('open');
}

