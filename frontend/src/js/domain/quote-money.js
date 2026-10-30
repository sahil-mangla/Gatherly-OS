/**
 * @file quote-money.js
 * @description Dollar-amount, deposit and hidden-fee extraction for raw vendor quote text.
 * Mirrors backend/app/domain/quote_money.py rule-for-rule. Every `$` figure (prefix required,
 * so bare guest counts are never picked up) is classified from the words around it, then the
 * base price, deposit and fees are derived.
 */

const MONEY_SOURCE = String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
const CLAUSE_SPLIT_RE = /[.;!?\n]|,\s/;
const PREFIX_WINDOW = 30;
const SUFFIX_WINDOW = 30;
const PERCENT = 100;
const CENTS = 100;

const DEPOSIT_WORDS = String.raw`deposit|retainer|down\s*payment`;
const OVERTIME_WORDS = String.raw`over\s*time|extra\s+hours?|additional\s+hours?`;
const CLEANUP_WORDS = String.raw`clean\s*-?up|tear\s*down|break\s*down|set\s*-?up`;
const FEE_WORDS = String.raw`travel|delivery|parking|permit|corkage|cake\s+cutting|fees?|surcharge`;
const AFTER_FILLER = String.raw`(?:(?:/\s*hr|/\s*hour|per\s+hour|an\s+hour|flat|for|the|a|an)\s*){0,3}`;
const FEE_WORD_GROUP = String.raw`gratuity|tip|service\s+charge|service\s+fee|admin(?:istrative)?\s+fee`;
const PCT = String.raw`(\d+(?:\.\d+)?)`;

const TOTAL_RE = /\btotal\b/;
const EXPLICIT_RE = /=|\bpackage\b|\bbase\b|\bflat\b|all-in|comes\s+to|\bquoted?\b|\bprice\b/;
const UNIT_RE = /^\s*(?:\/|per\s+|an?\s+|each\s+)\s*(hr|hour|person|guest|head|pp|plate)/;
const HOUR_UNITS = ['hr', 'hour'];
const GUESTS_RE = /(\d{1,5})\s*(?:guests?|people|attendees|persons|ppl)/i;
const DEPOSIT_BEFORE_RE = new RegExp(DEPOSIT_WORDS);
const DEPOSIT_AFTER_RE = new RegExp(
  String.raw`^\s*(?:(?:non-refundable|refundable|required|upfront|due|as|is|a|the)\s+){0,2}(?:${DEPOSIT_WORDS})`
);
const DEPOSIT_PCT_RES = [
  new RegExp(String.raw`${PCT}\s*%\s*(?:non-refundable\s+)?(?:${DEPOSIT_WORDS})`, 'i'),
  new RegExp(String.raw`(?:${DEPOSIT_WORDS})\s*(?:of|is|:)?\s*${PCT}\s*%`, 'i')
];
const PERCENT_FEE_SOURCES = [
  String.raw`\b(${FEE_WORD_GROUP})\b\D{0,12}?${PCT}\s*%`,
  String.raw`${PCT}\s*%\s*\b(${FEE_WORD_GROUP})\b`
];

export const FEE_LABELS = {
  overtime: 'Overtime rate',
  cleanup: 'Cleanup / setup fee',
  fee: 'Additional fee'
};
const KIND_PATTERNS = [
  ['overtime', OVERTIME_WORDS],
  ['cleanup', CLEANUP_WORDS],
  ['fee', FEE_WORDS]
].map(([kind, words]) => ({
  kind,
  before: new RegExp(words),
  after: new RegExp(String.raw`^\s*${AFTER_FILLER}(?:${words})`)
}));

export const RATE_ESTIMATE_NOTE = 'Base amount estimated from per-person rate x guest count.';
const TIER_TOTAL = 0;
const TIER_EXPLICIT = 1;
const TIER_PLAIN = 2;

/** Python-style round(x, 2) for money. */
export const roundCents = (value) => Math.round((value + Number.EPSILON) * CENTS) / CENTS;

