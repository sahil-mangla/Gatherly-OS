/**
 * @file quote-percent.js
 * @description Clause-aware percentage classification for raw vendor quote text. Mirrors
 * backend/app/domain/quote_percent.py rule-for-rule. Every `N%` token is classified once:
 *   1. followed (optional whitespace) by deposit | retainer | down payment (optionally
 *      `non-refundable`) -> the deposit percentage, never a fee;
 *   2. followed (whitespace only) by a fee word (gratuity, tip, service charge/fee, admin fee)
 *      -> belongs to that word, which becomes claimed ("N% word" wins over "word N%");
 *   3. preceded by an UNCLAIMED fee word, <= 12 chars earlier with no `.` `;` newline, digit or
 *      `%` in between -> belongs to that word;
 *   4. otherwise ignored.
 * Digit runs are bounded and anchored, so scanning stays linear on adversarial input.
 */

export const DEPOSIT_WORDS = String.raw`deposit|retainer|down\s{0,3}payment`;
const NUMBER = String.raw`(?<![0-9.])([0-9]{1,9}(?:\.[0-9]{1,4})?)`;
const PCT_RE = new RegExp(String.raw`${NUMBER}\s{0,3}%`, 'g');
const FEE_WORD_RE = /\b(gratuity|tip|service\s{1,4}charge|service\s{1,4}fee|admin(?:istrative)?\s{1,4}fee)\b/gi;
const DEPOSIT_AFTER_RE = new RegExp(String.raw`\s{0,4}(?:non-refundable\s{1,4})?(?:${DEPOSIT_WORDS})`, 'iy');
const DEPOSIT_BEFORE_RE = new RegExp(
  String.raw`(?:${DEPOSIT_WORDS})\s{0,3}(?:of|is|:)?\s{0,3}${NUMBER}\s{0,3}%`,
  'i'
);
const GAP_BREAK_RE = /[.;\n\r0-9%]/;
const BLANK_RE = /^\s*$/;
const FOLLOW_GAP = 4;
const PRECEDE_GAP = 12;

/** Index of the first element >= x (sorted ascending). */
function bisectLeft(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the first element > x (sorted ascending). */
function bisectRight(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const pctEnd = (pct) => pct.index + pct[0].length;

/** Index of the fee word directly following `pct` (whitespace only between), else -1. */
function followingWord(text, pct, words) {
  const end = pctEnd(pct);
  const idx = bisectLeft(words.starts, end);
  if (idx === words.starts.length || words.starts[idx] - end > FOLLOW_GAP) return -1;
  return BLANK_RE.test(text.slice(end, words.starts[idx])) ? idx : -1;
}

/** Index of the nearest fee word ending shortly before `pct` in the same clause, else -1. */
function precedingWord(text, pct, words) {
  const idx = bisectRight(words.ends, pct.index) - 1;
  if (idx < 0 || pct.index - words.ends[idx] > PRECEDE_GAP) return -1;
  return GAP_BREAK_RE.test(text.slice(words.ends[idx], pct.index)) ? -1 : idx;
}

function depositFollows(text, pct) {
  DEPOSIT_AFTER_RE.lastIndex = pctEnd(pct);
  return DEPOSIT_AFTER_RE.test(text);
}

/** Rules 1 and 2: the deposit percentage, 'N% word' claims and the unresolved rest. */
function firstPass(text, pcts, words) {
  let deposit = null;
  const claims = new Map();
  const rest = [];
  for (const pct of pcts) {
    if (depositFollows(text, pct)) {
      deposit ??= parseFloat(pct[1]);
      continue;
    }
    const idx = followingWord(text, pct, words);
    if (idx < 0) rest.push(pct);
    else claims.set(idx, pct);
  }
  return { deposit, claims, rest };
}

/** Returns { deposit: number|null, fees: [{ word, rate }] } with fees in text order. */
export function classifyPercents(text) {
  const found = [...text.matchAll(FEE_WORD_RE)];
  const words = { starts: found.map(w => w.index), ends: found.map(w => w.index + w[0].length) };
  const { deposit, claims, rest } = firstPass(text, [...text.matchAll(PCT_RE)], words);
  for (const pct of rest) {
    const idx = precedingWord(text, pct, words);
    if (idx >= 0 && !claims.has(idx)) claims.set(idx, pct);
  }
  const fees = [...claims]
    .sort((a, b) => a[1].index - b[1].index)
    .map(([i, pct]) => ({ word: found[i][1], rate: parseFloat(pct[1]) }));
  const before = deposit === null ? DEPOSIT_BEFORE_RE.exec(text) : null;
  return { deposit: before ? parseFloat(before[1]) : deposit, fees };
}
