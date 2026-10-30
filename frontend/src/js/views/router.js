/**
 * @file router.js
 * @description View switching: renders only the visible view (others stay dirty until shown),
 * keeps nav `aria-current`, the document title and heading focus in sync.
 */

import { store } from '../store.js';
import { captureFocus, restoreFocus } from '../a11y.js';
import { createViewContext } from './context.js';
import { renderOverview } from './overview-view.js';
import { renderBudget } from './budget-view.js';
import { renderTimeline } from './timeline-view.js';
import { renderVendors } from './vendors-view.js';
import { renderIdeas } from './ideas-view.js';

export const VIEWS = {
  overview: { label: 'Overview', render: renderOverview },
  budget: { label: 'Budget', render: renderBudget },
  timeline: { label: 'Timeline', render: renderTimeline },
  vendors: { label: 'Vendors', render: renderVendors },
  ideas: { label: 'Idea board', render: renderIdeas }
};

const dirty = new Set(Object.keys(VIEWS));
let current = 'overview';

export function currentView() {
  return current;
}

export function updateTitle() {
  const event = store.getActiveEvent();
  const name = event ? ` · ${event.name}` : '';
  document.title = `${VIEWS[current].label}${name} · Gatherly`;
}

function renderView(viewId) {
  VIEWS[viewId].render(createViewContext());
  dirty.delete(viewId);
}

/** Store changed: everything is stale, but only the visible view is rebuilt (focus is preserved). */
export function refreshCurrentView() {
  Object.keys(VIEWS).forEach(id => dirty.add(id));
  const snapshot = captureFocus();
  renderView(current);
  restoreFocus(snapshot);
}

function syncNav(viewId) {
  document.querySelectorAll('.nav-item').forEach(item => {
    const active = item.dataset.view === viewId;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

/**
 * Shows a view, rendering it first when stale.
 * @param {string} viewId one of the keys of VIEWS
 * @param {{focus?:boolean}} [options] focus: move keyboard focus to the view's h1
 */
export function showView(viewId, { focus = false } = {}) {
  if (!VIEWS[viewId]) return;
  current = viewId;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
  syncNav(viewId);
  if (dirty.has(viewId)) renderView(viewId);
  updateTitle();
  if (focus) document.querySelector(`#${viewId} h1`)?.focus({ preventScroll: true });
}
