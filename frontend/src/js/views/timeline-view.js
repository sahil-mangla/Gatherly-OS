/**
 * @file timeline-view.js
 * @description Timeline renderer displaying milestones, progress rings, and reschedule triggers.
 */

import { store } from '../store.js';
import { calculateTimelineProgress } from '../domain/timeline.js';
import { openRescheduleModal } from '../components/forms.js';
import { capitalize, escapeHtml } from './helpers.js';

export function renderTimeline() {
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

  const container = document.getElementById('timeline-events-container');
  if (container) {
    container.innerHTML = '';
    if (tasks.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted)">No milestones scheduled. Click "+ Add milestone" to start.</div>';
      return;
    }

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

      groups[mKey]
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
        .forEach(t => {
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

          const dot = evDiv.querySelector('.timeline-dot');
          dot.addEventListener('click', () => store.toggleTask(t.id));
          dot.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              store.toggleTask(t.id);
            }
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
