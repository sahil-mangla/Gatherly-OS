/**
 * @file ui-env.js
 * @description jsdom harness for UI tests: loads the real index.html, installs browser globals and boots app.js.
 * jsdom is optional; set GATHERLY_JSDOM_DIR to a folder whose node_modules contains jsdom/axe-core if not installed locally.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Loads an optional dev dependency, honouring GATHERLY_JSDOM_DIR; returns null when unavailable. */
export async function loadOptional(name) {
  try {
    return await import(name);
  } catch {
    const dir = process.env.GATHERLY_JSDOM_DIR;
    if (!dir) return null;
    try {
      return createRequire(`${dir}/package.json`)(name);
    } catch {
      return null;
    }
  }
}

export function readSource(relativePath) {
  return readFileSync(`${ROOT}${relativePath}`, 'utf8');
}

let booted = null;

/** Boots the real app once per test process and returns handy handles. */
export async function bootApp() {
  if (booted) return booted;
  const jsdomModule = await loadOptional('jsdom');
  if (!jsdomModule) return null;
  const { JSDOM } = jsdomModule.JSDOM ? jsdomModule : jsdomModule.default;

  const dom = new JSDOM(readSource('index.html'), { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.alert = () => { throw new Error('alert() must not be used'); };
  window.confirm = () => { throw new Error('confirm() must not be used'); };
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    CustomEvent: window.CustomEvent,
    HTMLElement: window.HTMLElement,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    fetch: () => Promise.reject(new Error('offline in tests'))
  });
  if (window.document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r));

  await import('../src/js/app.js');
  const { store } = await import('../src/js/store.js');
  booted = { window, document: window.document, store, key: (k, opts = {}) => new window.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }) };
  return booted;
}
