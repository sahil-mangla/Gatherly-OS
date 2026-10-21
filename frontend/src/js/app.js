/**
 * @file app.js
 * @description Main application controller for Gatherly.
 * Orchestrates reactive view rendering, multi-event switching, and user interactions.
 */

import { store } from './store.js';
import { calculateBudgetSummary, formatMoney } from './domain/budget.js';
import { calculateTimelineProgress } from './domain/timeline.js';
import { evaluateEventRisks } from './domain/risks.js';
import { initCopilotDrawer, openCopilot, closeCopilot } from './components/copilot-drawer.js';
import { initRiskTray, toggleRiskTray, closeRiskTray } from './components/risk-tray.js';
import { initQuoteModal, openQuoteModal, closeQuoteModal } from './components/quote-modal.js';
import { renderWhatIfPanel } from './components/whatif-panel.js';
import {
  initFormModals,
  openAddExpenseModal,
  openAddMilestoneModal,
  openAddVendorModal,
  openAddIdeaModal,
  openRescheduleModal,
  closeFormModal
} from './components/forms.js';

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

      // Render active view
      renderCurrentView(targetView);
    });
  });

  // Sidebar event switching
  setupSidebarEvents();

  // Topbar and quick actions
  const copilotToggle = document.getElementById('copilot-toggle-btn');
  if (copilotToggle) copilotToggle.addEventListener('click', () => openCopilot());

  const riskBtn = document.getElementById('topbar-risk-btn');
  if (riskBtn) riskBtn.addEventListener('click', () => toggleRiskTray());

  const resetBtn = document.getElementById('reset-demo-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset demo state back to clean initial templates?')) {
        store.resetToDefaults();
        showToast('Demo State Reset', 'Fresh celebration templates loaded.');
      }
    });
  }

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
  const addExpBtn = document.getElementById('add-expense-btn');
  if (addExpBtn) addExpBtn.addEventListener('click', openAddExpenseModal);

  const addMileBtn = document.getElementById('add-milestone-btn');
  if (addMileBtn) addMileBtn.addEventListener('click', openAddMilestoneModal);

  const addVenBtn = document.getElementById('add-vendor-btn');
  if (addVenBtn) addVenBtn.addEventListener('click', openAddVendorModal);

  const addIdeaBtn = document.getElementById('add-idea-btn');
  if (addIdeaBtn) addIdeaBtn.addEventListener('click', openAddIdeaModal);

  const compareHeaderBtn = document.getElementById('compare-quotes-header-btn');
  if (compareHeaderBtn) compareHeaderBtn.addEventListener('click', () => openQuoteModal());

  const gotoTimelineBtn = document.getElementById('goto-timeline-btn');
  if (gotoTimelineBtn) {
    gotoTimelineBtn.addEventListener('click', () => {
      document.querySelector('.nav-item[data-view="timeline"]')?.click();
    });
  }

  const editVibeBtn = document.getElementById('edit-vibe-btn');
  if (editVibeBtn) {
    editVibeBtn.addEventListener('click', () => {
      document.querySelector('.nav-item[data-view="ideas"]')?.click();
    });
  }

  const exportBtn = document.getElementById('export-budget-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const summary = calculateBudgetSummary(store.getActiveEvent());
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(summary, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${store.getActiveEvent().id}-budget-summary.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Export Complete', 'Budget summary downloaded.');
    });
  }

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

/**
 * Setup and sync the sidebar event list.
 */
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

/**
 * Re-render all views and shared header metrics.
 */
function renderAllViews() {
  const event = store.getActiveEvent();
  if (!event) return;

  // Header / Topbar sync
  const topbarName = document.getElementById('topbar-event-name');
  if (topbarName) topbarName.innerText = event.name;

  const vendorCountBadge = document.getElementById('vendor-nav-count');
  if (vendorCountBadge) vendorCountBadge.innerText = (event.vendors || []).length;

  renderOverview();
  renderBudget();
  renderTimeline();
  renderVendors();
  renderIdeas();
}

/**
 * Render active view on tab change.
 */
function renderCurrentView(viewId) {
  if (viewId === 'overview') renderOverview();
  else if (viewId === 'budget') renderBudget();
  else if (viewId === 'timeline') renderTimeline();
  else if (viewId === 'vendors') renderVendors();
  else if (viewId === 'ideas') renderIdeas();
}

/**
 * Render Overview Dashboard.
 */
