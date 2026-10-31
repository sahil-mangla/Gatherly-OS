/**
 * @file mara-fallbacks.js
 * @description Deterministic offline Mara responses, selected by a dispatch table (no backend needed).
 * Every answer is computed from the event context (budget, risks, tasks); nothing is hard-coded to a seeded event.
 */

import { extractQuoteFromRawText } from '../domain/vendors.js';
import { formatDollars as money } from '../format.js';
import { dateText } from '../views/helpers.js';
import { costSavingResponse } from './mara-budget.js';

const plain = (operation, text) => ({ operation, summary: text, response: text });

function prioritizeTasksResponse({ tasks }) {
  if (tasks.length === 0) {
    return plain(
      'prioritize_tasks',
      'You have no open milestones right now. Add one on the Timeline when something new comes up.'
    );
  }
  const lines = tasks.slice(0, 3).map((t, i) => `${i + 1}. ${t.title} (due ${dateText(t.due_date)}${t.priority ? `, ${t.priority} priority` : ''})`);
  return plain('prioritize_tasks', `Your next open milestones by due date: ${lines.join('; ')}.`);
}

function riskExplanationResponse({ risks }) {
  const summary = `You currently have ${risks.length} active item${risks.length === 1 ? '' : 's'} on the Event Risk Radar.`;
  const top = risks.find(r => r && typeof r === 'object' && r.title);
  if (!top) return { operation: 'risk_explanation', summary };
  return {
    operation: 'risk_explanation',
    summary: `${summary} The most urgent is “${top.title}”.`,
    proposals: [{
      id: 'prop-mitigate-risk',
      action_type: 'review_risks',
      title: `Resolve: ${top.title}`,
      description: top.evidence || top.title,
      consequence: top.consequence || 'Resolving it keeps the plan on track.'
    }]
  };
}

function generalAdviceResponse({ budget, risks, event }) {
  const name = (event && event.name) || 'your event';
  const committed = budget ? `${money(budget.total_allocated)} of ${money(budget.total_budget)} is committed` : 'no budget figures are available yet';
  const risk = risks.length > 0 ? `${risks.length} active risk${risks.length === 1 ? '' : 's'} on the Risk Radar` : 'no active risks';
  return plain('general_advice', `For ${name}: ${committed}, with ${risk}. Ask me about saving money or what to do this week for specifics.`);
}

function parseQuoteSeedResponse({ prompt }) {
  const extracted = extractQuoteFromRawText(prompt);
  return {
    operation: 'parse_quote_seed',
    summary: `Extracted quote for ${extracted.vendor_name} (${money(extracted.quoted_base_amount)}).`,
    extracted_quote: extracted
  };
}

/** Ordered: an operation name matches exactly, or any keyword appears in the prompt. First hit wins. */
export const LOCAL_RESPONDERS = [
  { operation: 'cost_saving_proposals', keywords: ['save', 'budget'], build: costSavingResponse },
  { operation: 'prioritize_tasks', keywords: ['week', 'task'], build: prioritizeTasksResponse },
  { operation: 'risk_explanation', keywords: ['risk'], build: riskExplanationResponse }
];

const asList = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

/** Normalises whatever context the caller passed (it may be absent or malformed). */
function requestFrom(prompt, context) {
  const ctx = asObject(context) || {};
  return {
    prompt: String(prompt || ''),
    risks: asList(ctx.risks),
    tasks: asList(ctx.tasks),
    budget: asObject(ctx.budget),
    event: asObject(ctx.event)
  };
}

/** Answers a Mara operation in the browser from the event's own numbers, used when the API is unreachable. */
export function getLocalDeterministicMaraResponse(operation, prompt, context = {}) {
  const op = operation || 'general_advice';
  const request = requestFrom(prompt, context);
  if (op === 'parse_quote_seed') return parseQuoteSeedResponse(request);

  const lowered = request.prompt.toLowerCase();
  const responder = LOCAL_RESPONDERS.find(
    r => r.operation === op || r.keywords.some(k => lowered.includes(k))
  );
  return (responder ? responder.build : generalAdviceResponse)(request);
}
