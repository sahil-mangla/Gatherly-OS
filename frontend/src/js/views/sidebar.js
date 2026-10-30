/**
 * @file sidebar.js
 * @description Sidebar event list. One delegated click handler; markup is only replaced when it changes.
 */

import { store } from '../store.js';
import { showToast } from '../components/toast.js';
import { escapeHtml, capitalize, safeToken, dateText, bindOnce } from './helpers.js';

const DOT_COLORS = ['coral', 'mint', 'gold'];
const DEFAULT_DOT = { wedding: 'coral', birthday: 'mint' };

function eventLinkHtml(ev, isSelected) {
  const id = escapeHtml(ev.id);
  const dot = safeToken(ev.color_accent || DEFAULT_DOT[ev.type], DOT_COLORS, 'gold');
  return `
    <button type="button" class="event-link${isSelected ? ' selected' : ''}" data-event-id="${id}" data-focus-key="event:${id}"${isSelected ? ' aria-current="true"' : ''}>
      <span class="event-dot ${dot}" aria-hidden="true"></span>
      <span class="event-meta"><b>${escapeHtml(ev.name)}</b><small>${escapeHtml(dateText(ev.date))} · ${escapeHtml(capitalize(ev.type))}</small></span>
    </button>`;
}

function onListClick(e) {
  const link = e.target.closest('.event-link');
  if (!link || link.dataset.eventId === store.getActiveEvent().id) return;
  store.switchEvent(link.dataset.eventId);
  showToast('Event Switched', `Viewing ${store.getActiveEvent().name}`);
}

export function renderSidebar() {
  const list = document.getElementById('sidebar-event-list');
  const active = store.getActiveEvent();
  if (!list || !active) return;
  bindOnce(list, 'click', onListClick);
  const html = store.getAllEvents().map(ev => eventLinkHtml(ev, ev.id === active.id)).join('');
  if (list.dataset.signature === html) return;
  list.dataset.signature = html;
  list.innerHTML = html;
}
