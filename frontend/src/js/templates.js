/**
 * @file templates.js
 * @description Pre-seeded celebration datasets for Weddings, Birthdays, and Community events.
 * Provides high-fidelity realistic data with intentional constraint scenarios for risk testing.
 */

export const INITIAL_TEMPLATES = {
  'wedding-leila-noor': {
    id: 'wedding-leila-noor',
    name: 'Leila & Noor',
    subtitle: 'Wedding celebration',
    type: 'wedding',
    date: '2025-09-14',
    currency: '$',
    total_budget: 24000,
    expected_guests: 150,
    venue_capacity: 140, // Intentional slight breach (150 > 140) to test Risk Radar
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
        cost_per_guest: 48 // Variable cost per guest for what-if simulation
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
        committed_amount: 2400, // Intentional category overrun ($2,400 committed vs $1,840 planned)
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
        is_fixed_deadline: true // Fixed deadline
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
    vendors: [
      {
        id: 'ven-crumb-bloom',
        name: 'Crumb & Bloom',
        category: 'Cake',
        status: 'booked',
        quoted_amount: 780,
        deposit_paid: 780,
        avatar_emoji: '🍰',
        summary: 'Three-tier lemon olive oil cake with seasonal pressed florals.',
        inclusions: ['Tiered cake for 150 guests', 'On-site floral dressing', 'Delivery & stand rental'],
        exclusions: ['Individual guest favor boxes'],
        notes: 'Deposit paid in full. Tasting confirmed citrus profile.'
      },
      {
        id: 'ven-sol-studio',
        name: 'Sol Studio',
        category: 'Photography',
        status: 'shortlist',
        quoted_amount: 2400,
        deposit_paid: 0,
        avatar_emoji: '📷',
        summary: 'Warm, documentary-style imagery with natural light and 35mm film.',
        inclusions: ['8 hours coverage', 'High-res online gallery', '50 archival prints'],
        exclusions: ['Second photographer (+$500)', 'Travel outside metro (+$250)'],
        notes: 'Quote received. Awaiting contract review before booking deposit.',
        quotes: [
          {
            quote_id: 'q-sol-full',
            tier_name: 'Sol Studio (Documentary Package)',
            price: 2400,
            deposit: 720,
            service_hours: 8,
            second_shooter: false,
            turnaround_weeks: 4,
            missing_fields: ['Overtime fee rate', 'Travel reimbursement limits']
          },
          {
            quote_id: 'q-lumina-alt',
            tier_name: 'Lumina Collective (Alternative Quote)',
            price: 2150,
            deposit: 500,
            service_hours: 7,
            second_shooter: true,
            turnaround_weeks: 6,
            missing_fields: ['Raw video clip policy', 'Cancellation refund clause']
          }
        ]
      },
      {
        id: 'ven-stem-society',
        name: 'Stem Society',
        category: 'Florals',
        status: 'booked',
        quoted_amount: 1840,
        deposit_paid: 1120,
        avatar_emoji: '🌿',
        summary: 'Garden-grown, loose, and a little wild around the edges.',
        inclusions: ['Bridal bouquet', '12 table centerpieces', 'Ceremony ground installation'],
        exclusions: ['Late night teardown (venue requires clean by 11pm)'],
        notes: 'Teardown logistics must be assigned to bridal party or paid extra.'
      }
    ],
    ideas: [
      {
        id: 'idea-disposable-cameras',
        title: 'Disposable cameras at every table',
        description: 'For candid, unscripted moments we would never think to plan.',
        author: 'Maya',
        date_added: 'May 30',
        bg_color: 'idea-yellow',
        estimated_cost: 180,
        converted_task_id: null,
        requirements: 'Order 15 cameras, develop post-wedding voucher'
      },
      {
        id: 'idea-grilled-cheese',
        title: 'Late-night grilled cheese & hot cocoa',
        description: 'Wrapped in greaseproof butcher paper stamped with their initials.',
        author: 'Mara (AI Copilot)',
        date_added: 'May 28',
        bg_color: 'idea-coral',
        estimated_cost: 320,
        converted_task_id: null,
        requirements: 'Coordinate with catering kitchen for 10:30 PM service'
      },
      {
        id: 'idea-chapter-tables',
        title: 'Table numbers as story chapters',
        description: 'Each table highlights a year or memory from Leila & Noor’s journey.',
        author: 'Noor',
        date_added: 'May 24',
        bg_color: 'idea-green',
        estimated_cost: 60,
        converted_task_id: null,
        requirements: 'Print 12 mini photo booklets'
      },
      {
        id: 'idea-library-cards',
        title: 'Library checkout slip song requests',
        description: 'Retro library card catalog cards on the welcome table for DJ requests.',
        author: 'Leila',
        date_added: 'May 18',
        bg_color: 'idea-pink',
        estimated_cost: 35,
        converted_task_id: null,
        requirements: 'Vintage date stamps and card box'
      }
    ],
    dismissed_risk_ids: []
  },

  'birthday-dads-60th': {
    id: 'birthday-dads-60th',
    name: "Dad’s 60th",
    subtitle: 'Milestone birthday celebration',
    type: 'birthday',
    date: '2025-11-02',
    currency: '$',
    total_budget: 6000,
    expected_guests: 50,
    venue_capacity: 60,
    theme: 'Warm vintage jazz, heartfelt stories, and fine wine',
    color_accent: 'mint',
    expenses: [
      {
        id: 'exp-dad-venue',
        category: 'venue',
        description: 'Private garden conservatory dining room',
        planned_amount: 2200,
        actual_amount: 1100,
        committed_amount: 1100,
        status: 'paid',
        cost_per_guest: 0
      },
      {
        id: 'exp-dad-catering',
        category: 'catering',
        description: 'Family-style Mediterranean feast & wine pairing',
        planned_amount: 2300,
        actual_amount: 0,
        committed_amount: 2200,
        status: 'pending',
        cost_per_guest: 44
      },
      {
        id: 'exp-dad-music',
        category: 'photo_music',
        description: 'Acoustic jazz trio (3 hours)',
        planned_amount: 900,
        actual_amount: 450,
        committed_amount: 450,
        status: 'paid',
        cost_per_guest: 0
      },
      {
        id: 'exp-dad-contingency',
        category: 'contingency',
        description: 'Keepsake album and buffer',
        planned_amount: 600,
        actual_amount: 0,
        committed_amount: 0,
        status: 'planned',
        cost_per_guest: 0
      }
    ],
    tasks: [
      {
        id: 'task-dad-reserve',
        title: 'Confirm conservatory reservation & deposit',
        category: 'Venue',
        due_date: '2025-08-15',
        status: 'done',
        priority: 'high',
        depends_on: [],
        is_fixed_deadline: true
      },
      {
        id: 'task-dad-video',
        title: 'Collect childhood video clips from family',
        category: 'Media',
        due_date: '2025-09-20',
        status: 'todo',
        priority: 'high',
        depends_on: [],
        is_fixed_deadline: false
      },
      {
        id: 'task-dad-cake',
        title: 'Order vintage espresso hazelnut cake',
        category: 'Catering',
        due_date: '2025-10-10',
        status: 'todo',
        priority: 'medium',
        depends_on: [],
        is_fixed_deadline: false
      }
    ],
    vendors: [
      {
        id: 'ven-dad-trio',
        name: 'The Velvet Trio',
        category: 'Music',
        status: 'booked',
        quoted_amount: 900,
        deposit_paid: 450,
        avatar_emoji: '🎶',
        summary: 'Upright bass, jazz guitar, and warm saxophone standards.',
        inclusions: ['3 sets of 45 mins', 'PA system', 'Custom father-favorite requests'],
        exclusions: ['Additional hour past 10 PM'],
        notes: 'Deposit paid.'
      }
    ],
    ideas: [
      {
        id: 'idea-dad-timeline',
        title: '1965 to 2025 Life Milestone Wall',
        description: 'Photo clothesline displaying one notable memory per decade of Dad’s life.',
        author: 'Maya',
        date_added: 'June 01',
        bg_color: 'idea-yellow',
        estimated_cost: 45,
        converted_task_id: null,
        requirements: '60 mini wood clips, hemp rope, and photo lab prints'
      }
    ],
    dismissed_risk_ids: []
  },

  'community-block-party': {
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
  }
};
