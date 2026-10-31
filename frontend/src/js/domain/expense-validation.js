/**
 * @file expense-validation.js
 * @description Table-driven validation of raw expense payloads (mirrors backend validate_expense_input).
 */

import { EXPENSE_CATEGORIES } from './constants.js';
import { numberOr } from './numeric.js';

/**
 * Amount fields checked by validateExpenseInput:
 * [field, value used when the field is absent (undefined = required), negative message, invalid message].
 */
const AMOUNT_RULES = [
  [
    'planned_amount', undefined,
    'Planned amount must be a positive number or zero.', 'Planned amount must be a valid number.'
  ],
  ['actual_amount', 0, 'Actual amount cannot be negative.', 'Actual amount must be a valid number.'],
  ['committed_amount', 0, 'Committed amount cannot be negative.', 'Committed amount must be a valid number.']
];

function descriptionErrors(item) {
  const text = item.description;
  const blank = typeof text !== 'string' || text.trim().length === 0;
  return blank ? ['Description is required and must not be empty.'] : [];
}

function amountError(item, [field, absent, negativeMessage, invalidMessage]) {
  const amount = numberOr(field in item ? item[field] : absent, null);
  if (amount === null) return [invalidMessage];
  return amount < 0 ? [negativeMessage] : [];
}

function categoryErrors(item) {
  if (!item.category || EXPENSE_CATEGORIES.includes(item.category)) return [];
  return [`Invalid category '${item.category}'. Allowed: ${EXPENSE_CATEGORIES.join(', ')}`];
}

/** Validation messages for an expense record; an empty list means it is valid. */
export function validateExpenseInput(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { valid: false, errors: ['Expense payload must be an object.'] };
  }
  const errors = [
    ...descriptionErrors(item),
    ...AMOUNT_RULES.flatMap(rule => amountError(item, rule)),
    ...categoryErrors(item)
  ];
  return { valid: errors.length === 0, errors };
}
