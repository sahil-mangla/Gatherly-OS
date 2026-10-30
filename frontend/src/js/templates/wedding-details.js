/**
 * @file wedding-details.js
 * @description Vendor roster and idea sparks for the Leila & Noor wedding template.
 */

export const weddingVendors = [
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
];

export const weddingIdeas = [
  {
    id: 'idea-disposable-cameras',
    title: 'Disposable cameras at every table',
    description: 'For candid, unscripted moments we would never think to plan.',
    author: 'Leila',
    date_added: '2025-05-30',
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
    date_added: '2025-05-28',
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
    date_added: '2025-05-24',
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
    date_added: '2025-05-18',
    bg_color: 'idea-pink',
    estimated_cost: 35,
    converted_task_id: null,
    requirements: 'Vintage date stamps and card box'
  }
];
