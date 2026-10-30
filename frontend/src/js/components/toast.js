/**
 * @file toast.js
 * @description Status toast. Stays at least 6 seconds, pauses while hovered or focused and can be dismissed.
 */

const DURATION_MS = 6500;
let timer = null;

function setShown(shown) {
  document.getElementById('app-toast')?.classList.toggle('show', shown);
  const dismiss = document.getElementById('toast-dismiss');
  if (dismiss) dismiss.disabled = !shown;
}

function hide() {
  clearTimeout(timer);
  setShown(false);
}

function arm() {
  clearTimeout(timer);
  timer = setTimeout(hide, DURATION_MS);
}

/** One-time wiring for hover/focus pause and the dismiss button. */
export function initToast() {
  const toast = document.getElementById('app-toast');
  if (!toast || toast.dataset.ready) return;
  toast.dataset.ready = 'true';
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('focusin', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', () => toast.classList.contains('show') && arm());
  toast.addEventListener('focusout', () => toast.classList.contains('show') && arm());
  document.getElementById('toast-dismiss')?.addEventListener('click', hide);
}

export function showToast(title = 'Mara is on it', message = "I'll pull together a few thoughtful options.") {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  initToast();
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-sub').textContent = message;
  setShown(true);
  arm();
}
