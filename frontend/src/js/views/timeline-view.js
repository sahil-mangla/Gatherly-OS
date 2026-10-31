/**
 * @file timeline-view.js
 * @description Timeline renderer displaying milestones, progress rings, and reschedule triggers.
 */

import { store } from '../store.js';
import { calculateTimelineProgress } from '../domain/timeline.js';
import { evaluateEventRisks } from '../domain/risks.js';
import { openRescheduleModal } from '../components/forms.js';
import { createViewContext } from './context.js';
import { groupTasksByMonth, monthHtml } from './timeline-item.js';
import { bindOnce, setText } from './helpers.js';

/** True when a milestone is due before a prerequisite; a dismissed radar alert must not hide it here. */
export function hasDependencyCollision(event) {
  const radar = evaluateEventRisks({ ...event, dismissed_risk_ids: [] });
  return radar.risks.some(risk => risk.type === 'dependency_collision');
}

/** The timeline status headline: overdue tasks, then collisions, then completion. */
export function headlineFor(progress, collides = false) {
  if (progress.overdue_tasks.length > 0) return `${progress.overdue_tasks.length} task(s) need attention!`;
  if (collides) return 'Some milestones are due before what they depend on.';
  return progress.percent_complete === 100 ? 'All milestones completed!' : 'You’re right on time.';
}

function renderSummary(progress, collides) {
  const ring = document.getElementById('timeline-progress-ring');
  if (ring) {
    ring.innerHTML = `<span>${progress.percent_complete}</span><small>%</small>`;
    ring.style.background = `conic-gradient(var(--coral) ${progress.percent_complete}%, var(--track) 0)`;
    ring.setAttribute('aria-label', `${progress.percent_complete}% of milestones complete`);
  }
  setText('timeline-status-headline', headlineFor(progress, collides));
  const counts = `${progress.completed} of ${progress.total} milestones complete`;
  setText('timeline-status-sub', collides ? `${counts}. Check the Risk Radar for the tasks affected.` : counts);
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

/** Renders the Timeline view. */
export function renderTimeline(ctx = createViewContext()) {
  const tasks = ctx.event.tasks || [];
  renderSummary(calculateTimelineProgress(tasks), hasDependencyCollision(ctx.event));

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
