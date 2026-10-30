/**
 * @file risk-rules.js
 * @description Individual Event Risk Radar rules. Each rule maps a context to zero or more risks.
 */

import { safeNonNegativeNumber } from './budget.js';
import { UNLIMITED_VENUE_CAPACITY } from './constants.js';
import { auditQuoteCompleteness } from './vendors.js';

export function makeRisk({ id, type, severity, title, evidence, consequence, actions }) {
  return {
    id,
    type,
    severity,
    title,
    evidence,
    consequence,
    recommended_actions: actions,
    status: 'open'
  };
}

const askMara = (label, prompt) => ({ label, action_type: 'ask_mara', prompt });
const money = (n) => `$${n.toLocaleString()}`;

export function capacityRule({ event }) {
  const expectedGuests = Number(event.expected_guests || 0);
  const venueCapacity = safeNonNegativeNumber(event.venue_capacity ?? UNLIMITED_VENUE_CAPACITY);
  if (!(expectedGuests > venueCapacity && venueCapacity > 0)) return [];

  const diff = Math.round(expectedGuests - venueCapacity);
  return [makeRisk({
    id: 'risk-capacity-breach',
    type: 'capacity_breach',
    severity: 'critical',
    title: 'Venue Capacity Exceeded',
    evidence: `Expected guest count (${expectedGuests}) exceeds confirmed venue capacity (${venueCapacity.toLocaleString()}) by ${diff} guests.`,
    consequence: 'Fire code safety violation or venue surcharge on the event day.',
    actions: [
      { label: 'Simulate Guest Adjustment', action_type: 'open_whatif', payload: { guest_delta: -diff } },
      askMara(
        'Consult Mara on Capacity Solutions',
        `Our venue capacity is ${venueCapacity} but expected guests is ${expectedGuests}. How should we handle this gracefully?`
      )
    ]
  })];
}

export function budgetDeficitRule({ budgetSummary: s }) {
  if (!s.is_over_budget) return [];
  return [makeRisk({
    id: 'risk-budget-deficit',
    type: 'budget_overrun',
    severity: 'critical',
    title: 'Total Budget Overrun',
    evidence: `Total allocated spend (${money(s.total_allocated)}) exceeds total budget (${money(s.total_budget)}) by ${money(s.deficit_amount)}.`,
    consequence: 'Financial shortfall before final vendor retainers are disbursed.',
    actions: [
      askMara('Smart Ways to Save', 'Show me smart ways to eliminate our budget deficit.'),
      { label: 'Open What-If Sandbox', action_type: 'open_whatif' }
    ]
  })];
}

function categoryOverrunRisk(catName, catData) {
  const variance = catData.variance;
  return makeRisk({
    id: `risk-category-overrun-${catName}`,
    type: 'category_overrun',
    severity: 'warning',
    title: `Category Spend Overrun: ${catName}`,
    evidence: `Category '${catName}' allocated spend (${money(catData.allocated)}) exceeds planned budget (${money(catData.planned)}) by ${money(variance)}.`,
    consequence: 'Diverts funds away from remaining uncommitted items.',
    actions: [askMara(
      'Rebalance with Mara',
      `Our ${catName} budget is over by ${money(variance)}. Suggest reallocations from other categories.`
    )]
  });
}

export function categoryOverrunRule({ budgetSummary }) {
  return Object.entries(budgetSummary.categories)
    .filter(([, data]) => data.is_overrun && data.planned > 0)
    .map(([name, data]) => categoryOverrunRisk(name, data));
}

export function overdueMilestonesRule({ timelineProgress }) {
  const overdue = timelineProgress.overdue_tasks || [];
  if (overdue.length === 0) return [];

  const titles = overdue.map(t => `'${t.title}'`).join(', ');
  return [makeRisk({
    id: 'risk-overdue-milestones',
    type: 'milestone_overdue',
    severity: 'warning',
    title: `${overdue.length} Milestone(s) Overdue`,
    evidence: `Uncompleted milestone(s) past scheduled due date: ${titles}.`,
    consequence: 'May compress downstream tasks and vendor booking lead times.',
    actions: [
      { label: 'View Timeline', action_type: 'open_timeline' },
      askMara('Reschedule Assistance', 'What tasks should I prioritize to get back on schedule?')
    ]
  })];
}

function vendorFeeRisk(vendor) {
  if (!vendor || typeof vendor !== 'object' || vendor.status !== 'shortlist') return null;
  const { isComplete, missing } = auditQuoteCompleteness(vendor);
  if (isComplete) return null;

  const vId = vendor.id || 'vendor';
  return makeRisk({
    id: `risk-vendor-missing-${vId}`,
    type: 'missing_quote_details',
    severity: 'notice',
    title: `Undisclosed Terms: ${vendor.name}`,
    evidence: `Quote received for ${vendor.name} does not disclose: ${missing.join('; ')}.`,
    consequence: 'Risk of surprise surcharges during final invoicing.',
    actions: [{
      label: 'Review Quote & Draft Questions',
      action_type: 'open_quotes',
      payload: { vendor_id: vId }
    }]
  });
}

export function vendorFeesRule({ event }) {
  const vendors = Array.isArray(event.vendors) ? event.vendors : [];
  return vendors.map(vendorFeeRisk).filter(Boolean);
}

export const RISK_RULES = [
  capacityRule,
  budgetDeficitRule,
  categoryOverrunRule,
  overdueMilestonesRule,
  vendorFeesRule
];
