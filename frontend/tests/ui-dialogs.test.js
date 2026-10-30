/**
 * @file ui-dialogs.test.js
 * @description Dialog focus management, keyboard handling and ARIA tabs under jsdom.
 * Skipped automatically when jsdom is not installed.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from './ui-env.js';

let env = null;
before(async () => { env = await bootApp(); });

const needsDom = (t) => {
  if (!env) t.skip('jsdom is not installed');
  return Boolean(env);
};
const press = (key, target) => (target || env.document).dispatchEvent(env.key(key));
const click = (id) => env.document.getElementById(id).click();
const visible = (el) => Boolean(el) && !el.closest('[hidden]');

describe('dialogs', () => {
  it('risk tray: one bell click opens, a second closes (single binding)', (t) => {
    if (!needsDom(t)) return;
    const bell = env.document.getElementById('topbar-risk-btn');
    bell.focus();
    bell.click();
    const tray = env.document.getElementById('risk-tray');
    assert.ok(tray.classList.contains('open'));
    assert.equal(bell.getAttribute('aria-expanded'), 'true');
    assert.equal(tray.getAttribute('role'), 'dialog');
    assert.ok(env.document.getElementById(tray.getAttribute('aria-labelledby')).textContent.trim());
    assert.ok(tray.contains(env.document.activeElement));
    bell.click();
    assert.ok(!tray.classList.contains('open'));
    assert.equal(bell.getAttribute('aria-expanded'), 'false');
    assert.match(bell.getAttribute('aria-label'), /^Event Risk Radar, (no|\d+) active risks?$/);
  });

  it('form dialog: labelled, focus moves in, page inert, focus returns on Escape', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    const trigger = d.getElementById('add-expense-btn');
    trigger.focus();
    trigger.click();
    const dialog = d.getElementById('generic-form-dialog');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.ok(d.getElementById(dialog.getAttribute('aria-labelledby')).textContent.trim());
    assert.ok(dialog.contains(d.activeElement));
    assert.equal(d.querySelector('.app-shell').inert, true);
    assert.ok(d.querySelector('.form-note'), 'required-fields note');
    press('Escape');
    assert.ok(!d.getElementById('generic-form-backdrop').classList.contains('open'));
    assert.equal(d.activeElement, trigger);
    assert.notEqual(d.querySelector('.app-shell').inert, true);
  });

  it('traps Tab inside the dialog', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    click('add-vendor-btn');
    const dialog = d.getElementById('generic-form-dialog');
    const items = [...dialog.querySelectorAll('input, button, select, textarea')].filter(el => !el.closest('[hidden]'));
    items[items.length - 1].focus();
    press('Tab', d.activeElement);
    assert.ok(dialog.contains(d.activeElement));
    assert.equal(d.activeElement, items[0]);
    press('Escape');
  });

  it('Escape closes only the topmost layer', async (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    const { openCopilot } = await import('../src/js/components/copilot-drawer.js');
    const { openFormModal } = await import('../src/js/components/form-dialog.js');
    openCopilot();
    const drawer = d.getElementById('copilot-drawer');
    assert.ok(drawer.classList.contains('open'));
    openFormModal('Top layer', '<button type="button" class="cancel-btn">Cancel</button>');
    press('Escape');
    assert.ok(!d.getElementById('generic-form-backdrop').classList.contains('open'));
    assert.ok(drawer.classList.contains('open'), 'drawer stays open');
    press('Escape');
    assert.ok(!drawer.classList.contains('open'));
    assert.equal(drawer.inert, true, 'closed drawer is not focusable');
  });

  it('inline form errors replace alert()', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    click('add-vendor-btn');
    d.getElementById('add-vendor-form').dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
    const box = d.getElementById('form-modal-error');
    assert.equal(box.getAttribute('role'), 'alert');
    assert.match(box.textContent, /required/i);
    assert.ok(d.getElementById('generic-form-backdrop').classList.contains('open'));
    press('Escape');
  });

  it('quote modal exposes ARIA tabs with arrow/Home/End keys', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    click('compare-quotes-header-btn');
    const compare = d.getElementById('tab-compare');
    const seed = d.getElementById('tab-seed');
    assert.equal(compare.closest('[role="tablist"]').getAttribute('role'), 'tablist');
    assert.equal(compare.getAttribute('aria-selected'), 'true');
    assert.equal(seed.tabIndex, -1);
    compare.focus();
    press('ArrowRight', compare);
    assert.equal(seed.getAttribute('aria-selected'), 'true');
    assert.equal(d.activeElement, seed);
    assert.ok(visible(d.getElementById('seed-tab')) && d.getElementById('compare-tab').hidden);
    assert.equal(d.getElementById('seed-tab').getAttribute('aria-labelledby'), 'tab-seed');
    press('Home', seed);
    assert.equal(d.activeElement, compare);
    press('End', compare);
    assert.equal(d.activeElement, seed);
    assert.ok(d.querySelector('label[for="raw-quote-text"]'));
    press('Escape');
  });

  it('copilot log is a polite live region', (t) => {
    if (!needsDom(t)) return;
    const log = env.document.getElementById('copilot-messages');
    assert.equal(log.getAttribute('role'), 'log');
    assert.equal(log.getAttribute('aria-live'), 'polite');
    assert.ok(log.getAttribute('aria-label'));
  });
});

