/**
 * @file dependency-picker.js
 * @description "Depends on" checkbox group for the milestone dialog (a labelled fieldset, keyboard operable).
 */

import { escapeHtml, timeHtml } from '../views/helpers.js';

const byDueDate = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''));

function optionHtml(task, index) {
  const id = `mile-dep-${index}`;
  return `
    <label class="dep-option" for="${id}">
      <input type="checkbox" id="${id}" name="depends_on" value="${escapeHtml(task.id)}" />
      <span><span class="dep-title">${escapeHtml(task.title)}</span> <span class="dep-due">due ${timeHtml(task.due_date)}</span></span>
    </label>`;
}

/** Trusted HTML: a fieldset with one checkbox per existing task (labels escaped), or a note when there are none. */
export function dependencyFieldsetHtml(tasks) {
  if (tasks.length === 0) {
    return '<p class="field-hint">No other milestones yet, so this one has no dependencies.</p>';
  }
  return `
    <fieldset class="dep-fieldset" aria-describedby="mile-dep-hint">
      <legend>Depends on <span class="optional">(optional)</span></legend>
      <p class="field-hint" id="mile-dep-hint">Tick the milestones that must be finished first. Leave all unticked for none.</p>
      <div class="dep-list">${[...tasks].sort(byDueDate).map(optionHtml).join('')}</div>
    </fieldset>`;
}

const inputs = () => [...document.querySelectorAll('.dep-fieldset input[type="checkbox"]')];

/** Task ids of the ticked boxes, in list order. */
export function selectedDependencies() {
  return inputs().filter(input => input.checked).map(input => input.value);
}

/** DOM id of the checkbox for `taskId` (so an error can focus it), or null. */
export function dependencyInputId(taskId) {
  const match = inputs().find(input => input.value === taskId);
  return match ? match.id : null;
}
