/**
 * @file templates.js
 * @description Master template registry aggregating celebration archetypes.
 */

import { weddingTemplate } from './templates/wedding.js';
import { birthdayTemplate } from './templates/birthday.js';
import { communityTemplate } from './templates/community.js';

export const INITIAL_TEMPLATES = {
  [weddingTemplate.id]: weddingTemplate,
  [birthdayTemplate.id]: birthdayTemplate,
  [communityTemplate.id]: communityTemplate
};
