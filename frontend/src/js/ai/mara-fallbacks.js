/**
 * @file mara-fallbacks.js
 * @description Deterministic offline Mara responses, selected by a dispatch table (no backend needed).
 */

import { extractQuoteFromRawText } from '../domain/vendors.js';

const costSavingResponse = () => ({
  operation: 'cost_saving_proposals',
  summary: "I've analyzed your financial structure and found 3 high-impact adjustments:",
  proposals: [
    {
      id: 'prop-save-cater',
      action_type: 'adjust_expense',
      category: 'catering',
      title: 'Shift from Plated Dinner to Family-Style Service',
      description: 'Reduces staffing labor requirements by 3 waitstaff while keeping the meal vibrant and generous.',
      delta_amount: -900,
      consequence: 'Saves ~$900 without sacrificing food quality or menu courses.'
    },
    {
      id: 'prop-save-decor',
      action_type: 'adjust_expense',
      category: 'design',
      title: 'Repurpose Ceremony Florals to Reception Tables',
      description: 'Coordinate with floral team to move aisle ground arrangements to the sweetheart table and bar.',
      delta_amount: -450,
      consequence: 'Frees $450 in design budget and eliminates floral waste.'
    },
    {
      id: 'prop-save-buffer',
      action_type: 'rebalance_budget',
      category: 'contingency',
      title: 'Reserve $1,200 Contingency Guard',
      description: 'Lock in unallocated funds to prevent scope creep during final 30 days before event.',
      delta_amount: 0,
      consequence: 'Protects against sudden overtime or corkage additions.'
    }
  ]
});

const prioritizeTasksResponse = () => ({
  operation: 'prioritize_tasks',
  summary: 'Here is your critical path roadmap for this week:',
  proposals: [
    {
      id: 'prop-task-caterer',
      action_type: 'create_task',
      title: 'Confirm Final Headcount with Caterer',
      description: 'Submit dietary requirements and table floorplan at least 14 days before celebration.',
      consequence: 'Locks per-head rates and prevents last-minute rush surcharges.'
    },
    {
      id: 'prop-task-timeline',
      action_type: 'create_task',
      title: 'Distribute Master Day-Of Run Sheet to Vendors',
      description: 'Align photographer arrival, florist load-in, and DJ soundcheck windows.',
      consequence: 'Prevents load-in congestion at venue loading dock.'
    }
  ]
});

const riskExplanationResponse = ({ risks }) => ({
  operation: 'risk_explanation',
  summary: `You currently have ${risks.length} active item${risks.length === 1 ? '' : 's'} on the Event Risk Radar.`,
  proposals: [
    {
      id: 'prop-mitigate-risks',
      action_type: 'review_risks',
      title: 'Review Undisclosed Quote Fees',
      description: 'Photographer and rental quotes do not disclose overtime rates or breakdown terms.',
      consequence: 'Sending clarification questions now prevents unexpected line items on the final invoice.'
    }
  ]
});

const generalAdviceResponse = () => ({
  operation: 'general_advice',
  summary: "I've analyzed your event setup. Your schedule is on track, and your priority is locking down vendor contracts and ensuring all fees are transparent before deposits are released.",
  proposals: [
    {
      id: 'prop-audit-roster',
      action_type: 'audit_vendors',
      title: 'Run Quote Completeness Audit',
      description: 'Check Sol Studio and Lumina Collective quotes side-by-side to review overtime terms.',
      consequence: 'Ensures full transparency before contractual commitment.'
    }
  ]
});

function parseQuoteSeedResponse({ prompt }) {
  const extracted = extractQuoteFromRawText(prompt);
  return {
    operation: 'parse_quote_seed',
    summary: `Extracted quote for ${extracted.vendor_name} ($${extracted.quoted_base_amount.toLocaleString()}).`,
    extracted_quote: extracted
  };
}

/** Ordered: an operation name matches exactly, or any keyword appears in the prompt. First hit wins. */
export const LOCAL_RESPONDERS = [
  { operation: 'cost_saving_proposals', keywords: ['save', 'budget'], build: costSavingResponse },
  { operation: 'prioritize_tasks', keywords: ['week', 'task'], build: prioritizeTasksResponse },
  { operation: 'risk_explanation', keywords: ['risk'], build: riskExplanationResponse }
];

export function getLocalDeterministicMaraResponse(operation, prompt, context = {}) {
  const op = operation || 'general_advice';
  const text = String(prompt || '');
  const request = { prompt: text, risks: (context && context.risks) || [] };
  if (op === 'parse_quote_seed') return parseQuoteSeedResponse(request);

  const lowered = text.toLowerCase();
  const responder = LOCAL_RESPONDERS.find(
    r => r.operation === op || r.keywords.some(k => lowered.includes(k))
  );
  return (responder ? responder.build : generalAdviceResponse)(request);
}
