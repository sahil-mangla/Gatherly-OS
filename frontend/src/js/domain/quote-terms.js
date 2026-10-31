/**
 * @file quote-terms.js
 * @description Which essential vendor terms a saved, extracted quote already states (by its text or by a fee).
 */

/** Extractor labels (prefix of a stored quote's missing_disclosures) -> keywords showing the quote states the term. */
const STATED_TERM_NOTES = [
  ['Service staff', 'staff and gratuity policy stated'],
  ['Post-event cleanup', 'cleanup and teardown covered'],
  ['Overtime', 'overtime rate stated'],
  ['Deposit milestones', 'refund and cancellation terms stated']
];

/** Extracted fee types -> audit keywords for the term the fee itself states. */
const FEE_TYPE_NOTES = {
  gratuity: 'staff and gratuity policy stated',
  service_charge: 'staff and gratuity policy stated',
  overtime: 'overtime rate stated',
  cleanup: 'cleanup and teardown covered'
};

/** Audit keywords for every essential term one extracted quote states, by its text or by an extracted fee. */
export function statedTermsNote(stored = {}) {
  const missing = Array.isArray(stored.missing_disclosures) ? stored.missing_disclosures : null;
  const fees = Array.isArray(stored.hidden_fees) ? stored.hidden_fees : [];
  const fromText = missing
    ? STATED_TERM_NOTES.filter(([label]) => !missing.some(m => String(m).startsWith(label))).map(([, note]) => note)
    : [];
  const fromFees = fees
    .filter(fee => fee && Object.hasOwn(FEE_TYPE_NOTES, fee.type))
    .map(fee => FEE_TYPE_NOTES[fee.type]);
  return [...fromText, ...fromFees].join('; ');
}

/** Lower-cased audit keywords for every term the vendor's saved quotes state. */
export const savedQuotesNote = (vendor) => (Array.isArray(vendor.quotes) ? vendor.quotes : [])
  .filter(q => q && typeof q === 'object')
  .map(statedTermsNote)
  .join(' ')
  .toLowerCase();
