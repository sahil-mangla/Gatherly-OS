/**
 * @file overview-view.js
 * @description Overview dashboard renderer showing key metrics, risk status, and recent activity.
 */

import { store } from '../store.js';
import { calculateBudgetSummary, formatMoney } from '../domain/budget.js';
import { calculateTimelineProgress } from '../domain/timeline.js';
import { evaluateEventRisks } from '../domain/risks.js';
import { toggleRiskTray } from '../components/risk-tray.js';
import { formatDateSub, capitalize, escapeHtml } from './helpers.js';

export function renderOverview() {
  const event = store.getActiveEvent();
  const budget = calculateBudgetSummary(event);
  const timeline = calculateTimelineProgress(event.tasks || []);
  const risks = evaluateEventRisks(event);
  const cur = event.currency || '$';

  // Hero Date Card & Dynamic Eyebrow
  if (event.date) {
    const [yStr, mStr, dStr] = event.date.split('-');
    const d = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, parseInt(dStr, 10));
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const cardDay = document.getElementById('card-day');
    const cardMonth = document.getElementById('card-month');
    const cardYear = document.getElementById('card-year');
    const eyebrow = document.getElementById('overview-eyebrow');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

    if (cardDay) cardDay.innerText = d.getDate();
    if (cardMonth) cardMonth.innerText = months[d.getMonth()] || 'SEP';
    if (cardYear) cardYear.innerText = `${d.getFullYear()} · ${dayName}`;

    if (eyebrow) {
      const diffDays = Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
      const countdown = diffDays > 0 ? ` · ${Math.max(1, Math.round(diffDays / 7))} weeks to go` : '';
      eyebrow.innerHTML = `<span class="live-dot"></span> ${dayName} · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${countdown}`;
    }
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
      const isDone = i < timeline.completed;
      const span = document.createElement('span');
      span.className = `pill-dot ${isDone ? 'done' : ''}`;
      timePills.appendChild(span);
    }
  }
  if (timeNext) {
    timeNext.innerText = timeline.next_task 
      ? `Next: ${timeline.next_task.title} (due ${timeline.next_task.due_date})`
      : 'All current milestones complete!';
  }

  // Guest & Capacity Stat Card
  const guestVal = document.getElementById('overview-guests-val');
  const guestCapacity = document.getElementById('overview-guests-capacity');
  if (guestVal) guestVal.innerHTML = `${event.expected_guests} <span>attending</span>`;
  if (guestCapacity) {
    const isOver = event.expected_guests > event.venue_capacity;
    guestCapacity.className = isOver ? 'warn' : 'good';
    guestCapacity.innerText = isOver 
      ? `⚠️ Limit: ${event.venue_capacity}`
      : `Venue limit: ${event.venue_capacity}`;
  }

  // Risk Radar Overview Chip
  const riskChip = document.getElementById('overview-risk-chip');
  if (riskChip) {
    riskChip.style.display = 'inline-flex';
    riskChip.className = `risk-chip-btn ${risks.critical_count > 0 ? 'critical' : risks.warning_count > 0 ? 'warning' : 'good'}`;
    riskChip.innerHTML = `🛡️ Event Risk Radar: <b>${risks.total_count} active</b>`;
    riskChip.onclick = () => toggleRiskTray();
  }

  // Keep Moving: Next Up Tasks in Vertical Order (1., 2., 3.)
  const taskListContainer = document.getElementById('overview-task-list');
  if (taskListContainer) {
    taskListContainer.innerHTML = '';
    const allTasks = event.tasks || [];
    const pendingTasks = allTasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    const completedTasks = allTasks.filter(t => t.status === 'done');
    const nextTasks = [...pendingTasks, ...completedTasks].slice(0, 3);

    if (nextTasks.length === 0) {
      taskListContainer.innerHTML = `<div class="empty-task-card" style="padding:16px;text-align:center;color:var(--muted);font-size:12px;">All milestones complete!</div>`;
    } else {
      nextTasks.forEach((task, idx) => {
        const isDone = task.status === 'done';
        const card = document.createElement('div');
        card.className = `next-task-card ${isDone ? 'is-done' : ''}`;
        card.setAttribute('data-task-id', task.id);
        card.innerHTML = `
          <div class="task-num-badge">${idx + 1}</div>
          <div class="task-card-content">
            <div class="task-card-title-row">
              <span class="task-card-title">${escapeHtml(task.title)}</span>
              <span class="task-priority-tag ${task.priority || 'medium'}">${capitalize(task.priority || 'Normal')}</span>
            </div>
            <div class="task-card-sub">
              <span>📅 Due ${formatDateSub(task.due_date)}</span>
              <span>🏷️ ${capitalize(task.category || 'General')}</span>
              <span class="task-status-pill ${task.status}">${isDone ? 'Completed' : 'Pending'}</span>
            </div>
          </div>
          <button class="task-check-circle" aria-label="Toggle ${escapeHtml(task.title)}" title="${isDone ? 'Mark incomplete' : 'Mark complete'}">${isDone ? '✓' : ''}</button>
        `;
        card.querySelector('.task-check-circle').addEventListener('click', (e) => {
          e.stopPropagation();
          store.toggleTask(task.id);
        });
        card.addEventListener('click', () => {
          const tab = document.querySelector('[data-tab="timeline"]') || document.querySelector('[data-view="timeline"]');
          if (tab) tab.click();
        });
        taskListContainer.appendChild(card);
      });
    }
  }

  const moodCaption = document.getElementById('overview-mood-caption');
  if (moodCaption && event.theme) {
    moodCaption.innerText = `“${event.theme}”`;
  }
}
