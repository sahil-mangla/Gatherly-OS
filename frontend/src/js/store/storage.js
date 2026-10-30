/**
 * @file storage.js
 * @description Defensive localStorage access: never throws when storage is missing, blocked or corrupt.
 */

export function readStorage(key) {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key, value) {
  if (!globalThis.localStorage) return false;
  try {
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error(`Failed to write "${key}" to localStorage:`, e);
    return false;
  }
}

export function removeStorage(key) {
  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Parses a persisted events map; returns null unless it is a non-empty map of event objects. */
export function parseEventsMap(serialized) {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized);
    const events = isPlainObject(parsed) ? Object.values(parsed) : [];
    return events.length > 0 && events.every(isPlainObject) ? parsed : null;
  } catch (e) {
    console.warn('Could not parse persisted events, using initial templates:', e);
    return null;
  }
}
