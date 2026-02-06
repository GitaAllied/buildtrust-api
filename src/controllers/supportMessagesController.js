import pool from '../config/database.js';

// Get messages for a ticket
export async function getTicketMessages(req, res) {
  try {
    const { ticketId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify ticket exists
    const [tickets] = await pool.query(
      'SELECT id FROM support_tickets WHERE id = ?',
      [ticketId]
    );

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const offset = (page - 1) * limit;

    const [messages] = await pool.query(
      `SELECT sm.*, u.name as sender_name, u.profile_image 
       FROM support_messages sm 
       LEFT JOIN users u ON sm.sender_id = u.id 
       WHERE sm.ticket_id = ? 
       ORDER BY sm.created_at ASC 
       LIMIT ? OFFSET ?`,
      [ticketId, parseInt(limit), offset]
    );

    // Get total count
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM support_messages WHERE ticket_id = ?',
      [ticketId]
    );

    res.json({
      messages: messages || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
}

// Send message to ticket
export async function sendMessage(req, res) {
  try {
    const { ticketId } = req.params;
    const { sender_id, content, is_internal = false, attachments = null } = req.body;

    if (!sender_id || !content) {
      return res.status(400).json({ error: 'Sender ID and content are required' });
    }

    // Verify ticket exists
    const [tickets] = await pool.query(
      'SELECT id FROM support_tickets WHERE id = ?',
      [ticketId]
    );

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Verify sender exists
    const [users] = await pool.query(
      'SELECT id FROM users WHERE id = ?',
      [sender_id]
    );

    if (!users || users.length === 0) {
      return res.status(400).json({ error: 'Invalid sender' });
    }

    // Insert message
    const [result] = await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_id, content, is_internal, attachments) 
       VALUES (?, ?, ?, ?, ?)`,
      [ticketId, sender_id, content, is_internal, attachments ? JSON.stringify(attachments) : null]
    );

    const messageId = result.insertId;

    // Update ticket's updated_at
    await pool.query(
      'UPDATE support_tickets SET updated_at = NOW() WHERE id = ?',
      [ticketId]
    );

    // Get the created message
    const [message] = await pool.query(
      `SELECT sm.*, u.name as sender_name, u.profile_image 
       FROM support_messages sm 
       LEFT JOIN users u ON sm.sender_id = u.id 
       WHERE sm.id = ?`,
      [messageId]
    );

    res.status(201).json({
      message: 'Message sent successfully',
      data: message[0]
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
}

// Delete message
export async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;

    // Verify message exists
    const [messages] = await pool.query(
      'SELECT id FROM support_messages WHERE id = ?',
      [messageId]
    );

    if (!messages || messages.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await pool.query('DELETE FROM support_messages WHERE id = ?', [messageId]);

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message', details: error.message });
  }
}
