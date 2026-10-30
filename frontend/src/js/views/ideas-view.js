/**
 * @file ideas-view.js
 * @description Idea Board renderer displaying creative sparks and task conversion triggers.
 */

import { store } from '../store.js';
import { openAddIdeaModal } from '../components/forms.js';
import { showToast } from '../components/toast.js';
import { createViewContext } from './context.js';
import { escapeHtml, formatAdded, safeToken, bindOnce } from './helpers.js';

const PINS = ['✦', '✺', '❋', '◌'];
const BG_COLORS = ['idea-yellow', 'idea-coral', 'idea-green', 'idea-pink'];

function actionHtml(idea, title) {
  if (idea.converted_task_id) return '<span class="idea-converted-tag"><span aria-hidden="true">✓</span> Converted to Task</span>';
  const id = escapeHtml(idea.id);
  return `<button type="button" class="convert-task-btn" data-id="${id}" data-focus-key="idea:${id}:convert" aria-label="Convert to task: ${title}">+ Convert to Task</button>`;
}

function ideaCardHtml(idea, index) {
  const title = escapeHtml(idea.title || idea.description);
  const bg = safeToken(idea.bg_color, BG_COLORS, 'idea-yellow');
  const cost = idea.estimated_cost ? `Est: $${escapeHtml(Number(idea.estimated_cost).toLocaleString())}` : 'Cost: Free';
  return `
    <article class="idea-card ${bg}" tabindex="-1" data-focus-key="idea:${escapeHtml(idea.id)}">
      <span class="idea-pin" aria-hidden="true">${PINS[index % PINS.length]}</span>
      <h3 class="sr-only">${title}</h3>
      <p>“${escapeHtml(idea.description || idea.title)}”</p>
      <small>Added by ${escapeHtml(idea.author || 'You')} · ${escapeHtml(formatAdded(idea.date_added))}</small>
      <div class="idea-action-row"><small>${cost}</small>${actionHtml(idea, title)}</div>
    </article>`;
}

const ADD_CARD_HTML = `
  <button type="button" class="idea-card add-idea" id="add-idea-card" data-focus-key="idea-add">
    <span aria-hidden="true">+</span>
    <b>Add a new spark</b>
    <small>Drop in a thought, link, or photo</small>
  </button>`;

function onGridClick(e) {
  const convert = e.target.closest('.convert-task-btn');
  if (convert) {
    const task = store.convertIdeaToTask(convert.dataset.id);
    showToast('Spark Converted', `Added "${task.title}" to Timeline.`);
  } else if (e.target.closest('.add-idea')) {
    openAddIdeaModal();
  }
}

export function renderIdeas(ctx = createViewContext()) {
  const grid = document.getElementById('idea-board-grid');
  if (!grid) return;
  bindOnce(grid, 'click', onGridClick);
  grid.innerHTML = (ctx.event.ideas || []).map(ideaCardHtml).join('') + ADD_CARD_HTML;
}
