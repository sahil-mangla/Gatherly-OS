/**
 * @file ui2-honesty.test.js
 * @description Honest UI: the event's own copy, vendor quote comparison from saved quotes, and the Create-your-event CTA.
 * Skipped automatically when jsdom is not installed.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from './ui-env.js';

let env = null;
before(async () => {
  env = await bootApp();
  console.warn = () => {};
});

const needsDom = (t) => {
  if (!env) t.skip('jsdom is not installed');
  return Boolean(env);
};
const $ = (id) => env.document.getElementById(id);
const tick = () => new Promise(r => setTimeout(r, 20));
const futureIso = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const newEvent = () => env.store.createEvent({ type: 'wedding', name: 'Priya & Sam', date: futureIso(120), guests: 100, capacity: 150, budget: 20000 });

async function saveQuote(text) {
  $('raw-quote-text').value = text;
  $('parse-quote-btn').click();
  await tick();
  $('save-parsed-vendor-btn').click();
}
async function openQuotes() {
  env.document.dispatchEvent(new env.window.CustomEvent('gatherly:navigate', { detail: { view: 'vendors' } }));
  $('compare-quotes-header-btn').click();
  await tick();
}

describe('copy and structure', () => {
  it('uses a div (not aside) for the Mara dialog', (t) => {
    if (!needsDom(t)) return;
    $('copilot-toggle-btn').click();
    const drawer = $('copilot-drawer');
    assert.equal(drawer.tagName, 'DIV');
    assert.equal(drawer.getAttribute('role'), 'dialog');
    assert.equal(env.document.querySelector('aside[role="dialog"]'), null);
    assert.doesNotMatch($('copilot-messages').textContent, /Maya/);
    env.document.dispatchEvent(env.key('Escape'));
  });

  it('greets with the active event, not a hard-coded person', (t) => {
    if (!needsDom(t)) return;
    assert.match($('overview-sub').textContent, /^Leila & Noor: your wedding weekend/);
    assert.doesNotMatch(env.document.body.textContent, /Maya/);
    assert.doesNotMatch($('workspace-label').textContent + env.document.querySelector('.user-link').textContent, /Maya|Personal plan/);
    assert.match(env.document.querySelector('.user-link').textContent, /Your plan.*Saved in this browser/);
  });

  it('the role badge says what it really does and quote tabs use plain words', (t) => {
    if (!needsDom(t)) return;
    assert.equal($('enterprise-auth-badge').title, 'Demo role for API calls — does not change what you see');
    assert.equal($('tab-seed').textContent, 'Paste quote text');
    assert.equal($('parse-quote-btn').textContent.trim().replace(/^✦\s*/, ''), 'Extract details');
    assert.doesNotMatch($('quote-modal').textContent, /Seed Ingestion|Mara raw seed/);
  });

  it('shows no enum leaks such as photo_music or in_progress', (t) => {
    if (!needsDom(t)) return;
    env.document.dispatchEvent(new env.window.CustomEvent('gatherly:navigate', { detail: { view: 'budget' } }));
    const text = $('budget').textContent;
    assert.match(text, /Photo & music/);
    assert.doesNotMatch(text, /photo_music|Photo music/);
  });
});

describe('Create your event call to action', () => {
  it('is shown on the Overview until the user creates an event of their own, then opens the New event dialog', (t) => {
    if (!needsDom(t)) return;
    env.document.dispatchEvent(new env.window.CustomEvent('gatherly:navigate', { detail: { view: 'overview' } }));
    const cta = $('hero-create-event-btn');
    assert.equal(cta.hidden, false);
    assert.equal(cta.textContent.trim(), 'Create your event');
    assert.equal(cta.classList.contains('primary-btn'), true);
    assert.ok($('new-event-btn'), 'the small sidebar button stays');
    cta.focus();
    cta.click();
    assert.equal($('generic-form-dialog').getAttribute('aria-labelledby') && $($('generic-form-dialog').getAttribute('aria-labelledby')).textContent, 'New event');
    env.document.dispatchEvent(env.key('Escape'));
    assert.equal(env.document.activeElement, cta);
    newEvent();
    assert.equal($('hero-create-event-btn').hidden, true);
    assert.match($('overview-sub').textContent, /^Priya & Sam: /);
  });
});

