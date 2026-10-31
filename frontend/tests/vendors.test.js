/**
 * @file vendors.test.js
 * @description Tests for quote normalisation, follow-ups and the raw-text quote extractor.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQuote,
  compareQuotes,
  generateFollowUpQuestions,
  auditQuoteCompleteness,
  firstDefined,
  firstTruthy,
  extractQuoteFromRawText
} from '../src/js/domain/vendors.js';
import { statedTermsNote } from '../src/js/domain/quote-terms.js';
import { extractVendorName, detectServiceType, NO_AMOUNT_NOTE } from '../src/js/domain/vendors-extract.js';

describe('normalizeQuote', () => {
  test('applies defaults for an empty quote', () => {
    const q = normalizeQuote();
    assert.deepEqual(
      [q.id, q.name, q.category, q.base_price, q.deposit_amount, q.deposit_percent],
      ['quote-1', 'Vendor Quote', 'General', 0, 0, 0]
    );
    assert.equal(q.estimated_hidden_risk_score, 60);
    assert.equal(q.is_fully_disclosed, false);
  });

  test('resolves aliases in priority order and clamps negatives', () => {
    const q = normalizeQuote({ quote_id: 'q9', vendor_name: 'V', service_type: 'dj', quoted_base_amount: 1000, deposit_amount: 250 });
    assert.deepEqual([q.id, q.name, q.category, q.base_price, q.deposit_percent], ['q9', 'V', 'dj', 1000, 25]);
    assert.equal(normalizeQuote({ price: -50, quoted_amount: 10 }).base_price, 0);
    assert.equal(normalizeQuote({ price: 0, quoted_amount: 10 }).base_price, 0, '?? keeps an explicit zero');
    assert.equal(normalizeQuote({ id: '', quote_id: 'z' }).id, 'z');
  });

  test('coerces non-array inclusions to empty lists', () => {
    const q = normalizeQuote({ inclusions: 'cleanup', exclusions: null });
    assert.deepEqual([q.inclusions, q.exclusions], [[], []]);
  });

  test('firstDefined / firstTruthy mirror ?? and || chains', () => {
    assert.equal(firstDefined(null, undefined, 0, 5), 0);
    assert.equal(firstDefined(null, undefined), undefined);
    assert.equal(firstTruthy('', 0, null, 'x'), 'x');
  });
});

describe('compareQuotes / audit / follow-ups', () => {
  test('handles missing and empty inputs', () => {
    assert.equal(compareQuotes().count, 0);
    assert.equal(compareQuotes(null).summary, 'No quotes supplied.');
  });

  test('audit examines notes, summary and missing_fields', () => {
    const r = auditQuoteCompleteness({ notes: 'Staff on site', summary: 'overtime billed', missing_fields: ['Refund policy'] });
    assert.deepEqual(r.missing, ['Post-event cleanup and teardown fees']);
    assert.equal(auditQuoteCompleteness().isComplete, false);
  });

  test('follow-up questions map one-to-one to missing terms, with generic fallback', () => {
    assert.equal(generateFollowUpQuestions({}).length, 4);
    assert.match(generateFollowUpQuestions({}).join(' '), /gratuity policy/);
    const full = generateFollowUpQuestions({ inclusions: ['clean', 'staff', 'overtime', 'refund'] });
    assert.equal(full.length, 2);
    assert.match(full[0], /certificate of vendor insurance/);
  });
});

describe('extractQuoteFromRawText (mirrors backend quote_parser)', () => {
  test('never picks a bare guest count and prefers explicit base totals', () => {
    const q = extractQuoteFromRawText('Catering for 150 guests at $42/person plus drinks ($6,300 base). Deposit of $1,800 due.');
    assert.equal(q.quoted_base_amount, 6300);
    assert.equal(q.deposit_amount, 1800);
    assert.equal(q.deposit_stated, true);
  });

  test('picks the largest dollar amount when nothing is marked as total', () => {
    assert.equal(extractQuoteFromRawText('We charge $500 for the venue tour and $1,500 for the main service.').quoted_base_amount, 1500);
    assert.equal(extractQuoteFromRawText('Total $900. Also $1,200 add-on.').quoted_base_amount, 900);
  });

  test('parses gratuity, service charge, overtime and cleanup into hidden fees', () => {
    const q = extractQuoteFromRawText('Sol Studio here — total = $3,000. Gratuity 20%, service charge 18%. Overtime $250/hr. Cleanup $300.');
    const byType = Object.fromEntries(q.hidden_fees.map(f => [f.type, f]));
    assert.equal(byType.overtime.rate, 250);
    assert.equal(byType.overtime.unit, 'per_hour');
    assert.equal(byType.cleanup.amount, 300);
    assert.equal(byType.gratuity.amount, 600);
    assert.equal(byType.service_charge.label, 'Service Charge 18%');
    assert.equal(q.quoted_base_amount, 3000);
    assert.equal(q.vendor_name, 'Sol Studio');
  });

  test('does not fabricate a deposit and notes a missing amount', () => {
    const q = extractQuoteFromRawText('Please send over your best price. We have 200 guests.');
    assert.equal(q.quoted_base_amount, 0);
    assert.equal(q.deposit_amount, 0);
    assert.equal(q.deposit_stated, false);
    assert.deepEqual(q.notes, [NO_AMOUNT_NOTE]);
    assert.deepEqual(q.flags, ['no_amount_found']);
    assert.match(q.follow_up_questions[0], /confirm the total price/);
    assert.equal(extractQuoteFromRawText().quoted_base_amount, 0);
  });

  test('estimates from a per-person rate and guest count when no total exists', () => {
    const q = extractQuoteFromRawText('Dinner for 120 guests at $55 per person.');
    assert.equal(q.quoted_base_amount, 6600);
    assert.deepEqual(q.flags, ['amount_estimated']);
  });

  test('derives a percentage deposit from the base price', () => {
    const q = extractQuoteFromRawText('Package is $2,000. We require a 25% deposit.');
    assert.deepEqual([q.deposit_amount, q.deposit_stated], [500, true]);
  });

  test('vendor name and service type heuristics', () => {
    assert.equal(extractVendorName('Hi, Lumina Collective here — quote attached'), 'Lumina Collective');
    assert.equal(extractVendorName('Thanks for asking. Bloom & Crumb Catering can do it.'), 'Bloom & Crumb Catering');
    assert.equal(extractVendorName('no capitals here'), null);
    assert.equal(detectServiceType('Sol DJ Music', 'catering dinner'), 'music');
    assert.equal(detectServiceType(null, 'nothing relevant'), 'decor');
  });

  test('lists inclusions but not exclusions', () => {
    const q = extractQuoteFromRawText('Includes tables, chairs and linens. Does not include travel.');
    assert.deepEqual(q.inclusions, ['Tables', 'Chairs', 'Linens']);
  });

  test('confidence rises with evidence and is capped', () => {
    const full = extractQuoteFromRawText('Lumina Collective: photography for $2,400 with a $720 deposit. Gratuity 20%.');
    assert.equal(full.confidence_score, 0.95);
    assert.equal(extractQuoteFromRawText('hello').confidence_score, 0.3);
  });

  test('handles very large inputs quickly', () => {
    const big = 'Studio Foo here. '.repeat(20000) + 'Total $1,000.';
    const started = Date.now();
    assert.equal(extractQuoteFromRawText(big).quoted_base_amount, 1000);
    assert.ok(Date.now() - started < 3000);
  });
});

describe('saved extracted quotes feed the completeness audit', () => {
  const stored = (text) => {
    const found = extractQuoteFromRawText(text);
    return { missing_disclosures: found.missing_fields, hidden_fees: found.hidden_fees };
  };

  test('terms a saved quote states are not reported as undisclosed', () => {
    const text = 'Package $3,000. 18% gratuity, overtime $150 per hour, cleanup fee $200, deposit 25% non-refundable.';
    assert.deepEqual(auditQuoteCompleteness({ quotes: [stored(text)] }), { isComplete: true, missing: [] });
  });

  test('terms a saved quote never mentions are still reported', () => {
    const { isComplete, missing } = auditQuoteCompleteness({ quotes: [stored('Package $3,000. Includes a DJ.')] });
    assert.equal(isComplete, false);
    assert.equal(missing.length, 4);
  });

  test('extracted fee types state their own term', () => {
    const { missing } = auditQuoteCompleteness({ quotes: [{ hidden_fees: [{ type: 'overtime' }, { type: 'gratuity' }, { type: 'x' }, null] }] });
    assert.deepEqual(missing, ['Post-event cleanup and teardown fees', 'Cancellation milestones & deposit refund clause']);
  });

  test('malformed saved quotes are ignored', () => {
    for (const quotes of [null, 'x', [null, 5, {}], [{ missing_disclosures: 'bad' }]]) {
      assert.equal(auditQuoteCompleteness({ quotes }).isComplete, false);
    }
    assert.equal(statedTermsNote(), '');
  });

  test('normalizeQuote carries extracted fees for the compare table', () => {
    const fees = [{ type: 'overtime', label: 'Overtime rate', unit: 'per_hour', amount: 150 }];
    assert.deepEqual(normalizeQuote({ hidden_fees: [...fees, 'junk', null] }).hidden_fees, fees);
    assert.deepEqual(normalizeQuote({ hidden_fees: 'x' }).hidden_fees, []);
    assert.deepEqual(normalizeQuote().hidden_fees, []);
  });
});
