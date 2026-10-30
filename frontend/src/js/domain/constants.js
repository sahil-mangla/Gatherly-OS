/**
 * @file constants.js
 * @description Shared named constants for Gatherly client domain logic (no magic numbers).
 */

export const MS_PER_DAY = 86400000;
export const DAYS_PER_WEEK = 7;
export const MS_PER_WEEK = DAYS_PER_WEEK * MS_PER_DAY;

/** Venue capacity assumed when an event has none recorded (effectively "unlimited"). */
export const UNLIMITED_VENUE_CAPACITY = 999999;
export const DEFAULT_EXPECTED_GUESTS = 100;

/** Catering assumptions used by the what-if sandbox when no catering expense exists. */
export const FALLBACK_CATERING = Object.freeze({ planned_amount: 4000, cost_per_guest: 45 });
export const DEFAULT_COST_PER_GUEST = 40;

/** Estimated risk points added per undisclosed quote term. */
export const RISK_POINTS_PER_MISSING_TERM = 15;

/** Days between "today" and the due date of a task converted from an idea / Mara proposal. */
export const IDEA_TASK_LEAD_DAYS = 14;
export const PROPOSAL_TASK_LEAD_DAYS = 7;

export const EXPENSE_CATEGORIES = [
  'venue',
  'catering',
  'design',
  'photo_music',
  'contingency',
  'other'
];
