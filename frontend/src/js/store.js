/**
 * @file store.js
 * @description Centralized, reactive state store backed by localStorage.
 * Supports multi-event switching, transactional updates, and pub/sub subscriptions.
 */

import { INITIAL_TEMPLATES } from './templates.js';
import { validateExpenseInput } from './domain/budget.js';
import { validateTask } from './domain/timeline.js';

const STORAGE_EVENTS_KEY = 'gatherly_events_v1';
const STORAGE_ACTIVE_ID_KEY = 'gatherly_active_event_id_v1';

class EventStore {
  constructor() {
    this.events = {};
    this.activeEventId = 'wedding-leila-noor';
    this.listeners = new Set();
    this.init();
  }

  /**
   * Initialize state from localStorage or load seed templates.
   */
  init() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedEvents = window.localStorage.getItem(STORAGE_EVENTS_KEY);
        const storedActiveId = window.localStorage.getItem(STORAGE_ACTIVE_ID_KEY);

        if (storedEvents) {
          this.events = JSON.parse(storedEvents);
        } else {
          this.resetToDefaults();
        }

        if (storedActiveId && this.events[storedActiveId]) {
          this.activeEventId = storedActiveId;
        } else {
          this.activeEventId = Object.keys(this.events)[0] || 'wedding-leila-noor';
        }
      } else {
        this.resetToDefaults();
      }
    } catch (e) {
      console.warn('[Gatherly Store] Failed to load localStorage, initializing defaults:', e);
      this.resetToDefaults();
    }
  }

  /**
   * Reset store to clean pre-seeded templates.
   */
  resetToDefaults() {
    this.events = JSON.parse(JSON.stringify(INITIAL_TEMPLATES));
    this.activeEventId = 'wedding-leila-noor';
    this.save();
    this.emit('store:reset');
  }

  /**
   * Persist state to localStorage.
   */
  save() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(this.events));
        window.localStorage.setItem(STORAGE_ACTIVE_ID_KEY, this.activeEventId);
      }
    } catch (e) {
      console.error('[Gatherly Store] Failed to persist state:', e);
    }
  }

  /**
   * Subscribe to state change events.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} type
   * @param {any} payload
   */
  emit(type, payload = {}) {
    for (const listener of this.listeners) {
      try {
        listener({ type, payload, state: this.getActiveEvent() });
      } catch (err) {
        console.error('[Gatherly Store] Error in listener:', err);
      }
    }
  }

  /**
   * Retrieve active event model.
   * @returns {Object}
   */
  getActiveEvent() {
    return this.events[this.activeEventId] || Object.values(this.events)[0] || null;
  }

  /**
   * Retrieve list of all loaded events.
   * @returns {Array<Object>}
   */
  getAllEvents() {
    return Object.values(this.events);
  }

  /**
   * Switch the active event by ID.
   * @param {string} eventId
   */
  switchEvent(eventId) {
    if (!this.events[eventId]) {
      throw new Error(`Event with id "${eventId}" not found.`);
    }
    this.activeEventId = eventId;
    this.save();
    this.emit('event:switched', { eventId });
  }

  /**
   * Add a new expense record to active event.
   * @param {Object} rawExpense
   */
  addExpense(rawExpense) {
    const event = this.getActiveEvent();
    const validation = validateExpenseInput(rawExpense);
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    const newExpense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      category: rawExpense.category || 'other',
      description: rawExpense.description.trim(),
      planned_amount: Number(rawExpense.planned_amount || 0),
      actual_amount: Number(rawExpense.actual_amount || 0),
      committed_amount: Number(rawExpense.committed_amount || 0),
      status: rawExpense.status || (rawExpense.actual_amount > 0 ? 'paid' : 'pending'),
      cost_per_guest: Number(rawExpense.cost_per_guest || 0)
    };

    event.expenses = event.expenses || [];
    event.expenses.unshift(newExpense);
    this.save();
    this.emit('expense:added', { expense: newExpense });
  }

  /**
   * Add a new task/milestone to active event.
   * @param {Object} rawTask
   */
  addTask(rawTask) {
    const event = this.getActiveEvent();
    const validation = validateTask(rawTask);
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    const newTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title: rawTask.title.trim(),
      category: rawTask.category || 'General',
      due_date: rawTask.due_date,
      status: rawTask.status || 'todo',
      priority: rawTask.priority || 'medium',
      depends_on: Array.isArray(rawTask.depends_on) ? rawTask.depends_on : [],
      is_fixed_deadline: Boolean(rawTask.is_fixed_deadline)
    };

    event.tasks = event.tasks || [];
    event.tasks.push(newTask);
    this.save();
    this.emit('task:added', { task: newTask });
  }

  /**
   * Toggle task completion status.
   * @param {string} taskId
   */
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

  /**
   * Reschedule a task to a new due date.
   * @param {string} taskId
   * @param {string} newDate
   */
  rescheduleTask(taskId, newDate) {
    const event = this.getActiveEvent();
    const task = (event.tasks || []).find(t => t.id === taskId);
    if (!task) throw new Error('Task not found.');
    task.due_date = newDate;
    this.save();
    this.emit('task:rescheduled', { task, newDate });
  }

  /**
   * Add a new idea spark card.
   * @param {Object} rawIdea
   */
  addIdea(rawIdea) {
    const event = this.getActiveEvent();
    if (!rawIdea.title || !rawIdea.description) {
      throw new Error('Idea title and description are required.');
    }

    const colors = ['idea-yellow', 'idea-coral', 'idea-green', 'idea-pink'];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];

    const newIdea = {
      id: `idea-${Date.now()}`,
      title: rawIdea.title.trim(),
      description: rawIdea.description.trim(),
      author: rawIdea.author || 'You',
      date_added: 'Just now',
      bg_color: chosenColor,
      estimated_cost: Number(rawIdea.estimated_cost || 0),
      converted_task_id: null,
      requirements: rawIdea.requirements || ''
    };

    event.ideas = event.ideas || [];
    event.ideas.unshift(newIdea);
    this.save();
    this.emit('idea:added', { idea: newIdea });
  }

  /**
   * Convert an idea into an actionable timeline task.
   * @param {string} ideaId
   */
  convertIdeaToTask(ideaId) {
    const event = this.getActiveEvent();
    const idea = (event.ideas || []).find(i => i.id === ideaId);
    if (!idea) throw new Error('Idea not found.');

    const due = new Date();
    due.setDate(due.getDate() + 14); // default due in 2 weeks
    const dueIso = due.toISOString().split('T')[0];

    const newTask = {
      id: `task-from-idea-${Date.now()}`,
      title: idea.title,
      category: 'Inspiration',
      due_date: dueIso,
      status: 'todo',
      priority: 'medium',
      depends_on: [],
      is_fixed_deadline: false
    };

    idea.converted_task_id = newTask.id;
    event.tasks = event.tasks || [];
    event.tasks.push(newTask);
    this.save();
    this.emit('idea:converted', { idea, task: newTask });
    return newTask;
  }

  /**
   * Add a new vendor / quote to the active event.
   * @param {Object} rawVendor
   */
  addVendor(rawVendor) {
    const event = this.getActiveEvent();
    if (!rawVendor.name) {
      throw new Error('Vendor name is required.');
    }

    const newVendor = {
      id: `ven-${Date.now()}`,
      name: rawVendor.name.trim(),
      category: rawVendor.category || 'General',
      status: rawVendor.status || 'shortlist',
      quoted_amount: Number(rawVendor.quoted_amount || 0),
      deposit_paid: Number(rawVendor.deposit_paid || 0),
      avatar_emoji: rawVendor.avatar_emoji || '🤝',
      summary: rawVendor.summary || '',
      inclusions: Array.isArray(rawVendor.inclusions) ? rawVendor.inclusions : [],
      exclusions: Array.isArray(rawVendor.exclusions) ? rawVendor.exclusions : [],
      notes: rawVendor.notes || ''
    };

    event.vendors = event.vendors || [];
    event.vendors.push(newVendor);
    this.save();
    this.emit('vendor:added', { vendor: newVendor });
  }

  /**
   * Dismiss an active risk warning.
   * @param {string} riskId
   */
  dismissRisk(riskId) {
    const event = this.getActiveEvent();
    event.dismissed_risk_ids = event.dismissed_risk_ids || [];
    if (!event.dismissed_risk_ids.includes(riskId)) {
      event.dismissed_risk_ids.push(riskId);
      this.save();
      this.emit('risk:dismissed', { riskId });
    }
  }

  /**
   * Transactionally apply an AI-recommended proposal.
   * Supports:
   * - action: 'reallocate' (shifts planned budget from one category to another)
   * - action: 'update_expense' (modifies planned/committed amount)
   * - action: 'add_task' (adds a mitigation milestone)
   * @param {Object} proposal
   */
  applyProposal(proposal) {
    const event = this.getActiveEvent();
    if (!proposal || !proposal.action) {
      throw new Error('Invalid proposal payload.');
    }

    if (proposal.action === 'reallocate') {
      const fromCat = proposal.from_category;
      const toCat = proposal.to_category;
      const amount = Number(proposal.amount || 0);

      if (!fromCat || !toCat || amount <= 0) {
        throw new Error('Reallocation requires valid from_category, to_category, and positive amount.');
      }

      // Find an expense in from_category to reduce or adjust planned contingency
      const fromExp = (event.expenses || []).find(e => e.category === fromCat);
      const toExp = (event.expenses || []).find(e => e.category === toCat);

      if (fromExp) {
        fromExp.planned_amount = Math.max(0, fromExp.planned_amount - amount);
      }
      if (toExp) {
        toExp.planned_amount += amount;
      }

      this.save();
      this.emit('proposal:applied', { proposal });
      return { success: true, message: `Reallocated $${amount.toLocaleString()} from ${fromCat} to ${toCat}.` };
    }

    if (proposal.action === 'update_expense') {
      const cat = proposal.category;
      const savings = Number(proposal.savings || 0);
      const targetExp = (event.expenses || []).find(e => e.category === cat);
      if (targetExp && savings > 0) {
        targetExp.planned_amount = Math.max(0, targetExp.planned_amount - savings);
        this.save();
        this.emit('proposal:applied', { proposal });
        return { success: true, message: `Saved $${savings.toLocaleString()} on ${cat}.` };
      }
    }

    if (proposal.action === 'custom') {
      // Add a task to implement the custom suggestion
      this.addTask({
        title: proposal.title || 'Implement Mara recommendation',
        category: 'Action',
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        status: 'todo',
        priority: 'high'
      });
      this.emit('proposal:applied', { proposal });
      return { success: true, message: `Created follow-up task: "${proposal.title}".` };
    }

    throw new Error(`Unsupported proposal action: "${proposal.action}"`);
  }
}

export const store = new EventStore();
