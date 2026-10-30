/**
 * @file app.js
 * @description Main application controller for Gatherly.
 * Wires components, navigation and the reactive store; renders only the visible view per event.
 */

import { store } from './store.js';
import { calculateBudgetSummary } from './domain/budget.js';
import { initCopilotDrawer, openCopilot } from './components/copilot-drawer.js';
import { initRiskTray } from './components/risk-tray.js';
import { initQuoteModal, openQuoteModal } from './components/quote-modal.js';
import {
  initFormModals,
  openConfirmDialog,
  openAddExpenseModal,
  openAddMilestoneModal,
  openAddVendorModal,
  openAddIdeaModal,
  openNewEventModal,
  openEditEventModal
} from './components/forms.js';
import { initTenantAuthBadge } from './components/tenant-auth-badge.js';
import { initToast, showToast } from './components/toast.js';
import { captureFocus, restoreFocus, scrollBehavior } from './a11y.js';
import { setText } from './views/helpers.js';
import { renderSidebar } from './views/sidebar.js';
import { showView, refreshCurrentView, updateTitle } from './views/router.js';

export { showToast };

const TOASTS = {
  'proposal:applied': () => ['Proposal Applied', 'Event state updated transactionally.'],
  'event:created': (payload) => [`Created ${payload.event.name}`, 'Your plan is ready: budget, milestones and risk checks are set up.'],
  'event:updated': () => ['Event details saved', 'Risk Radar and budget have been recalculated.'],
  'task:rescheduled': (payload) => ['Milestone Rescheduled', `Updated due date for "${(payload && payload.task && payload.task.title) || 'milestone'}".`]
};

function navigate(viewId) {
  showView(viewId, { focus: true });
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

function exportBudget() {
  const event = store.getActiveEvent();
  const blob = new Blob([JSON.stringify(calculateBudgetSummary(event), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: `${event.id}-budget.json` }).click();
  URL.revokeObjectURL(url);
  showToast('Export Complete', 'Budget summary downloaded.');
}

function confirmReset() {
  openConfirmDialog({
    title: 'Reset demo state?',
    message: 'This replaces your current plans with the clean starting templates.',
    confirmLabel: 'Reset demo',
    onConfirm: () => {
      store.resetToDefaults();
      showToast('Demo State Reset', 'Fresh celebration templates loaded.');
    }
  });
}

const CLICK_ACTIONS = {
  'copilot-toggle-btn': () => openCopilot(),
  'open-assistant-arrow': () => openCopilot(),
  'add-expense-btn': openAddExpenseModal,
  'add-milestone-btn': openAddMilestoneModal,
  'add-vendor-btn': openAddVendorModal,
  'add-idea-btn': openAddIdeaModal,
  'new-event-btn': openNewEventModal,
  'hero-create-event-btn': openNewEventModal,
  'edit-event-btn': openEditEventModal,
  'compare-quotes-header-btn': () => openQuoteModal(),
  'goto-timeline-btn': () => navigate('timeline'),
  'edit-vibe-btn': () => navigate('ideas'),
  'export-budget-btn': exportBudget,
  'reset-demo-btn': confirmReset
};

function bindActions() {
  Object.entries(CLICK_ACTIONS).forEach(([id, action]) => {
    document.getElementById(id)?.addEventListener('click', () => action());
  });
  document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => openCopilot(btn.dataset.message || btn.textContent.trim(), btn.dataset.op || 'general_advice'));
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.view));
  });
  document.addEventListener('gatherly:navigate', (e) => navigate(e.detail.view));
}

/** Re-renders chrome (topbar, nav badge, sidebar) and the visible view, keeping keyboard focus. */
function renderAll() {
  const event = store.getActiveEvent();
  if (!event) return;
  const snapshot = captureFocus();
  setText('topbar-event-name', event.name);
  setText('vendor-nav-count', (event.vendors || []).length);
  renderSidebar();
  refreshCurrentView();
  updateTitle();
  restoreFocus(snapshot);
}

function onStoreEvent({ type, payload }) {
  renderAll();
  const toast = TOASTS[type] && TOASTS[type](payload);
  if (toast) showToast(...toast);
}

export function initApp() {
  initToast();
  initCopilotDrawer();
  initRiskTray();
  initQuoteModal();
  initFormModals();
  initTenantAuthBadge(showToast);
  bindNavigation();
  bindActions();
  store.subscribe(onStoreEvent);
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
