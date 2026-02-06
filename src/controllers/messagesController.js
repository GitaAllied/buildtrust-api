import pool from '../config/database.js';

export const getConversations = async (req, res) => {
  const userId = req.user?.userId;
  try {
    // Return conversations where user participates (admin can view all if role=admin)
    let params = [userId, userId];
    const query = `
      SELECT c.id AS conversation_id,
        CASE WHEN c.participant1_id = ? THEN c.participant2_id ELSE c.participant1_id END AS other_id,
        u.name AS other_name, u.email AS other_email, u.role AS other_role, u.profile_image AS other_avatar,
        c.last_message_at
      FROM conversations c
      JOIN users u ON u.id = (CASE WHEN c.participant1_id = ? THEN c.participant2_id ELSE c.participant1_id END)
      WHERE c.participant1_id = ? OR c.participant2_id = ?
      ORDER BY c.last_message_at DESC
    `;

    // If user is admin, allow listing all conversations
    if (req.user && req.user.role === 'admin') {
      const [rows] = await pool.query(`
        SELECT c.id AS conversation_id, c.participant1_id, c.participant2_id, c.last_message_at
        FROM conversations c
        ORDER BY c.last_message_at DESC
      `);
      return res.json(rows);
    }

    const [rows] = await pool.query(query, [...params, ...params]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

// Simple in-memory typing map: conversationId -> { userId, expiresAt }
const typingMap = new Map();

export const setTypingStatus = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId;
  const { typing } = req.body;

  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  try {
    const key = String(conversationId);
    if (typing) {
      // mark typing for 5 seconds
      typingMap.set(key, { userId, expiresAt: Date.now() + 5000 });
    } else {
      typingMap.delete(key);
    }
    return res.json({ success: true, typing: !!typing });
  } catch (err) {
    console.error('Error setting typing status:', err);
    return res.status(500).json({ error: 'Failed to set typing status' });
  }
};

export const getTypingStatus = async (req, res) => {
  const { conversationId } = req.params;
  try {
    const key = String(conversationId);
    const entry = typingMap.get(key);
    if (entry) {
      // expire stale entries
      if (Date.now() > entry.expiresAt) {
        typingMap.delete(key);
        return res.json({ typing: false });
      }
      return res.json({ typing: true, userId: entry.userId });
    }
    return res.json({ typing: false });
  } catch (err) {
    console.error('Error getting typing status:', err);
    return res.status(500).json({ error: 'Failed to get typing status' });
  }
};

export const getMessagesForConversation = async (req, res) => {
  const { conversationId } = req.params;
  try {
    // Mark messages as read for the requesting user (they are the recipient of messages where sender_id != req.user.userId)
    if (req.user && req.user.userId) {
      await pool.query(
        `UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
        [conversationId, req.user.userId]
      );
    }

    const [rows] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type, m.attachments, m.is_read, m.created_at,
              u.name AS sender_name, u.role AS sender_role
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC`,
      [conversationId]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

export const postMessage = async (req, res) => {
  const senderId = req.user?.userId;
  const { recipientId, content, conversationId } = req.body;

  if (!senderId) return res.status(401).json({ error: 'Authentication required' });
  if (!recipientId && !conversationId) return res.status(400).json({ error: 'recipientId or conversationId required' });
  if (!content) return res.status(400).json({ error: 'Message content is required' });

  try {
    let convId = conversationId;

    if (!convId) {
      // Verify recipient exists and is allowed
      const [recipientRows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [recipientId]);
      if (!Array.isArray(recipientRows) || recipientRows.length === 0) {
        return res.status(404).json({ error: 'Recipient not found' });
      }
      const recipient = recipientRows[0];

      // Admins may message only 'client' or 'developer' accounts, not 'sub_admin' or other roles
      if (req.user && req.user.role === 'admin') {
        if (!['client', 'developer'].includes(recipient.role)) {
          return res.status(403).json({ error: 'Admins may only message clients or developers' });
        }
      }

      // find existing conversation
      const [found] = await pool.query(
        `SELECT id FROM conversations WHERE (participant1_id = ? AND participant2_id = ?) OR (participant1_id = ? AND participant2_id = ?) LIMIT 1`,
        [senderId, recipientId, recipientId, senderId]
      );

      if (found.length > 0) {
        convId = found[0].id;
      } else {
        const [ins] = await pool.query(
          `INSERT INTO conversations (participant1_id, participant2_id, last_message_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
          [senderId, recipientId]
        );
        convId = ins.insertId;
      }
    } else {
      // If conversationId is provided, validate that it exists
      const [convExists] = await pool.query(
        `SELECT id FROM conversations WHERE id = ? LIMIT 1`,
        [convId]
      );
      
      if (!Array.isArray(convExists) || convExists.length === 0) {
        // Conversation doesn't exist, check if we have recipientId to create it
        if (recipientId) {
          // Verify recipient exists and is allowed
          const [recipientRows] = await pool.query('SELECT id, role FROM users WHERE id = ?', [recipientId]);
          if (!Array.isArray(recipientRows) || recipientRows.length === 0) {
            return res.status(404).json({ error: 'Recipient not found' });
          }
          const recipient = recipientRows[0];

          // Admins may message only 'client' or 'developer' accounts
          if (req.user && req.user.role === 'admin') {
            if (!['client', 'developer'].includes(recipient.role)) {
              return res.status(403).json({ error: 'Admins may only message clients or developers' });
            }
          }

          // Create the conversation
          const [ins] = await pool.query(
            `INSERT INTO conversations (participant1_id, participant2_id, last_message_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [senderId, recipientId]
          );
          convId = ins.insertId;
        } else {
          return res.status(404).json({ error: 'Conversation not found' });
        }
      }
    }

    const [insertMsg] = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, is_read) VALUES (?, ?, ?, 'text', ?)`,
      [convId, senderId, content, senderId === recipientId ? 1 : 0]
    );

    // update conversation last_message_at
    await pool.query(`UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?`, [convId]);

    const [msgRows] = await pool.query(`SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`, [insertMsg.insertId]);

    res.status(201).json(msgRows[0]);
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
};

export const markConversationRead = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });
  try {
    await pool.query(
      `UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
      [conversationId, userId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Error marking conversation read:', err);
    return res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
};

export default { getConversations, getMessagesForConversation, postMessage, setTypingStatus, getTypingStatus };