function renderOverview() {
  const event = store.getActiveEvent();
  const budget = calculateBudgetSummary(event);
  const timeline = calculateTimelineProgress(event.tasks || []);
  const risks = evaluateEventRisks(event);

  // Hero Date Card
  if (event.date) {
    const d = new Date(event.date);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const cardDay = document.getElementById('card-day');
    const cardMonth = document.getElementById('card-month');
    const cardYear = document.getElementById('card-year');

    if (cardDay) cardDay.innerText = d.getDate();
    if (cardMonth) cardMonth.innerText = months[d.getMonth()] || 'SEP';
    if (cardYear) cardYear.innerText = `${d.getFullYear()} · ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }

  // Hero Copy
  const heading = document.getElementById('overview-heading');
  const sub = document.getElementById('overview-sub');
  if (heading && event.type === 'birthday') {
    heading.innerHTML = `Celebrate the years,<br /><em>cherish every story.</em>`;
    if (sub) sub.innerText = `A memorable gathering for ${event.name} is coming together.`;
  } else if (heading && event.type === 'community') {
    heading.innerHTML = `Bring people together,<br /><em>make local magic.</em>`;
    if (sub) sub.innerText = `Neighborhood planning for ${event.name} in progress.`;
  } else if (heading) {
    heading.innerHTML = `Make room for<br /><em>the good stuff.</em>`;
    if (sub) sub.innerText = `Your wedding weekend is coming together beautifully, Maya.`;
  }

  const cur = event.currency || '$';

  // Mara Overview Quote
  const maraQuote = document.getElementById('mara-overview-quote');
  if (maraQuote) {
    if (risks.critical_count > 0) {
      const topRisk = risks.risks[0];
      maraQuote.innerText = `“Alert: ${topRisk.evidence} Want me to propose 3 ways to balance this without compromise?”`;
    } else {
      maraQuote.innerText = `“Your event plan has ${formatMoney(budget.remaining_uncommitted, cur)} in breathing room. Everything is tracking smoothly.”`;
    }
  }

  // Budget Stat Card
  const budgetVal = document.getElementById('overview-budget-val');
  const budgetBar = document.getElementById('overview-budget-progress');
  const budgetPct = document.getElementById('overview-budget-pct');
  const budgetLeft = document.getElementById('overview-budget-left');

  if (budgetVal) budgetVal.innerHTML = `${formatMoney(budget.total_allocated, cur)} <span>/ ${formatMoney(budget.total_budget, cur)}</span>`;
  if (budgetBar) budgetBar.style.width = `${Math.min(100, budget.percent_committed)}%`;
  if (budgetPct) budgetPct.innerText = `${budget.percent_committed}% committed`;
  if (budgetLeft) {
    if (budget.is_over_budget) {
      budgetLeft.className = 'warn';
      budgetLeft.innerText = `⚠️ ${formatMoney(budget.deficit_amount, cur)} over`;
    } else {
      budgetLeft.className = 'good';
      budgetLeft.innerText = `${formatMoney(budget.remaining_uncommitted, cur)} left`;
    }
  }

  // Timeline Stat Card
  const timeVal = document.getElementById('overview-timeline-val');
  const timePills = document.getElementById('overview-milestone-pills');
  const timeNext = document.getElementById('overview-timeline-next');

  if (timeVal) timeVal.innerHTML = `${timeline.completed} <span>of ${timeline.total} milestones</span>`;
  if (timePills) {
    timePills.innerHTML = '';
    const maxPills = Math.min(12, timeline.total || 8);
    for (let i = 0; i < maxPills; i++) {
      const span = document.createElement('span');
      if (i < timeline.completed) span.className = 'done';
      else if (i === timeline.completed) span.className = 'active';
      timePills.appendChild(span);
    }
  }
  if (timeNext) {
    timeNext.innerText = timeline.next_task ? `Next: ${timeline.next_task.title}` : 'All caught up!';
  }

  // Vendors Stat Card
  const venVal = document.getElementById('overview-vendors-val');
  const venAvatars = document.getElementById('overview-vendor-avatars');
  const venAlerts = document.getElementById('overview-vendor-alerts');

  const vendors = event.vendors || [];
  const bookedCount = vendors.filter(v => v.status === 'booked').length;
  if (venVal) venVal.innerHTML = `${bookedCount} <span>booked (${vendors.length} total)</span>`;

  if (venAvatars) {
    venAvatars.innerHTML = '';
    vendors.slice(0, 4).forEach((v, idx) => {
      const av = document.createElement('span');
      av.className = `vendor-avatar va-${(idx % 4) + 1}`;
      av.innerText = v.avatar_emoji || '🤝';
      av.title = v.name;
      venAvatars.appendChild(av);
    });
    if (vendors.length > 4) {
      const more = document.createElement('span');
      more.className = 'avatar-more';
      more.innerText = `+${vendors.length - 4}`;
      venAvatars.appendChild(more);
    }
  }

  if (venAlerts) {
    const unconfirmed = vendors.filter(v => v.status !== 'booked').length;
    venAlerts.innerText = unconfirmed > 0 ? `${unconfirmed} quotes to review` : 'All vendors booked';
  }

  // Checklist Panel (Next up tasks)
  const taskListEl = document.getElementById('overview-task-list');
  if (taskListEl) {
    taskListEl.innerHTML = '';
    const tasks = event.tasks || [];
    tasks.slice(0, 4).forEach(t => {
      const isDone = t.status === 'done';
      const label = document.createElement('label');
      label.className = `task ${isDone ? 'done-task' : ''}`;
      label.innerHTML = `
        <input type="checkbox" ${isDone ? 'checked' : ''} />
        <span class="checkmark">${isDone ? '✓' : ''}</span>
        <span class="task-copy">
          <b>${escapeHtml(t.title)}</b>
          <small>Due ${t.due_date} · ${escapeHtml(t.category)}</small>
        </span>
        <span class="task-tag ${t.priority === 'critical' ? 'soon' : ''}">${capitalize(t.priority || 'Normal')}</span>
      `;

      label.querySelector('input').addEventListener('change', () => {
        store.toggleTask(t.id);
      });

      taskListEl.appendChild(label);
    });
  }

  // Mood caption
  const moodCaption = document.getElementById('overview-mood-caption');
  if (moodCaption && event.theme) {
    moodCaption.innerText = `“${event.theme}”`;
  }
}

/**
 * Render Budget View & What-If Panel.
 */
function renderBudget() {
  const event = store.getActiveEvent();
  const summary = calculateBudgetSummary(event);
  const cur = event.currency || '$';

  const bigNum = document.getElementById('budget-big-number');
  const bigBar = document.getElementById('budget-big-bar');
  const committedLabel = document.getElementById('budget-committed-label');
  const availableLabel = document.getElementById('budget-available-label');

  if (bigNum) bigNum.innerHTML = `${formatMoney(summary.total_allocated, cur)} <small>allocated of ${formatMoney(summary.total_budget, cur)}</small>`;
  if (bigBar) bigBar.style.width = `${Math.min(100, summary.percent_committed)}%`;
  if (committedLabel) committedLabel.innerText = `${summary.percent_committed}% committed`;
  if (availableLabel) {
    if (summary.is_over_budget) {
      availableLabel.style.color = '#d84534';
      availableLabel.innerText = `⚠️ Deficit: ${formatMoney(summary.deficit_amount, cur)}`;
    } else {
      availableLabel.style.color = '#a9d2a9';
      availableLabel.innerText = `${formatMoney(summary.remaining_uncommitted, cur)} available`;
    }
  }

  // Category Breakdown Grid
  const catGrid = document.getElementById('budget-category-grid');
  if (catGrid) {
    const catColors = {
      venue: '#f47b63',
      catering: '#e3a449',
      design: '#799f83',
      photo_music: '#927b9d',
      contingency: '#ddb04d',
      other: '#817783'
    };

    let gridHtml = '';
    for (const [catKey, catData] of Object.entries(summary.categories)) {
      if (catData.planned === 0 && catData.allocated === 0) continue;
      const color = catColors[catKey] || '#f47b63';
      const pctWidth = catData.planned > 0 ? Math.min(100, Math.round((catData.allocated / catData.planned) * 100)) : 0;

      gridHtml += `
        <div class="category">
          <div>
            <span class="category-dot" style="background:${color}"></span>
            <b>${capitalize(catKey.replace('_', ' '))}</b>
            <small>${catData.percent_of_budget}% of total budget</small>
          </div>
          <strong>${formatMoney(catData.allocated, cur)}</strong>
          <div class="tiny-bar"><span style="width:${pctWidth}%;background:${color}"></span></div>
          <small style="color:${catData.is_overrun ? '#d84534' : 'var(--muted)'}; font-size:10px; margin-top:6px; display:block;">
            ${catData.is_overrun ? `⚠️ Overrun by ${formatMoney(catData.variance, cur)}` : `Planned: ${formatMoney(catData.planned, cur)}`}
          </small>
        </div>
      `;
    }
    catGrid.innerHTML = gridHtml;
  }

  // Expense Activity Table
  const tableRows = document.getElementById('budget-table-rows');
  if (tableRows) {
    tableRows.innerHTML = '';
    const expenses = event.expenses || [];

    if (expenses.length === 0) {
      tableRows.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No expense records added yet.</div>';
    } else {
      expenses.forEach(exp => {
        const row = document.createElement('div');
        row.className = 'expense-row';
        const pillClass = exp.status === 'paid' ? 'pill paid' : 'pill pending';

        row.innerHTML = `
          <span><b>${escapeHtml(exp.description)}</b><small>Planned ${formatMoney(exp.planned_amount || 0, cur)}</small></span>
          <span>${capitalize((exp.category || 'other').replace('_', ' '))}</span>
          <span class="${pillClass}">${capitalize(exp.status || 'pending')}</span>
          <strong>${formatMoney((exp.actual_amount || 0) + (exp.committed_amount || 0), cur)}</strong>
        `;
        tableRows.appendChild(row);
      });
    }
  }

  // Render What-If Panel
  renderWhatIfPanel();
}

/**
 * Render Timeline View.
 */
function renderTimeline() {
  const event = store.getActiveEvent();
  const tasks = event.tasks || [];
  const progress = calculateTimelineProgress(tasks);

  const ring = document.getElementById('timeline-progress-ring');
  const headline = document.getElementById('timeline-status-headline');
  const sub = document.getElementById('timeline-status-sub');

  if (ring) {
    ring.innerHTML = `${progress.percent_complete}<small>%</small>`;
    ring.style.background = `conic-gradient(var(--coral) ${progress.percent_complete}%, #eee6e1 0)`;
  }

  if (headline) {
    if (progress.overdue_tasks.length > 0) {
      headline.innerText = `${progress.overdue_tasks.length} task(s) need attention!`;
    } else if (progress.percent_complete === 100) {
      headline.innerText = `All milestones completed!`;
    } else {
      headline.innerText = `You’re right on time.`;
    }
  }

  if (sub) {
    sub.innerText = `${progress.completed} of ${progress.total} milestones complete`;
  }

  // Events Container
  const container = document.getElementById('timeline-events-container');
  if (container) {
    container.innerHTML = '';
    if (tasks.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted)">No milestones scheduled. Click "+ Add milestone" to start.</div>';
      return;
    }

    // Group tasks by month
    const groups = {};
    tasks.forEach(t => {
      const monthKey = t.due_date ? t.due_date.substring(0, 7) : '2025-06';
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(t);
    });

    Object.keys(groups).sort().forEach(mKey => {
      const monthDiv = document.createElement('div');
      monthDiv.className = 'timeline-month';

      const d = new Date(`${mKey}-01T00:00:00Z`);
      const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      monthDiv.innerHTML = `<span>${monthName}</span>`;

      groups[mKey].forEach(t => {
        const isDone = t.status === 'done';
        const evDiv = document.createElement('div');
        evDiv.className = `timeline-event ${isDone ? 'complete' : ''}`;
        evDiv.innerHTML = `
          <span class="timeline-dot" style="cursor:pointer" title="Toggle completion" tabindex="0" role="button" aria-label="Toggle completion for ${escapeHtml(t.title)}">${isDone ? '✓' : ''}</span>
          <div style="flex:1">
            <b>${escapeHtml(t.title)}</b>
            <small>Due ${t.due_date} · ${capitalize(t.status)} ${t.is_fixed_deadline ? '· [Fixed Deadline]' : ''}</small>
          </div>
          <button class="reschedule-btn" title="Reschedule and audit dependencies" style="background:none;border:none;color:var(--terracotta);cursor:pointer;font-size:12px;padding:4px 8px;font-family:inherit;font-weight:600;">📅 Reschedule →</button>
          <span class="event-type">${(t.category || 'GENERAL').toUpperCase()}</span>
        `;

        evDiv.querySelector('.timeline-dot').addEventListener('click', () => {
          store.toggleTask(t.id);
        });

        evDiv.querySelector('.reschedule-btn').addEventListener('click', () => {
          openRescheduleModal(t);
        });

        monthDiv.appendChild(evDiv);
      });

      container.appendChild(monthDiv);
    });
  }
}

