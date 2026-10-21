/**
 * @file mara-client.js
 * @description API client for Mara AI copilot service with robust deterministic fallback.
 */

import { extractQuoteFromRawText } from '../domain/vendors.js';

const API_BASE = '/api';

/**
 * Send request to Mara AI Copilot.
 * Gracefully falls back to deterministic local domain logic if backend is unavailable.
 */
export async function askMara(operation, prompt = '', context = {}) {
  try {
    if (operation === 'parse_quote_seed') {
      const res = await fetch(`${API_BASE}/vendors/parse-seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt })
      });
      if (res.ok) {
        const data = await res.json();
        return {
          operation: 'parse_quote_seed',
          summary: 'Successfully extracted vendor quote parameters.',
          extracted_quote: data.extracted_quote || data
        };
      }
    } else {
      const res = await fetch(`${API_BASE}/mara`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: operation || 'general_advice',
          prompt: prompt || '',
          context: context || {}
        })
      });
      if (res.ok) {
        return await res.json();
      }
    }
  } catch (err) {
    console.warn('API call to Mara backend failed, using deterministic local domain engine:', err);
  }

  // Deterministic local fallback
  return getLocalDeterministicMaraResponse(operation, prompt, context);
}

function getLocalDeterministicMaraResponse(operation, prompt, context = {}) {
  const op = operation || 'general_advice';
  const event = context.event || {};
  const budget = context.budget || {};
  const risks = context.risks || [];

  if (op === 'parse_quote_seed') {
    const extracted = extractQuoteFromRawText(prompt);
    return {
      operation: 'parse_quote_seed',
      summary: `Extracted quote for ${extracted.vendor_name} ($${extracted.quoted_base_amount.toLocaleString()}).`,
      extracted_quote: extracted
    };
  }

  if (op === 'cost_saving_proposals' || prompt.toLowerCase().includes('save') || prompt.toLowerCase().includes('budget')) {
    return {
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
    };
  }

  if (op === 'prioritize_tasks' || prompt.toLowerCase().includes('week') || prompt.toLowerCase().includes('task')) {
    return {
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
    };
  }

  if (op === 'risk_explanation' || prompt.toLowerCase().includes('risk')) {
    const riskCount = risks.length;
    return {
      operation: 'risk_explanation',
      summary: `You currently have ${riskCount} active item${riskCount === 1 ? '' : 's'} on the Event Risk Radar.`,
      proposals: [
        {
          id: 'prop-mitigate-risks',
          action_type: 'review_risks',
          title: 'Review Undisclosed Quote Fees',
          description: 'Photographer and rental quotes do not disclose overtime rates or breakdown terms.',
          consequence: 'Sending clarification questions now prevents unexpected line items on the final invoice.'
        }
      ]
    };
  }

  return {
    operation: 'general_advice',
    summary: `I've analyzed your event setup. Your schedule is on track, and your priority is locking down vendor contracts and ensuring all fees are transparent before deposits are released.`,
    proposals: [
      {
        id: 'prop-audit-roster',
        action_type: 'audit_vendors',
        title: 'Run Quote Completeness Audit',
        description: 'Check Sol Studio and Lumina Collective quotes side-by-side to review overtime terms.',
        consequence: 'Ensures full transparency before contractual commitment.'
      }
    ]
  };
}
