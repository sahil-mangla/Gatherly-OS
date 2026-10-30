/**
 * @file timeline-item.js
 * @description Markup builders for timeline months and milestone rows (all values escaped).
 */

import { unfinishedDependencies, dependentsOf } from '../domain/dependencies.js';
import { prettyLabel } from '../format.js';
import { escapeHtml, timeHtml, upperEscaped } from './helpers.js';

/** Groups tasks by `YYYY-MM` of their due date, sorted chronologically inside each group. */
export function groupTasksByMonth(tasks) {
  const groups = {};
  tasks.forEach(t => {
    const key = t.due_date ? String(t.due_date).substring(0, 7) : '2025-06';
    (groups[key] = groups[key] || []).push(t);
  });
  Object.values(groups).forEach(list => list.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')));
  return groups;
}

export function monthLabel(key) {
  const d = new Date(`${key}-01T00:00:00Z`);
  return isNaN(d.getTime())
    ? key
    : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Text-only dependency status ("Blocked by: ..." / "Unblocks N milestones"); empty when there is nothing to say. */
export function dependencyNoteHtml(t, tasks) {
  const blockers = t.status === 'done' ? [] : unfinishedDependencies(t, tasks);
  const unblocks = dependentsOf(t, tasks).length;
  const parts = [
    ...(blockers.length ? [`<span class="dep-blocked">Blocked by: ${blockers.map(b => escapeHtml(b.title)).join(', ')}</span>`] : []),
    ...(unblocks ? [`<span class="dep-unblocks">Unblocks ${unblocks} ${unblocks === 1 ? 'milestone' : 'milestones'}</span>`] : [])
  ];
  return parts.length ? `<small class="dep-note">${parts.join(' · ')}</small>` : '';
}

export function taskRowHtml(t, tasks = []) {
  const isDone = t.status === 'done';
  const id = escapeHtml(t.id);
  const title = escapeHtml(t.title);
  const fixed = t.is_fixed_deadline ? ' · Fixed deadline' : '';
  return `
    <li class="timeline-event ${isDone ? 'complete' : ''}">
      <button type="button" class="timeline-dot" aria-pressed="${isDone}" aria-label="Mark complete: ${title}" data-task-id="${id}" data-focus-key="timeline-toggle:${id}"><span aria-hidden="true">${isDone ? '✓' : ''}</span></button>
      <div class="timeline-event-body">
        <b>${title}</b>
        <small>Due ${timeHtml(t.due_date)} · ${escapeHtml(prettyLabel(t.status, 'To do'))}${fixed}</small>
        ${dependencyNoteHtml(t, tasks)}
      </div>
      <button type="button" class="reschedule-btn" aria-label="Reschedule ${title}" data-task-id="${id}" data-focus-key="reschedule:${id}"><span aria-hidden="true">📅</span> Reschedule <span aria-hidden="true">→</span></button>
      <span class="event-type">${upperEscaped(t.category, 'GENERAL')}</span>
    </li>`;
}

export function monthHtml(key, group, allTasks = group) {
  const id = `month-${escapeHtml(key)}`;
  return `
    <section class="timeline-month" aria-labelledby="${id}">
      <h2 class="month-label" id="${id}">${escapeHtml(monthLabel(key))}</h2>
      <ul class="timeline-list">${group.map(t => taskRowHtml(t, allTasks)).join('')}</ul>
    </section>`;
}
