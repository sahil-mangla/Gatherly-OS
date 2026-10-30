/**
 * @file net-helpers.js
 * @description Shared fetch / localStorage stubs for network-facing tests (not itself a test file).
 */

export const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
export const realFetch = globalThis.fetch;
export const realWarn = console.warn;
export const state = { calls: [], storage: new Map() };

export const installStorage = (seed = {}) => {
  state.storage = new Map(Object.entries(seed));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (state.storage.has(k) ? state.storage.get(k) : null),
      setItem: (k, v) => { state.storage.set(k, String(v)); },
      removeItem: (k) => { state.storage.delete(k); }
    }
  });
};

export const stubFetch = (handler) => {
  state.calls = [];
  globalThis.fetch = async (url, options = {}) => {
    state.calls.push({ url, options });
    return handler(url, options, state.calls.length);
  };
};

export const hangUntilAborted = () => {
  globalThis.fetch = (url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
};

export const flush = () => new Promise(resolve => setImmediate(resolve));
export const authHeader = (call) => call.options.headers.Authorization;
