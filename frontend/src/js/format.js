/**
 * @file format.js
 * @description One place for user-facing money and enum-label formatting (no raw `photo_music`, `$5,330.5` or `in_progress`).
 */

const CENTS = 100;
const LABELS = {
  photo_music: 'Photo & music',
  todo: 'To do',
  in_progress: 'In progress',
  rebalance_budget: 'Rebalance budget'
};

/** `$2,400` for whole-dollar amounts, `$5,330.50` when cents are present (never `$5,330.5`). */
export function formatDollars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  const digits = Math.round(abs * CENTS) % CENTS === 0 ? 0 : 2;
  const text = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? '-' : ''}$${text}`;
}

/** Human label for an enum-like token: `photo_music` -> `Photo & music`, `in_progress` -> `In progress`. */
export function prettyLabel(token, fallback = '') {
  const raw = String(token ?? '').trim();
  if (!raw) return fallback;
  if (Object.hasOwn(LABELS, raw.toLowerCase())) return LABELS[raw.toLowerCase()];
  const spaced = raw.replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `$150 per hour`, `$400` or `18% (about $432)` for one extracted fee. */
export function formatFee(fee) {
  if (fee.unit === 'percent') return `${fee.rate}% (about ${formatDollars(fee.amount)})`;
  return `${formatDollars(fee.amount)}${fee.unit === 'per_hour' ? ' per hour' : ''}`;
}
