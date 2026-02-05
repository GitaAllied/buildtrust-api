import axios from 'axios';
import pool from '../src/config/database.js';
import bcrypt from 'bcryptjs';

const BASE = process.env.TEST_BASE || 'http://localhost:3001';

async function ensureUser(role, emailPrefix) {
  // look for existing user with role
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE role = ? LIMIT 1', [role]);
  if (Array.isArray(rows) && rows.length > 0) return rows[0];

  const email = `${emailPrefix}+${Date.now()}@example.com`;
  const password = 'Test123!';
  const hashed = await bcrypt.hash(password, 10);
  const [ins] = await pool.query('INSERT INTO users (email, password, name, role, email_verified, is_active, setup_completed, created_at) VALUES (?, ?, ?, ?, TRUE, TRUE, TRUE, NOW())', [email, hashed, `${role} user`, role]);
  return { id: ins.insertId, email, role };
}

(async () => {
  try {
    console.log('Starting messaging test');

    // Ensure at least one client and one developer exist
    const client = await ensureUser('client', 'test-client');
    const developer = await ensureUser('developer', 'test-dev');

    console.log('Client:', client);
    console.log('Developer:', developer);

    // Login as default admin
    const loginResp = await axios.post(`${BASE}/api/auth/login`, { email: 'admin@gmail.com', password: '12345' }).catch(e => { throw e.response ? e.response.data : e; });
    const token = loginResp.data.token;
    console.log('Admin logged in, token length:', token.length);

    const headers = { Authorization: `Bearer ${token}` };

    // Send messages to client and developer
    const clientMsg = await axios.post(`${BASE}/api/messages`, { recipientId: client.id, content: 'Hello client from admin (test)' }, { headers }).catch(e => e.response ? e.response.data : e);
    console.log('Sent to client response:', clientMsg.data || clientMsg);

    const devMsg = await axios.post(`${BASE}/api/messages`, { recipientId: developer.id, content: 'Hello developer from admin (test)' }, { headers }).catch(e => e.response ? e.response.data : e);
    console.log('Sent to developer response:', devMsg.data || devMsg);

    // Fetch conversations
    const convs = await axios.get(`${BASE}/api/messages/conversations`, { headers }).catch(e => { throw e.response ? e.response.data : e; });
    console.log('Conversations:', convs.data);

    // Pick a conversation id for client
    const convForClient = (Array.isArray(convs.data) ? convs.data.find(c => c.other_id === client.id || c.participant1_id === client.id || c.participant2_id === client.id) : null);
    if (convForClient) {
      console.log('Found conversation for client:', convForClient);
      const msgs = await axios.get(`${BASE}/api/messages/${convForClient.conversation_id || convForClient.id}`, { headers }).catch(e => e.response ? e.response.data : e);
      console.log('Messages for client conversation:', msgs.data || msgs);
    }

    // Pick conversation for developer
    const convForDev = (Array.isArray(convs.data) ? convs.data.find(c => c.other_id === developer.id || c.participant1_id === developer.id || c.participant2_id === developer.id) : null);
    if (convForDev) {
      console.log('Found conversation for dev:', convForDev);
      const msgs = await axios.get(`${BASE}/api/messages/${convForDev.conversation_id || convForDev.id}`, { headers }).catch(e => e.response ? e.response.data : e);
      console.log('Messages for dev conversation:', msgs.data || msgs);
    }

    console.log('Messaging test completed');
    process.exit(0);
  } catch (err) {
    console.error('Messaging test failed:', err);
    process.exit(2);
  }
})();
