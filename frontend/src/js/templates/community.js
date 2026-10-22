/**
 * @file community.js
 * @description Community block party archetype template (Oakwood Summer Block Party).
 */

export const communityTemplate = {
  id: 'community-block-party',
  name: 'Block party',
  subtitle: 'Neighborhood summer festival',
  type: 'community',
  date: '2026-06-20',
  currency: '$',
  total_budget: 3500,
  expected_guests: 200,
  venue_capacity: 250,
  theme: 'Sunny, inclusive street festival with music and games',
  color_accent: 'gold',
  expenses: [
    {
      id: 'exp-comm-permit',
      category: 'venue',
      description: 'City street closure & sound permit',
      planned_amount: 350,
      actual_amount: 350,
      committed_amount: 0,
      status: 'paid',
      cost_per_guest: 0
    },
    {
      id: 'exp-comm-stage',
      category: 'photo_music',
      description: 'Portable stage, tent & generator rental',
      planned_amount: 1400,
      actual_amount: 0,
      committed_amount: 1200,
      status: 'pending',
      cost_per_guest: 0
    },
    {
      id: 'exp-comm-bbq',
      category: 'catering',
      description: 'Community BBQ supplies & compostable cutlery',
      planned_amount: 1250,
      actual_amount: 0,
      committed_amount: 1000,
      status: 'pending',
      cost_per_guest: 5
    },
    {
      id: 'exp-comm-buffer',
      category: 'contingency',
      description: 'First aid, sanitation & volunteer t-shirts',
      planned_amount: 500,
      actual_amount: 0,
      committed_amount: 0,
      status: 'planned',
      cost_per_guest: 0
    }
  ],
  tasks: [
    {
      id: 'task-comm-permit',
      title: 'File city council street closure permit',
      category: 'Legal',
      due_date: '2026-03-01',
      status: 'done',
      priority: 'critical',
      depends_on: [],
      is_fixed_deadline: true
    },
    {
      id: 'task-comm-volunteers',
      title: 'Recruit 10 neighborhood crossing guards & grill captains',
      category: 'Volunteers',
      due_date: '2026-05-01',
      status: 'todo',
      priority: 'high',
      depends_on: ['task-comm-permit'],
      is_fixed_deadline: false
    },
    {
      id: 'task-comm-stage',
      title: 'Confirm stage, sound PA & shade tent delivery schedule',
      category: 'Logistics',
      due_date: '2026-05-20',
      status: 'todo',
      priority: 'high',
      depends_on: ['task-comm-permit'],
      is_fixed_deadline: false
    },
    {
      id: 'task-comm-flyers',
      title: 'Distribute festival map flyers & neighbor RSVP cards',
      category: 'Outreach',
      due_date: '2026-06-05',
      status: 'todo',
      priority: 'medium',
      depends_on: ['task-comm-volunteers'],
      is_fixed_deadline: false
    }
  ],
  vendors: [
    {
      id: 'ven-comm-stage',
      name: 'Metro Sound & Tent',
      category: 'Rentals',
      status: 'booked',
      quoted_amount: 1200,
      deposit_paid: 300,
      avatar_emoji: '⛺',
      summary: '20x20 shade tent, portable battery generator, PA system with microphones.',
      inclusions: ['Delivery Saturday 8 AM', 'Teardown Sunday 9 AM'],
      exclusions: ['Fuel for auxiliary generator'],
      notes: 'Deposit paid.'
    }
  ],
  ideas: [
    {
      id: 'idea-comm-potluck',
      title: 'Heritage Recipe Exchange Table',
      description: 'Neighbors bring printed family recipes from their cultures to swap.',
      author: 'Neighborhood Committee',
      date_added: 'May 10',
      bg_color: 'idea-green',
      estimated_cost: 20,
      converted_task_id: null,
      requirements: 'Recipe card box and index cards'
    }
  ],
  dismissed_risk_ids: []
};
