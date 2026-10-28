/**
 * @file store.js
 * @description Reactive EventStore providing transactional persistence and subscriber notifications.
 */

import { INITIAL_TEMPLATES } from './templates.js';
import { normalizeAllEventDates } from './domain/event-dates.js';
import {
  addExpenseAction,
  addTaskAction,
  addVendorAction,
  addIdeaAction,
  convertIdeaToTaskAction,
  applyProposalAction
} from './store/actions.js';

const STORAGE_KEY = 'gatherly_events_v4';
const ACTIVE_EVENT_KEY = 'gatherly_active_event_v4';

export class EventStore {
  constructor() {
    this.events = this.load();
    if (normalizeAllEventDates(this.events, new Date(), INITIAL_TEMPLATES)) this.save();
    const savedActiveId = localStorage.getItem(ACTIVE_EVENT_KEY);
    this.activeEventId = (savedActiveId && this.events[savedActiveId])
      ? savedActiveId
      : (Object.keys(this.events)[0] || 'wedding-leila-noor');
    this.subscribers = new Set();
  }

  load() {
    try {
      const serialized = localStorage.getItem(STORAGE_KEY);
      if (serialized) {
        const parsed = JSON.parse(serialized);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read from localStorage, using initial templates:', e);
    }
    return JSON.parse(JSON.stringify(INITIAL_TEMPLATES));
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.error('Failed to save event store state to localStorage:', e);
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  emit(eventType, payload = {}) {
    for (const callback of this.subscribers) {
      try {
        callback({ type: eventType, payload, store: this });
      } catch (err) {
        console.error('Error in store subscriber:', err);
      }
    }
  }

  getActiveEvent() {
    return this.events[this.activeEventId] || Object.values(this.events)[0];
  }

  getAllEvents() {
    return Object.values(this.events);
  }

  switchEvent(eventId) {
    if (this.events[eventId]) {
      this.activeEventId = eventId;
      try {
        localStorage.setItem(ACTIVE_EVENT_KEY, eventId);
      } catch (e) {}
      this.emit('event:switched', { eventId });
    }
  }

  resetToDefaults() {
    this.events = JSON.parse(JSON.stringify(INITIAL_TEMPLATES));
    normalizeAllEventDates(this.events, new Date(), INITIAL_TEMPLATES);
    this.activeEventId = Object.keys(this.events)[0];
    try {
      localStorage.removeItem(ACTIVE_EVENT_KEY);
    } catch (e) {}
    this.save();
    this.emit('store:reset', { events: this.events });
  }

  addExpense(rawExpense) {
    const event = this.getActiveEvent();
    const newExpense = addExpenseAction(event, rawExpense);
    this.save();
    this.emit('expense:added', { expense: newExpense });
  }

  addTask(rawTask) {
    const event = this.getActiveEvent();
    const newTask = addTaskAction(event, rawTask);
    this.save();
    this.emit('task:added', { task: newTask });
  }

  toggleTask(taskId) {
    const event = this.getActiveEvent();
    const task = (event.tasks || []).find(t => t.id === taskId);
    if (!task) return;

    if (task.status === 'done') {
      task.status = 'todo';
      delete task.completed_at;
    } else {
      task.status = 'done';
      task.completed_at = new Date().toISOString().split('T')[0];
    }

    this.save();
    this.emit('task:updated', { task });
  }

  rescheduleTask(taskId, newDate) {
    const event = this.getActiveEvent();
    const task = (event.tasks || []).find(t => t.id === taskId);
    if (!task) throw new Error('Task not found.');
    task.due_date = newDate;
    this.save();
    this.emit('task:rescheduled', { task, newDate });
  }

  addVendor(rawVendor) {
    const event = this.getActiveEvent();
    const newVendor = addVendorAction(event, rawVendor);
    this.save();
    this.emit('vendor:added', { vendor: newVendor });
  }

  addIdea(rawIdea) {
    const event = this.getActiveEvent();
    const newIdea = addIdeaAction(event, rawIdea);
    this.save();
    this.emit('idea:added', { idea: newIdea });
  }

  convertIdeaToTask(ideaId) {
    const event = this.getActiveEvent();
    const result = convertIdeaToTaskAction(event, ideaId);
    this.save();
    this.emit('idea:converted', result);
    return result.task;
  }

  dismissRisk(riskId) {
    const event = this.getActiveEvent();
    event.dismissed_risk_ids = event.dismissed_risk_ids || [];
    if (!event.dismissed_risk_ids.includes(riskId)) {
      event.dismissed_risk_ids.push(riskId);
      this.save();
      this.emit('risk:dismissed', { riskId });
    }
  }

  applyProposal(proposal) {
    const event = this.getActiveEvent();
    const result = applyProposalAction(event, proposal);
    this.save();
    this.emit('proposal:applied', { proposal, result });
    return result;
  }
}

export const store = new EventStore();
