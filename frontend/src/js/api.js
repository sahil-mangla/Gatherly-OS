/**
 * @file api.js
 * @description Unified HTTP API client communicating with Gatherly FastAPI backend.
 */

const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const api = {
  getHealth: () => request('/health'),
  postMara: (payload) => request('/mara', { method: 'POST', body: JSON.stringify(payload) }),
  postSimulation: (payload) => request('/simulate', { method: 'POST', body: JSON.stringify(payload) }),
  compareVendors: (quotes) => request('/vendors/compare', { method: 'POST', body: JSON.stringify({ quotes }) }),
  parseQuoteSeed: (text) => request('/vendors/parse-seed', { method: 'POST', body: JSON.stringify({ text }) }),
  evaluateRisks: (payload) => request('/risks', { method: 'POST', body: JSON.stringify(payload) })
};
