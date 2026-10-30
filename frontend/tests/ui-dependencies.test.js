/**
 * @file ui-dependencies.test.js
 * @description Milestone "Depends on" fieldset and the timeline's blocked / unblocks text under jsdom.
 * Skipped automatically when jsdom is not installed.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from './ui-env.js';
import { getFocusable } from '../src/js/components/dialog-focus.js';

let env = null;
before(async () => {
  env = await bootApp();
  if (env) env.store.switchEvent('wedding-leila-noor');
});

const needsDom = (t) => {
  if (!env) t.skip('jsdom is not installed');
  return Boolean(env);
};
const $ = (id) => env.document.getElementById(id);
const press = (key) => env.document.dispatchEvent(env.key(key));
const submit = () => $('add-milestone-form').dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
const fill = (id, value) => { $(id).value = value; };
const optionFor = (title) => [...env.document.querySelectorAll('.dep-option')].find(l => l.querySelector('.dep-title').textContent === title);
const showTimeline = () => env.document.querySelector('.nav-item[data-view="timeline"]').click();
const rowFor = (title) => [...env.document.querySelectorAll('.timeline-event')].find(li => li.querySelector('b').textContent === title);
const openMilestone = () => {
  showTimeline();
  $('add-milestone-btn').click();
};

describe('milestone dependency picker', () => {
  it('renders a labelled fieldset with one checkbox per existing task and due dates as <time>', (t) => {
    if (!needsDom(t)) return;
    openMilestone();
    const fieldset = env.document.querySelector('fieldset.dep-fieldset');
    assert.match(fieldset.querySelector('legend').textContent, /^Depends on/);
    const tasks = env.store.getActiveEvent().tasks;
    const boxes = fieldset.querySelectorAll('input[type="checkbox"]');
    assert.equal(boxes.length, tasks.length);
    assert.ok([...boxes].every(b => !b.checked), 'none selected by default');
    for (const box of boxes) {
      const label = env.document.querySelector(`label[for="${box.id}"]`);
      assert.ok(label.querySelector('.dep-title').textContent.length > 3);
      assert.match(label.querySelector('time').getAttribute('datetime'), /^\d{4}-\d{2}-\d{2}$/);
    }
    assert.equal(new Set([...boxes].map(b => b.id)).size, boxes.length, 'unique ids');
    assert.equal(fieldset.getAttribute('aria-describedby'), 'mile-dep-hint');
    press('Escape');
  });

  it('checkboxes are in the dialog tab order and toggle from their labels', (t) => {
    if (!needsDom(t)) return;
    openMilestone();
    const dialog = $('generic-form-dialog');
    const focusable = getFocusable(dialog);
    const boxes = [...dialog.querySelectorAll('.dep-fieldset input')];
    assert.ok(boxes.every(b => focusable.includes(b) && b.tabIndex === 0));
    assert.ok(focusable.indexOf(boxes[0]) > focusable.indexOf($('mile-fixed')), 'follows the fields before it');
    boxes[1].focus();
    assert.equal(env.document.activeElement, boxes[1]);
    env.document.querySelector(`label[for="${boxes[1].id}"]`).click();
    assert.equal(boxes[1].checked, true);
    boxes[1].click();
    assert.equal(boxes[1].checked, false);
    press('Escape');
  });

  it('rejects a dependency due after the milestone, naming it and flagging its checkbox', (t) => {
    if (!needsDom(t)) return;
    openMilestone();
    fill('mile-title', 'Early thing');
    fill('mile-due', '2000-01-01');
    optionFor('Finalize seating chart & place cards').querySelector('input').checked = true;
    submit();
    const alertBox = $('form-modal-error');
    assert.equal(alertBox.getAttribute('role'), 'alert');
    assert.match(alertBox.textContent, /Finalize seating chart & place cards/);
    assert.match(alertBox.textContent, /after this milestone/);
    const box = optionFor('Finalize seating chart & place cards').querySelector('input');
    assert.equal(box.getAttribute('aria-invalid'), 'true');
    assert.match(box.getAttribute('aria-describedby'), /form-modal-error/);
    assert.equal(env.document.activeElement, box);
    assert.ok($('generic-form-backdrop').classList.contains('open'));
    assert.ok(!env.store.getActiveEvent().tasks.some(x => x.title === 'Early thing'));
    press('Escape');
  });

  it('saves depends_on, and the timeline shows escaped Blocked-by text that updates as work completes', (t) => {
    if (!needsDom(t)) return;
    const dep = env.store.getActiveEvent().tasks.find(x => x.title === 'Mail invitations');
    const due = '2099-01-01';
    openMilestone();
    fill('mile-title', 'Send <i>thank-you</i> notes');
    fill('mile-due', due);
    optionFor('Mail invitations').querySelector('input').checked = true;
    submit();
    assert.ok(!$('generic-form-backdrop').classList.contains('open'));
    const added = env.store.getActiveEvent().tasks.find(x => x.title === 'Send <i>thank-you</i> notes');
    assert.deepEqual(added.depends_on, [dep.id]);

    const row = rowFor('Send <i>thank-you</i> notes');
    assert.equal(row.querySelector('i'), null, 'title is escaped');
    assert.equal(row.querySelector('.dep-blocked').textContent, 'Blocked by: Mail invitations');
    assert.match(rowFor('Mail invitations').querySelector('.dep-unblocks').textContent, /^Unblocks 2 milestones$/);

    env.store.toggleTask(dep.id);
    assert.equal(rowFor('Send <i>thank-you</i> notes').querySelector('.dep-blocked'), null, 'unblocked once the dependency is done');
    env.store.toggleTask(added.id);
    assert.equal(rowFor('Mail invitations').querySelector('.dep-note').textContent, 'Unblocks 1 milestone');
    env.store.toggleTask(added.id);
    env.store.toggleTask(dep.id);
  });
});

describe('timeline dependency text', () => {
  it('lists every unfinished blocker, keeps one reschedule button per task with unique names', (t) => {
    if (!needsDom(t)) return;
    showTimeline();
    const tasting = rowFor('Schedule menu tasting');
    assert.equal(tasting.querySelector('.dep-blocked').textContent, 'Blocked by: Review photographer shortlist');
    assert.equal(rowFor('Send guest list to stationer').querySelector('.dep-blocked'), null, 'a task with no dependencies');
    assert.match(rowFor('Send guest list to stationer').querySelector('.dep-note').textContent, /^Unblocks 2 milestones/);
    const names = [...env.document.querySelectorAll('#timeline-events-container button')].map(b => b.getAttribute('aria-label'));
    assert.equal(new Set(names).size, names.length, 'unique accessible names');
    tasting.querySelector('.reschedule-btn').click();
    assert.equal($('form-modal-title').textContent, 'Milestone Reschedule & Dependency Audit');
    press('Escape');
  });

  it('joins several blockers with commas and drops finished ones', (t) => {
    if (!needsDom(t)) return;
    const { tasks } = env.store.getActiveEvent();
    const [photo, readings] = ['Review photographer shortlist', 'Choose ceremony readings'].map(title => tasks.find(x => x.title === title));
    tasks.push({ id: 'zz-multi', title: 'Combine', category: 'X', due_date: '2099-02-02', status: 'todo', priority: 'low', depends_on: [photo.id, readings.id] });
    env.store.emit('test:update', {});
    assert.equal(rowFor('Combine').querySelector('.dep-blocked').textContent, 'Blocked by: Choose ceremony readings, Review photographer shortlist');
    env.store.toggleTask(photo.id);
    assert.equal(rowFor('Combine').querySelector('.dep-blocked').textContent, 'Blocked by: Choose ceremony readings');
    env.store.toggleTask(photo.id);
    tasks.pop();
  });
});
