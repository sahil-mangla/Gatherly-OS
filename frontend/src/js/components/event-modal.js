/**
 * @file event-modal.js
 * @description "New event" and "Edit event details" dialog (shared form dialog, per-field inline errors).
 */

import { store } from '../store.js';
import { EVENT_TYPES, CAPACITY_WARNING, EVENT_LIMITS, validateEventBasics, validateEventEdit, isOverCapacity } from '../domain/event-validation.js';
import { escapeHtml, capitalize, requestView } from '../views/helpers.js';
import { openFormModal, closeFormModal, showFormError } from './form-dialog.js';

const CREATE_FIELDS = ['type', 'name', 'date', 'guests', 'capacity', 'budget'];
const EDIT_FIELDS = CREATE_FIELDS.slice(1);
const NUMBER = 'type="number" autocomplete="off"';

const FIELDS = {
  type: { label: 'Event type', hint: 'Starts you off with a ready-made budget and timeline.' },
  name: { label: 'Event name', hint: `Up to ${EVENT_LIMITS.nameMax} characters.`, attrs: 'type="text" autocomplete="off" placeholder="e.g. Priya &amp; Sam’s wedding"' },
  date: { label: 'Event date', hint: 'Today or later, within the next 5 years.', attrs: 'type="date" autocomplete="off"' },
  guests: { label: 'Expected guests', hint: 'A whole number from 1 to 5,000.', attrs: `${NUMBER} inputmode="numeric" min="1" max="5000" step="1" placeholder="80"` },
  capacity: { label: 'Venue capacity', hint: 'The most people your venue can hold.', attrs: `${NUMBER} inputmode="numeric" min="1" step="1" placeholder="100"` },
  budget: { label: 'Total budget ($)', hint: 'Up to $10,000,000.', attrs: `${NUMBER} inputmode="decimal" min="0.01" max="10000000" step="0.01" placeholder="15000"` }
};

const fieldId = (field) => `ev-${field}`;
const byId = (id) => document.getElementById(id);
const fieldsFor = (mode) => (mode === 'create' ? CREATE_FIELDS : EDIT_FIELDS);

function controlHtml(field, value) {
  const id = fieldId(field);
  const describedBy = `${id}-hint ${id}-error${field === 'capacity' ? ' ev-capacity-warning' : ''}`;
  if (field === 'type') {
    const options = EVENT_TYPES.map(t => `<option value="${t}">${escapeHtml(capitalize(t))}</option>`).join('');
    return `<select id="${id}" name="type" required aria-describedby="${describedBy}">${options}</select>`;
  }
  return `<input id="${id}" name="${field}" ${FIELDS[field].attrs} required value="${escapeHtml(value ?? '')}" aria-describedby="${describedBy}" />`;
}

function fieldHtml(field, value) {
  const id = fieldId(field);
  const warning = field === 'capacity' ? '<p class="field-hint field-warning" id="ev-capacity-warning" role="status"></p>' : '';
  return `
    <div class="form-group">
      <label for="${id}">${FIELDS[field].label} <span class="req" aria-hidden="true">*</span></label>
      ${controlHtml(field, value)}
      <small class="field-hint" id="${id}-hint">${FIELDS[field].hint}</small>
      ${warning}
      <p class="field-error" id="${id}-error" role="alert"></p>
    </div>`;
}

function formHtml(mode, values) {
  const label = mode === 'create' ? 'Create event' : 'Save details';
  return `
    <form id="event-form" class="modal-form" novalidate>
      ${fieldsFor(mode).map(field => fieldHtml(field, values[field])).join('')}
      <div class="form-actions">
        <button type="button" class="text-btn cancel-btn">Cancel</button>
        <button type="submit" class="primary-btn">${label}</button>
      </div>
    </form>`;
}

function readInput(mode) {
  return Object.fromEntries(fieldsFor(mode).map(field => [field, byId(fieldId(field)).value]));
}

/** Writes (or clears) each field's inline error, flags invalid fields and focuses the first one. */
function showFieldErrors(mode, errors) {
  const invalid = [];
  for (const field of fieldsFor(mode)) {
    const input = byId(fieldId(field));
    byId(`${fieldId(field)}-error`).textContent = errors[field] || '';
    if (errors[field]) {
      input.setAttribute('aria-invalid', 'true');
      invalid.push(input);
    } else {
      input.removeAttribute('aria-invalid');
    }
  }
  if (invalid.length > 0) invalid[0].focus();
}

function updateCapacityWarning() {
  const over = isOverCapacity(byId('ev-guests').value, byId('ev-capacity').value);
  byId('ev-capacity-warning').textContent = over ? CAPACITY_WARNING : '';
}

function submit(mode, event) {
  const input = readInput(mode);
  const check = mode === 'create' ? validateEventBasics(input) : validateEventEdit(event, input);
  showFieldErrors(mode, check.errors);
  if (!check.valid) return;
  try {
    if (mode === 'create') store.createEvent(check.values);
    else store.updateEventBasics(check.values);
  } catch (err) {
    showFormError(err.message);
    return;
  }
  closeFormModal();
  if (mode === 'create') requestView('overview');
}

function openEventModal(mode, values) {
  const title = mode === 'create' ? 'New event' : 'Edit event details';
  openFormModal(title, formHtml(mode, values));
  const form = byId('event-form');
  const event = store.getActiveEvent();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(mode, event);
  });
  form.addEventListener('input', () => {
    showFieldErrors(mode, {});
    updateCapacityWarning();
  });
  updateCapacityWarning();
}

/** Opens the dialog for creating a new event. */
export function openNewEventModal() {
  openEventModal('create', {});
}

/** Opens the dialog for editing the active event's details. */
export function openEditEventModal() {
  const event = store.getActiveEvent();
  openEventModal('edit', {
    name: event.name,
    date: event.date,
    guests: event.expected_guests,
    capacity: event.venue_capacity,
    budget: event.total_budget
  });
}
