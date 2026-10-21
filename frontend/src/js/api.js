const API_BASE = '/api';
const AUTH_TOKEN_KEY = 'gatherly_auth_token';

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': `web-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    ...options
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {}
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
  evaluateRisks: (payload) => request('/risks', { method: 'POST', body: JSON.stringify(payload) }),

  // Multi-Tenant Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request('/auth/me'),
  getDemoToken: (role = 'owner') => request(`/auth/demo-token?role=${encodeURIComponent(role)}`),

  // Multi-Tenant Events
  listEvents: () => request('/events'),
  getEvent: (id) => request(`/events/${encodeURIComponent(id)}`),
  createEvent: (payload) => request('/events', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (id, payload) => request(`/events/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEvent: (id) => request(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
};

