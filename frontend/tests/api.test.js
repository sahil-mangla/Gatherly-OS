/**
 * @file api.test.js
 * @description api.js authorisation, retry and timeout behaviour with a stubbed global fetch.
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { api, getAuthToken, setAuthToken, resetAuthState, REQUEST_TIMEOUT_MS } from '../src/js/api.js';
import {
  json, realFetch, realWarn, state, installStorage, stubFetch, hangUntilAborted, flush, authHeader
} from './net-helpers.js';

describe('api.js authorisation', () => {
  beforeEach(() => { resetAuthState(); installStorage(); console.warn = () => {}; });
  afterEach(() => {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
    delete globalThis.localStorage;
    mock.timers.reset();
  });

  test('attaches the stored bearer token to every call, including /mara, /simulate, /risks', async () => {
    installStorage({ gatherly_auth_token: 'tok-1' });
    stubFetch(() => json({ ok: true }));
    await api.postMara({ operation: 'x' });
    await api.postSimulation({});
    await api.evaluateRisks({});
    await api.compareVendors([]);
    await api.parseQuoteSeed('t');
    assert.equal(state.calls.length, 5);
    assert.ok(state.calls.every(c => authHeader(c) === 'Bearer tok-1'));
    assert.ok(state.calls.every(c => c.options.signal instanceof AbortSignal));
    assert.ok(state.calls.every(c => c.options.headers['X-Correlation-ID'].startsWith('web-')));
  });

  test('lazily fetches one demo token for concurrent requests, then reuses it', async () => {
    stubFetch((url) => (url.includes('/auth/demo-token')
      ? json({ access_token: 'demo-abc' })
      : json({ result: 1 })));
    await Promise.all([api.postMara({}), api.evaluateRisks({}), api.postSimulation({})]);
    const tokenCalls = state.calls.filter(c => c.url.includes('/auth/demo-token?role=planner'));
    assert.equal(tokenCalls.length, 1);
    assert.equal(getAuthToken(), 'demo-abc');
    const apiCalls = state.calls.filter(c => !c.url.includes('demo-token'));
    assert.ok(apiCalls.every(c => authHeader(c) === 'Bearer demo-abc'));
  });

  test('on 401 fetches a fresh demo token and retries exactly once', async () => {
    installStorage({ gatherly_auth_token: 'stale' });
    stubFetch((url, options) => {
      if (url.includes('/auth/demo-token')) return json({ access_token: 'fresh' });
      return options.headers.Authorization === 'Bearer fresh' ? json({ ok: 'yes' }) : json({ detail: 'expired' }, 401);
    });
    assert.deepEqual(await api.postMara({}), { ok: 'yes' });
    assert.equal(state.calls.length, 3);
    assert.equal(getAuthToken(), 'fresh');
  });

  test('a persistent 401 is surfaced after a single retry, never looping', async () => {
    installStorage({ gatherly_auth_token: 'stale' });
    stubFetch((url) => (url.includes('/auth/demo-token') ? json({ access_token: 'also-bad' }) : json({ detail: 'nope' }, 401)));
    await assert.rejects(() => api.postMara({}), /nope/);
    assert.equal(state.calls.filter(c => !c.url.includes('demo-token')).length, 2);
  });

  test('auth endpoints and /health never trigger lazy token fetch or retry', async () => {
    stubFetch(() => json({ detail: 'bad credentials' }, 401));
    await assert.rejects(() => api.login('a@b.c', 'pw'), /bad credentials/);
    await assert.rejects(() => api.getHealth(), /bad credentials/);
    assert.equal(state.calls.length, 2);
    assert.equal(authHeader(state.calls[0]), undefined);
  });

  test('demo-token failures back off instead of hammering the backend', async () => {
    stubFetch((url) => (url.includes('demo-token') ? json({}, 500) : json({ detail: 'unauth' }, 401)));
    await assert.rejects(() => api.postMara({}), /unauth/);
    const first = state.calls.length;
    await assert.rejects(() => api.postMara({}), /unauth/);
    assert.equal(state.calls.filter(c => c.url.includes('demo-token')).length, 1);
    assert.ok(state.calls.length > first);
  });

  test('caller-supplied headers merge instead of replacing the defaults', async () => {
    installStorage({ gatherly_auth_token: 't' });
    stubFetch(() => json({}));
    await api.getHealth();
    assert.equal(state.calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(authHeader(state.calls[0]), 'Bearer t');
  });

  test('non-JSON error bodies fall back to a status message', async () => {
    installStorage({ gatherly_auth_token: 't' });
    stubFetch(() => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }));
    await assert.rejects(() => api.listEvents(), /status 502/);
  });

  test('missing or throwing localStorage never throws from token helpers', () => {
    delete globalThis.localStorage;
    assert.equal(getAuthToken(), '');
    assert.doesNotThrow(() => setAuthToken('x'));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } });
    assert.equal(getAuthToken(), '');
    assert.doesNotThrow(() => setAuthToken('x'));
    assert.doesNotThrow(() => setAuthToken(''));
  });

  test('requests abort after the 8s timeout', async () => {
    installStorage({ gatherly_auth_token: 't' });
    mock.timers.enable({ apis: ['setTimeout'] });
    hangUntilAborted();
    const pending = api.getHealth();
    assert.equal(REQUEST_TIMEOUT_MS, 8000);
    await flush();
    mock.timers.tick(REQUEST_TIMEOUT_MS);
    await assert.rejects(() => pending, /aborted/);
  });
});

