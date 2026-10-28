/**
 * @file ideas-view.js
 * @description Idea Board renderer displaying creative sparks and task conversion triggers.
 */

import { store } from '../store.js';
import { openAddIdeaModal } from '../components/forms.js';
import { escapeHtml, formatAdded } from './helpers.js';

export function renderIdeas(showToast) {
  const event = store.getActiveEvent();
  const ideas = event.ideas || [];
  const grid = document.getElementById('idea-board-grid');
  if (!grid) return;

  grid.innerHTML = '';

  ideas.forEach(idea => {
    const card = document.createElement('div');
    card.className = `idea-card ${idea.bg_color || 'idea-yellow'}`;

    const pinIcons = ['✦', '✺', '❋', '◌'];
    const pin = pinIcons[Math.floor(Math.random() * pinIcons.length)];
    const isConverted = Boolean(idea.converted_task_id);

    card.innerHTML = `
      <span class="idea-pin">${pin}</span>
      <p>“${escapeHtml(idea.description || idea.title)}”</p>
      <small>Added by ${escapeHtml(idea.author || 'You')} · ${escapeHtml(formatAdded(idea.date_added))}</small>
      <div class="idea-action-row">
        ${idea.estimated_cost ? `<small>Est: $${idea.estimated_cost}</small>` : '<small>Cost: Free</small>'}
        ${isConverted 
          ? '<span class="idea-converted-tag">✓ Converted to Task</span>' 
          : `<button class="convert-task-btn" data-id="${idea.id}">+ Convert to Task</button>`}
      </div>
    `;

    const convBtn = card.querySelector('.convert-task-btn');
    if (convBtn) {
      convBtn.addEventListener('click', () => {
        const newTask = store.convertIdeaToTask(idea.id);
        if (showToast) showToast('Spark Converted', `Added "${newTask.title}" to Timeline.`);
      });
    }

    grid.appendChild(card);
  });

  // "Add new spark" card
  const addCard = document.createElement('div');
  addCard.className = 'idea-card add-idea';
  addCard.style.cursor = 'pointer';
  addCard.innerHTML = `
    <span>+</span>
    <b>Add a new spark</b>
    <small>Drop in a thought, link, or photo</small>
  `;
  addCard.addEventListener('click', openAddIdeaModal);
  grid.appendChild(addCard);
}
