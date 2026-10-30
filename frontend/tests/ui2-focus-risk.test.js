/**
 * @file ui2-focus-risk.test.js
 * @description Focus is kept after a task leaves "Next up" and after a risk is dismissed in the open Risk Radar.
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
const $ = (id) => env.document.getElementById(id);
const toggles = () => [...env.document.querySelectorAll('#overview-task-list [data-focus-key^="task-toggle:"]')];

describe('focus after completing a task on Overview', () => {
  it('moves to the next task toggle when the task leaves Next up', (t) => {
    if (!needsDom(t)) return;
    const first = toggles()[0];
    const firstKey = first.dataset.focusKey;
    first.focus();
    first.click();
    const keys = toggles().map(el => el.dataset.focusKey);
    assert.ok(!keys.includes(firstKey), 'the completed task left the list');
    assert.equal(env.document.activeElement, toggles()[0], 'focus is on the control now in its place');
    assert.match(env.document.activeElement.dataset.focusKey, /^task-toggle:/);
  });

  it('falls back to the Next up heading when no task control remains', (t) => {
    if (!needsDom(t)) return;
    const heading = $('next-up-heading');
    assert.equal(heading.getAttribute('tabindex'), '-1');
    toggles()[0].focus();
    env.store.getActiveEvent().tasks = [];
    env.store.emit('task:updated', {});
    assert.equal(toggles().length, 0);
    assert.equal(env.document.activeElement, heading);
    env.store.resetToDefaults();
  });
});

describe('Risk Radar dismissal', () => {
  it('keeps the tray open and focus inside it while dismissing every risk', (t) => {
    if (!needsDom(t)) return;
    const tray = $('risk-tray');
    $('topbar-risk-btn').click();
    assert.ok(tray.classList.contains('open'));
    const before = tray.querySelectorAll('.risk-dismiss-btn').length;
    assert.ok(before >= 2, 'the sample event has several risks');

    tray.querySelector('.risk-dismiss-btn').click();
    assert.ok(tray.classList.contains('open'), 'tray stays open');
    assert.equal(tray.querySelectorAll('.risk-dismiss-btn').length, before - 1);
    assert.ok(env.document.activeElement.classList.contains('risk-dismiss-btn'), 'focus moves to the next dismiss button');
    assert.ok(tray.contains(env.document.activeElement));

    while (tray.querySelector('.risk-dismiss-btn')) tray.querySelector('.risk-dismiss-btn').click();
    assert.ok(tray.classList.contains('open'), 'still open after the last risk');
    assert.equal(env.document.activeElement, $('risk-tray-close'), 'last dismissal lands on the close button');
    assert.ok(tray.querySelector('.risk-empty-state'));
  });

  it('still closes when clicking outside the tray', (t) => {
    if (!needsDom(t)) return;
    env.document.querySelector('main').click();
    assert.ok(!$('risk-tray').classList.contains('open'));
  });
});
