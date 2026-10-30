/**
 * @file vendors-extract.js
 * @description Structured extraction from raw, unstructured vendor quote emails.
 * Mirrors backend/app/domain/quote_parser.py rule-for-rule.
 */

import { parseMoneyItems, pickBaseAmount, findDeposit, findHiddenFees, roundCents, roundHalfEven } from './quote-money.js';

export const DEFAULT_VENDOR_NAME = 'Extracted Vendor';
const DEFAULT_SERVICE_TYPE = 'decor';
const CATEGORY_WORDS = 'Catering|Caterers|Photography|Photo|Photos|Florals|Floral|Flowers|Music|Venue|DJ|DJs'
  + '|Events|Studio|Bakery|Band|Video|Rentals|Entertainment';
const WORD_CHAR = String.raw`\p{L}\p{N}_`;
const CAP_WORD = String.raw`[A-Z][${WORD_CHAR}&'’-]*`;
const GREETING_RE = /^\s*(?:hi|hello|hey|dear\s+[\p{L}\p{N}_]+)\b(?:\s+(?:there|team|all))?[\s,!.:-]*/iu;
const LEADING_NAME_RE = new RegExp(
  String.raw`^[^${WORD_CHAR}]*(${CAP_WORD}(?:\s+(?:&\s+)?${CAP_WORD}){0,4})\s*(?:\bhere\b|\bquote\b|\bproposal\b|—|–|-|:)`,
  'u'
);
const CATEGORY_NAME_RE = new RegExp(String.raw`\b((?:${CAP_WORD}\s+(?:&\s+)?){1,3}(?:${CATEGORY_WORDS}))\b`, 'u');
const CATEGORY_ONLY_RE = new RegExp(`^(?:${CATEGORY_WORDS})$`, 'i');
const STOP_WORDS = new Set(
  'thanks thank hi hello hey dear please our the this quote here includes include package'.split(' ')
);
const SERVICE_RULES = [
  ['photography', /photo|shoot|image|gallery|videograph/i],
  ['catering', /cater|food|menu|drink|dinner|buffet|plated/i],
  ['music', /\bdj\b|band|music|playlist/i],
  ['florals', /floral|flower|bouquet|bloom/i],
  ['venue', /venue|ballroom|hall rental/i]
];
const INCLUDES_RE = /(?<!not )(?<!n't )\binclud(?:es?|ing|ed)\b\s*:?\s*(.+?)(?:[.;\n]|$)/gi;
const INCLUSION_SPLIT_RE = /,\s*(?:and\s+)?|\s+and\s+/i;
const MAX_INCLUSIONS = 8;
const MAX_INCLUSION_LEN = 80;

const MISSING_CHECKS = [
  [/staff|server|labor|crew|gratuity|service\s+charge/i, 'Service staff & gratuity policy'],
  [/clean|setup|breakdown|teardown/i, 'Post-event cleanup & teardown fees'],
  [/overtime|per\s*hour/i, 'Overtime hourly billing rate'],
  [/deposit|retainer|down\s*payment/i, 'Deposit milestones and cancellation refund terms']
];

const CONFIDENCE = { base: 0.3, amount: 0.35, name: 0.2, deposit: 0.1, fees: 0.05, cap: 0.95 };
export const NO_AMOUNT_NOTE = 'No dollar amount found in the text; base amount left at 0.';
const AMOUNT_ESTIMATED_FLAG = 'amount_estimated';
const NO_AMOUNT_FLAG = 'no_amount_found';

function cleanName(name) {
  const words = name.split(/\s+/);
  while (words.length > 0 && STOP_WORDS.has(words[0].toLowerCase())) words.shift();
  const cleaned = words.join(' ');
  return !cleaned || CATEGORY_ONLY_RE.test(cleaned) ? null : cleaned;
}

/** Business name from a leading 'Name here/quote/—' phrase or 'Name + category word'. */
export function extractVendorName(text) {
  const body = text.replace(GREETING_RE, '');
  for (const pattern of [LEADING_NAME_RE, CATEGORY_NAME_RE]) {
    const found = pattern.exec(body);
    const name = found ? cleanName(found[1]) : null;
    if (name) return name;
  }
  return null;
}

/** Service category from the vendor name first, then the whole message. */
export function detectServiceType(name, text) {
  for (const haystack of [name || '', text]) {
    const rule = SERVICE_RULES.find(([, pattern]) => pattern.test(haystack));
    if (rule) return rule[0];
  }
  return DEFAULT_SERVICE_TYPE;
}

/** Items listed after 'includes'/'including' (never after 'does not include'). */
export function extractInclusions(text) {
  const items = [...text.matchAll(INCLUDES_RE)]
    .flatMap(found => found[1].split(INCLUSION_SPLIT_RE))
    .map(part => part.trim())
    .filter(part => part && part.length <= MAX_INCLUSION_LEN)
    .map(part => part[0].toUpperCase() + part.slice(1));
  return items.slice(0, MAX_INCLUSIONS);
}

/** Essential terms (staffing, cleanup, overtime, deposit) the text never mentions. */
export function missingDisclosures(text) {
  return MISSING_CHECKS.filter(([pattern]) => !pattern.test(text)).map(([, label]) => label);
}

function confidence(hasAmount, hasName, depositStated, hasFees) {
  const score = CONFIDENCE.base
    + (hasAmount ? CONFIDENCE.amount : 0)
    + (hasName ? CONFIDENCE.name : 0)
    + (depositStated ? CONFIDENCE.deposit : 0)
    + (hasFees ? CONFIDENCE.fees : 0);
  return roundCents(Math.min(CONFIDENCE.cap, score));
}

function followUpQuestions(base) {
  const first = base > 0
    ? `Could you clarify if setup and post-event teardown are included in the $${roundHalfEven(base, 0).toLocaleString('en-US')} quote?`
    : 'Could you confirm the total price and exactly what it covers?';
  return [
    first,
    'What is the hourly overtime rate if the schedule extends past contracted hours?',
    'What is the exact payment schedule and cancellation refund timeline?'
  ];
}

/** Extract structured quote parameters from raw unstructured text. */
export function extractQuoteFromRawText(text = '') {
  const items = parseMoneyItems(text);
  const [base, estimateNote] = pickBaseAmount(text, items);
  const [deposit, depositStated] = findDeposit(text, items, base);
  const fees = findHiddenFees(text, items, base);
  const name = extractVendorName(text);
  const missing = missingDisclosures(text);

  const notes = estimateNote ? [estimateNote] : [];
  const flags = estimateNote ? [AMOUNT_ESTIMATED_FLAG] : [];
  if (base <= 0) {
    notes.push(NO_AMOUNT_NOTE);
    flags.push(NO_AMOUNT_FLAG);
  }

  return {
    vendor_name: name || DEFAULT_VENDOR_NAME,
    service_type: detectServiceType(name, text),
    quoted_base_amount: base,
    deposit_amount: deposit,
    deposit_stated: depositStated,
    hidden_fees: fees,
    inclusions: extractInclusions(text),
    exclusions: missing,
    missing_fields: missing,
    confidence_score: confidence(base > 0, Boolean(name), depositStated, fees.length > 0),
    follow_up_questions: followUpQuestions(base),
    notes,
    flags
  };
}