/**
 * Render Vendors View.
 */
function renderVendors() {
  const event = store.getActiveEvent();
  const vendors = event.vendors || [];
  const budget = calculateBudgetSummary(event);

  const booked = vendors.filter(v => v.status === 'booked').length;
  const toReview = vendors.filter(v => v.status === 'shortlist').length;
  const vendorSpent = vendors.reduce((acc, v) => acc + (v.deposit_paid || v.quoted_amount || 0), 0);

  const summaryCards = document.getElementById('vendor-summary-cards');
  if (summaryCards) {
    summaryCards.innerHTML = `
      <div>
        <span class="eyebrow">BOOKED</span>
        <strong>${booked} / ${vendors.length}</strong>
        <small>vendors confirmed</small>
      </div>
      <div>
        <span class="eyebrow">TO REVIEW</span>
        <strong class="${toReview > 0 ? 'coral-text' : ''}">${toReview}</strong>
        <small>quotes waiting review</small>
      </div>
      <div>
        <span class="eyebrow">ALLOCATED</span>
        <strong>$${vendorSpent.toLocaleString()}</strong>
        <small>of $${budget.total_budget.toLocaleString()} total budget</small>
      </div>
    `;
  }

  const grid = document.getElementById('vendor-cards-grid');
  if (grid) {
    grid.innerHTML = '';
    if (vendors.length === 0) {
      grid.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);grid-column:1/-1">No vendors added yet. Click "+ Add vendor" or "Compare Quotes".</div>';
      return;
    }

    vendors.forEach(v => {
      const card = document.createElement('div');
      card.className = 'vendor-card-large';
      const isBooked = v.status === 'booked';

      card.innerHTML = `
        <div class="vendor-photo ${v.category?.toLowerCase() || 'general'}-photo">${v.avatar_emoji || '🤝'}</div>
        <div class="vendor-details">
          <span class="vendor-category">${(v.category || 'VENDOR').toUpperCase()} · ${(v.status || 'PENDING').toUpperCase()}</span>
          <h3>${escapeHtml(v.name)}</h3>
          <p>${escapeHtml(v.summary || 'Vendor service partner')}</p>
          <div class="vendor-bottom">
            <span>$${(v.quoted_amount || 0).toLocaleString()} · ${isBooked ? 'Deposit paid' : 'Quote received'}</span>
            <button class="review-quote-btn" data-id="${v.id}">${isBooked ? 'View details →' : 'Review quote →'}</button>
          </div>
        </div>
      `;

      card.querySelector('.review-quote-btn').addEventListener('click', () => {
        openQuoteModal(v.id);
      });

      grid.appendChild(card);
    });
  }
}

