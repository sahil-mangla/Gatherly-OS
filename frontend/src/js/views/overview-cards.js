/**
 * @file overview-cards.js
 * @description Budget, timeline and vendor stat cards for the Overview dashboard.
 */

import { formatMoney } from '../domain/budget.js';
import { calculateTimelineProgress } from '../domain/timeline.js';
import { setProgress } from '../a11y.js';
import { escapeHtml, setHtml, setText, dateText, requestView } from './helpers.js';

const MAX_PILLS = 12;
const MAX_AVATARS = 4;

/** The Overview budget card: committed against total with a progress bar. */
export function renderBudgetCard({ budget, cur }) {
  const pct = budget.percent_committed;
  setHtml('overview-budget-val', `${escapeHtml(formatMoney(budget.total_allocated, cur))} <span>/ ${escapeHtml(formatMoney(budget.total_budget, cur))}</span>`);
  const bar = document.getElementById('overview-budget-progress');
  if (bar) bar.style.width = `${Math.min(100, pct)}%`;
  setProgress(document.getElementById('overview-budget-track'), {
    now: pct,
    label: 'Budget committed',
    valuetext: `${pct}% of the budget is committed`
  });
  setText('overview-budget-pct', `${pct}% committed`);

  const left = document.getElementById('overview-budget-left');
  if (!left) return;
  left.className = budget.is_over_budget ? 'warn' : 'good';
  left.innerHTML = budget.is_over_budget
    ? `<span aria-hidden="true">⚠</span> ${escapeHtml(formatMoney(budget.deficit_amount, cur))} over`
    : `${escapeHtml(formatMoney(budget.remaining_uncommitted, cur))} left`;
}

function pillsHtml(completed, total) {
  const count = Math.min(MAX_PILLS, total || 8);
  const done = total > 0 ? Math.round((completed / total) * count) : 0;
  return Array.from({ length: count }, (_, i) => `<span class="${i < done ? 'done' : ''}"></span>`).join('');
}

/** The Overview timeline card: progress and the next milestone. */
export function renderTimelineCard(event) {
  const timeline = calculateTimelineProgress(event.tasks || []);
  setHtml('overview-timeline-val', `${timeline.completed} <span>of ${timeline.total} milestones</span>`);

  const pills = document.getElementById('overview-milestone-pills');
  if (pills) {
    pills.innerHTML = pillsHtml(timeline.completed, timeline.total);
    pills.setAttribute('role', 'img');
    pills.setAttribute('aria-label', `${timeline.completed} of ${timeline.total} milestones complete`);
  }

  const overdue = timeline.overdue_tasks.length;
  setText('overview-timeline-status', overdue > 0 ? `${overdue} overdue` : 'On track');
  const next = timeline.next_task;
  setText('overview-timeline-next', next
    ? `Next: ${next.title} (due ${dateText(next.due_date)})`
    : 'All current milestones complete!');
}

function avatarsHtml(vendors) {
  const shown = vendors.slice(0, MAX_AVATARS)
    .map((v, i) => `<span class="vendor-avatar va-${i + 1}">${escapeHtml(v.avatar_emoji || '🤝')}</span>`)
    .join('');
  const extra = vendors.length - MAX_AVATARS;
  return extra > 0 ? `${shown}<span class="avatar-more">+${extra}</span>` : shown;
}

/** The Overview vendor card: shortlisted and booked vendors. */
export function renderVendorCard(event) {
  const vendors = event.vendors || [];
  const booked = vendors.filter(v => v.status === 'booked').length;
  const toReview = vendors.filter(v => v.status === 'shortlist').length;
  setHtml('overview-vendors-val', `${booked} <span>booked</span>`);
  setHtml('overview-vendor-avatars', avatarsHtml(vendors));
  setText('overview-vendor-alerts', toReview > 0 ? `${toReview} need your reply` : 'No quotes waiting');

  const review = document.getElementById('overview-review-now');
  if (!review) return;
  review.hidden = toReview === 0;
  if (!review.dataset.bound) {
    review.dataset.bound = 'true';
    review.addEventListener('click', () => requestView('vendors'));
  }
}
