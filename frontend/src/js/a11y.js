/**
 * @file a11y.js
 * @description Small accessibility helpers shared by views and components
 * (progress semantics, motion preferences and focus preservation across re-renders).
 */

/** True when the user asked the OS/browser to minimise animation. */
export function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Scroll behaviour that honours `prefers-reduced-motion`. */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/**
 * Keeps an ARIA progressbar in sync with its visual value.
 * @param {HTMLElement|null} el element carrying role="progressbar"
 * @param {{now:number,label?:string,valuetext?:string}} state percentage 0-100 plus optional text
 */
export function setProgress(el, { now, label, valuetext }) {
  if (!el) return;
  const value = Math.max(0, Math.min(100, Math.round(Number(now) || 0)));
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.setAttribute('aria-valuenow', String(value));
  if (label) el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuetext', valuetext || `${value}%`);
}

/** Finds an element by its `data-focus-key` (the key may degrade by dropping its last ':' segment). */
export function findByFocusKey(key) {
  if (!key) return null;
  const all = [...document.querySelectorAll('[data-focus-key]')];
  const exact = all.find(el => el.dataset.focusKey === key);
  if (exact) return exact;
  const parent = key.includes(':') ? key.slice(0, key.lastIndexOf(':')) : null;
  return parent ? all.find(el => el.dataset.focusKey === parent) || null : null;
}

/** Moves focus to the element matching `key`; returns whether focus moved. */
export function focusByKey(key) {
  const target = findByFocusKey(key);
  if (target) target.focus();
  return Boolean(target);
}

/** Returns the focus key of the currently focused element, if any. */
export function activeFocusKey() {
  const active = document.activeElement;
  return active && active.dataset ? active.dataset.focusKey || null : null;
}
