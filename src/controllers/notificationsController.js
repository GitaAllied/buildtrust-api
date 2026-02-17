import pool from '../config/database.js';

export const getUserNotifications = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    // Ensure user can only see their own notifications
    if (!req.user || (req.user.userId !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const notifications = [];

    // 1. Fetch recent project updates for client's projects
    try {
      const [projectUpdates] = await pool.query(`
        SELECT 
          p.id, 
          p.title,
          p.updated_at,
          'project_update' as type
        FROM projects p
        WHERE p.client_id = ? 
        AND p.updated_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY p.updated_at DESC
        LIMIT 3
      `, [userId]);

      if (Array.isArray(projectUpdates)) {
        projectUpdates.forEach(update => {
          const timeAgo = getTimeAgo(update.updated_at);
          notifications.push({
            id: `project-${update.id}`,
            title: 'Project Update',
            message: `${update.title} was updated`,
            time: timeAgo,
            unread: true,
            type: 'project_update',
          });
        });
      }
    } catch (e) {
      console.error('Error fetching project updates:', e.message);
    }

    // 2. Fetch recent messages from developers
    try {
      const [messages] = await pool.query(`
        SELECT DISTINCT
          m.sender_id,
          u.name as developer_name,
          m.message,
          m.created_at,
          'new_message' as type
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.recipient_id = ? 
        AND m.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND u.role = 'developer'
        ORDER BY m.created_at DESC
        LIMIT 3
      `, [userId]);

      if (Array.isArray(messages)) {
        messages.forEach(msg => {
          const timeAgo = getTimeAgo(msg.created_at);
          notifications.push({
            id: `message-${msg.sender_id}`,
            title: 'New Message',
            message: `${msg.developer_name} sent you a message`,
            time: timeAgo,
            unread: true,
            type: 'new_message',
          });
        });
      }
    } catch (e) {
      console.error('Error fetching messages:', e.message);
    }

    // 3. Fetch upcoming payment milestones
    try {
      const [milestones] = await pool.query(`
        SELECT 
          m.id,
          m.amount,
          m.status,
          p.title as project_title,
          m.due_date,
          'payment_due' as type
        FROM milestones m
        JOIN projects p ON p.id = m.project_id
        WHERE p.client_id = ? 
        AND m.status IN ('pending', 'due')
        AND m.due_date <= DATE_ADD(NOW(), INTERVAL 7 DAY)
        ORDER BY m.due_date ASC
        LIMIT 3
      `, [userId]);

      if (Array.isArray(milestones)) {
        milestones.forEach(milestone => {
          const timeAgo = getTimeAgo(milestone.due_date);
          notifications.push({
            id: `milestone-${milestone.id}`,
            title: 'Payment Reminder',
            message: `Payment of ₦${milestone.amount} due for ${milestone.project_title}`,
            time: timeAgo,
            unread: true,
            type: 'payment_due',
          });
        });
      }
    } catch (e) {
      console.error('Error fetching milestones:', e.message);
    }

    // 4. Fetch document verification status changes
    try {
      const [docUpdates] = await pool.query(`
        SELECT 
          ud.id,
          ud.type,
          ud.verified,
          ud.decline_reason,
          ud.created_at,
          'document_status' as type
        FROM user_documents ud
        WHERE ud.user_id = ? 
        AND ud.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY ud.created_at DESC
        LIMIT 3
      `, [userId]);

      if (Array.isArray(docUpdates)) {
        docUpdates.forEach(doc => {
          const timeAgo = getTimeAgo(doc.created_at);
          let title = 'Document Status';
          let message = '';
          
          if (doc.verified === 1) {
            message = `Your ${doc.type} document was approved`;
            title = 'Document Approved';
          } else if (doc.verified === 2) {
            message = `Your ${doc.type} document was declined: ${doc.decline_reason}`;
            title = 'Document Declined';
          }
          
          if (message) {
            notifications.push({
              id: `doc-${doc.id}`,
              title,
              message,
              time: timeAgo,
              unread: true,
              type: 'document_status',
            });
          }
        });
      }
    } catch (e) {
      console.error('Error fetching document updates:', e.message);
    }

    // Sort by unread first, then by time
    notifications.sort((a, b) => {
      if (a.unread !== b.unread) return b.unread - a.unread;
      return 0;
    });

    // Return top 10 notifications
    res.json({ 
      notifications: notifications.slice(0, 10),
      total: notifications.length 
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
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
