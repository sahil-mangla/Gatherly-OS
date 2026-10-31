/**
 * @file vendors.js
 * @description Vendor quote normalization, fee completeness audit, and comparison for Gatherly client.
 */

import { safeNonNegativeNumber } from './budget.js';
import { RISK_POINTS_PER_MISSING_TERM } from './constants.js';
import { savedQuotesNote } from './quote-terms.js';

export { extractQuoteFromRawText } from './vendors-extract.js';

/** Disclosure checks: a message is reported when none of its keywords appear in the quote text. */
const DISCLOSURE_CHECKS = [
  { keywords: ['clean', 'teardown', 'breakdown'], message: 'Post-event cleanup and teardown fees' },
  { keywords: ['staff', 'server', 'labor', 'crew'], message: 'Service staff staffing & gratuity terms' },
  { keywords: ['overtime', 'extra hour', 'curfew'], message: 'Overtime hourly rate and curfew policy' },
  { keywords: ['refund', 'cancellation', 'deposit milestone'], message: 'Cancellation milestones & deposit refund clause' }
];

const joinLower = (value) => (Array.isArray(value) ? value.join(' ') : '').toLowerCase();

/** First value that is neither null nor undefined (mirrors a `??` chain). */
export const firstDefined = (...values) => values.find(v => v !== undefined && v !== null);
/** First truthy value (mirrors a `||` chain). */
export const firstTruthy = (...values) => values.find(Boolean);

/** Which essential terms (cleanup, staffing, overtime, cancellation) a quote and its saved quotes never mention. */
export function auditQuoteCompleteness(quote = {}) {
  const combined = [
    joinLower(quote.inclusions),
    String(quote.notes || '').toLowerCase(),
    String(quote.summary || '').toLowerCase(),
    joinLower(quote.missing_fields),
    savedQuotesNote(quote)
  ].join(' ');

  const missing = DISCLOSURE_CHECKS
    .filter(check => !check.keywords.some(k => combined.includes(k)))
    .map(check => check.message);

  return { isComplete: missing.length === 0, missing };
}

/** Normalizes a vendor quote for side-by-side comparison. */
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

/** Compares quotes in a normalized matrix and names the cheapest and the most fully disclosed. */
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

/** Follow-up questions for each term the quote leaves undisclosed. */
export function generateFollowUpQuestions(quote = {}) {
  const { missing } = auditQuoteCompleteness(quote);
  const questions = missing.map(questionFor).filter(Boolean);
  return questions.length > 0 ? questions : [...GENERIC_FOLLOW_UPS];
}
