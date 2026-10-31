/**
 * @file quote-entries.js
 * @description Which stored vendor quotes can be compared: entries, defaults, "Price not found" handling
 * and the labelled example quotes shown only when fewer than two real quotes exist.
 */

import { statedTermsNote } from '../domain/quote-terms.js';

export const MAX_COMPARED = 4;
export const MIN_COMPARED = 2;
export const EXAMPLE_NOTE = 'Example quotes — paste your own quotes to compare real vendors';
export const NO_PRICE_REASON = 'Price not found in the pasted text, so this quote cannot be compared.';

/** Example quotes (clearly labelled in the UI) used until the event has two comparable quotes of its own. */
export const SAMPLE_QUOTES = [
  { id: 'sample-sol', name: 'Sol Studio (example)', price: 2400, deposit: 720, inclusions: ['8 hrs coverage', 'Online gallery'], hidden_fees: [{ type: 'fee', label: 'Additional fee', unit: 'flat', rate: 120, amount: 120 }], missing_fields: ['Overtime fee rate', 'Teardown terms'] },
  { id: 'sample-lumina', name: 'Lumina Collective (example)', price: 2150, deposit: 500, inclusions: ['7 hrs coverage', 'Second shooter'], hidden_fees: [{ type: 'fee', label: 'Additional fee', unit: 'flat', rate: 90, amount: 90 }], missing_fields: ['Raw clip policy', 'Cancellation refund clause'] }
];

const priceOf = (quote) => Number(quote.base_amount ?? quote.price ?? quote.quoted_amount ?? 0) || 0;

/** True when a stored quote has a price and was not flagged `no_amount_found`. */
export function isComparable(quote) {
  return priceOf(quote) > 0 && !(quote.flags || []).includes('no_amount_found');
}

/** Input for the domain `compareQuotes`: stored quotes are mapped to its field names, legacy ones pass through. */
export function forCompare(entry) {
  const q = entry.quote;
  const name = q.name || q.tier_name || entry.vendorName;
  if (!('base_amount' in q)) return { ...q, id: entry.key, name };
  return {
    id: entry.key,
    name,
    category: q.service_type,
    price: priceOf(q),
    deposit: q.deposit_amount,
    inclusions: q.inclusions || [],
    hidden_fees: q.hidden_fees || [],
    notes: statedTermsNote(q)
  };
}

function entryFor(vendor, quote, index) {
  const comparable = isComparable(quote);
  return {
    key: `${vendor.id}:${index}`,
    vendorId: vendor.id,
    vendorName: vendor.name,
    label: quote.name || quote.tier_name || vendor.name,
    price: priceOf(quote),
    quote,
    comparable,
    reason: comparable ? '' : NO_PRICE_REASON
  };
}

/** Every stored quote of the event's vendors; the vendor the user opened the dialog from comes first. */
export function quotedEntries(vendors, vendorId) {
  const entries = (vendors || []).flatMap(v => (Array.isArray(v.quotes) ? v.quotes : [])
    .map((quote, i) => entryFor(v, quote, i)));
  return [...entries.filter(e => e.vendorId === vendorId), ...entries.filter(e => e.vendorId !== vendorId)];
}

/** Keys of the first comparable entries, up to the maximum that can be compared. */
export const defaultSelection = (entries) => entries.filter(e => e.comparable).slice(0, MAX_COMPARED).map(e => e.key);

/** The labelled example quotes shown until two real quotes exist. */
export const sampleEntries = () => SAMPLE_QUOTES.map(quote => entryFor({ id: quote.id, name: quote.name }, quote, 0));
