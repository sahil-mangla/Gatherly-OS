/**
 * @file overview-tasks.js
 * @description "Next up" task list for the Overview: three numbered cards with accessible controls.
 */

import { store } from '../store.js';
import { escapeHtml, capitalize, safeToken, timeHtml, bindOnce, requestView } from './helpers.js';

const PRIORITIES = ['low', 'medium', 'high', 'critical', 'normal'];
const STATUSES = ['todo', 'in_progress', 'done'];
const MAX_TASKS = 3;

export function pickNextTasks(tasks) {
  const pending = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  return [...pending, ...tasks.filter(t => t.status === 'done')].slice(0, MAX_TASKS);
}

function taskCardHtml(task, idx) {
  const isDone = task.status === 'done';
  const id = escapeHtml(task.id);
  const title = escapeHtml(task.title);
  const priority = safeToken(task.priority, PRIORITIES, 'medium');
  return `
    <li class="next-task-card ${isDone ? 'is-done' : ''}" data-task-id="${id}">
      <span class="task-num-badge" aria-hidden="true">${idx + 1}</span>
      <div class="task-card-content">
        <div class="task-card-title-row">
          <button type="button" class="task-card-title task-card-link" data-focus-key="task-open:${id}">${title}</button>
          <span class="task-priority-tag ${priority}">${escapeHtml(capitalize(priority))}</span>
        </div>
        <div class="task-card-sub">
          <span><span aria-hidden="true">📅</span> Due ${timeHtml(task.due_date)}</span>
          <span><span aria-hidden="true">🏷️</span> ${escapeHtml(capitalize(task.category || 'General'))}</span>
          <span class="task-status-pill ${safeToken(task.status, STATUSES, 'todo')}">${isDone ? 'Completed' : 'Pending'}</span>
        </div>
      </div>
      <button type="button" class="task-check-circle" aria-pressed="${isDone}" aria-label="Mark complete: ${title}" data-task-id="${id}" data-focus-key="task-toggle:${id}"><span aria-hidden="true">${isDone ? '✓' : ''}</span></button>
    </li>`;
}

function onListClick(e) {
  const toggle = e.target.closest('.task-check-circle');
  if (toggle) {
    store.toggleTask(toggle.dataset.taskId);
  } else if (e.target.closest('.task-card-link')) {
    requestView('timeline');
  }
}

export function renderNextUp(event) {
  const list = document.getElementById('overview-task-list');
  if (!list) return;
  bindOnce(list, 'click', onListClick);
  const next = pickNextTasks(event.tasks || []);
  list.innerHTML = next.length === 0
    ? '<li class="empty-task-card">All milestones complete!</li>'
    : next.map(taskCardHtml).join('');
}
