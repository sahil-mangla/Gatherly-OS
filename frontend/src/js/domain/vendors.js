/**
 * @file vendors.js
 * @description Vendor quote normalization, fee completeness audit, and raw seed parsing for Gatherly client.
 */

import { safeNonNegativeNumber } from './budget.js';

export const ESSENTIAL_QUOTE_FIELDS = [
  { key: 'setup_cleanup', label: 'Setup & post-event cleanup' },
  { key: 'service_staff', label: 'Service staff & gratuity policy' },
  { key: 'overtime_rate', label: 'Overtime hourly rate' },
  { key: 'cancellation_terms', label: 'Cancellation refund policy' }
];

export function auditQuoteCompleteness(quote = {}) {
  const missing = [];
  const inclusions = (Array.isArray(quote.inclusions) ? quote.inclusions.join(' ') : '').toLowerCase();
  const notes = String(quote.notes || '').toLowerCase();
  const summary = String(quote.summary || '').toLowerCase();
  const missingFields = (Array.isArray(quote.missing_fields) ? quote.missing_fields.join(' ') : '').toLowerCase();
  const combined = `${inclusions} ${notes} ${summary} ${missingFields}`;

  if (!['clean', 'teardown', 'breakdown'].some(k => combined.includes(k))) {
    missing.push('Post-event cleanup and teardown fees');
  }

  if (!['staff', 'server', 'labor', 'crew'].some(k => combined.includes(k))) {
    missing.push('Service staff staffing & gratuity terms');
  }

  if (!['overtime', 'extra hour', 'curfew'].some(k => combined.includes(k))) {
    missing.push('Overtime hourly rate and curfew policy');
  }

  if (!['refund', 'cancellation', 'deposit milestone'].some(k => combined.includes(k))) {
    missing.push('Cancellation milestones & deposit refund clause');
  }

  return { isComplete: missing.length === 0, missing };
}

export function normalizeQuote(rawQuote = {}) {
  const basePrice = safeNonNegativeNumber(
    rawQuote.price ?? rawQuote.quoted_amount ?? rawQuote.quoted_base_amount ?? 0
  );
  const deposit = safeNonNegativeNumber(
    rawQuote.deposit ?? rawQuote.deposit_paid ?? rawQuote.deposit_amount ?? 0
  );
  const { isComplete, missing } = auditQuoteCompleteness(rawQuote);

  const depositPercent = basePrice > 0 ? Math.round((deposit / basePrice) * 100) : 0;

  return {
    id: rawQuote.id || rawQuote.quote_id || 'quote-1',
    name: rawQuote.name || rawQuote.vendor_name || rawQuote.tier_name || 'Vendor Quote',
    category: rawQuote.category || rawQuote.service_type || 'General',
    base_price: basePrice,
    deposit_amount: deposit,
    deposit_percent: depositPercent,
    inclusions: Array.isArray(rawQuote.inclusions) ? rawQuote.inclusions : [],
    exclusions: Array.isArray(rawQuote.exclusions) ? rawQuote.exclusions : [],
    missing_disclosures: missing,
    is_fully_disclosed: isComplete,
    estimated_hidden_risk_score: missing.length * 15
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

export function generateFollowUpQuestions(quote = {}) {
  const { missing } = auditQuoteCompleteness(quote);
  const questions = [];

  for (const item of missing) {
    if (item.includes('cleanup')) {
      questions.push('Does the quoted fee include full post-event cleanup and waste removal, or is there an auxiliary teardown surcharge?');
    } else if (item.includes('staff')) {
      questions.push('How many service staff members are included on-site during the contracted hours, and what is the gratuity policy?');
    } else if (item.includes('Overtime') || item.includes('overtime')) {
      questions.push('What is the billing rate if speeches or dancing extend 30 to 60 minutes past the scheduled timeline?');
    } else if (item.includes('Cancellation') || item.includes('cancellation')) {
      questions.push('What are the refund milestones if an unexpected postponement or date change occurs?');
    }
  }

  if (questions.length === 0) {
    questions.push('Could you provide the certificate of vendor insurance for venue approval?');
    questions.push('What is your delivery and electrical hookup arrival window?');
  }

  return questions;
}

export function extractQuoteFromRawText(text = '') {
  const priceMatch = text.match(/\$?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
  const extractedAmount = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 2400.0;

  const hasStaff = /staff|server|labor|crew/i.test(text);
  const hasCleanup = /clean|setup|breakdown|teardown/i.test(text);
  const hasOvertime = /overtime|per\s*hour/i.test(text);
  const hasDeposit = /deposit|retainer|down\s*payment/i.test(text);

  const missing = [];
  if (!hasStaff) missing.push('Service staff & gratuity policy');
  if (!hasCleanup) missing.push('Post-event cleanup & teardown fees');
  if (!hasOvertime) missing.push('Overtime hourly billing rate');
  if (!hasDeposit) missing.push('Deposit milestones and cancellation refund terms');

  const vendorNameMatch = text.match(/(?:studio|catering|florals|bakery|photo|bloom|crumb|society|sol)[\w\s]*/i);
  const vendorName = vendorNameMatch ? vendorNameMatch[0].trim() : 'Extracted Vendor';

  let serviceType = 'decor';
  if (/photo|shoot|image/i.test(text)) serviceType = 'photography';
  else if (/cater|food|menu|drink/i.test(text)) serviceType = 'catering';

  return {
    vendor_name: vendorName,
    service_type: serviceType,
    quoted_base_amount: extractedAmount,
    deposit_amount: Math.round(extractedAmount * 0.3),
    inclusions: [
      'Core service delivery as specified in proposal',
      'Standard equipment package'
    ],
    exclusions: missing,
    missing_fields: missing,
    confidence_score: 0.92,
    follow_up_questions: [
      `Could you clarify if setup and post-event teardown are included in the $${extractedAmount.toLocaleString()} quote?`,
      'What is the hourly overtime rate if the schedule extends past contracted hours?',
      'What is the exact payment schedule and cancellation refund timeline?'
    ]
  };
}
