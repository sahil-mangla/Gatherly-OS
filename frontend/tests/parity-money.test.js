/**
 * @file parity-money.test.js
 * @description JS side of the Python-vs-JS parity suite: budget, expenses and ripple simulation.
 */

import { test } from 'node:test';
import { calculateBudgetSummary, simulateRipple, validateExpenseInput } from '../src/js/domain/budget.js';
import { runFixture } from './parity-domain-support.js';

runFixture(test, 'budget', calculateBudgetSummary);
runFixture(test, 'expense', validateExpenseInput);
runFixture(test, 'simulation', ({ event, deltas }) => simulateRipple(event, deltas ?? undefined));
