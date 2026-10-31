/**
 * @file ui-security.test.js
 * @description XSS regression: hostile data must be escaped by every view and dialog.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from './ui-env.js';

const PAYLOAD = '"><img src=x onerror=alert(1)>';
let env = null;
before(async () => { env = await bootApp(); });

function poison(event) {
  Object.assign(event.vendors[0], {
    name: PAYLOAD, category: PAYLOAD, status: PAYLOAD, avatar_emoji: PAYLOAD, summary: PAYLOAD, id: PAYLOAD
  });
  Object.assign(event.tasks[0], {
    title: PAYLOAD, category: PAYLOAD, status: PAYLOAD, priority: PAYLOAD, due_date: PAYLOAD, id: PAYLOAD
  });
  Object.assign(event.expenses[0], { description: PAYLOAD, category: PAYLOAD, status: PAYLOAD });
  if (event.ideas[0]) {
    Object.assign(event.ideas[0], { title: PAYLOAD, description: PAYLOAD, author: PAYLOAD, bg_color: PAYLOAD });
  }
  event.name = PAYLOAD;
}

describe('XSS escaping', () => {
  it('never turns injected markup into elements on any view', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const d = env.document;
    poison(env.store.getActiveEvent());
    env.store.emit('test:poisoned', {});
    for (const view of ['overview', 'budget', 'timeline', 'vendors', 'ideas']) {
      d.querySelector(`.nav-item[data-view="${view}"]`).click();
      assert.equal(d.querySelectorAll('img').length, 0, `${view}: <img> injected`);
      assert.equal(d.querySelectorAll('[onerror]').length, 0, `${view}: onerror attribute injected`);
    }
    assert.match(d.getElementById('topbar-event-name').textContent, /<img/);
  });

  it('escapes task data in the reschedule dialog', async (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const d = env.document;
    const { openRescheduleModal } = await import('../src/js/components/forms.js');
    openRescheduleModal(env.store.getActiveEvent().tasks[0]);
    assert.equal(d.querySelectorAll('#generic-form-dialog img, [onerror]').length, 0);
    d.dispatchEvent(env.key('Escape'));
  });

  it('escapes risk radar content', (t) => {
    if (!env) return t.skip('jsdom is not installed');
    const d = env.document;
    d.getElementById('topbar-risk-btn').click();
    assert.equal(d.querySelectorAll('#risk-tray img, #risk-tray [onerror]').length, 0);
    d.dispatchEvent(env.key('Escape'));
  });
});
