/**
 * @file forms.js
 * @description Central export gateway for all Gatherly modal forms.
 */

import { initFormModals, closeFormModal, openFormModal } from './form-dialog.js';
import { openConfirmDialog } from './confirm-dialog.js';
import { openAddExpenseModal } from './expense-modal.js';
import { openAddMilestoneModal } from './milestone-modal.js';
import { openAddVendorModal, openAddIdeaModal } from './vendor-idea-modal.js';
import { openNewEventModal, openEditEventModal } from './event-modal.js';
import { openRescheduleModal as openRescheduleModalImpl } from './reschedule-modal.js';

export {
  initFormModals,
  closeFormModal,
  openFormModal,
  openConfirmDialog,
  openAddExpenseModal,
  openAddMilestoneModal,
  openAddVendorModal,
  openAddIdeaModal,
  openNewEventModal,
  openEditEventModal
};

export function openRescheduleModal(task) {
  openRescheduleModalImpl(task, openFormModal, closeFormModal);
}
