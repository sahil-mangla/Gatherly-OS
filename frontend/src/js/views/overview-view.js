/**
 * @file overview-view.js
 * @description Overview dashboard renderer: hero, Mara's take, key metrics and the next-up list.
 */

import { store } from '../store.js';
import { INITIAL_TEMPLATES } from '../templates.js';
import { formatMoney } from '../domain/budget.js';
import { evaluateEventRisks } from '../domain/risks.js';
import { parseDate } from '../domain/timeline-dates.js';
import { defaultEventDate, describeCountdown } from '../domain/event-dates.js';
import { createViewContext } from './context.js';
import { renderBudgetCard, renderTimelineCard, renderVendorCard } from './overview-cards.js';
import { renderNextUp } from './overview-tasks.js';
import { escapeHtml, setHtml, setText } from './helpers.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const HERO_COPY = {
  birthday: {
    heading: 'Celebrate the years,<br /><em>cherish every story.</em>',
    sub: (name) => `A memorable gathering for ${name} is coming together.`
  },
  community: {
    heading: 'Bring people together,<br /><em>make local magic.</em>',
    sub: (name) => `Neighborhood planning for ${name} in progress.`
  },
  wedding: {
    heading: 'Make room for<br /><em>the good stuff.</em>',
    sub: (name) => `${name}: your wedding weekend is coming together beautifully.`
  }
};

function renderDateCard(eventDate) {
  const weekday = eventDate.toLocaleDateString('en-US', { weekday: 'long' });
  setText('card-day', eventDate.getDate());
  setText('card-month', MONTHS[eventDate.getMonth()]);
  setText('card-year', `${eventDate.getFullYear()} · ${weekday}`);
  document.getElementById('overview-date-card')
    ?.setAttribute('aria-label', `Event date: ${eventDate.toLocaleDateString('en-US', { dateStyle: 'full' })}`);
}

function renderEyebrow(eventDate, today) {
  const day = today.toLocaleDateString('en-US', { weekday: 'long' });
  const short = `${today.getDate()} ${today.toLocaleDateString('en-US', { month: 'short' })}`;
  setHtml('overview-eyebrow', `<span class="live-dot" aria-hidden="true"></span> ${escapeHtml(day)} · ${escapeHtml(short)}${escapeHtml(describeCountdown(eventDate, today))}`);
}

function renderHeroCopy(event) {
  const copy = HERO_COPY[event.type] || HERO_COPY.wedding;
  setHtml('overview-heading', copy.heading);
  setText('overview-sub', copy.sub(event.name));
}

/** True once the user has created an event of their own (the built-in sample events do not count). */
export function hasOwnEvent() {
  return store.getAllEvents().some(ev => !Object.hasOwn(INITIAL_TEMPLATES, ev.id));
}

function renderCta() {
  const cta = document.getElementById('hero-create-event-btn');
  if (cta) cta.hidden = hasOwnEvent();
}

function renderMaraQuote(ctx, risks) {
  const text = risks.critical_count > 0
    ? `“Alert: ${risks.risks[0].evidence} Want me to propose 3 ways to balance this without compromise?”`
    : `“Your event plan has ${formatMoney(ctx.budget.remaining_uncommitted, ctx.cur)} in breathing room. Everything is tracking smoothly.”`;
  setText('mara-overview-quote', text);
}

function renderMood(event) {
  if (event.theme) setText('overview-mood-caption', `“${event.theme}”`);
}

/** Renders the Overview view. */
export function renderOverview(ctx = createViewContext()) {
  const { event } = ctx;
  const today = new Date();
  const eventDate = parseDate(event.date) || defaultEventDate(today);

  renderDateCard(eventDate);
  renderEyebrow(eventDate, today);
  renderHeroCopy(event);
  renderCta();
  renderMaraQuote(ctx, evaluateEventRisks(event));
  renderBudgetCard(ctx);
  renderTimelineCard(event);
  renderVendorCard(event);
  renderNextUp(event);
  renderMood(event);
}