describe('vendor comparison uses the event\'s own quotes', () => {
  it('seeded vendors with stored quotes are listed with checkboxes; no example note', async (t) => {
    if (!needsDom(t)) return;
    env.store.switchEvent('wedding-leila-noor');
    await openQuotes();
    const boxes = [...env.document.querySelectorAll('#quote-picker input[name="quote-pick"]')];
    assert.equal(boxes.length, 2);
    assert.ok(boxes.every(b => b.checked));
    assert.equal($('quote-example-note'), null);
    assert.equal(env.document.querySelector('#quote-picker legend').closest('fieldset').id, 'quote-picker');
    assert.equal(env.document.querySelectorAll('.matrix-card').length, 2);
    env.document.dispatchEvent(env.key('Escape'));
  });

  it('a new event shows labelled example quotes only until two real quotes are saved', async (t) => {
    if (!needsDom(t)) return;
    newEvent();
    await openQuotes();
    assert.match($('quote-example-note').textContent, /Example quotes — paste your own quotes to compare real vendors/);
    assert.equal(env.document.querySelectorAll('.matrix-card').length, 2);
    assert.match(env.document.querySelector('.matrix-card h3').textContent, /\(example\)/);

    await saveQuote('Golden Hour Photography here: package $2,400 with a $600 deposit. Includes 8 hours of coverage and an online gallery.');
    const vendor = env.store.getActiveEvent().vendors[0];
    assert.equal(vendor.quotes.length, 1);
    assert.deepEqual(Object.keys(vendor.quotes[0]).sort(), ['base_amount', 'deposit_amount', 'flags', 'hidden_fees', 'id', 'inclusions', 'missing_disclosures', 'name', 'service_type']);
    assert.equal(vendor.quotes[0].base_amount, 2400);
    await openQuotes();
    assert.ok($('quote-example-note'), 'one real quote is not enough');
    assert.match($('quote-example-note').textContent, /1 saved quote/);

    $('tab-seed').click();
    await saveQuote('Lumen Photo: our package is $2,150 with a $500 retainer. Includes 7 hours and a second shooter.');
    await openQuotes();
    assert.equal($('quote-example-note'), null);
    assert.doesNotMatch($('quote-comparison-content').textContent, /example/i);
    const names = [...env.document.querySelectorAll('.matrix-card h3')].map(h => h.textContent);
    assert.equal(names.length, 2);
    assert.ok(!names.some(n => /Sol Studio/.test(n)));
  });

  it('the compare table lists each quote\'s fee amounts', async (t) => {
    if (!needsDom(t)) return;
    newEvent();
    await saveQuote('Keystone Catering here: package $5,000. 18% gratuity and overtime $150 per hour. Includes plated dinner.');
    $('tab-seed').click();
    await saveQuote('Plain Photo: package $2,000 with a $400 deposit. Includes 6 hours.');
    await openQuotes();
    const cards = [...env.document.querySelectorAll('.matrix-card')];
    assert.equal(cards.length, 2);
    const feeText = (name) => cards.find(c => c.querySelector('h3').textContent === name).textContent;
    assert.match(feeText('Keystone Catering'), /Fees:[\s\S]*Overtime rate: \$150 per hour/);
    assert.match(feeText('Keystone Catering'), /Gratuity 18%: 18% \(about \$900\)/);
    assert.match(feeText('Plain Photo'), /No additional fees found in the quote text/);
    env.document.dispatchEvent(env.key('Escape'));
  });

  it('checkboxes change the matrix, announce it, enforce 2-4 and block quotes without a price', async (t) => {
    if (!needsDom(t)) return;
    await saveQuote('No numbers here, just a friendly hello from Plain Vendor Events.');
    await openQuotes();
    const boxes = [...env.document.querySelectorAll('#quote-picker input[name="quote-pick"]')];
    assert.equal(boxes.length, 3);
    const unpriced = boxes.find(b => b.disabled);
    assert.ok(unpriced && !unpriced.checked, 'Price not found vendor is disabled and unchecked');
    assert.match($(unpriced.getAttribute('aria-describedby')).textContent, /Price not found/);
    assert.equal($('quote-compare-status').getAttribute('role'), 'status');
    assert.match($('quote-compare-status').textContent, /Compared 2 quotes/);

    const [first] = boxes.filter(b => !b.disabled);
    first.checked = false;
    first.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.equal(env.document.querySelectorAll('.matrix-card').length, 0);
    assert.match($('quote-compare-status').textContent, /Choose at least 2 vendors/);
    first.checked = true;
    first.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.equal(env.document.querySelectorAll('.matrix-card').length, 2);
    assert.equal(env.document.querySelectorAll('.badge-cheapest').length, 1);
    env.document.dispatchEvent(env.key('Escape'));
  });

  it('shows at most four quotes at once and disables the rest until one is unchecked', async (t) => {
    if (!needsDom(t)) return;
    newEvent();
    for (let i = 1; i <= 5; i += 1) {
      env.store.addVendor({ name: `Vendor ${i}`, category: 'music', quotes: [{ id: `q${i}`, name: `Vendor ${i}`, base_amount: 1000 + i * 100, deposit_amount: 100, inclusions: [], missing_disclosures: [], service_type: 'music', flags: [], hidden_fees: [] }] });
    }
    await openQuotes();
    const boxes = [...env.document.querySelectorAll('#quote-picker input[name="quote-pick"]')];
    assert.equal(boxes.length, 5);
    assert.equal(boxes.filter(b => b.checked).length, 4);
    assert.equal(env.document.querySelectorAll('.matrix-card').length, 4);
    assert.equal(boxes[4].disabled, true, 'the fifth box cannot be added at the limit');
    boxes[0].checked = false;
    boxes[0].dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.equal(boxes[4].disabled, false);
    assert.equal(env.document.querySelectorAll('.matrix-card').length, 3);
  });
});
