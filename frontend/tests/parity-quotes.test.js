/**
 * @file parity-quotes.test.js
 * @description Parity proof: the JS quote extractor must agree with the shared JSON fixtures
 * that backend/tests/test_parity_quotes.py asserts against the Python implementation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractQuoteFromRawText } from '../src/js/domain/vendors.js';

const FIXTURE = new URL('../../shared/parity/quotes.json', import.meta.url);
const CASES = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const MONEY_TOLERANCE = 0.01;
const MAX_FIXTURE_BYTES = 60000;
const MIN_CASES = 30;

const textOf = (c) => c.text ?? `${c.text_template.prefix}${c.text_template.unit.repeat(c.text_template.count)}${c.text_template.suffix}`;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= MONEY_TOLERANCE, `${message}: ${actual} vs ${expected}`);

function assertFees(actual, expected) {
  assert.equal(actual.length, expected.length, 'fee count');
  expected.forEach((want, i) => {
    assert.equal(actual[i].type, want.type);
    assert.equal(actual[i].unit, want.unit);
    near(actual[i].rate, want.rate, 'fee rate');
    near(actual[i].amount, want.amount, 'fee amount');
  });
}

describe('shared quote fixtures (Python parity)', () => {
  test('fixture is substantial and compact', () => {
    assert.ok(CASES.length >= MIN_CASES);
    assert.equal(new Set(CASES.map(c => c.name)).size, CASES.length);
    assert.ok(readFileSync(FIXTURE).length < MAX_FIXTURE_BYTES);
  });

  for (const c of CASES) {
    test(c.name, () => {
      const got = extractQuoteFromRawText(textOf(c));
      const want = c.expected;
      assert.equal(got.vendor_name, want.vendor_name);
      assert.equal(got.service_type, want.service_type);
      near(got.quoted_base_amount, want.base_amount, 'base');
      near(got.deposit_amount, want.deposit_amount, 'deposit');
      assert.equal(got.deposit_stated, want.deposit_stated);
      assert.deepEqual(got.flags, want.flags);
      assert.deepEqual(got.missing_fields, want.missing_fields);
      assertFees(got.hidden_fees, want.hidden_fees);
    });
  }
});
