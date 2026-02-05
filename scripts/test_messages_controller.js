import pool from '../src/config/database.js';
import { postMessage, getConversations, getMessagesForConversation } from '../src/controllers/messagesController.js';

function makeRes() {
  return {
    statusCode: 200,
    _data: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this._data = data; console.log('RES JSON:', this.statusCode, data); return data; }
  };
}

(async () => {
  try {
    console.log('Starting controller-level messaging test');
    // find admin
    const [admins] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", ['admin@gmail.com']);
    if (!admins || admins.length === 0) throw new Error('Admin user not found');
    const adminId = admins[0].id;

    // ensure client and developer
    const [clients] = await pool.query("SELECT id FROM users WHERE role = 'client' LIMIT 1");
    let clientId;
    if (clients && clients.length > 0) clientId = clients[0].id;
    else {
      const [ins] = await pool.query("INSERT INTO users (email, password, name, role, email_verified, is_active, setup_completed, created_at) VALUES (?, 'x', ?, 'client', TRUE, TRUE, TRUE, NOW())", ['controller-client-'+Date.now()+'@example.com','Controller Client']);
      clientId = ins.insertId;
    }

    const [devs] = await pool.query("SELECT id FROM users WHERE role = 'developer' LIMIT 1");
    let devId;
    if (devs && devs.length > 0) devId = devs[0].id;
    else {
      const [ins] = await pool.query("INSERT INTO users (email, password, name, role, email_verified, is_active, setup_completed, created_at) VALUES (?, 'x', ?, 'developer', TRUE, TRUE, TRUE, NOW())", ['controller-dev-'+Date.now()+'@example.com','Controller Dev']);
      devId = ins.insertId;
    }

    console.log('adminId', adminId, 'clientId', clientId, 'devId', devId);

    // Test posting message to client
    const req1 = { user: { id: adminId, role: 'admin' }, body: { recipientId: clientId, content: 'Hello from admin (controller test to client)' } };
    const res1 = makeRes();
    await postMessage(req1, res1);

    // Test posting message to developer
    const req2 = { user: { id: adminId, role: 'admin' }, body: { recipientId: devId, content: 'Hello from admin (controller test to developer)' } };
    const res2 = makeRes();
    await postMessage(req2, res2);

    // Attempt to send to a sub_admin (create one and test reject)
    const [subAdmins] = await pool.query("SELECT id FROM users WHERE role = 'sub_admin' LIMIT 1");
    let subId;
    if (subAdmins && subAdmins.length > 0) subId = subAdmins[0].id;
    else {
      const [ins] = await pool.query("INSERT INTO users (email, password, name, role, email_verified, is_active, setup_completed, created_at) VALUES (?, 'x', ?, 'sub_admin', TRUE, TRUE, TRUE, NOW())", ['controller-sub-'+Date.now()+'@example.com','Controller Sub']);
      subId = ins.insertId;
    }

    console.log('sub_admin id', subId);
    const req3 = { user: { id: adminId, role: 'admin' }, body: { recipientId: subId, content: 'Should be blocked' } };
    const res3 = makeRes();
    await postMessage(req3, res3);

    console.log('Controller-level messaging test completed');
    process.exit(0);
  } catch (err) {
    console.error('Controller test error:', err);
    process.exit(2);
  }
})();
