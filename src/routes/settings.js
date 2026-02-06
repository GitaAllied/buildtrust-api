import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getSettings,
  updateGeneralSettings,
  updateSecuritySettings,
  updateEmailSettings,
  updatePaymentSettings,
  updateNotificationSettings,
  updatePassword,
} from '../controllers/settingsController.js';

const router = express.Router();

// Protected endpoints - require authentication and admin role
router.get('/', authenticateToken, getSettings);
router.post('/general', authenticateToken, updateGeneralSettings);
router.post('/security', authenticateToken, updateSecuritySettings);
router.post('/email', authenticateToken, updateEmailSettings);
router.post('/payment', authenticateToken, updatePaymentSettings);
router.post('/notifications', authenticateToken, updateNotificationSettings);
router.post('/password', authenticateToken, updatePassword);

export default router;
