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

  // Recent Updates Feed
  const updatesContainer = document.getElementById('recent-updates-container');
  if (updatesContainer) {
    updatesContainer.innerHTML = '';
    const recentTasks = (event.tasks || []).slice(0, 3);
    recentTasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'update-item';
      const isDone = task.status === 'done';
      item.innerHTML = `
        <div class="update-icon ${isDone ? 'cake' : 'ring'}">${isDone ? '✓' : '◌'}</div>
        <div class="update-text">
          <p><b>${escapeHtml(task.title)}</b> — ${isDone ? 'Marked complete' : 'Scheduled milestone'}</p>
          <small>Due ${formatDateSub(task.due_date)} · ${capitalize(task.category || 'General')}</small>
        </div>
      `;
      updatesContainer.appendChild(item);
    });
  }

  const moodCaption = document.getElementById('overview-mood-caption');
  if (moodCaption && event.theme) {
    moodCaption.innerText = `“${event.theme}”`;
  }
}
