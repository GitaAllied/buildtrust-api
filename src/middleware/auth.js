import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const secret = process.env.JWT_SECRET || 'your_secret_key';
  jwt.verify(token, secret, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    
    // Update last_seen for online status tracking (non-critical)
    if (user.id) {
      pool.query('UPDATE users SET last_seen = NOW() WHERE id = ?', [user.id]).catch(() => {
        // Silently ignore last_seen update failures - not critical for auth
      });
    }
    
    next();
  });
};
