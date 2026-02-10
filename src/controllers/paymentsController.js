import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const formatDate = (d) => {
  if (!d) return new Date().toISOString().split('T')[0];
  if (typeof d === 'string') return d.split('T')[0];
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d).split('T')[0];
};
/**
 * Get all payment information for the authenticated user's projects
 * Returns projects with payment progress and transaction history
 */
export const getClientPaymentsSummary = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;

    // Get all projects for this client
    const [projects] = await pool.query(
      `SELECT id, client_id, developer_id, title, type, location, budget, description, status, created_at, updated_at 
       FROM projects WHERE client_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    if (!Array.isArray(projects) || projects.length === 0) {
      return res.json({ projects: [], transactions: [], summary: { totalInvested: 0, pendingPayments: 0, projectsCount: 0 } });
    }

    // Enrich projects with payment data
    const enrichedProjects = await Promise.all(
      projects.map(async (project) => {
        // Get contract and milestones
        const [contracts] = await pool.query(
          `SELECT c.id, c.milestones, u.name as developer_name 
           FROM contracts c 
           LEFT JOIN users u ON c.developer_id = u.id 
           WHERE c.project_id = ? LIMIT 1`,
          [project.id]
        );

        const contract = contracts?.[0] || {};
        let milestones = [];
        let totalAmount = parseFloat(project.budget) || 0;
        let paidAmount = 0;

        // Parse milestones from contract
        if (contract.milestones) {
          try {
            milestones = typeof contract.milestones === 'string' 
              ? JSON.parse(contract.milestones) 
              : contract.milestones;
            
            if (!Array.isArray(milestones)) milestones = [];
          } catch (e) {
            console.error('Error parsing milestones:', e);
            milestones = [];
          }
        }

        // If no milestones, create default milestone structure
        if (milestones.length === 0) {
          milestones = [
            { name: 'Initial Payment', amount: totalAmount * 0.3, status: 'pending', date: formatDate(project.created_at) },
            { name: 'Mid-way Payment', amount: totalAmount * 0.4, status: 'pending', date: new Date().toISOString().split('T')[0] },
            { name: 'Final Payment', amount: totalAmount * 0.3, status: 'pending', date: new Date().toISOString().split('T')[0] },
          ];
        }

        // Get payments for this contract
        const [payments] = await pool.query(
          `SELECT id, amount, payment_type, status, payment_method, paid_at, created_at 
           FROM payments WHERE contract_id = ? ORDER BY created_at DESC`,
          [contract.id]
        );

        // Calculate paid amount from completed payments
        if (Array.isArray(payments)) {
          paidAmount = payments
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);
        }

        return {
          id: project.id,
          title: project.title || 'Untitled Project',
          totalAmount,
          paidAmount,
          budget: project.budget,
          description: project.description,
          status: project.status,
          created_at: project.created_at,
          updated_at: project.updated_at,
          developer_name: contract.developer_name || 'Developer',
          contract_id: contract.id,
          milestones: milestones.map((m, idx) => ({
            name: m.name || `Milestone ${idx + 1}`,
            amount: parseFloat(m.amount) || 0,
            status: m.status === 'completed' ? 'paid' : m.status === 'in_progress' ? 'pending' : 'upcoming',
            date: m.date || formatDate(project.created_at),
          })),
          payments: payments || [],
        };
      })
    );

    // Get all transactions for this user
    const [transactions] = await pool.query(
      `SELECT p.id, p.amount, p.payment_type, p.status, p.payment_method, p.paid_at, 
              pr.title as project_name, c.id as contract_id
       FROM payments p
       JOIN contracts c ON p.contract_id = c.id
       JOIN projects pr ON c.project_id = pr.id
       WHERE pr.client_id = ? AND p.status = 'completed'
       ORDER BY p.paid_at DESC, p.created_at DESC
       LIMIT 100`,
      [userId]
    );

    // Calculate summary
    const totalInvested = enrichedProjects.reduce((sum, p) => sum + p.paidAmount, 0);
    const pendingPayments = enrichedProjects.reduce((sum, p) => {
      return sum + p.milestones
        .filter(m => m.status === 'pending')
        .reduce((mSum, m) => mSum + m.amount, 0);
    }, 0);

    res.json({
      projects: enrichedProjects,
      transactions: (Array.isArray(transactions) ? transactions : []).map((t, idx) => ({
        id: t.id || idx,
        project: t.project_name,
        milestone: `Payment ${idx + 1}`,
        amount: parseFloat(t.amount),
        date: t.paid_at ? t.paid_at.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        status: t.status,
        method: t.payment_method || 'Bank Transfer',
      })),
      summary: {
        totalInvested,
        pendingPayments,
        projectsCount: enrichedProjects.length,
      }
    });
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while fetching payment information', details: error.message });
  }
};

/**
 * Get transaction history for authenticated user
 */
export const getTransactionHistory = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;

    const [transactions] = await pool.query(
      `SELECT p.id, p.amount, p.payment_type, p.status, p.payment_method, p.paid_at, p.created_at,
              pr.title as project_title, u.name as developer_name
       FROM payments p
       JOIN contracts c ON p.contract_id = c.id
       JOIN projects pr ON c.project_id = pr.id
       LEFT JOIN users u ON c.developer_id = u.id
       WHERE pr.client_id = ?
       ORDER BY p.created_at DESC
       LIMIT 200`,
      [userId]
    );

    res.json({
      transactions: (Array.isArray(transactions) ? transactions : []).map(t => ({
        id: t.id,
        project: t.project_title,
        developer: t.developer_name,
        amount: parseFloat(t.amount),
        type: t.payment_type,
        method: t.payment_method || 'Bank Transfer',
        status: t.status,
        date: t.paid_at || t.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while fetching transactions' });
  }
};

/**
 * Record a payment
 */
export const recordPayment = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const { contract_id, amount, payment_type, payment_method, due_date } = req.body;

    if (!contract_id || !amount) {
      return res.status(400).json({ error: 'contract_id and amount are required' });
    }

    // Verify contract belongs to user
    const [contracts] = await pool.query(
      'SELECT c.id, pr.client_id FROM contracts c JOIN projects pr ON c.project_id = pr.id WHERE c.id = ?',
      [contract_id]
    );

    if (!contracts?.[0] || contracts[0].client_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get payee and payer info
    const [contractInfo] = await pool.query(
      'SELECT developer_id FROM contracts WHERE id = ?',
      [contract_id]
    );

    const payeeId = contractInfo[0]?.developer_id;

    // Record payment
    const [result] = await pool.query(
      `INSERT INTO payments (contract_id, payer_id, payee_id, amount, payment_type, payment_method, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [contract_id, userId, payeeId, amount, payment_type || 'milestone', payment_method || 'bank_transfer', due_date]
    );

    res.json({
      message: 'Payment recorded successfully',
      payment_id: result.insertId,
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while recording payment' });
  }
};

/**
 * Payment methods CRUD
 */

export const addPaymentMethod = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;

    const { cardholderName, cardNumber, expiryDate, cvv } = req.body;

    if (!cardholderName || !cardNumber || !expiryDate) {
      return res.status(400).json({ error: 'cardholderName, cardNumber and expiryDate are required' });
    }

    // Basic parsing: last4 and expiry MM/YY
    const digits = String(cardNumber).replace(/\D/g, '');
    const last4 = digits.slice(-4);
    const [mm, yy] = String(expiryDate).split('/');
    const expMonth = parseInt(mm, 10) || null;
    let expYear = parseInt(yy, 10) || null;
    if (expYear && expYear < 100) expYear = 2000 + expYear;

    // If user requested default, unset other defaults
    const isDefault = req.body.isDefault ? 1 : 0;
    if (isDefault) {
      await pool.query('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [userId]);
    }

    const [result] = await pool.query(
      `INSERT INTO payment_methods (user_id, cardholder_name, card_brand, last4, exp_month, exp_year, is_default, token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, cardholderName, null, last4, expMonth, expYear, isDefault, null]
    );

    const [rows] = await pool.query('SELECT * FROM payment_methods WHERE id = ? LIMIT 1', [result.insertId]);
    res.json({ method: rows[0] });
  } catch (error) {
    console.error('Error adding payment method:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while adding payment method' });
  }
};

export const listPaymentMethods = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const [rows] = await pool.query('SELECT id, cardholder_name, card_brand, last4, exp_month, exp_year, is_default, created_at FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [userId]);
    res.json({ methods: rows });
  } catch (error) {
    console.error('Error listing payment methods:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while listing payment methods' });
  }
};

export const updatePaymentMethod = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const id = parseInt(req.params.id, 10);
    const { cardholderName, isDefault } = req.body;

    if (!id) return res.status(400).json({ error: 'Invalid method id' });

    const [rows] = await pool.query('SELECT * FROM payment_methods WHERE id = ? LIMIT 1', [id]);
    if (!rows[0] || rows[0].user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });

    if (isDefault) {
      await pool.query('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [userId]);
    }

    await pool.query('UPDATE payment_methods SET cardholder_name = ?, is_default = ? WHERE id = ?', [cardholderName || rows[0].cardholder_name, isDefault ? 1 : 0, id]);
    const [updated] = await pool.query('SELECT id, cardholder_name, card_brand, last4, exp_month, exp_year, is_default, created_at FROM payment_methods WHERE id = ? LIMIT 1', [id]);
    res.json({ method: updated[0] });
  } catch (error) {
    console.error('Error updating payment method:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while updating payment method' });
  }
};

export const deletePaymentMethod = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    const userId = decoded.userId || decoded.id;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const [rows] = await pool.query('SELECT * FROM payment_methods WHERE id = ? LIMIT 1', [id]);
    if (!rows[0] || rows[0].user_id !== userId) return res.status(403).json({ error: 'Unauthorized' });
    await pool.query('DELETE FROM payment_methods WHERE id = ?', [id]);
    res.json({ message: 'Payment method deleted' });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    res.status(500).json({ error: 'An error occurred while deleting payment method' });
  }
};
