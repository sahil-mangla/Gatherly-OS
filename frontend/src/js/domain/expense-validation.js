/**
 * @file expense-validation.js
 * @description Table-driven validation of raw expense payloads.
 */

import { EXPENSE_CATEGORIES } from './constants.js';

/** Amount fields checked by validateExpenseInput: [field, optional (absent means 0), error message]. */
const AMOUNT_RULES = [
  ['planned_amount', false, 'Planned amount must be a positive number or zero.'],
  ['actual_amount', true, 'Actual amount cannot be negative.'],
  ['committed_amount', true, 'Committed amount cannot be negative.']
];

const isInvalidAmount = (value) => {
  const num = Number(value);
  return isNaN(num) || num < 0;
};

function descriptionErrors(item) {
  const text = item.description;
  const blank = typeof text !== 'string' || text.trim().length === 0;
  return blank ? ['Description is required and must not be empty.'] : [];
}

function amountErrors(item) {
  return AMOUNT_RULES
    .filter(([field, optional]) => isInvalidAmount(optional ? (item[field] ?? 0) : item[field]))
    .map(([, , message]) => message);
}

function categoryErrors(item) {
  if (!item.category || EXPENSE_CATEGORIES.includes(item.category)) return [];
  return [`Invalid category: "${item.category}". Allowed: ${EXPENSE_CATEGORIES.join(', ')}`];
}

export function validateExpenseInput(item) {
  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Expense payload must be an object.'] };
  }
  const errors = [...descriptionErrors(item), ...amountErrors(item), ...categoryErrors(item)];
  return { valid: errors.length === 0, errors };
}
