/**
 * @file ui-a11y.test.js
 * @description Accessibility behaviour of the real UI (index.html + views) under jsdom.
 * Skipped automatically when jsdom is not installed.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, readSource, loadOptional } from './ui-env.js';

let env = null;
before(async () => { env = await bootApp(); });

const needsDom = (t) => {
  if (!env) t.skip('jsdom is not installed');
  return Boolean(env);
};

describe('page shell', () => {
  it('has skip link, main landmark, header outside main, and no user-scalable=no', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    assert.equal(d.querySelector('.skip-link').getAttribute('href'), '#main');
    assert.equal(d.getElementById('main').getAttribute('tabindex'), '-1');
    assert.equal(d.querySelector('header.topbar').closest('main'), null);
    assert.ok(d.querySelector('meta[name="description"]').content.length > 40);
    assert.doesNotMatch(d.querySelector('meta[name="viewport"]').content, /user-scalable/);
    assert.equal(d.documentElement.lang, 'en');
    assert.ok(d.querySelector('link[rel="modulepreload"][href$="app.js"]'));
  });

  it('has no inline scripts or inline event handlers (CSP friendly)', () => {
    const html = readSource('index.html');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  });

  it('renders live numbers instead of static placeholders and sets a per-view title', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    assert.match(d.getElementById('overview-budget-val').textContent, /\$[\d,]+/);
    assert.doesNotMatch(d.getElementById('overview-budget-val').textContent, /18,460/);
    assert.match(d.title, /^Overview/);
    d.querySelector('.nav-item[data-view="timeline"]').click();
    assert.match(d.title, /^Timeline/);
    assert.equal(d.querySelector('.nav-item[data-view="timeline"]').getAttribute('aria-current'), 'page');
    assert.equal(d.activeElement.id, 'timeline-heading');
    d.querySelector('.nav-item[data-view="overview"]').click();
  });

  it('exposes progressbars with value, range and label; selected event has aria-current', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    d.querySelector('.nav-item[data-view="budget"]').click();
    for (const id of ['overview-budget-track', 'budget-big-track']) {
      const bar = d.getElementById(id);
      assert.equal(bar.getAttribute('role'), 'progressbar');
      assert.ok(Number.isFinite(Number(bar.getAttribute('aria-valuenow'))));
      assert.equal(bar.getAttribute('aria-valuemin'), '0');
      assert.equal(bar.getAttribute('aria-valuemax'), '100');
      assert.ok(bar.getAttribute('aria-label'));
    }
    assert.equal(d.querySelectorAll('#sidebar-event-list [aria-current="true"]').length, 1);
    assert.equal(d.getElementById('timeline-progress-ring').getAttribute('role'), 'img');
    assert.ok(d.querySelector('table.expense-table caption'));
    assert.ok(d.querySelector('table.expense-table tbody th[scope="row"]'));
    d.querySelector('.nav-item[data-view="overview"]').click();
  });
});

describe('state preservation and static checks', () => {
  it('what-if slider keeps its value when the store updates', (t) => {
    if (!needsDom(t)) return;
    const d = env.document;
    d.querySelector('.nav-item[data-view="budget"]').click();
    const slider = d.getElementById('guest-slider');
    slider.value = '30';
    slider.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    assert.match(d.getElementById('guest-delta-val').textContent, /\+30/);
    assert.equal(slider.getAttribute('aria-valuetext'), '+30 guests');
    env.store.emit('test:update', {});
    assert.equal(d.getElementById('guest-slider'), slider, 'same element');
    assert.equal(slider.value, '30');
    assert.equal(d.getElementById('guest-delta-val').tagName, 'OUTPUT');
    d.querySelector('.nav-item[data-view="overview"]').click();
  });

  it('components, views and app never call alert() or confirm()', async () => {
    const { readdirSync } = await import('node:fs');
    const files = ['app.js', ...['components', 'views'].flatMap(dir => readdirSync(new URL(`../src/js/${dir}`, import.meta.url)).map(f => `${dir}/${f}`))];
    for (const file of files.filter(f => f.endsWith('.js'))) {
      assert.doesNotMatch(readSource(`src/js/${file}`), /(^|[^.\w])(alert|confirm)\(/m, file);
    }
  });

  it('axe-core reports no violations (color-contrast disabled in jsdom)', async (t) => {
    if (!needsDom(t)) return;
    const axe = await loadOptional('axe-core');
    if (!axe) return t.skip('axe-core is not installed');
    env.window.eval((axe.default || axe).source);
    const result = await env.window.axe.run(env.document, { rules: { 'color-contrast': { enabled: false } } });
    const summary = result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
    assert.deepEqual(summary, []);
  });
});
