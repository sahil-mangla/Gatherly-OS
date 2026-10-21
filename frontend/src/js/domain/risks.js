/**
 * @file risks.js
 * @description Deterministic Event Risk Radar engine for Gatherly client. Grounded in actual state.
 */

import { calculateBudgetSummary, safeNonNegativeNumber } from './budget.js';
import { calculateTimelineProgress } from './timeline.js';
import { auditQuoteCompleteness } from './vendors.js';

export function evaluateEventRisks(event, refDateStr = null) {
  if (!event || typeof event !== 'object') {
    return {
      critical_count: 0,
      warning_count: 0,
      notice_count: 0,
      total_count: 0,
      risks: []
    };
  }

  const dismissedIds = new Set(Array.isArray(event.dismissed_risk_ids) ? event.dismissed_risk_ids : []);
  const risks = [];

  const expectedGuests = Number(event.expected_guests || 0);
  const venueCapacity = safeNonNegativeNumber(event.venue_capacity ?? 999999);

  // Rule 1: Capacity Breach
  if (expectedGuests > venueCapacity && venueCapacity > 0) {
    const diff = Math.round(expectedGuests - venueCapacity);
    risks.push({
      id: 'risk-capacity-breach',
      type: 'capacity_breach',
      severity: 'critical',
      title: 'Venue Capacity Exceeded',
      evidence: `Expected guest count (${expectedGuests}) exceeds confirmed venue capacity (${venueCapacity.toLocaleString()}) by ${diff} guests.`,
      consequence: 'Fire code safety violation or venue surcharge on the event day.',
      recommended_actions: [
        {
          label: 'Simulate Guest Adjustment',
          action_type: 'open_whatif',
          payload: { guest_delta: -diff }
        },
        {
          label: 'Consult Mara on Capacity Solutions',
          action_type: 'ask_mara',
          prompt: `Our venue capacity is ${venueCapacity} but expected guests is ${expectedGuests}. How should we handle this gracefully?`
        }
      ],
      status: 'open'
    });
  }

  // Rule 2: Budget Deficit
  const budgetSummary = calculateBudgetSummary(event);
  if (budgetSummary.is_over_budget) {
    const deficit = budgetSummary.deficit_amount;
    risks.push({
      id: 'risk-budget-deficit',
      type: 'budget_overrun',
      severity: 'critical',
      title: 'Total Budget Overrun',
      evidence: `Total allocated spend ($${budgetSummary.total_allocated.toLocaleString()}) exceeds total budget ($${budgetSummary.total_budget.toLocaleString()}) by $${deficit.toLocaleString()}.`,
      consequence: 'Financial shortfall before final vendor retainers are disbursed.',
      recommended_actions: [
        {
          label: 'Smart Ways to Save',
          action_type: 'ask_mara',
          prompt: 'Show me smart ways to eliminate our budget deficit.'
        },
        { label: 'Open What-If Sandbox', action_type: 'open_whatif' }
      ],
      status: 'open'
    });
  }

  // Rule 3: Category Overruns
  for (const catName of Object.keys(budgetSummary.categories)) {
    const catData = budgetSummary.categories[catName];
    if (catData.is_overrun && catData.planned > 0) {
      const variance = catData.variance;
      risks.push({
        id: `risk-category-overrun-${catName}`,
        type: 'category_overrun',
        severity: 'warning',
        title: `Category Spend Overrun: ${catName}`,
        evidence: `Category '${catName}' allocated spend ($${catData.allocated.toLocaleString()}) exceeds planned budget ($${catData.planned.toLocaleString()}) by $${variance.toLocaleString()}.`,
        consequence: 'Diverts funds away from remaining uncommitted items.',
        recommended_actions: [
          {
            label: 'Rebalance with Mara',
            action_type: 'ask_mara',
            prompt: `Our ${catName} budget is over by $${variance.toLocaleString()}. Suggest reallocations from other categories.`
          }
        ],
        status: 'open'
      });
    }
  }

  // Rule 4: Overdue Milestones
  const tasks = Array.isArray(event.tasks) ? event.tasks : [];
  const timelineProgress = calculateTimelineProgress(tasks, refDateStr);
  if (timelineProgress.overdue_tasks && timelineProgress.overdue_tasks.length > 0) {
    const overdueTitles = timelineProgress.overdue_tasks.map(t => `'${t.title}'`).join(', ');
    risks.push({
      id: 'risk-overdue-milestones',
      type: 'milestone_overdue',
      severity: 'warning',
      title: `${timelineProgress.overdue_tasks.length} Milestone(s) Overdue`,
      evidence: `Uncompleted milestone(s) past scheduled due date: ${overdueTitles}.`,
      consequence: 'May compress downstream tasks and vendor booking lead times.',
      recommended_actions: [
        { label: 'View Timeline', action_type: 'open_timeline' },
        {
          label: 'Reschedule Assistance',
          action_type: 'ask_mara',
          prompt: 'What tasks should I prioritize to get back on schedule?'
        }
      ],
      status: 'open'
    });
  }

  // Rule 5: Undisclosed Vendor Fees
  const vendors = Array.isArray(event.vendors) ? event.vendors : [];
  for (const v of vendors) {
    if (!v || typeof v !== 'object') continue;
    if (v.status === 'shortlist') {
      const { isComplete, missing } = auditQuoteCompleteness(v);
      if (!isComplete) {
        const vId = v.id || 'vendor';
        risks.push({
          id: `risk-vendor-missing-${vId}`,
          type: 'missing_quote_details',
          severity: 'notice',
          title: `Undisclosed Terms: ${v.name}`,
          evidence: `Quote received for ${v.name} does not disclose: ${missing.join('; ')}.`,
          consequence: 'Risk of surprise surcharges during final invoicing.',
          recommended_actions: [
            {
              label: 'Review Quote & Draft Questions',
              action_type: 'open_quotes',
              payload: { vendor_id: vId }
            }
          ],
          status: 'open'
        });
      }
    }
  }

  // Filter dismissed
  const activeRisks = risks.filter(r => !dismissedIds.has(r.id));

  const severityRank = { critical: 1, warning: 2, notice: 3 };
  activeRisks.sort((a, b) => (severityRank[a.severity] || 4) - (severityRank[b.severity] || 4));

  return {
    critical_count: activeRisks.filter(r => r.severity === 'critical').length,
    warning_count: activeRisks.filter(r => r.severity === 'warning').length,
    notice_count: activeRisks.filter(r => r.severity === 'notice').length,
    total_count: activeRisks.length,
    risks: activeRisks
  };
}
