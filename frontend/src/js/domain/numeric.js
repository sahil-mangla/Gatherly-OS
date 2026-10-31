/**
 * @file numeric.js
 * @description Numeric coercion and rounding shared by the domain engines. Mirrors
 * backend/app/domain/numeric.py: only plain decimal numbers (or numeric strings) are accepted,
 * non-finite values are rejected, and halves round up.
 */

const DECIMAL = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;

/** `value` as a finite number, or `fallback` when it is not a plain finite number. */
export function numberOr(value, fallback) {
  const plain = typeof value === 'number' || typeof value === 'boolean'
    || (typeof value === 'string' && DECIMAL.test(value));
  const num = plain ? Number(value) : NaN;
  return Number.isFinite(num) ? num : fallback;
}

/** `val` as a finite number clamped to zero or more (invalid input becomes 0). */
export function safeNonNegativeNumber(val) {
  return Math.max(0, numberOr(val, 0));
}

/** `value` truncated toward zero, or `fallback` when it is not a finite number. */
export function toInt(value, fallback) {
  const num = numberOr(value, null);
  return num === null ? fallback : Math.trunc(num);
}

/** Nearest integer with halves toward +infinity (never "-0"). */
export const roundHalfUp = (value) => Math.round(value) + 0;

/** Whole-number amount with comma grouping, e.g. "1,235" (always en-US, never locale-dependent). */
export const formatAmount = (value) => roundHalfUp(value).toLocaleString('en-US');

/** Signed one-decimal text with halves rounded up, e.g. "+12.3" or "-0.5". */
export function formatSignedTenths(value) {
  const tenths = roundHalfUp(Math.abs(value) * 10);
  return `${value < 0 ? '-' : '+'}${Math.trunc(tenths / 10)}.${tenths % 10}`;
}
