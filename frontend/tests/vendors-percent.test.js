/**
 * @file vendors-percent.test.js
 * @description Regression tests for ReDoS-safe extraction, clause-aware percentage
 * classification, per-person rate wording and Python-compatible rounding.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractQuoteFromRawText } from '../src/js/domain/vendors.js';
import { classifyPercents } from '../src/js/domain/quote-percent.js';
import { roundHalfEven } from '../src/js/domain/quote-money.js';

const BASE = 'Package $4,950. ';
const MAX_MS = 500;
const ADVERSARIAL = {
  'digit run': '1'.repeat(20000),
  'deposit digit run': `deposit ${'1'.repeat(20000)}`,
  'tip digit run': `tip ${'1'.repeat(20000)}`,
  'dollar digit run': `$${'1'.repeat(20000)}`,
  'dotted digits': '1.'.repeat(10000),
  'percent signs': '%'.repeat(20000),
  'spaced digits': '1 '.repeat(10000),
  'dollar commas': '$1,'.repeat(7000),
  'digits then guests': `${'1'.repeat(20000)} guests`,
  'deposit whitespace': `deposit${' '.repeat(20000)}x`,
  'repeated tip percents': 'tip 5% '.repeat(5000)
};
const RULES = [
  ['20% gratuity and 8% service charge', null, [['gratuity', 20], ['service charge', 8]]],
  ['Gratuity 20%', null, [['Gratuity', 20]]],
  ['5% admin fee. 25% deposit.', 25, [['admin fee', 5]]],
  ['22% service charge applies. 50% deposit holds the date.', 50, [['service charge', 22]]],
  ['Service fee of 10% and 12% tip', null, [['Service fee', 10], ['tip', 12]]],
  ['Tip: 15%; deposit of 30%', 30, [['Tip', 15]]],
  ['Gratuity is optional. 25% deposit.', 25, []],
  ['Gratuity.\n20% off for locals', null, []],
  ['Gratuity far far away from the figure 20%', null, []],
  ['Save 10% when booking', null, []],
  ['40% non-refundable retainer', 40, []]
];

describe('adversarial input is extracted in linear time', () => {
  for (const [name, text] of Object.entries(ADVERSARIAL)) {
    test(name, () => {
      const started = performance.now();
      const result = extractQuoteFromRawText(text);
      assert.ok(performance.now() - started < MAX_MS);
      assert.ok(result.quoted_base_amount >= 0);
    });
  }
});

describe('percentage classification', () => {
  for (const [text, deposit, fees] of RULES) {
    test(JSON.stringify(text), () => {
      const got = classifyPercents(BASE + text);
      assert.equal(got.deposit, deposit);
      assert.deepEqual(got.fees.map(f => [f.word, f.rate]), fees);
    });
  }

  test('fees are priced against the base once each and never include the deposit', () => {
    const both = extractQuoteFromRawText(`${BASE}20% gratuity and 8% service charge`);
    assert.deepEqual(both.hidden_fees.map(f => [f.type, f.rate, f.amount]), [['gratuity', 20, 990], ['service_charge', 8, 396]]);
    const admin = extractQuoteFromRawText(`${BASE}5% admin fee. 25% deposit.`);
    assert.deepEqual(admin.hidden_fees.map(f => [f.type, f.rate]), [['service_charge', 5]]);
    assert.deepEqual([admin.deposit_amount, admin.deposit_stated], [1237.5, true]);
  });
});

describe('per-person rates', () => {
  for (const text of ['Per plate $65, 150 guests', 'Per person: $65 for 150 guests', '$65 per plate, 150 guests']) {
    test(text, () => {
      const q = extractQuoteFromRawText(text);
      assert.equal(q.quoted_base_amount, 9750);
      assert.deepEqual(q.flags, ['amount_estimated']);
    });
  }

  test('a unit phrase owned by the previous figure does not demote the total', () => {
    const q = extractQuoteFromRawText('$48 per person: $7,200 for 150 guests');
    assert.deepEqual([q.quoted_base_amount, q.flags], [7200, []]);
  });
});

describe('roundHalfEven matches Python round()', () => {
  test('rounds exact ties to even and everything else to nearest', () => {
    assert.equal(roundHalfEven(0.125), 0.12);
    assert.equal(roundHalfEven(0.375), 0.38);
    assert.equal(roundHalfEven(-0.125), -0.12);
    assert.equal(roundHalfEven(1.005), 1);
    assert.equal(roundHalfEven(416.625), 416.62);
    assert.equal(roundHalfEven(2.5, 0), 2);
    assert.equal(roundHalfEven(3.5, 0), 4);
    assert.equal(roundHalfEven(12345.675), 12345.67);
  });
});
