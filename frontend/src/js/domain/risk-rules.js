/**
 * @file risk-rules.js
 * @description Individual Event Risk Radar rules. Each rule maps a context to zero or more risks.
 */

import { safeNonNegativeNumber } from './budget.js';
import { formatAmount, roundHalfUp, toInt } from './numeric.js';
import { UNLIMITED_VENUE_CAPACITY } from './constants.js';
import { parseDate } from './timeline-dates.js';
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
const money = (n) => `$${formatAmount(n)}`;

export function capacityRule({ event }) {
  const expectedGuests = toInt(event.expected_guests, 0);
  const venueCapacity = safeNonNegativeNumber(event.venue_capacity ?? UNLIMITED_VENUE_CAPACITY);
  if (!(expectedGuests > venueCapacity && venueCapacity > 0)) return [];

  const diff = roundHalfUp(expectedGuests - venueCapacity);
  const limit = roundHalfUp(venueCapacity);
  return [makeRisk({
    id: 'risk-capacity-breach',
    type: 'capacity_breach',
    severity: 'critical',
    title: 'Venue Capacity Exceeded',
    evidence: `Expected guest count (${expectedGuests}) exceeds confirmed venue capacity (${limit}) by ${diff} guests.`,
    consequence: 'Fire code safety violation or venue surcharge on the event day.',
    actions: [
      { label: 'Simulate Guest Adjustment', action_type: 'open_whatif', payload: { guest_delta: -diff } },
      askMara(
        'Consult Mara on Capacity Solutions',
        `Our venue capacity is ${limit} but expected guests is ${expectedGuests}. How should we handle this gracefully?`
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

const MAX_TITLES_SHOWN = 3;
const isIdKey = (id) => typeof id === 'string' || typeof id === 'number';

function dueOf(task) {
  return task && typeof task === 'object' ? parseDate(task.due_date) : null;
}

/** True when `dep` is an open task whose due date is strictly later than `due`. */
function dueAfter(dep, due) {
  const depDue = dep && dep.status !== 'done' ? dueOf(dep) : null;
  return Boolean(depDue) && depDue > due;
}

function collidesWithPrerequisite(task, byId) {
  const due = dueOf(task);
  if (task.status === 'done' || !due || !Array.isArray(task.depends_on)) return false;
  return task.depends_on.some(id => dueAfter(isIdKey(id) ? byId.get(id) : null, due));
}

function collisionEvidence(colliding) {
  const shown = colliding.slice(0, MAX_TITLES_SHOWN).map(t => `'${t.title || t.id || 'Untitled'}'`).join(', ');
  const extra = colliding.length - MAX_TITLES_SHOWN;
  return `Due before a prerequisite that is still open: ${shown}${extra > 0 ? ` and ${extra} more` : ''}.`;
}

export function dependencyCollisionRule({ event }) {
  const tasks = (Array.isArray(event.tasks) ? event.tasks : []).filter(t => t && typeof t === 'object');
  const byId = new Map(tasks.filter(t => isIdKey(t.id)).map(t => [t.id, t]));
  const colliding = tasks.filter(t => collidesWithPrerequisite(t, byId));
  if (colliding.length === 0) return [];

  return [makeRisk({
    id: 'risk-dependency-collision',
    type: 'dependency_collision',
    severity: 'warning',
    title: `${colliding.length} Dependency Collision(s)`,
    evidence: collisionEvidence(colliding),
    consequence: 'Work may be due before its prerequisites finish, forcing last-minute rescheduling.',
    actions: [
      { label: 'View Timeline', action_type: 'open_timeline' },
      askMara(
        'Resolve Dependency Conflicts',
        'Which tasks are scheduled before their prerequisites, and how should I reorder them?'
      )
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
  dependencyCollisionRule,
  vendorFeesRule
];
