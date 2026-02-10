import pool from '../config/database.js';

// Get all support tickets with filters - filtered by current user
export async function getTickets(req, res) {
  try {
    const { category, status, priority, search, page = 1, limit = 10 } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let query = 'SELECT st.*, sc.name as category_name, u.name as user_name, u.email FROM support_tickets st LEFT JOIN support_categories sc ON st.category_id = sc.id LEFT JOIN users u ON st.user_id = u.id WHERE st.user_id = ?';
    const params = [userId];

    if (category) {
      query += ' AND sc.id = ?';
      params.push(category);
    }

    if (status) {
      query += ' AND st.status = ?';
      params.push(status);
    }

    if (priority) {
      query += ' AND st.priority = ?';
      params.push(priority);
    }

    if (search) {
      query += ' AND (st.subject LIKE ? OR st.description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY st.created_at DESC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    params.push(parseInt(limit), offset);

    const [tickets] = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM support_tickets st LEFT JOIN support_categories sc ON st.category_id = sc.id WHERE st.user_id = ?';
    const countParams = [userId];

    if (category) {
      countQuery += ' AND sc.id = ?';
      countParams.push(category);
    }

    if (status) {
      countQuery += ' AND st.status = ?';
      countParams.push(status);
    }

    if (priority) {
      countQuery += ' AND st.priority = ?';
      countParams.push(priority);
    }

    if (search) {
      countQuery += ' AND (st.subject LIKE ? OR st.description LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm);
    }

    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    res.json({
      tickets: tickets || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets', details: error.message });
  }
}

// Get single ticket
export async function getTicket(req, res) {
  try {
    const { id } = req.params;

    const [tickets] = await pool.query(
      `SELECT st.*, sc.name as category_name, u.name as user_name, u.email 
       FROM support_tickets st 
       LEFT JOIN support_categories sc ON st.category_id = sc.id 
       LEFT JOIN users u ON st.user_id = u.id 
       WHERE st.id = ?`,
      [id]
    );

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(tickets[0]);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket', details: error.message });
  }
}

// Create new ticket
export async function createTicket(req, res) {
  try {
    const { user_id, subject, description, category_id, priority = 'medium' } = req.body;

    // Validate required fields
    if (!user_id || !subject || !description || !category_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify category exists
    const [categories] = await pool.query(
      'SELECT id FROM support_categories WHERE id = ?',
      [category_id]
    );

    if (!categories || categories.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const [result] = await pool.query(
      `INSERT INTO support_tickets (user_id, subject, description, category_id, priority) 
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, subject, description, category_id, priority]
    );

    const ticketId = result.insertId;

    // Get the created ticket
    const [ticket] = await pool.query(
      `SELECT st.*, sc.name as category_name, u.name as user_name, u.email 
       FROM support_tickets st 
       LEFT JOIN support_categories sc ON st.category_id = sc.id 
       LEFT JOIN users u ON st.user_id = u.id 
       WHERE st.id = ?`,
      [ticketId]
    );

    res.status(201).json({
      message: 'Ticket created successfully',
      ticket: ticket[0]
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket', details: error.message });
  }
}

// Update ticket status
export async function updateTicketStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const resolvedAt = status === 'resolved' ? new Date() : null;

    await pool.query(
      `UPDATE support_tickets SET status = ?, resolved_at = ?, updated_at = NOW() WHERE id = ?`,
      [status, resolvedAt, id]
    );

    const [ticket] = await pool.query(
      `SELECT st.*, sc.name as category_name, u.name as user_name, u.email 
       FROM support_tickets st 
       LEFT JOIN support_categories sc ON st.category_id = sc.id 
       LEFT JOIN users u ON st.user_id = u.id 
       WHERE st.id = ?`,
      [id]
    );

    res.json({
      message: 'Ticket status updated',
      ticket: ticket[0]
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ error: 'Failed to update ticket', details: error.message });
  }
}

// Update ticket priority
export async function updateTicketPriority(req, res) {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!priority) {
      return res.status(400).json({ error: 'Priority is required' });
    }

    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    await pool.query(
      `UPDATE support_tickets SET priority = ?, updated_at = NOW() WHERE id = ?`,
      [priority, id]
    );

    const [ticket] = await pool.query(
      `SELECT st.*, sc.name as category_name, u.name as user_name, u.email 
       FROM support_tickets st 
       LEFT JOIN support_categories sc ON st.category_id = sc.id 
       LEFT JOIN users u ON st.user_id = u.id 
       WHERE st.id = ?`,
      [id]
    );

    res.json({
      message: 'Ticket priority updated',
      ticket: ticket[0]
    });
  } catch (error) {
    console.error('Error updating ticket priority:', error);
    res.status(500).json({ error: 'Failed to update ticket', details: error.message });
  }
}

// Update ticket category
export async function updateTicketCategory(req, res) {
  try {
    const { id } = req.params;
    const { category_id } = req.body;

    if (!category_id) {
      return res.status(400).json({ error: 'Category is required' });
    }

    // Verify category exists
    const [categories] = await pool.query(
      'SELECT id FROM support_categories WHERE id = ?',
      [category_id]
    );

    if (!categories || categories.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    await pool.query(
      `UPDATE support_tickets SET category_id = ?, updated_at = NOW() WHERE id = ?`,
      [category_id, id]
    );

    const [ticket] = await pool.query(
      `SELECT st.*, sc.name as category_name, u.name as user_name, u.email 
       FROM support_tickets st 
       LEFT JOIN support_categories sc ON st.category_id = sc.id 
       LEFT JOIN users u ON st.user_id = u.id 
       WHERE st.id = ?`,
      [id]
    );

    res.json({
      message: 'Ticket category updated',
      ticket: ticket[0]
    });
  } catch (error) {
    console.error('Error updating ticket category:', error);
    res.status(500).json({ error: 'Failed to update ticket', details: error.message });
  }
}

// Delete ticket
export async function deleteTicket(req, res) {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM support_tickets WHERE id = ?', [id]);

    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Failed to delete ticket', details: error.message });
  }
}
