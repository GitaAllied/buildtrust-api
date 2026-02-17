import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getUserNotifications } from '../controllers/notificationsController.js';

const router = express.Router();

// GET /api/users/:userId/notifications - fetch user's notifications based on DB activity
router.get('/:userId/notifications', authenticateToken, getUserNotifications);

export default router;
