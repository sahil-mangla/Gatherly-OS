/**
 * @file ui-events.test.js
 * @description New event / Edit event details dialogs under jsdom. Skipped when jsdom is not installed.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, loadOptional } from './ui-env.js';

let env = null;
before(async () => { env = await bootApp(); });

const needsDom = (t) => {
  if (!env) t.skip('jsdom is not installed');
  return Boolean(env);
};
const $ = (id) => env.document.getElementById(id);
const press = (key) => env.document.dispatchEvent(env.key(key));
const submit = (id) => $(id).dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
const fill = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new env.window.Event('input', { bubbles: true }));
};
const isoIn = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fillValid = (over = {}) => {
  const v = { 'ev-type': 'community', 'ev-name': '  Elm Street Fair  ', 'ev-date': isoIn(90), 'ev-guests': '120', 'ev-capacity': '100', 'ev-budget': '8000', ...over };
  Object.entries(v).forEach(([id, value]) => fill(id, value));
};

describe('New event dialog', () => {
  it('sidebar has a real, labelled New event button', (t) => {
    if (!needsDom(t)) return;
    const btn = $('new-event-btn');
    assert.equal(btn.tagName, 'BUTTON');
    assert.equal(btn.type, 'button');
    assert.equal(btn.textContent.replace(/\s+/g, ' ').trim(), '+ New event');
    assert.equal(btn.querySelector('[aria-hidden="true"]').textContent, '+');
    assert.ok($('sidebar-event-list').compareDocumentPosition(btn) & env.window.Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('opens a labelled dialog with focus inside and returns focus on Escape', (t) => {
    if (!needsDom(t)) return;
    const btn = $('new-event-btn');
    btn.focus();
    btn.click();
    const dialog = $('generic-form-dialog');
    assert.equal($(dialog.getAttribute('aria-labelledby')).textContent, 'New event');
    assert.ok(dialog.contains(env.document.activeElement));
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.ok(env.document.querySelector('.form-note'));
    for (const id of ['ev-type', 'ev-name', 'ev-date', 'ev-guests', 'ev-capacity', 'ev-budget']) {
      const label = env.document.querySelector(`label[for="${id}"]`);
      assert.ok(label && label.textContent.trim().length > 3, id);
      assert.match($(id).getAttribute('aria-describedby'), new RegExp(`${id}-hint ${id}-error`));
      assert.equal($(`${id}-error`).getAttribute('role'), 'alert');
    }
    assert.deepEqual([...$('ev-type').options].map(o => o.value), ['wedding', 'birthday', 'community']);
    press('Escape');
    assert.equal(env.document.activeElement, btn);
  });

  it('shows inline errors, flags fields and focuses the first invalid one', (t) => {
    if (!needsDom(t)) return;
    $('new-event-btn').click();
    submit('event-form');
    assert.ok($('generic-form-backdrop').classList.contains('open'), 'stays open');
    for (const id of ['ev-name', 'ev-date', 'ev-guests', 'ev-capacity', 'ev-budget']) {
      assert.equal($(id).getAttribute('aria-invalid'), 'true', id);
      assert.ok($(`${id}-error`).textContent.length > 10, id);
    }
    assert.equal($('ev-type').getAttribute('aria-invalid'), null);
    assert.equal(env.document.activeElement, $('ev-name'));
    fill('ev-name', 'Fixed');
    assert.equal($('ev-name-error').textContent, '', 'typing clears the stale error');
    assert.equal($('ev-date').getAttribute('aria-invalid'), null);
    press('Escape');
  });

  it('rejects out-of-range values with specific messages', (t) => {
    if (!needsDom(t)) return;
    $('new-event-btn').click();
    fillValid({ 'ev-name': 'x'.repeat(81), 'ev-date': isoIn(-5), 'ev-guests': '5001', 'ev-capacity': '0', 'ev-budget': '10000001' });
    submit('event-form');
    assert.match($('ev-name-error').textContent, /80 characters/);
    assert.match($('ev-date-error').textContent, /past/);
    assert.match($('ev-guests-error').textContent, /5,000/);
    assert.match($('ev-capacity-error').textContent, /1 or more/);
    assert.match($('ev-budget-error').textContent, /10,000,000/);
    press('Escape');
  });

  it('warns, without blocking, when guests exceed venue capacity', (t) => {
    if (!needsDom(t)) return;
    $('new-event-btn').click();
    fillValid({ 'ev-guests': '200', 'ev-capacity': '100' });
    const warning = $('ev-capacity-warning');
    assert.equal(warning.getAttribute('role'), 'status');
    assert.equal(warning.textContent, 'This is over capacity — Gatherly will flag it on your Risk Radar');
    assert.match($('ev-capacity').getAttribute('aria-describedby'), /ev-capacity-warning/);
    fill('ev-capacity', '250');
    assert.equal(warning.textContent, '');
    press('Escape');
  });

  it('creating an event switches to it, lists it, toasts and focuses the Overview heading', (t) => {
    if (!needsDom(t)) return;
    const before = env.store.getAllEvents().length;
    $('new-event-btn').click();
    fillValid();
    submit('event-form');
    assert.ok(!$('generic-form-backdrop').classList.contains('open'));
    const active = env.store.getActiveEvent();
    assert.equal(env.store.getAllEvents().length, before + 1);
    assert.deepEqual([active.name, active.type, active.expected_guests, active.venue_capacity, active.total_budget], ['Elm Street Fair', 'community', 120, 100, 8000]);
    const link = env.document.querySelector(`#sidebar-event-list [data-event-id="${active.id}"]`);
    assert.ok(link && link.getAttribute('aria-current') === 'true');
    assert.match(link.textContent, /Elm Street Fair/);
    assert.equal($('topbar-event-name').textContent, 'Elm Street Fair');
    assert.equal($('toast-title').textContent, 'Created Elm Street Fair');
    assert.ok($('app-toast').classList.contains('show'));
    assert.equal(env.document.activeElement, $('overview-heading'));
    assert.match(env.document.title, /^Overview · Elm Street Fair/);
    assert.match($('overview-budget-val').textContent, /8,000/);
    assert.match($('mara-overview-quote').textContent, /exceeds confirmed venue capacity/, 'capacity breach reaches the Risk Radar');
  });

  it('the new-event dialog has no axe violations (color-contrast disabled in jsdom)', async (t) => {
    if (!needsDom(t)) return;
    const axe = await loadOptional('axe-core');
    if (!axe) return t.skip('axe-core is not installed');
    $('new-event-btn').click();
    fill('ev-guests', '500');
    fill('ev-capacity', '100');
    submit('event-form');
    env.window.eval((axe.default || axe).source);
    const result = await env.window.axe.run(env.document, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`), []);
    press('Escape');
  });
});

describe('Edit event details', () => {
  it('opens prefilled for the active event and applies changes everywhere', (t) => {
    if (!needsDom(t)) return;
    const event = env.store.getActiveEvent();
    const btn = $('edit-event-btn');
    assert.equal(btn.textContent.trim(), 'Edit event details');
    btn.focus();
    btn.click();
    assert.equal($('form-modal-title').textContent, 'Edit event details');
    assert.equal($('ev-type'), null, 'type is fixed after creation');
    assert.deepEqual([$('ev-name').value, $('ev-guests').value, $('ev-capacity').value, $('ev-budget').value, $('ev-date').value], [event.name, '120', '100', '8000', event.date]);
    fill('ev-capacity', '300');
    fill('ev-name', 'Elm Street Fair 2');
    fill('ev-budget', '9000.50');
    submit('event-form');
    assert.ok(!$('generic-form-backdrop').classList.contains('open'));
    assert.equal(env.document.activeElement, btn, 'focus returns to the opener');
    assert.equal(event.venue_capacity, 300);
    assert.equal($('topbar-event-name').textContent, 'Elm Street Fair 2');
    assert.match(env.document.querySelector(`#sidebar-event-list [data-event-id="${event.id}"]`).textContent, /Elm Street Fair 2/);
    assert.doesNotMatch($('mara-overview-quote').textContent, /exceeds confirmed venue capacity/, 'the breach risk disappears');
    assert.equal($('toast-title').textContent, 'Event details saved');
  });

  it('an invalid edit shows inline errors and keeps the dialog open', (t) => {
    if (!needsDom(t)) return;
    $('edit-event-btn').click();
    fill('ev-guests', '0');
    submit('event-form');
    assert.equal($('ev-guests').getAttribute('aria-invalid'), 'true');
    assert.equal(env.document.activeElement, $('ev-guests'));
    assert.equal(env.store.getActiveEvent().expected_guests, 120);
    press('Escape');
  });

  it('lowering capacity below guests raises the capacity risk on the Overview and Budget', (t) => {
    if (!needsDom(t)) return;
    $('edit-event-btn').click();
    fill('ev-capacity', '50');
    assert.match($('ev-capacity-warning').textContent, /over capacity/);
    submit('event-form');
    assert.match($('mara-overview-quote').textContent, /exceeds confirmed venue capacity/);
    env.document.querySelector('.nav-item[data-view="budget"]').click();
    assert.match($('guest-caption').textContent, /Venue Capacity Limit: 50 guests/);
    env.document.querySelector('.nav-item[data-view="overview"]').click();
  });
});
