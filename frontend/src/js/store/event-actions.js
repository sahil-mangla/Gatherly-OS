/**
 * @file event-actions.js
 * @description Transactional mutations for creating events and editing their basics.
 */

import { createEventFromTemplate, updateEventBasics } from '../domain/event-factory.js';
import { makeId } from './helpers.js';

/** Builds an event from the matching template and registers it in `events` under a unique id. */
export function createEventAction(events, payload, templates, now = new Date()) {
  const event = createEventFromTemplate(payload, templates, now);
  while (Object.hasOwn(events, event.id)) event.id = makeId('event');
  events[event.id] = event;
  return event;
}

/** Revalidates and applies guests / capacity / budget / date / name to `event`. */
export function updateEventBasicsAction(event, payload, now = new Date()) {
  return updateEventBasics(event, payload, now);
}
