/**
 * @file dialog-focus.js
 * @description Shared modal-layer manager: remembers the opener, moves focus in, traps Tab,
 * makes the rest of the page inert, closes only the topmost layer on Escape and restores focus.
 */

import { focusByKey } from '../a11y.js';

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';
const stack = [];
const inerted = new Set();
let listening = false;

function isFocusable(el) {
  if (el.disabled || el.tabIndex < 0) return false;
  if (el.closest('[hidden],[inert]')) return false;
  return window.getComputedStyle(el).visibility !== 'hidden';
}

/** Tabbable descendants of `container` in DOM order. */
export function getFocusable(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(isFocusable);
}

function trapTab(event, layer) {
  const items = getFocusable(layer.container);
  if (items.length === 0) {
    event.preventDefault();
    layer.container.focus();
    return;
  }
  const edge = event.shiftKey ? items[0] : items[items.length - 1];
  const wrapTo = event.shiftKey ? items[items.length - 1] : items[0];
  const active = document.activeElement;
  if (active === edge || !layer.container.contains(active)) {
    event.preventDefault();
    wrapTo.focus();
  }
}

function onKeydown(event) {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    top.close();
  } else if (event.key === 'Tab') {
    trapTab(event, top);
  }
}

function setInert(el, value) {
  if (value && !el.inert) {
    el.inert = true;
    inerted.add(el);
  } else if (!value && inerted.has(el)) {
    el.inert = false;
    inerted.delete(el);
  }
}

/** Everything outside the topmost layer (and the toast) becomes inert while a layer is open. */
function syncInert() {
  const top = stack[stack.length - 1];
  const keep = new Set(top ? [...top.roots, document.getElementById('app-toast')] : []);
  for (const child of document.body.children) {
    if (child.tagName === 'SCRIPT') continue;
    setInert(child, Boolean(top) && !keep.has(child));
  }
}

function restoreFocus(layer) {
  const opener = layer.opener;
  if (opener && opener.isConnected && opener !== document.body) {
    opener.focus();
  } else if (!focusByKey(layer.openerKey)) {
    document.getElementById('main')?.focus();
  }
}

function focusInitial(container, initialFocus) {
  const preferred = typeof initialFocus === 'string' ? container.querySelector(initialFocus) : initialFocus;
  (preferred || getFocusable(container)[0] || container).focus({ preventScroll: true });
}

/**
 * Registers an open modal layer.
 * @param {{container:HTMLElement, roots?:HTMLElement[], close:Function, initialFocus?:string|HTMLElement}} opts
 */
export function openLayer({ container, roots, close, initialFocus }) {
  if (stack.some(layer => layer.container === container)) return;
  if (!listening) {
    document.addEventListener('keydown', onKeydown);
    listening = true;
  }
  const opener = document.activeElement;
  const openerKey = opener && opener.dataset ? opener.dataset.focusKey || null : null;
  stack.push({ container, roots: roots || [container], close, opener, openerKey });
  syncInert();
  focusInitial(container, initialFocus);
}

/** Unregisters a layer; focus returns to its trigger when it was the topmost one. */
export function closeLayer(container) {
  const index = stack.findIndex(layer => layer.container === container);
  if (index === -1) return;
  const wasTop = index === stack.length - 1;
  const [layer] = stack.splice(index, 1);
  syncInert();
  if (wasTop) restoreFocus(layer);
}

/** Number of open layers (useful for tests and guards). */
export function openLayerCount() {
  return stack.length;
}