/**
 * Render Idea Board.
 */
function renderIdeas() {
  const event = store.getActiveEvent();
  const ideas = event.ideas || [];
  const grid = document.getElementById('idea-board-grid');
  if (!grid) return;

  grid.innerHTML = '';

  ideas.forEach(idea => {
    const card = document.createElement('div');
    card.className = `idea-card ${idea.bg_color || 'idea-yellow'}`;

    const pinIcons = ['✦', '✺', '❋', '◌'];
    const pin = pinIcons[Math.floor(Math.random() * pinIcons.length)];
    const isConverted = Boolean(idea.converted_task_id);

    card.innerHTML = `
      <span class="idea-pin">${pin}</span>
      <p>“${escapeHtml(idea.description || idea.title)}”</p>
      <small>Added by ${escapeHtml(idea.author || 'You')} · ${idea.date_added || 'Recently'}</small>
      <div class="idea-action-row">
        ${idea.estimated_cost ? `<small>Est: $${idea.estimated_cost}</small>` : '<small>Cost: Free</small>'}
        ${isConverted 
          ? '<span class="idea-converted-tag">✓ Converted to Task</span>' 
          : `<button class="convert-task-btn" data-id="${idea.id}">+ Convert to Task</button>`}
      </div>
    `;

    const convBtn = card.querySelector('.convert-task-btn');
    if (convBtn) {
      convBtn.addEventListener('click', () => {
        const newTask = store.convertIdeaToTask(idea.id);
        showToast('Spark Converted', `Added "${newTask.title}" to Timeline.`);
      });
    }

    grid.appendChild(card);
  });

  // "Add new spark" card
  const addCard = document.createElement('div');
  addCard.className = 'idea-card add-idea';
  addCard.style.cursor = 'pointer';
  addCard.innerHTML = `
    <span>+</span>
    <b>Add a new spark</b>
    <small>Drop in a thought, link, or photo</small>
  `;
  addCard.addEventListener('click', openAddIdeaModal);
  grid.appendChild(addCard);
}

// Format date helpers
function formatDateSub(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
