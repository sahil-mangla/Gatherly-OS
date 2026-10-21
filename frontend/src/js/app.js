/**
 * @file app.js
 * @description Main application controller for Gatherly.
 * Orchestrates reactive view rendering, multi-event switching, and user interactions.
 */

import { store } from './store.js';
import { calculateBudgetSummary } from './domain/budget.js';
import { initCopilotDrawer, openCopilot, closeCopilot } from './components/copilot-drawer.js';
import { initRiskTray, toggleRiskTray, closeRiskTray } from './components/risk-tray.js';
import { initQuoteModal, openQuoteModal, closeQuoteModal } from './components/quote-modal.js';
import {
  initFormModals,
  closeFormModal,
  openAddExpenseModal,
  openAddMilestoneModal,
  openAddVendorModal,
  openAddIdeaModal
} from './components/forms.js';

import { renderOverview } from './views/overview-view.js';
import { renderBudget } from './views/budget-view.js';
import { renderTimeline } from './views/timeline-view.js';
import { renderVendors } from './views/vendors-view.js';
import { renderIdeas } from './views/ideas-view.js';
import { formatDateSub, capitalize, escapeHtml } from './views/helpers.js';
import { initTenantAuthBadge } from './components/tenant-auth-badge.js';

// Global Toast helper
let toastTimer = null;
export function showToast(title = 'Mara is on it', message = "I'll pull together a few thoughtful options.") {
  const toast = document.getElementById('app-toast');
  if (!toast) return;

  document.getElementById('toast-title').innerText = title;
  document.getElementById('toast-sub').innerText = message;
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/**
 * Main application bootstrap.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize component shells
  initCopilotDrawer();
  initRiskTray();
  initQuoteModal();
  initFormModals();
  initTenantAuthBadge(showToast);

  // Primary navigation switching
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const targetView = item.dataset.view;
      views.forEach(v => v.classList.toggle('active', v.id === targetView));
      window.scrollTo({ top: 0, behavior: 'smooth' });

      renderCurrentView(targetView);
    });
  });

  // Sidebar event switching
  setupSidebarEvents();

  // Topbar and quick actions
  const copilotToggle = document.getElementById('copilot-toggle-btn');
  if (copilotToggle) copilotToggle.addEventListener('click', () => openCopilot());

  document.getElementById('topbar-risk-btn')?.addEventListener('click', () => toggleRiskTray());
  document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
    if (confirm('Reset demo state back to clean initial templates?')) {
      store.resetToDefaults();
      showToast('Demo State Reset', 'Fresh celebration templates loaded.');
    }
  });

  // Assistant card triggers
  const assistantCard = document.getElementById('assistant-card-main');
  if (assistantCard) {
    assistantCard.addEventListener('click', (e) => {
      if (e.target.closest('.suggestion')) return;
      openCopilot();
    });
  }

  document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const prompt = btn.dataset.message || btn.innerText;
      const op = btn.dataset.op || 'general_advice';
      openCopilot(prompt, op);
    });
  });

  // Action buttons
  document.getElementById('add-expense-btn')?.addEventListener('click', openAddExpenseModal);
  document.getElementById('add-milestone-btn')?.addEventListener('click', openAddMilestoneModal);
  document.getElementById('add-vendor-btn')?.addEventListener('click', openAddVendorModal);
  document.getElementById('add-idea-btn')?.addEventListener('click', openAddIdeaModal);
  document.getElementById('compare-quotes-header-btn')?.addEventListener('click', () => openQuoteModal());
  document.getElementById('goto-timeline-btn')?.addEventListener('click', () => document.querySelector('.nav-item[data-view="timeline"]')?.click());
  document.getElementById('edit-vibe-btn')?.addEventListener('click', () => document.querySelector('.nav-item[data-view="ideas"]')?.click());

  document.getElementById('export-budget-btn')?.addEventListener('click', () => {
    const summary = calculateBudgetSummary(store.getActiveEvent());
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${store.getActiveEvent().id}-budget.json` });
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export Complete', 'Budget summary downloaded.');
  });

  // Global Escape key listener to close modals/drawers (A11Y requirement)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      closeCopilot();
      closeQuoteModal();
      closeFormModal();
      closeRiskTray();
    }
  });

  // Subscribe to store updates for reactive updates across views
  store.subscribe(({ type, payload }) => {
    setupSidebarEvents();
    renderAllViews();
    if (type === 'proposal:applied') {
      showToast('Proposal Applied', 'Event state updated transactionally.');
    } else if (type === 'task:rescheduled') {
      showToast('Milestone Rescheduled', `Updated due date for "${payload?.task?.title || 'milestone'}".`);
    }
  });

  // Initial render
  renderAllViews();
});

function setupSidebarEvents() {
  const activeEvent = store.getActiveEvent();
  const allEvents = store.getAllEvents();
  const listEl = document.getElementById('sidebar-event-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  allEvents.forEach(ev => {
    const isSelected = ev.id === activeEvent.id;
    const dotColor = ev.color_accent || (ev.type === 'wedding' ? 'coral' : ev.type === 'birthday' ? 'mint' : 'gold');

    const btn = document.createElement('button');
    btn.className = `event-link ${isSelected ? 'selected' : ''}`;
    btn.dataset.eventId = ev.id;
    btn.innerHTML = `
      <span class="event-dot ${dotColor}"></span>
      <span><b>${escapeHtml(ev.name)}</b><small>${formatDateSub(ev.date)} · ${capitalize(ev.type)}</small></span>
      ${isSelected ? '<span class="mini-more">•••</span>' : ''}
    `;

    btn.addEventListener('click', () => {
      store.switchEvent(ev.id);
      showToast('Event Switched', `Viewing ${ev.name}`);
    });

    listEl.appendChild(btn);
  });
}

function renderAllViews() {
  const event = store.getActiveEvent();
  if (!event) return;

  const topbarName = document.getElementById('topbar-event-name');
  if (topbarName) topbarName.innerText = event.name;

  const vendorCountBadge = document.getElementById('vendor-nav-count');
  if (vendorCountBadge) vendorCountBadge.innerText = (event.vendors || []).length;

  renderOverview();
  renderBudget();
  renderTimeline();
  renderVendors();
  renderIdeas(showToast);
}

const viewRenderers = { overview: renderOverview, budget: renderBudget, timeline: renderTimeline, vendors: renderVendors, ideas: () => renderIdeas(showToast) };
function renderCurrentView(viewId) {
  viewRenderers[viewId]?.();
}
