/**
 * @file context.js
 * @description Per-render view context so expensive domain aggregates are computed once per store event.
 */

import { store } from '../store.js';
import { calculateBudgetSummary } from '../domain/budget.js';

/** Snapshot of the active event with its budget summary. */
export function createViewContext() {
  const event = store.getActiveEvent();
  return { event, budget: calculateBudgetSummary(event), cur: event.currency || '$' };
}
