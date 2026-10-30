/**
 * @file mara-client.js
 * @description API client for Mara AI copilot service with robust deterministic fallback.
 */

import { authorizedFetch } from '../api.js';
import { getLocalDeterministicMaraResponse } from './mara-fallbacks.js';

const JSON_POST = { method: 'POST' };

async function postJson(path, body) {
  return authorizedFetch(path, { ...JSON_POST, body: JSON.stringify(body) });
}

async function parseQuoteSeedRemote(prompt) {
  const res = await postJson('/vendors/parse-seed', { text: prompt });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    operation: 'parse_quote_seed',
    summary: 'Successfully extracted vendor quote parameters.',
    extracted_quote: data.extracted_quote || data
  };
}

async function askMaraRemote(operation, prompt, context) {
  const res = await postJson('/mara', {
    operation: operation || 'general_advice',
    prompt: prompt || '',
    context: context || {}
  });
  return res.ok ? res.json() : null;
}

/**
 * Send request to Mara AI Copilot.
 * Gracefully falls back to deterministic local domain logic if backend is unavailable
 * (network error, timeout, auth failure or non-2xx response).
 */
export async function askMara(operation, prompt = '', context = {}) {
  try {
    const remote = operation === 'parse_quote_seed'
      ? await parseQuoteSeedRemote(prompt)
      : await askMaraRemote(operation, prompt, context);
    if (remote) return remote;
  } catch (err) {
    console.warn('API call to Mara backend failed, using deterministic local domain engine:', err);
  }

  return getLocalDeterministicMaraResponse(operation, prompt, context);
}
