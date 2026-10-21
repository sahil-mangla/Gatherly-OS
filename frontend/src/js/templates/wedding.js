/**
 * @file wedding.js
 * @description Wedding celebration archetype template (Leila & Noor).
 */

import { weddingVendors, weddingIdeas } from './wedding-details.js';

export const weddingTemplate = {
  id: 'wedding-leila-noor',
  name: 'Leila & Noor',
  subtitle: 'Wedding celebration',
  type: 'wedding',
  date: '2025-09-14',
  currency: '$',
  total_budget: 24000,
  expected_guests: 150,
  venue_capacity: 140, // Intentional slight breach to test Risk Radar
  theme: 'Effortless, intimate, a little bit unexpected',
  color_accent: 'coral',
  expenses: [
    {
      id: 'exp-venue-deposit',
      category: 'venue',
      description: 'Venue rental & ceremony lawn deposit',
      planned_amount: 9600,
      actual_amount: 4800,
      committed_amount: 4800,
      status: 'paid',
      vendor_id: 'ven-garden',
      cost_per_guest: 0
    },
    {
      id: 'exp-catering-main',
      category: 'catering',
      description: 'Plated dinner & cocktail reception',
      planned_amount: 4780,
      actual_amount: 1400,
      committed_amount: 3380,
      status: 'pending',
      vendor_id: 'ven-catering',
      cost_per_guest: 48
    },
    {
      id: 'exp-floral-design',
      category: 'design',
      description: 'Floral design & centerpiece retainer',
      planned_amount: 2240,
      actual_amount: 1120,
      committed_amount: 800,
      status: 'paid',
      vendor_id: 'ven-stem-society',
      cost_per_guest: 6
    },
    {
      id: 'exp-photo-shortlist',
      category: 'photo_music',
      description: 'Documentary photography package',
      planned_amount: 1840,
      actual_amount: 0,
      committed_amount: 2400,
      status: 'pending',
      vendor_id: 'ven-sol-studio',
      cost_per_guest: 0
    },
    {
      id: 'exp-contingency',
      category: 'contingency',
      description: 'Emergency buffer & unexpected fees',
      planned_amount: 5540,
      actual_amount: 0,
      committed_amount: 0,
      status: 'planned',
      cost_per_guest: 0
    }
  ],
  tasks: [
    {
      id: 'task-stationer',
      title: 'Send guest list to stationer',
      category: 'Invitations',
      due_date: '2025-06-02',
      status: 'done',
      priority: 'high',
      depends_on: [],
      is_fixed_deadline: false,
      completed_at: '2025-06-02'
    },
    {
      id: 'task-readings',
      title: 'Choose ceremony readings',
      category: 'Ceremony',
      due_date: '2025-06-05',
      status: 'todo',
      priority: 'medium',
      depends_on: ['task-stationer'],
      is_fixed_deadline: false
    },
    {
      id: 'task-photo-review',
      title: 'Review photographer shortlist',
      category: 'Vendors',
      due_date: '2025-06-08',
      status: 'todo',
      priority: 'high',
      depends_on: [],
      is_fixed_deadline: false
    },
    {
      id: 'task-tasting',
      title: 'Schedule menu tasting',
      category: 'Catering',
      due_date: '2025-06-12',
      status: 'todo',
      priority: 'critical',
      depends_on: ['task-photo-review'],
      is_fixed_deadline: true
    },
    {
      id: 'task-mail-invites',
      title: 'Mail invitations',
      category: 'Invitations',
      due_date: '2025-07-02',
      status: 'todo',
      priority: 'high',
      depends_on: ['task-stationer', 'task-readings'],
      is_fixed_deadline: true
    },
    {
      id: 'task-final-seating',
      title: 'Finalize seating chart & place cards',
      category: 'Decor',
      due_date: '2025-08-20',
      status: 'todo',
      priority: 'medium',
      depends_on: ['task-mail-invites'],
      is_fixed_deadline: false
    }
  ],
  vendors: weddingVendors,
  ideas: weddingIdeas,
  dismissed_risk_ids: []
};
