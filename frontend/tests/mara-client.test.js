/**
 * @file mara-client.test.js
 * @description askMara backend path (auth header) and deterministic local fallback on failure.
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { resetAuthState, REQUEST_TIMEOUT_MS } from '../src/js/api.js';
import { askMara } from '../src/js/ai/mara-client.js';
import {
  json, realFetch, realWarn, state, installStorage, stubFetch, hangUntilAborted, flush, authHeader
} from './net-helpers.js';

describe('askMara (mara-client.js)', () => {
  beforeEach(() => { resetAuthState(); installStorage({ gatherly_auth_token: 'tok' }); console.warn = () => {}; });
  afterEach(() => {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
    delete globalThis.localStorage;
    mock.timers.reset();
  });

  test('uses the authorised backend response when available', async () => {
    stubFetch(() => json({ operation: 'general_advice', summary: 'from server' }));
    const res = await askMara('general_advice', 'hi', { a: 1 });
    assert.equal(res.summary, 'from server');
    assert.equal(state.calls[0].url, '/api/mara');
    assert.equal(authHeader(state.calls[0]), 'Bearer tok');
    assert.deepEqual(JSON.parse(state.calls[0].options.body), { operation: 'general_advice', prompt: 'hi', context: { a: 1 } });
  });

  test('falls back locally on network error, timeout, 401 and 5xx', async () => {
    const failures = [
      () => { throw new TypeError('offline'); },
      () => json({ detail: 'x' }, 500),
      () => json({ detail: 'x' }, 401)
    ];
    for (const failure of failures) {
      resetAuthState();
      stubFetch((url) => (url.includes('demo-token') ? json({}, 500) : failure()));
      const res = await askMara('cost_saving_proposals', '');
      assert.equal(res.operation, 'cost_saving_proposals');
      assert.match(res.response, /no savings changes to propose/);
    }
  });

  test('falls back locally when the request times out', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    hangUntilAborted();
    const pending = askMara('prioritize_tasks', '');
    await flush();
    mock.timers.tick(REQUEST_TIMEOUT_MS);
    assert.equal((await pending).operation, 'prioritize_tasks');
  });

  test('parse_quote_seed posts to the parse-seed endpoint and unwraps extracted_quote', async () => {
    stubFetch(() => json({ extracted_quote: { vendor_name: 'Remote' } }));
    const res = await askMara('parse_quote_seed', 'text');
    assert.equal(res.extracted_quote.vendor_name, 'Remote');
    assert.equal(state.calls[0].url, '/api/vendors/parse-seed');
    assert.equal(authHeader(state.calls[0]), 'Bearer tok');
  });

  test('parse_quote_seed falls back to the local extractor, even for offline use', async () => {
    stubFetch(() => { throw new TypeError('offline'); });
    const res = await askMara('parse_quote_seed', 'Lumina Collective: photography for $2,400 with a $720 deposit.');
    assert.equal(res.extracted_quote.quoted_base_amount, 2400);
    assert.match(res.summary, /Lumina Collective/);
  });
});