/** Lower-cased text just before and after match `idx`, limited to its own clause. */
function clauseContext(text, matches, idx) {
  const match = matches[idx];
  const prevEnd = idx ? matches[idx - 1].index + matches[idx - 1][0].length : 0;
  const nextStart = idx + 1 < matches.length ? matches[idx + 1].index : text.length;
  const before = text.slice(prevEnd, match.index).split(CLAUSE_SPLIT_RE).at(-1).slice(-PREFIX_WINDOW);
  const after = text.slice(match.index + match[0].length, nextStart).split(CLAUSE_SPLIT_RE)[0].slice(0, SUFFIX_WINDOW);
  return [before.toLowerCase(), after.toLowerCase()];
}

/** Returns deposit | overtime | cleanup | fee | rate | amount for one dollar figure. */
function classify(before, after) {
  if (DEPOSIT_BEFORE_RE.test(before) || DEPOSIT_AFTER_RE.test(after)) return 'deposit';
  const feeKind = TOTAL_RE.test(before)
    ? null
    : KIND_PATTERNS.find(p => p.before.test(before) || p.after.test(after));
  if (feeKind) return feeKind.kind;
  return UNIT_RE.test(after) ? 'rate' : 'amount';
}

function tierOf(before) {
  if (TOTAL_RE.test(before)) return TIER_TOTAL;
  return EXPLICIT_RE.test(before) ? TIER_EXPLICIT : TIER_PLAIN;
}

/** Every `$` figure in `text` with its inferred kind, unit and priority tier. */
export function parseMoneyItems(text) {
  const matches = [...text.matchAll(new RegExp(MONEY_SOURCE, 'g'))];
  return matches.map((match, idx) => {
    const [before, after] = clauseContext(text, matches, idx);
    const unit = UNIT_RE.exec(after);
    return {
      amount: parseFloat(match[0].replace(/[$,\s]/g, '')),
      kind: classify(before, after),
      unit: unit ? unit[1] : null,
      tier: tierOf(before)
    };
  });
}

function rateTimesGuests(text, items) {
  const guests = GUESTS_RE.exec(text);
  const rates = items.filter(i => i.kind === 'rate' && !HOUR_UNITS.includes(i.unit)).map(i => i.amount);
  return guests && rates.length > 0 ? Math.max(...rates) * parseInt(guests[1], 10) : 0;
}

/** Base price: explicit totals, then largest amount, then per-person rate x guests. */
export function pickBaseAmount(text, items) {
  const candidates = items.filter(i => i.kind === 'amount');
  if (candidates.length > 0) {
    const bestTier = Math.min(...candidates.map(i => i.tier));
    return [Math.max(...candidates.filter(i => i.tier === bestTier).map(i => i.amount)), null];
  }
  const estimate = rateTimesGuests(text, items);
  return [estimate, estimate ? RATE_ESTIMATE_NOTE : null];
}

/** Returns [deposit, stated]. Never invents a deposit the text does not mention. */
export function findDeposit(text, items, base) {
  const stated = items.find(i => i.kind === 'deposit');
  if (stated) return [stated.amount, true];
  const found = DEPOSIT_PCT_RES.map(re => re.exec(text)).find(Boolean);
  return found ? [roundCents((base * parseFloat(found[1])) / PERCENT), true] : [0, false];
}

const titleCase = (s) => s.replace(/\b\w/g, c => c.toUpperCase());

function percentFee(match, base) {
  const groups = match.slice(1).filter(Boolean);
  const label = groups.find(g => !/^\d/.test(g)).toLowerCase();
  const rate = parseFloat(groups.find(g => /^\d/.test(g)));
  return {
    type: /^(gratuity|tip)/.test(label) ? 'gratuity' : 'service_charge',
    label: `${titleCase(label)} ${rate}%`,
    unit: 'percent',
    rate,
    amount: roundCents((base * rate) / PERCENT)
  };
}

/** Overtime / cleanup / other dollar fees plus gratuity and service-charge percentages. */
export function findHiddenFees(text, items, base) {
  const dollarFees = items
    .filter(item => Object.hasOwn(FEE_LABELS, item.kind))
    .map(item => ({
      type: item.kind,
      label: FEE_LABELS[item.kind],
      unit: HOUR_UNITS.includes(item.unit) ? 'per_hour' : 'flat',
      rate: item.amount,
      amount: item.amount
    }));
  const percentFees = PERCENT_FEE_SOURCES.flatMap(
    source => [...text.matchAll(new RegExp(source, 'gi'))].map(m => percentFee(m, base))
  );
  return [...dollarFees, ...percentFees];
}
