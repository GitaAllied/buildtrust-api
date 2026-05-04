import pool from '../config/database.js';

// Auto-cleanup old notifications (older than 30 days)
const cleanupOldNotifications = async () => {
  try {
    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) 
       AND is_read = TRUE`,
      []
    );
    if (result && result[0] && result[0].affectedRows > 0) {
      console.log(`🧹 Cleaned up ${result[0].affectedRows} old notifications (older than 30 days)`);
    }
  } catch (error) {
    console.error('Error cleaning up old notifications:', error);
  }
};

export const getUserNotifications = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    // Ensure user can only see their own notifications
    if (!req.user || (req.user.userId !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Run cleanup of old notifications (async, non-blocking)
    cleanupOldNotifications().catch(err => console.error('Cleanup error:', err));

    // Fetch all notifications from the notifications table (within 30 days)
    try {
      const [notifications] = await pool.query(`
        SELECT 
          n.id as notification_id,
          n.id,
          n.user_id,
          n.type,
          n.title,
          n.message,
          n.data,
          n.is_read,
          n.created_at,
          IF(n.is_read = 0, TRUE, FALSE) as unread
        FROM notifications n
        WHERE n.user_id = ? 
        AND n.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY n.is_read ASC, n.created_at DESC
        LIMIT 50
      `, [userId]);

      // Format notifications
      const formattedNotifications = notifications.map(notif => {
        let parsedData = {};
        try {
          if (notif.data) {
            parsedData = JSON.parse(notif.data);
          }
        } catch (e) {
          console.warn('Failed to parse notification data:', notif.data);
        }

        return {
          id: notif.id,
          notification_id: notif.notification_id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          data: parsedData,
          is_read: notif.is_read,
          unread: notif.unread,
          time: getTimeAgo(notif.created_at),
          created_at: notif.created_at
        };
      });

      res.json({ 
        notifications: formattedNotifications,
        total: formattedNotifications.length 
      });
    } catch (e) {
      console.error('Error fetching notifications from database:', e.message);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const getRecentMessages = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    // Ensure user can only see their own messages
    if (!req.user || (req.user.userId !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Fetch top 3 most recent messages within 48 hours
    // Messages sent TO the user from developers in shared conversations
    const [messages] = await pool.query(`
      SELECT 
        m.id,
        m.sender_id,
        u.name as developer,
        m.content as lastMessage,
        m.created_at as time,
        IF(m.is_read = 0, true, false) as unread
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN users u ON u.id = m.sender_id
      WHERE (c.participant1_id = ? OR c.participant2_id = ?)
      AND m.sender_id != ?
      AND u.role = 'developer'
      AND m.created_at > DATE_SUB(NOW(), INTERVAL 48 HOUR)
      ORDER BY m.created_at DESC
      LIMIT 3
    `, [userId, userId, userId]);

    if (!Array.isArray(messages)) {
      return res.json({ messages: [] });
    }

    // Format messages with time ago
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      developer: msg.developer || 'Developer',
      lastMessage: msg.lastMessage || 'No message content',
      time: getTimeAgo(msg.time),
      unread: msg.unread,
    }));

    res.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Get recent messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

export const requestInspectionNotification = async (req, res) => {
  try {
    const { projectId } = req.body;
    const userId = req.user.userId;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const [projects] = await pool.query(
      `SELECT id, title, client_id, developer_id FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );

    if (!Array.isArray(projects) || projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projects[0];
    if (req.user.role === 'client') {
      if (project.client_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized to request inspection for this project' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only clients and admins can request inspections' });
    }

    if (!project.developer_id) {
      return res.status(400).json({ error: 'Project has no assigned developer yet' });
    }

    await pool.query(
      'UPDATE projects SET inspection_requested = TRUE WHERE id = ?',
      [projectId]
    );

    await createNotification(
      project.developer_id,
      'inspection_request',
      'Inspection Requested',
      `A client has requested an inspection for project "${project.title}".`,
      { projectId }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error requesting inspection notification:', error);
    res.status(500).json({ error: 'Failed to request inspection notification' });
  }
};

// Mark a notification as read
export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.userId;

    // Verify that the notification belongs to the user
    const [notification] = await pool.query(
      'SELECT id, user_id FROM notifications WHERE id = ?',
      [notificationId]
    );

    if (notification.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Mark as read
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ?',
      [notificationId]
    );

    console.log(`✅ Notification ${notificationId} marked as read`);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

// Delete a notification
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.userId;

    // Verify that the notification belongs to the user
    const [notification] = await pool.query(
      'SELECT id, user_id FROM notifications WHERE id = ?',
      [notificationId]
    );

    if (notification.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete notification
    await pool.query(
      'DELETE FROM notifications WHERE id = ?',
      [notificationId]
    );

    console.log(`🗑️ Notification ${notificationId} deleted`);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

// Export cleanup function for external use (scheduled tasks, etc.)
export const cleanupExpiredNotifications = async (req, res) => {
  try {
    await cleanupOldNotifications();
    res.json({ message: 'Notification cleanup completed' });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup notifications' });
  }
};

// Helper function: Create a notification
export const createNotification = async (userId, type, title, message, data = null) => {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at) 
       VALUES (?, ?, ?, ?, ?, FALSE, NOW())`,
      [userId, type, title, message, data ? JSON.stringify(data) : null]
    );
    return result[0];
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Helper function: Delete old notifications manually
export const deleteOldNotifications = async () => {
  try {
    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      []
    );
    console.log(`🧹 Deleted ${result[0].affectedRows} notifications older than 30 days`);
    return result[0];
  } catch (error) {
    console.error('Error deleting old notifications:', error);
    throw error;
  }
};

// Helper function to convert timestamp to "X hours ago" format
function getTimeAgo(timestamp) {
  if (!timestamp) return 'just now';
  
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
