/**
 * @file vendors.js
 * @description Vendor quote normalization, fee completeness audit, and comparison for Gatherly client.
 */

import { safeNonNegativeNumber } from './budget.js';
import { RISK_POINTS_PER_MISSING_TERM } from './constants.js';

export { extractQuoteFromRawText } from './vendors-extract.js';

export const ESSENTIAL_QUOTE_FIELDS = [
  { key: 'setup_cleanup', label: 'Setup & post-event cleanup' },
  { key: 'service_staff', label: 'Service staff & gratuity policy' },
  { key: 'overtime_rate', label: 'Overtime hourly rate' },
  { key: 'cancellation_terms', label: 'Cancellation refund policy' }
];

/** Disclosure checks: a message is reported when none of its keywords appear in the quote text. */
const DISCLOSURE_CHECKS = [
  { keywords: ['clean', 'teardown', 'breakdown'], message: 'Post-event cleanup and teardown fees' },
  { keywords: ['staff', 'server', 'labor', 'crew'], message: 'Service staff staffing & gratuity terms' },
  { keywords: ['overtime', 'extra hour', 'curfew'], message: 'Overtime hourly rate and curfew policy' },
  { keywords: ['refund', 'cancellation', 'deposit milestone'], message: 'Cancellation milestones & deposit refund clause' }
];

/** Extractor labels (prefix of a stored quote's missing_disclosures) -> audit keywords that the quote states the term. */
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

const storedQuotesText = (quote) => (Array.isArray(quote.quotes) ? quote.quotes : [])
  .filter(q => q && typeof q === 'object')
  .map(statedTermsNote)
  .join(' ')
  .toLowerCase();

const joinLower = (value) => (Array.isArray(value) ? value.join(' ') : '').toLowerCase();

/** First value that is neither null nor undefined (mirrors a `??` chain). */
export const firstDefined = (...values) => values.find(v => v !== undefined && v !== null);
/** First truthy value (mirrors a `||` chain). */
export const firstTruthy = (...values) => values.find(Boolean);

export function auditQuoteCompleteness(quote = {}) {
  const combined = [
    joinLower(quote.inclusions),
    String(quote.notes || '').toLowerCase(),
    String(quote.summary || '').toLowerCase(),
    joinLower(quote.missing_fields),
    storedQuotesText(quote)
  ].join(' ');

  const missing = DISCLOSURE_CHECKS
    .filter(check => !check.keywords.some(k => combined.includes(k)))
    .map(check => check.message);

  return { isComplete: missing.length === 0, missing };
}

export function normalizeQuote(rawQuote = {}) {
  const basePrice = safeNonNegativeNumber(
    firstDefined(rawQuote.price, rawQuote.quoted_amount, rawQuote.quoted_base_amount, 0)
  );
  const deposit = safeNonNegativeNumber(
    firstDefined(rawQuote.deposit, rawQuote.deposit_paid, rawQuote.deposit_amount, 0)
  );
  const { isComplete, missing } = auditQuoteCompleteness(rawQuote);

  return {
    id: firstTruthy(rawQuote.id, rawQuote.quote_id, 'quote-1'),
    name: firstTruthy(rawQuote.name, rawQuote.vendor_name, rawQuote.tier_name, 'Vendor Quote'),
    category: firstTruthy(rawQuote.category, rawQuote.service_type, 'General'),
    base_price: basePrice,
    deposit_amount: deposit,
    deposit_percent: basePrice > 0 ? Math.round((deposit / basePrice) * 100) : 0,
    inclusions: Array.isArray(rawQuote.inclusions) ? rawQuote.inclusions : [],
    exclusions: Array.isArray(rawQuote.exclusions) ? rawQuote.exclusions : [],
    hidden_fees: Array.isArray(rawQuote.hidden_fees) ? rawQuote.hidden_fees.filter(f => f && typeof f === 'object') : [],
    missing_disclosures: missing,
    is_fully_disclosed: isComplete,
    estimated_hidden_risk_score: missing.length * RISK_POINTS_PER_MISSING_TERM
  };
}

export function compareQuotes(quotes = []) {
  if (!quotes || quotes.length === 0) {
    return {
      count: 0,
      normalized: [],
      cheapest_id: null,
      lowest_risk_id: null,
      summary: 'No quotes supplied.'
    };
  }

  const normalized = quotes.map(normalizeQuote);
  normalized.sort((a, b) => a.base_price - b.base_price);

  const cheapest = normalized[0];
  const lowestRisk = [...normalized].sort((a, b) => a.missing_disclosures.length - b.missing_disclosures.length)[0];

  return {
    count: normalized.length,
    normalized,
    cheapest_id: cheapest.id,
    cheapest_price: cheapest.base_price,
    lowest_risk_id: lowestRisk.id,
    comparison_summary: `Compared ${normalized.length} quotes. Lowest base quote is '${cheapest.name}' ($${cheapest.base_price.toLocaleString()}), but '${lowestRisk.name}' has the fewest missing disclosures (${lowestRisk.missing_disclosures.length} missing vs ${cheapest.missing_disclosures.length}).`
  };
}

/** Follow-up question per missing-term message; matched by a case-insensitive fragment. */
const FOLLOW_UP_QUESTIONS = [
  ['cleanup', 'Does the quoted fee include full post-event cleanup and waste removal, or is there an auxiliary teardown surcharge?'],
  ['staff', 'How many service staff members are included on-site during the contracted hours, and what is the gratuity policy?'],
  ['overtime', 'What is the billing rate if speeches or dancing extend 30 to 60 minutes past the scheduled timeline?'],
  ['cancellation', 'What are the refund milestones if an unexpected postponement or date change occurs?']
];

const GENERIC_FOLLOW_UPS = [
  'Could you provide the certificate of vendor insurance for venue approval?',
  'What is your delivery and electrical hookup arrival window?'
];

function questionFor(item) {
  const lower = item.toLowerCase();
  const hit = FOLLOW_UP_QUESTIONS.find(([fragment]) => lower.includes(fragment));
  return hit ? hit[1] : null;
}

export function generateFollowUpQuestions(quote = {}) {
  const { missing } = auditQuoteCompleteness(quote);
  const questions = missing.map(questionFor).filter(Boolean);
  return questions.length > 0 ? questions : [...GENERIC_FOLLOW_UPS];
}
