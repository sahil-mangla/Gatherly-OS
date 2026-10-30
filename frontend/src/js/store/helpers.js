/**
 * @file helpers.js
 * @description Small collision-safe id and defaulting helpers shared by store actions.
 */

import { MS_PER_DAY } from '../domain/constants.js';

let idCounter = 0;

/** Collision-safe id: crypto.randomUUID() when available, else timestamp + monotonic counter. */
export function makeId(prefix) {
  const uuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : null;
  if (uuid) return `${prefix}-${uuid.slice(0, 8)}${Date.now().toString(36)}`;
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const toAmount = (value) => Number(value || 0);
export const orElse = (value, fallback) => value || fallback;
export const asArray = (value) => (Array.isArray(value) ? value : []);

/** Appends to `event[key]`, creating the list when missing. */
export function pushTo(event, key, item) {
  event[key] = event[key] || [];
  event[key].push(item);
  return item;
}

export function isoDateFromNow(days, now = Date.now()) {
  return new Date(now + days * MS_PER_DAY).toISOString().split('T')[0];
}
