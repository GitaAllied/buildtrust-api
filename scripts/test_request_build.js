import pool from '../src/config/database.js';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

async function findOrCreateUser(role, name, email) {
  // Try find
  const [rows] = await pool.query('SELECT * FROM users WHERE role = ? LIMIT 1', [role]);
  if (rows && rows.length > 0) return rows[0];

  // Insert
  const password = 'password123';
  const [res] = await pool.query('INSERT INTO users (email, password, name, role, created_at) VALUES (?, ?, ?, ?, NOW())', [email, password, name, role]);
  const [newRow] = await pool.query('SELECT * FROM users WHERE id = ?', [res.insertId]);
  return newRow[0];
}

(async () => {
  try {
    console.log('Looking for or creating test users...');

    // Find or create a client and a developer
    const client = await findOrCreateUser('client', 'Test Client', 'test-client@example.com');
    const developer = await findOrCreateUser('developer', 'Preist Dev', 'preist-dev@example.com');

    console.log('Client:', { id: client.id, email: client.email });
    console.log('Developer:', { id: developer.id, email: developer.email });

    // Create JWT for client
    const token = jwt.sign({ id: client.id, userId: client.id, role: 'client' }, JWT_SECRET, { expiresIn: '1h' });

    // Check health
    try {
      const health = await axios.get(`${API_BASE}/health`);
      console.log('Health check:', health.data);
    } catch (hErr) {
      console.warn('Health check failed:', hErr.message || hErr);
    }

    // Build request payload
    const payload = {
      developerId: developer.id,
      projectName: 'Test Build Request from Client',
      location: 'Test City',
      buildingType: 'residential',
      budgetRange: '5000-10000',
      startDate: null,
      duration: null,
      message: 'Please build this test project',
      sitePlan: null
    };

    console.log('Sending project request...');
    const resp = await axios.post(`${API_BASE}/projects/request/submit`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('API Response:', resp.data);

    const projectId = resp.data.projectId;
    const contractId = resp.data.contractId;

    // Query DB to confirm
    const [projectRows] = await pool.query('SELECT id, client_id, developer_id, title, message FROM projects WHERE id = ?', [projectId]);
    const [contractRows] = await pool.query('SELECT id, developer_id, project_id FROM contracts WHERE id = ?', [contractId]);

    console.log('DB Project Row:', projectRows[0]);
    console.log('DB Contract Row:', contractRows[0]);

    // Basic assertions
    const okProject = projectRows[0] && projectRows[0].client_id === client.id && projectRows[0].developer_id === developer.id;
    const okContract = contractRows[0] && contractRows[0].developer_id === developer.id && contractRows[0].project_id === projectId;

    console.log('Validation: project has correct client & developer?', okProject);
    console.log('Validation: contract links developer & project?', okContract);

    process.exit(0);
  } catch (err) {
    console.error('Test failed:');
    if (err.response) console.error('Response data:', err.response.data, 'status:', err.response.status);
    else if (err.errors && Array.isArray(err.errors)) {
      console.error('Aggregate errors:');
      err.errors.forEach((e, i) => console.error(i, e && (e.stack || e.message || e)));
    } else {
      console.error(err.stack || err.message || err.toString());
    }
    process.exit(1);
  }
})();