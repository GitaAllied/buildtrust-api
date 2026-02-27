import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getUserNotifications, getRecentMessages } from '../controllers/notificationsController.js';

const router = express.Router();

// GET /api/users/:userId/notifications - fetch user's notifications based on DB activity
router.get('/:userId/notifications', authenticateToken, getUserNotifications);

// GET /api/users/:userId/messages/recent - fetch top 3 recent messages within 48 hours
router.get('/:userId/messages/recent', authenticateToken, getRecentMessages);

export default router;
