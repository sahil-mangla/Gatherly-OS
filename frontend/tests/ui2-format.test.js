/**
 * @file ui2-format.test.js
 * @description Money/label formatting, stored vendor quotes and quote-entry selection (pure logic, no DOM).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatDollars, prettyLabel } from '../src/js/format.js';
import { addVendorAction } from '../src/js/store/actions.js';
import { applyProposalAction } from '../src/js/store/proposals.js';
import { quotedEntries, defaultSelection, forCompare, isComparable, MAX_COMPARED } from '../src/js/components/quote-entries.js';
import { compareQuotes } from '../src/js/domain/vendors.js';

const stored = (id, price, missing = [], flags = []) => ({
  id, name: id, base_amount: price, deposit_amount: price / 4, hidden_fees: [], inclusions: ['Gallery'], missing_disclosures: missing, service_type: 'photography', flags
});

describe('formatting helpers', () => {
  test('formatDollars shows whole dollars or exactly two decimals, never one', () => {
    assert.equal(formatDollars(5330.5), '$5,330.50');
    assert.equal(formatDollars(2400), '$2,400');
    assert.equal(formatDollars('1200.00'), '$1,200');
    assert.equal(formatDollars(-45.5), '-$45.50');
    assert.equal(formatDollars(0.1 + 0.2), '$0.30');
    assert.equal(formatDollars(undefined), '$0');
  });

  test('prettyLabel turns enum tokens into words', () => {
    assert.equal(prettyLabel('photo_music'), 'Photo & music');
    assert.equal(prettyLabel('in_progress'), 'In progress');
    assert.equal(prettyLabel('todo'), 'To do');
    assert.equal(prettyLabel('catering'), 'Catering');
    assert.equal(prettyLabel(null, 'Other'), 'Other');
  });

  test('proposal messages use the same formatting', () => {
    const event = { expenses: [{ category: 'photo_music', planned_amount: 1000 }, { category: 'contingency', planned_amount: 3000 }] };
    const out = applyProposalAction(event, { action_type: 'rebalance_budget', from_category: 'contingency', to_category: 'photo_music', amount: 560.5 });
    assert.equal(out.message, 'Reallocated $560.50 from Contingency to Photo & music.');
  });
});

describe('stored vendor quotes', () => {
  test('addVendorAction keeps the quotes and omits the key when none are given', () => {
    const event = {};
    const withQuote = addVendorAction(event, { name: 'A', quotes: [stored('q1', 100)] });
    assert.equal(withQuote.quotes[0].base_amount, 100);
    assert.equal('quotes' in addVendorAction(event, { name: 'B' }), false);
  });

  test('entries list every stored quote, put the opened vendor first and flag "Price not found"', () => {
    const vendors = [
      { id: 'a', name: 'A', quotes: [stored('qa', 900)] },
      { id: 'b', name: 'B', quotes: [stored('qb', 0, [], ['no_amount_found'])] },
      { id: 'c', name: 'C', quotes: [stored('qc', 700)] },
      { id: 'd', name: 'D' }
    ];
    const entries = quotedEntries(vendors, 'c');
    assert.deepEqual(entries.map(e => e.vendorId), ['c', 'a', 'b']);
    assert.deepEqual(entries.map(e => e.comparable), [true, true, false]);
    assert.match(entries[2].reason, /Price not found/);
    assert.deepEqual(defaultSelection(entries), ['c:0', 'a:0']);
    assert.equal(isComparable({ price: 5 }), true);
  });

  test('defaults to at most four vendors', () => {
    const vendors = Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, quotes: [stored(`q${i}`, 100 + i)] }));
    assert.equal(defaultSelection(quotedEntries(vendors)).length, MAX_COMPARED);
  });

  test('the domain compare picks the cheapest and the most disclosed stored quote', () => {
    const cheap = stored('cheap', 1000, ['Service staff & gratuity policy', 'Post-event cleanup & teardown fees', 'Overtime hourly billing rate', 'Deposit milestones and cancellation refund terms']);
    const dear = stored('dear', 1500, []);
    const entries = quotedEntries([{ id: 'x', name: 'X', quotes: [cheap, dear] }]);
    const result = compareQuotes(entries.map(forCompare));
    assert.equal(result.cheapest_id, 'x:0');
    assert.equal(result.lowest_risk_id, 'x:1');
    const byId = Object.fromEntries(result.normalized.map(q => [q.id, q]));
    assert.equal(byId['x:0'].missing_disclosures.length, 4);
    assert.equal(byId['x:1'].missing_disclosures.length, 0);
  });
});
