/**
 * @file birthday.js
 * @description Milestone birthday archetype template (Dad's 60th).
 */

export const birthdayTemplate = {
  id: 'birthday-dads-60th',
  name: "Dad’s 60th",
  subtitle: 'Milestone birthday celebration',
  type: 'birthday',
  date: '2025-11-02',
  schedule_anchor: '2025-08-20', // the story's "today"; all dates below are shifted to the real date at runtime
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
    },
    {
      id: 'task-dad-playlist',
      title: 'Curate 70s vinyl jazz and funk dinner playlist',
      category: 'Music',
      due_date: '2025-10-25',
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
      author: 'You',
      date_added: '2025-08-12',
      bg_color: 'idea-yellow',
      estimated_cost: 45,
      converted_task_id: null,
      requirements: '60 mini wood clips, hemp rope, and photo lab prints'
    }
  ],
  dismissed_risk_ids: []
};
