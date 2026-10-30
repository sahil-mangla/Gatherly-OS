/**
 * @file parity-risks.test.js
 * @description JS side of the parity suite: Event Risk Radar (including dependency collisions).
 */

import { test } from 'node:test';
import { evaluateEventRisks } from '../src/js/domain/risks.js';
import { runFixture } from './parity-domain-support.js';

runFixture(test, 'risks', ({ event, ref_date: refDate }) => evaluateEventRisks(event, refDate));
