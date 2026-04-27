import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getUserNotifications, getRecentMessages, markNotificationAsRead, deleteNotification, cleanupExpiredNotifications } from '../controllers/notificationsController.js';

const router = express.Router();

// More specific routes first (notification-specific operations)
// PUT /api/notifications/:notificationId/read - mark notification as read
router.put('/:notificationId/read', authenticateToken, markNotificationAsRead);

// DELETE /api/notifications/:notificationId - delete a notification
router.delete('/:notificationId', authenticateToken, deleteNotification);

// POST /api/notifications/cleanup - cleanup old notifications (older than 30 days)
router.post('/cleanup', cleanupExpiredNotifications);

// Less specific routes (user-specific operations)
// GET /api/notifications/:userId/notifications - fetch user's notifications based on DB activity
router.get('/:userId/notifications', authenticateToken, getUserNotifications);

// GET /api/notifications/:userId/messages/recent - fetch top 3 recent messages within 48 hours
router.get('/:userId/messages/recent', authenticateToken, getRecentMessages);

export default router;
