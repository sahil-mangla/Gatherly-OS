/**
 * @file mara-fallbacks.test.js
 * @description Dispatch-table tests for the deterministic offline Mara responder.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalDeterministicMaraResponse as local, LOCAL_RESPONDERS } from '../src/js/ai/mara-fallbacks.js';

describe('getLocalDeterministicMaraResponse', () => {
  test('routes by explicit operation', () => {
    assert.equal(local('cost_saving_proposals', '').proposals.length, 3);
    assert.equal(local('prioritize_tasks', '').proposals.length, 2);
    assert.equal(local('risk_explanation', '', { risks: [1, 2] }).summary, 'You currently have 2 active items on the Event Risk Radar.');
    assert.equal(local('general_advice', '').operation, 'general_advice');
  });

  test('routes by prompt keywords in table order', () => {
    assert.equal(local(undefined, 'how can we SAVE money').operation, 'cost_saving_proposals');
    assert.equal(local('', 'what is my budget?').operation, 'cost_saving_proposals');
    assert.equal(local(null, 'plan my week').operation, 'prioritize_tasks');
    assert.equal(local(null, 'any risk?').operation, 'risk_explanation');
    assert.equal(local(null, 'save the risk task').operation, 'cost_saving_proposals');
    assert.equal(local('unknown_op', 'hello').operation, 'general_advice');
    assert.equal(LOCAL_RESPONDERS.length, 3);
  });

  test('is robust to null prompt/context and singular risk wording', () => {
    assert.equal(local('general_advice', null, null).operation, 'general_advice');
    assert.equal(local(undefined, undefined).operation, 'general_advice');
    assert.match(local('risk_explanation', '', { risks: [1] }).summary, /1 active item on/);
    assert.match(local('risk_explanation', '').summary, /0 active items/);
  });

  test('parse_quote_seed uses the local extractor', () => {
    const res = local('parse_quote_seed', 'Sol Studio here: package $1,000.');
    assert.equal(res.operation, 'parse_quote_seed');
    assert.equal(res.extracted_quote.quoted_base_amount, 1000);
    assert.match(res.summary, /Extracted quote for Sol Studio \(\$1,000\)/);
    assert.equal(local('parse_quote_seed', '').extracted_quote.quoted_base_amount, 0);
  });
});
