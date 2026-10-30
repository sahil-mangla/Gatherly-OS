/**
 * @file timeline-view.js
 * @description Timeline renderer displaying milestones, progress rings, and reschedule triggers.
 */

import { store } from '../store.js';
import { calculateTimelineProgress } from '../domain/timeline.js';
import { openRescheduleModal } from '../components/forms.js';
import { createViewContext } from './context.js';
import { groupTasksByMonth, monthHtml } from './timeline-item.js';
import { bindOnce, setText } from './helpers.js';

function headlineFor(progress) {
  if (progress.overdue_tasks.length > 0) return `${progress.overdue_tasks.length} task(s) need attention!`;
  return progress.percent_complete === 100 ? 'All milestones completed!' : 'You’re right on time.';
}

function renderSummary(progress) {
  const ring = document.getElementById('timeline-progress-ring');
  if (ring) {
    ring.innerHTML = `<span>${progress.percent_complete}</span><small>%</small>`;
    ring.style.background = `conic-gradient(var(--coral) ${progress.percent_complete}%, var(--track) 0)`;
    ring.setAttribute('aria-label', `${progress.percent_complete}% of milestones complete`);
  }
  setText('timeline-status-headline', headlineFor(progress));
  setText('timeline-status-sub', `${progress.completed} of ${progress.total} milestones complete`);
}

function onTimelineClick(e) {
  const dot = e.target.closest('.timeline-dot');
  const resched = e.target.closest('.reschedule-btn');
  const id = (dot || resched)?.dataset.taskId;
  if (dot) {
    store.toggleTask(id);
  } else if (resched) {
    const task = (store.getActiveEvent().tasks || []).find(t => t.id === id);
    if (task) openRescheduleModal(task);
  }
}

export function renderTimeline(ctx = createViewContext()) {
  const tasks = ctx.event.tasks || [];
  renderSummary(calculateTimelineProgress(tasks));

  const container = document.getElementById('timeline-events-container');
  if (!container) return;
  bindOnce(container, 'click', onTimelineClick);
  if (tasks.length === 0) {
    container.innerHTML = '<p class="empty-note">No milestones scheduled. Use “+ Add milestone” to start.</p>';
    return;
  }
  const groups = groupTasksByMonth(tasks);
  container.innerHTML = Object.keys(groups).sort().map(key => monthHtml(key, groups[key], tasks)).join('');
}
