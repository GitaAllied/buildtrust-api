import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getTickets,
  getTicket,
  createTicket,
  updateTicketStatus,
  updateTicketPriority,
  updateTicketCategory,
  deleteTicket
} from '../controllers/supportTicketsController.js';
import {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory
} from '../controllers/supportCategoriesController.js';
import {
  getTicketMessages,
  sendMessage,
  deleteMessage
} from '../controllers/supportMessagesController.js';
import {
  getSettings,
  updateGeneralSettings,
  updateTicketSettings,
  updateSLASettings,
  updateNotificationSettings,
  updateSecuritySettings,
  updateAdvancedSettings
} from '../controllers/supportSettingsController.js';

const router = express.Router();

// Ticket routes
router.get('/tickets', authenticateToken, getTickets);
router.get('/tickets/:id', authenticateToken, getTicket);
router.post('/tickets', authenticateToken, createTicket);
router.patch('/tickets/:id/status', authenticateToken, updateTicketStatus);
router.patch('/tickets/:id/priority', authenticateToken, updateTicketPriority);
router.patch('/tickets/:id/category', authenticateToken, updateTicketCategory);
router.delete('/tickets/:id', authenticateToken, deleteTicket);

// Category routes
router.get('/categories', authenticateToken, getCategories);
router.get('/categories/:id', authenticateToken, getCategory);
router.post('/categories', authenticateToken, createCategory);
router.patch('/categories/:id', authenticateToken, updateCategory);
router.patch('/categories/:id/toggle', authenticateToken, toggleCategoryStatus);
router.delete('/categories/:id', authenticateToken, deleteCategory);

// Message routes
router.get('/tickets/:ticketId/messages', authenticateToken, getTicketMessages);
router.post('/tickets/:ticketId/messages', authenticateToken, sendMessage);
router.delete('/messages/:messageId', authenticateToken, deleteMessage);

// Settings routes
router.get('/settings', authenticateToken, getSettings);
router.patch('/settings/general', authenticateToken, updateGeneralSettings);
router.patch('/settings/tickets', authenticateToken, updateTicketSettings);
router.patch('/settings/sla', authenticateToken, updateSLASettings);
router.patch('/settings/notifications', authenticateToken, updateNotificationSettings);
router.patch('/settings/security', authenticateToken, updateSecuritySettings);
router.patch('/settings/advanced', authenticateToken, updateAdvancedSettings);

export default router;
