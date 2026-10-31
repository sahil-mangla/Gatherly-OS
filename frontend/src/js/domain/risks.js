/**
 * @file risks.js
 * @description Deterministic Event Risk Radar engine for Gatherly client. Grounded in actual state.
 */

import { calculateBudgetSummary } from './budget.js';
import { calculateTimelineProgress } from './timeline.js';
import { RISK_RULES } from './risk-rules.js';

const SEVERITY_RANK = { critical: 1, warning: 2, notice: 3 };
const UNKNOWN_SEVERITY_RANK = 4;

const countBySeverity = (risks, severity) => risks.filter(r => r.severity === severity).length;

function emptyRadar() {
  return { critical_count: 0, warning_count: 0, notice_count: 0, total_count: 0, risks: [] };
}

function buildRuleContext(event, refDateStr) {
  const tasks = Array.isArray(event.tasks) ? event.tasks : [];
  return {
    event,
    budgetSummary: calculateBudgetSummary(event),
    timelineProgress: calculateTimelineProgress(tasks, refDateStr)
  };
}

/** Evaluates every risk rule against the event and returns severity counts plus the open risks. */
export function evaluateEventRisks(event, refDateStr = null) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return emptyRadar();

  const dismissedIds = new Set(Array.isArray(event.dismissed_risk_ids) ? event.dismissed_risk_ids : []);
  const context = buildRuleContext(event, refDateStr);

  const activeRisks = RISK_RULES
    .flatMap(rule => rule(context))
    .filter(r => !dismissedIds.has(r.id))
    .sort((a, b) => (SEVERITY_RANK[a.severity] || UNKNOWN_SEVERITY_RANK) - (SEVERITY_RANK[b.severity] || UNKNOWN_SEVERITY_RANK));

  return {
    critical_count: countBySeverity(activeRisks, 'critical'),
    warning_count: countBySeverity(activeRisks, 'warning'),
    notice_count: countBySeverity(activeRisks, 'notice'),
    total_count: activeRisks.length,
    risks: activeRisks
  };
}
