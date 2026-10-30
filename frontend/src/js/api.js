const API_BASE = '/api';
const AUTH_TOKEN_KEY = 'gatherly_auth_token';
const DEMO_ROLE = 'planner';

export const REQUEST_TIMEOUT_MS = 8000;
const DEMO_TOKEN_RETRY_MS = 30000;
const HTTP_UNAUTHORIZED = 401;

/** Paths sent with whatever token exists but never trigger lazy token fetch / 401 retry. */
const UNMANAGED_PATHS = ['/auth/', '/health'];

let demoTokenPromise = null;
let demoTokenFailedAt = 0;

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
  } catch {
    // Storage unavailable (private mode, quota): the app keeps working without a persisted token.
  }
}

/** fetch() with an AbortController deadline; always clears its timer. */
export async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDemoToken() {
  const res = await fetchWithTimeout(`${API_BASE}/auth/demo-token?role=${DEMO_ROLE}`);
  if (!res.ok) throw new Error(`Demo token request failed with status ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('Demo token response had no access_token.');
  setAuthToken(data.access_token);
  return data.access_token;
}

/** Fetches a demo token (one in-flight request shared by all callers; failures back off). */
function acquireDemoToken() {
  if (demoTokenPromise) return demoTokenPromise;
  if (Date.now() - demoTokenFailedAt < DEMO_TOKEN_RETRY_MS) return Promise.resolve('');

  demoTokenPromise = fetchDemoToken()
    .catch(() => {
      demoTokenFailedAt = Date.now();
      return '';
    })
    .finally(() => { demoTokenPromise = null; });
  return demoTokenPromise;
}

/** Stored token, else a lazily fetched demo token. Resolves '' when none can be had (offline). */
export function ensureAuthToken() {
  const stored = getAuthToken();
  return stored ? Promise.resolve(stored) : acquireDemoToken();
}

/** Test hook: forgets the cached demo-token failure and in-flight promise. */
export function resetAuthState() {
  demoTokenPromise = null;
  demoTokenFailedAt = 0;
}

function buildHeaders(options, token) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': `web-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...options.headers
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Sends an authenticated request. A 401 replaces the stale token with a fresh demo token and
 * retries exactly once. /auth/* and /health are sent as-is (a 401 there means bad credentials).
 */
export async function authorizedFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const managed = !UNMANAGED_PATHS.some(p => path.startsWith(p));
  const send = (token) => fetchWithTimeout(url, { ...options, headers: buildHeaders(options, token) });

  const token = managed ? await ensureAuthToken() : getAuthToken();
  const response = await send(token);
  if (!managed || response.status !== HTTP_UNAUTHORIZED) return response;

  const fresh = await acquireDemoToken();
  return fresh ? send(fresh) : response;
}

async function errorDetail(response) {
  try {
    const errorJson = await response.json();
    return errorJson.detail || JSON.stringify(errorJson);
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

async function request(path, options = {}) {
  const response = await authorizedFetch(path, options);
  if (!response.ok) throw new Error(await errorDetail(response));
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
